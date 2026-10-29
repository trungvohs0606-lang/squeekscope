// recompute.mjs: redraw any Squeekscope card, and the week that ends on it, from Sepolia with nothing but viem.
//   npm i viem@2.21.55 && node scripts/recompute.mjs <address> [YYYY-MM-DD]
import { createPublicClient, encodePacked, getAddress, http, keccak256, parseAbiItem } from 'viem';

const CORE = '0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44'; // live SqueekCore proxy (Sepolia)
const GENESIS = 1793022600n; // configuration().genesisTimestamp
const ROUND = 600n; // configuration().roundDuration
const FROM_BLOCK = 11998937n; // core deployment block
const DECK = ['The Hamster', 'The Wheel', 'The Seed', 'The Burrow', 'The Night Shift', 'The Reporter', 'The Magnet', 'The Sprint', 'The Difficulty', 'The Postman', 'The Odometer', 'The Settlement', 'The Nap', 'The Empty Wheel', 'The Water Bottle', 'The Cheek Pouch', 'The Cage Door', 'The Guardian', 'The Midnight Lap', 'The Sunflower', 'The Block', 'The Hoard'];

const client = createPublicClient({ transport: http('https://ethereum-sepolia-rpc.publicnode.com') });
const event = parseAbiItem('event RoundRecorded(uint64 indexed roundId, uint64 work, uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint32 workPerThousandBlocks, bytes32 dataHash)');

async function readRounds(head) {
  const rounds = [];
  for (let from = FROM_BLOCK; from <= head; from += 45000n) {
    const to = from + 44999n < head ? from + 44999n : head;
    const logs = await client.getLogs({ address: CORE, event, fromBlock: from, toBlock: to });
    rounds.push(...logs.map((log) => log.args));
  }
  return rounds.sort((a, b) => (a.roundId < b.roundId ? -1 : 1));
}

function draw(rounds, who, day) {
  const start = BigInt(Date.parse(`${day}T00:00:00Z`) / 1000);
  if (start + 86400n <= GENESIS) return { day, card: 'none: before the wheel' };
  if (start * 1000n > BigInt(Date.now())) return { day, card: 'none: not cut yet' };
  const first = (start - GENESIS) / ROUND + 1n; // first round of the UTC day
  const anchor = rounds.filter((r) => r.roundId < first).at(-1) ?? rounds[0]; // genesis day borrows round one
  if (!anchor) return { day, card: 'none: nothing settled yet' };
  const seed = BigInt(keccak256(encodePacked(['bytes32', 'address', 'string'], [anchor.dataHash, getAddress(who.toLowerCase()), day])));
  const energy = rounds.filter((r) => r.roundId >= first - 144n && r.roundId < first).reduce((sum, r) => sum + r.work, 0n);
  return {
    day,
    anchorRound: anchor.roundId,
    dataHash: anchor.dataHash,
    seed: `0x${seed.toString(16).padStart(64, '0')}`,
    card: `${seed % 22n} ${DECK[Number(seed % 22n)]}`,
    reversed: seed >> 255n === 1n,
    luckyRound: first + ((seed >> 64n) % 144n),
    colour: (seed >> 128n) % 12n,
    energyWork: energy,
  };
}

// The week strip: the same draw for each of the 7 UTC days ending on `day`, each from its own anchor round.
const week = (rounds, who, day) =>
  [6, 5, 4, 3, 2, 1, 0].map((back) => draw(rounds, who, new Date(Date.parse(`${day}T00:00:00Z`) - back * 86400000).toISOString().slice(0, 10)));

const [who, day = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
if (who) {
  const rounds = await readRounds(await client.getBlockNumber());
  console.log(draw(rounds, who, day));
  console.table(week(rounds, who, day).map((c) => ({ day: c.day, anchor: c.anchorRound === undefined ? '' : String(c.anchorRound), card: c.card, reversed: c.reversed ?? '' })));
} else await selfCheck();

// ------------------------------------------------------------------------------------------------
// Self-check, run with no arguments. The page reads rounds through js/ledger.js and draws with
// js/oracle.js; this compares both against the stand-alone maths above on the same chain data:
// the round book three ways, single cards, week strips and pair readings, for a dozen wallets
// and every day from three days before genesis to tomorrow. Exits 1 on any mismatch.
async function selfCheck() {
  const { parseAbi, toHex } = await import('viem');
  const { BOND_STEPS, castPair, castReading, castWeek, normalizeSubject } = await import('../js/oracle.js');
  const { createLedger, makeClient, readClock, resolveCore } = await import('../js/ledger.js');
  const { ARCANA, PALETTE } = await import('../js/arcana.js');
  const { config } = await import('../js/config.js');

  const tally = new Map();
  const failures = [];
  const check = (section, label, ok) => {
    const t = tally.get(section) ?? [0, 0];
    t[1] += 1;
    if (ok) t[0] += 1;
    else failures.push(`${section}: ${label}`);
    tally.set(section, t);
  };

  // one snapshot of the chain, read three ways: raw logs here, and js/ledger.js both ways the page can
  const head = await client.getBlockNumber();
  const STATE = parseAbi(['function state() view returns ((uint64 settledThroughRound, uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint64 blockHeight, uint96 blockProgress, uint32 workPerThousandBlocks, uint256 authorizationNonce, bool paused))']);
  const settled = (await client.readContract({ address: CORE, abi: STATE, functionName: 'state', blockNumber: head })).settledThroughRound;
  const raw = await readRounds(head);
  const pageClient = makeClient();
  const viaLogs = await createLedger({ client: pageClient, core: CORE, fromBlock: FROM_BLOCK }).sync();
  const viaPages = await createLedger({ client: pageClient, core: CORE, fromBlock: null }).sync();
  const frontier = [settled, viaLogs.frontier, viaPages.frontier].reduce((a, b) => (a < b ? a : b));
  const base = raw.filter((r) => r.roundId <= frontier);
  const pageRounds = viaLogs.rounds().filter((r) => r.roundId <= frontier);
  const same = (a, b) => !!b && a.roundId === b.roundId && a.work === b.work && a.cumulativeWork === b.cumulativeWork && a.dataHash === b.dataHash;
  for (const [name, ledger] of [['logs', viaLogs], ['roundPage', viaPages]]) {
    const got = ledger.rounds().filter((r) => r.roundId <= frontier);
    check(`round book (${name})`, 'count', got.length === base.length);
    base.forEach((r, i) => check(`round book (${name})`, `round ${r.roundId}`, same(r, got[i])));
  }
  const clock = await readClock(pageClient, CORE);
  check('clock and deck', 'configuration() matches GENESIS and ROUND', clock.source === 'chain' && clock.genesis === GENESIS && clock.roundDuration === ROUND);
  check('clock and deck', 'DECK matches js/arcana.js', DECK.length === ARCANA.length && DECK.every((name, i) => name === ARCANA[i].name));
  check('clock and deck', 'twelve lucky colours', PALETTE.length === 12);

  // rounds anyone can look up on Etherscan, and the example in the README
  const byId = new Map(base.map((r) => [r.roundId, r]));
  const known = [
    [241n, { cumulativeWork: 21465n }],
    [242n, { cumulativeWork: 22003n, dataHash: '0x4c6033f0cb4c8aee682b4ef1b4a4ae4fea671fb9b1cfadb0ccbb6833b5e6ed78' }],
    [243n, { cumulativeWork: 22073n, dataHash: '0xd687529ff3c59cfff95b5592f11e73f62f0d015a341adc7d23676df7f967a974' }],
    [334n, { work: 363n, cumulativeWork: 22542n }],
  ];
  for (const [id, want] of known) check('known rounds', `round ${id}`, Object.entries(want).every(([k, v]) => byId.get(id)?.[k] === v));
  const ex = draw(base, CORE, '2026-10-28');
  check('README example', 'Squeektoshi, 2026-10-28', ex.anchorRound === 197n && ex.card === '20 The Block' && ex.reversed && ex.luckyRound === 215n && ex.colour === 8n && ex.energyWork === 7548n);

  // the page's oracle against draw() and week()
  const nowSec = Math.floor(Date.now() / 1000);
  const firstRound = (d) => (BigInt(Date.parse(`${d}T00:00:00Z`) / 1000) - GENESIS) / ROUND + 1n;
  const NONE = { 'before-wheel': 'none: before the wheel', future: 'none: not cut yet', 'no-work': 'none: nothing settled yet' };
  const kindOf = (d) => (!base.some((r) => r.roundId < firstRound(d)) ? 'borrowed' : frontier >= firstRound(d) - 1n ? 'sealed' : 'provisional');
  const agree = (mine, page) =>
    !mine.seed
      ? page.status !== 'drawn' && mine.card === NONE[page.status]
      : page.status === 'drawn' &&
        page.frame.dayKey === mine.day &&
        page.anchor.round.roundId === mine.anchorRound &&
        page.anchor.round.dataHash === mine.dataHash &&
        page.anchor.kind === kindOf(mine.day) &&
        BigInt(page.seed) === BigInt(mine.seed) &&
        `${page.cardIndex} ${DECK[page.cardIndex]}` === mine.card &&
        page.reversed === mine.reversed &&
        page.luckyRound === mine.luckyRound &&
        BigInt(page.colourIndex) === mine.colour &&
        page.energy.work === mine.energyWork;

  const subjects = [
    CORE, // Squeektoshi's own card
    '0xcd46990f8349057335289ef282c276204b6cdc62', // mining proxy
    '0x5501e1fa81be1c3f49225fa7668da0245d07db60', // SQK token
    '0x0000000000000000000000000000000000000000',
    '0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045', // all capitals, as some wallets copy it
    ...Array.from({ length: 7 }, (_, i) => `0x${keccak256(toHex(`squeekscope check ${i}`)).slice(-40)}`),
  ];
  const today = new Date().toISOString().slice(0, 10);
  const days = [];
  for (let t = Date.parse('2026-10-23T00:00:00Z'); t <= Date.parse(`${today}T00:00:00Z`) + 86400000; t += 86400000) days.push(new Date(t).toISOString().slice(0, 10));
  const cast = (address, d) => castReading({ rounds: pageRounds, frontier, clock, subject: normalizeSubject(address), dayKey: d, nowSec });

  for (const address of subjects) {
    for (const d of days) {
      check('single cards', `${address} ${d}`, agree(draw(base, address, d), cast(address, d)));
      const pageWeek = castWeek({ rounds: pageRounds, frontier, clock, subject: normalizeSubject(address), dayKey: d, nowSec });
      week(base, address, d).forEach((mine, i) => check('week strips (day slots)', `${address} week to ${d}, slot ${i}`, pageWeek.length === 7 && agree(mine, pageWeek[i])));
    }
  }

  // pairs: every wallet with the next one, on every day both have a card
  const bandOf = (dist) => [...BOND_STEPS.entries()].filter(([, min]) => dist >= min).at(-1)[0];
  for (const d of days) {
    subjects.forEach((a, i) => {
      const b = subjects[(i + 1) % subjects.length];
      const [ma, mb] = [draw(base, a, d), draw(base, b, d)];
      const p = castPair(cast(a, d), cast(b, d));
      if (!ma.seed || !mb.seed) {
        check('pair readings', `${d} ${a} + ${b}: no pair without two cards`, p === null);
        return;
      }
      const [ia, ib] = [Number(BigInt(ma.seed) % 22n), Number(BigInt(mb.seed) % 22n)];
      const distance = Math.min(Math.abs(ia - ib), 22 - Math.abs(ia - ib));
      const [lo, hi] = BigInt(ma.seed) <= BigInt(mb.seed) ? [ma.seed, mb.seed] : [mb.seed, ma.seed];
      const shared = firstRound(d) + ((BigInt(keccak256(encodePacked(['bytes32', 'bytes32'], [lo, hi]))) >> 64n) % 144n);
      const score = (11 - distance) * 8 + (ma.reversed === mb.reversed ? 12 : 0);
      const q = castPair(cast(b, d), cast(a, d));
      check('pair readings', `${d} ${a} + ${b}`, !!p && p.distance === distance && p.score === score && p.band === bandOf(distance) && p.sharedRound === shared);
      check('pair readings', `${d} ${a} + ${b}: same either way round`, !!q && q.score === p?.score && q.sharedRound === p?.sharedRound && q.seed === p?.seed);
    });
  }
  check('pair readings', 'different days never pair', castPair(cast(subjects[0], '2026-10-27'), cast(subjects[1], '2026-10-28')) === null);

  // states the live chain rarely shows: a reporter lagging past midnight, and no settled work at all
  const lag = firstRound(today) - 2n;
  const lagging = castWeek({ rounds: pageRounds.filter((r) => r.roundId <= lag), frontier: lag, clock, subject: normalizeSubject(CORE), dayKey: today, nowSec });
  check('edge states', 'lagging reporter: only today is provisional', lagging.at(-1).anchor?.kind === 'provisional' && lagging.slice(0, -1).every((w) => w.anchor?.kind !== 'provisional'));
  const empty = castWeek({ rounds: [], frontier: 0n, clock, subject: normalizeSubject(CORE), dayKey: today, nowSec });
  check('edge states', 'nothing settled: every day face down', empty.every((w) => w.status === 'no-work' || w.status === 'before-wheel') && empty.at(-1).status === 'no-work');

  // the gallery (?deck) prints every plate with both one-line readings, in deck order
  const NUMERALS = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];
  ARCANA.forEach((card, i) =>
    check('deck gallery', `plate ${i}`, card.index === i && card.numeral === NUMERALS[i] && card.glyph.length > 0 && !!card.line.upright && !!card.line.reversed && card.line.upright !== card.line.reversed),
  );
  check('deck gallery', 'no one-line reading printed twice', new Set(ARCANA.flatMap((c) => [c.line.upright, c.line.reversed])).size === 2 * ARCANA.length);

  // the landing with no address shows Squeektoshi's own card: the core the page resolves (API, else config.js), drawn for today
  const where = await resolveCore(config.apiBase);
  check('landing spotlight', `the page's core (${where.source}) is the one read here`, where.core.toLowerCase() === CORE && config.coreFallback.toLowerCase() === CORE);
  check('landing spotlight', `Squeektoshi's card for ${today}`, agree(draw(base, CORE, today), cast(where.core, today)));

  let passed = 0;
  let total = 0;
  console.log(`Squeekscope self-check: SqueekCore ${CORE}, Sepolia block ${head}, certified through round ${frontier}, ${base.length} active rounds.`);
  console.log(`${subjects.length} wallets x ${days.length} days (${days[0]} to ${days.at(-1)}).`);
  for (const [section, [ok, n]] of tally) {
    passed += ok;
    total += n;
    console.log(`  ${`${section} `.padEnd(30, '.')} ${ok}/${n}`);
  }
  if (failures.length) console.log(`\nMismatches:\n  ${failures.slice(0, 25).join('\n  ')}`);
  console.log(`\n${passed}/${total} checks match.`);
  process.exitCode = passed === total ? 0 : 1;
}
