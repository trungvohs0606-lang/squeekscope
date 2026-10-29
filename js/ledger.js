// Reads the hamster's settled work from SqueekCore on Sepolia.
// Primary source: RoundRecorded logs (eth_getLogs, chunked). Fallback: roundPage().
// Everything is cached in memory; nothing is written anywhere.

import { createPublicClient, http, parseAbi, parseAbiItem } from 'viem';
import { config } from './config.js';

export const CORE_ABI = parseAbi([
  'function state() view returns ((uint64 settledThroughRound, uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint64 blockHeight, uint96 blockProgress, uint32 workPerThousandBlocks, uint256 authorizationNonce, bool paused))',
  'function roundPage(uint64 afterRound, uint64 throughRound, uint256 maxRecords) view returns ((uint64 certifiedThroughRound, (uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint32 workPerThousandBlocks) start, (uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint32 workPerThousandBlocks) end, (uint64 roundId, uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint32 workPerThousandBlocks, bytes32 dataHash)[] rounds))',
  'function configuration() view returns ((bytes32 streamId, uint64 genesisTimestamp, uint64 roundDuration, uint64 maxWorkPerRound, uint16 maxRoundsPerBatch, address guardian, address reporter, uint32 initialWorkPerThousandBlocks, uint64 targetBlocksPerActiveRound, uint64 difficultySmoothingRounds, uint96 blockUnitsPerBlock))',
]);

export const ROUND_RECORDED = parseAbiItem(
  'event RoundRecorded(uint64 indexed roundId, uint64 work, uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint32 workPerThousandBlocks, bytes32 dataHash)',
);

const HEX40 = /^0x[0-9a-fA-F]{40}$/;
const PAGE_WINDOW = 144n; // one UTC day of rounds per roundPage walker
const PAGE_SIZE = 16n; // the most roundPage will return

export function makeClient(rpcUrl = config.rpcUrl) {
  return createPublicClient({ transport: http(rpcUrl, { timeout: 20_000, retryCount: 2, retryDelay: 700 }) });
}

/** Which core is live. The API names it; the constant in config.js covers outages. */
export async function resolveCore(apiBase = config.apiBase) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${apiBase}/core`, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (res.ok) {
      const body = await res.json();
      const core = body?.identities?.core;
      if (body?.status === 'available' && HEX40.test(String(core))) {
        const dep = String(body?.chain?.deploymentBlock ?? '');
        const sameAsFallback = core.toLowerCase() === config.coreFallback.toLowerCase();
        return {
          core: core.toLowerCase(),
          deploymentBlock: /^\d+$/.test(dep) ? BigInt(dep) : sameAsFallback ? config.deploymentBlockFallback : null,
          source: 'api',
        };
      }
    }
  } catch {
    /* fall through to the constant */
  }
  return { core: config.coreFallback, deploymentBlock: config.deploymentBlockFallback, source: 'fallback' };
}

/** genesisTimestamp and roundDuration, read from the core itself. */
export async function readClock(client, core) {
  try {
    const c = await client.readContract({ address: core, abi: CORE_ABI, functionName: 'configuration' });
    if (c.roundDuration > 0n) return { genesis: c.genesisTimestamp, roundDuration: c.roundDuration, source: 'chain' };
  } catch {
    /* fall through */
  }
  return { genesis: config.genesisFallback, roundDuration: config.roundDurationFallback, source: 'config' };
}

async function eachLimited(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

function chunks(from, to, size) {
  const out = [];
  for (let a = from; a <= to; a += size) out.push([a, a + size - 1n < to ? a + size - 1n : to]);
  return out;
}

/**
 * A growing, in-memory book of every active round.
 * sync() reads state() and logs at the same block (head - 3, so lagging RPC nodes agree),
 * then checks the book against state().cumulativeWork and patches any gap with roundPage.
 */
export function createLedger({ client, core, fromBlock }) {
  const book = new Map(); // roundId (string) -> round
  const blockTimes = new Map();
  let sorted = [];
  let knownThrough = 0n; // the book is complete for every round <= knownThrough
  let logsBlock = null; // logs are fetched through this block
  const ledger = {
    core,
    fromBlock,
    frontier: 0n,
    cumulativeWork: 0n,
    snapshotBlock: null,
    source: null,
    logError: null,
    syncedAt: 0,
    rounds: () => sorted,
    sync,
    settlementOf,
    blockTime,
  };

  function put(r) {
    const key = r.roundId.toString();
    const had = book.get(key);
    // A log carries the transaction; a roundPage checkpoint does not. Keep the richer one.
    if (!had || (!had.txHash && r.txHash)) book.set(key, r);
  }

  async function fetchLogs(from, to) {
    const found = [];
    await eachLimited(chunks(from, to, config.logChunk), 3, async ([a, b]) => {
      const logs = await client.getLogs({ address: core, event: ROUND_RECORDED, fromBlock: a, toBlock: b, strict: true });
      for (const log of logs) {
        if (log.removed) continue;
        found.push({
          roundId: log.args.roundId,
          work: log.args.work,
          cumulativeWork: log.args.cumulativeWork,
          dataHash: log.args.dataHash,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        });
      }
    });
    return found;
  }

  async function scanPages(after, through, blockNumber) {
    const windows = [];
    for (let a = after; a < through; a += PAGE_WINDOW) windows.push([a, a + PAGE_WINDOW < through ? a + PAGE_WINDOW : through]);
    const found = [];
    await eachLimited(windows, 4, async ([a, b]) => {
      let cursor = a;
      while (cursor < b) {
        const page = await client.readContract({
          address: core,
          abi: CORE_ABI,
          functionName: 'roundPage',
          args: [cursor, b, PAGE_SIZE],
          blockNumber,
        });
        let prev = page.start.cumulativeWork;
        for (const r of page.rounds) {
          found.push({
            roundId: r.roundId,
            work: r.cumulativeWork - prev,
            cumulativeWork: r.cumulativeWork,
            dataHash: r.dataHash,
            txHash: null,
            blockNumber: null,
          });
          prev = r.cumulativeWork;
        }
        if (page.certifiedThroughRound <= cursor) throw new Error('roundPage did not advance');
        cursor = page.certifiedThroughRound;
      }
    });
    return found;
  }

  async function sync() {
    const head = await client.getBlockNumber();
    const target = head > 3n ? head - 3n : head;
    const st = await client.readContract({ address: core, abi: CORE_ABI, functionName: 'state', blockNumber: target });
    let viaLogs = fromBlock !== null;
    if (viaLogs) {
      const from = logsBlock === null ? fromBlock : logsBlock + 1n;
      try {
        if (from <= target) for (const r of await fetchLogs(from, target)) put(r);
        logsBlock = target;
        ledger.logError = null;
      } catch (err) {
        viaLogs = false;
        ledger.logError = err?.shortMessage || err?.message || String(err);
      }
    }
    sorted = [...book.values()].sort((x, y) => (x.roundId < y.roundId ? -1 : x.roundId > y.roundId ? 1 : 0));
    const settled = sorted.filter((r) => r.roundId <= st.settledThroughRound);
    const lastWork = settled.length ? settled[settled.length - 1].cumulativeWork : 0n;
    let patched = false;
    if (!viaLogs || lastWork !== st.cumulativeWork) {
      for (const r of await scanPages(knownThrough, st.settledThroughRound, target)) put(r);
      sorted = [...book.values()].sort((x, y) => (x.roundId < y.roundId ? -1 : x.roundId > y.roundId ? 1 : 0));
      patched = true;
    }
    knownThrough = st.settledThroughRound;
    ledger.frontier = st.settledThroughRound;
    ledger.cumulativeWork = st.cumulativeWork;
    ledger.snapshotBlock = target;
    ledger.source = viaLogs ? (patched ? 'logs+roundPage' : 'logs') : 'roundPage';
    ledger.syncedAt = Date.now();
    return ledger;
  }

  /** The transaction that settled a round (from the log, or one targeted log query if we only had roundPage). */
  async function settlementOf(round) {
    if (round.txHash) return { txHash: round.txHash, blockNumber: round.blockNumber };
    if (fromBlock === null || ledger.snapshotBlock === null) return null;
    try {
      const ranges = chunks(fromBlock, ledger.snapshotBlock, config.logChunk).reverse();
      for (const [a, b] of ranges) {
        const logs = await client.getLogs({ address: core, event: ROUND_RECORDED, args: { roundId: round.roundId }, fromBlock: a, toBlock: b });
        const hit = logs.find((l) => !l.removed);
        if (hit) {
          const enriched = { ...round, txHash: hit.transactionHash, blockNumber: hit.blockNumber };
          put(enriched);
          sorted = sorted.map((r) => (r.roundId === round.roundId ? enriched : r));
          return { txHash: hit.transactionHash, blockNumber: hit.blockNumber };
        }
      }
    } catch {
      /* unknown is fine; the panel says so */
    }
    return null;
  }

  async function blockTime(blockNumber) {
    if (blockNumber === null || blockNumber === undefined) return null;
    const key = blockNumber.toString();
    if (!blockTimes.has(key)) {
      blockTimes.set(
        key,
        client.getBlock({ blockNumber }).then(
          (b) => Number(b.timestamp),
          () => null,
        ),
      );
    }
    return blockTimes.get(key);
  }

  return ledger;
}
