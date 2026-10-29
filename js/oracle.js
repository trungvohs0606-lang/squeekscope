// The draw itself. Pure functions only: no network, no DOM, so node can import
// this file and get exactly the numbers the page shows.
//
//   dayKey          = UTC date "YYYY-MM-DD"
//   firstRound      = currentRound(dayStart) = floor((dayStart - genesis) / roundDuration) + 1
//   anchor          = last ACTIVE round with roundId < firstRound
//   seed            = keccak256(abi.encodePacked(bytes32 anchor.dataHash, address subject, string dayKey))
//   card            = seed mod 22
//   reversed        = seed >> 255            (the top bit)
//   luckyRound      = firstRound + ((seed >> 64) mod roundsPerDay)
//   colour          = (seed >> 128) mod 12
//   wheel energy    = sum of work in rounds [firstRound - roundsPerDay, firstRound - 1]
//
//   week            = the same reading for each of the 7 UTC days ending on dayKey, each with its own anchor
//   pair            = two readings of one day: distance round the wheel, a 0..100 score, a shared round

import { encodePacked, getAddress, keccak256 } from 'viem';

export const DECK_SIZE = 22;
export const PALETTE_SIZE = 12;
export const SECONDS_PER_DAY = 86400n;
export const WEEK_LENGTH = 7;
// Work in the 24 h before the day began -> energy level 0..5 (copy lives in arcana.js).
export const ENERGY_STEPS = Object.freeze([0n, 1n, 2000n, 5000n, 8000n, 11000n]);

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-10-28" for a moment in time, in UTC. */
export function dayKeyOf(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isDayKey(value) {
  const m = DAY_RE.exec(String(value ?? ''));
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1970 || y > 9999) return false;
  const t = Date.UTC(y, mo - 1, d);
  return dayKeyOf(t) === value;
}

/** The UTC day n days after dayKey (negative n goes back). */
export function addDays(dayKey, n) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return dayKeyOf(Date.UTC(y, m - 1, d + n));
}

/** Unix seconds (bigint) of 00:00:00 UTC on dayKey. */
export function dayStartUnix(dayKey) {
  if (!isDayKey(dayKey)) throw new Error(`not a day: ${dayKey}`);
  const [y, m, d] = dayKey.split('-').map(Number);
  return BigInt(Date.UTC(y, m - 1, d) / 1000);
}

/** Lowercase 0x + 40 hex, or a valid checksum, becomes a checksummed address; anything else is null. */
export function normalizeSubject(value) {
  const s = String(value ?? '').trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(s)) return null;
  const lower = s.toLowerCase();
  const checksummed = getAddress(lower);
  // Mixed case must be a correct EIP-55 checksum; all-lower or all-upper hex is accepted as is.
  const body = s.slice(2);
  const mixed = body !== body.toLowerCase() && body !== body.toUpperCase();
  if (mixed && s !== checksummed) return null;
  return checksummed;
}

function floorDiv(a, b) {
  const q = a / b;
  return a % b !== 0n && (a < 0n) !== (b < 0n) ? q - 1n : q;
}

/** Round that contains unix second t: floor((t - genesis) / duration) + 1. */
export function currentRound(t, clock) {
  return floorDiv(BigInt(t) - clock.genesis, clock.roundDuration) + 1n;
}

/** Unix second at which round r starts. */
export function roundStart(r, clock) {
  return clock.genesis + (BigInt(r) - 1n) * clock.roundDuration;
}

export function roundsPerDay(clock) {
  return SECONDS_PER_DAY / clock.roundDuration;
}

/** Everything about a UTC day that depends only on the clock. */
export function dayFrame(dayKey, clock) {
  const start = dayStartUnix(dayKey);
  const firstRound = currentRound(start, clock);
  const perDay = roundsPerDay(clock);
  return {
    dayKey,
    start,
    end: start + SECONDS_PER_DAY,
    firstRound,
    lastRound: firstRound + perDay - 1n,
    perDay,
  };
}

/**
 * Pick the anchor round for a day.
 * rounds: ACTIVE rounds sorted by roundId ascending ({ roundId, work, cumulativeWork, dataHash, ... }).
 * frontier: settledThroughRound, the last round SqueekCore has certified.
 *  - sealed:      last active round before firstRound, and every round before the day is certified
 *  - provisional: same pick, but rounds up to firstRound - 1 are not all certified yet (it can still move)
 *  - borrowed:    no active round existed before the day began, so the first active round on record stands in
 */
export function findAnchor(rounds, firstRound, frontier) {
  let anchor = null;
  for (const r of rounds) {
    if (r.roundId < firstRound) anchor = r;
    else break;
  }
  if (anchor) return { round: anchor, kind: frontier >= firstRound - 1n ? 'sealed' : 'provisional' };
  if (rounds.length) return { round: rounds[0], kind: 'borrowed' };
  return null;
}

export function energyLevel(work) {
  let level = 0;
  ENERGY_STEPS.forEach((min, i) => {
    if (work >= min) level = i;
  });
  return level;
}

/** Work the hamster settled in the 24 hours (roundsPerDay rounds) before the day began. */
export function wheelEnergy(rounds, frame, frontier) {
  const from = frame.firstRound - frame.perDay;
  const to = frame.firstRound - 1n;
  let work = 0n;
  let activeRounds = 0;
  for (const r of rounds) {
    if (r.roundId >= from && r.roundId <= to) {
      work += r.work;
      activeRounds += 1;
    }
  }
  return { from, to, work, activeRounds, complete: frontier >= to, level: energyLevel(work) };
}

/** keccak256(abi.encodePacked(bytes32 dataHash, address subject, string dayKey)) */
export function drawSeed(dataHash, subject, dayKey) {
  return keccak256(encodePacked(['bytes32', 'address', 'string'], [dataHash, subject, dayKey]));
}

/** Everything the seed decides. */
export function readSeed(seed, firstRound, perDay) {
  const s = BigInt(seed);
  return {
    cardIndex: Number(s % BigInt(DECK_SIZE)),
    reversed: s >> 255n === 1n,
    luckySlot: (s >> 64n) % perDay,
    luckyRound: firstRound + ((s >> 64n) % perDay),
    colourIndex: Number((s >> 128n) % BigInt(PALETTE_SIZE)),
  };
}

/**
 * The whole reading for (subject, dayKey).
 * Returns { status: 'future' | 'before-wheel' | 'no-work' | 'drawn', ... }.
 */
export function castReading({ rounds, frontier, clock, subject, dayKey, nowSec }) {
  const frame = dayFrame(dayKey, clock);
  if (frame.start > BigInt(nowSec)) return { status: 'future', frame };
  if (frame.end <= clock.genesis) return { status: 'before-wheel', frame };
  const anchor = findAnchor(rounds, frame.firstRound, frontier);
  if (!anchor) return { status: 'no-work', frame };
  const seed = drawSeed(anchor.round.dataHash, subject, dayKey);
  return {
    status: 'drawn',
    frame,
    subject,
    frontier,
    anchor,
    seed,
    ...readSeed(seed, frame.firstRound, frame.perDay),
    energy: wheelEnergy(rounds, frame, frontier),
  };
}

/**
 * The week strip: castReading for each of the WEEK_LENGTH UTC days ending on dayKey, oldest first.
 * Every day is cut from its own anchor round, exactly as if it had been picked on its own.
 */
export function castWeek({ rounds, frontier, clock, subject, dayKey, nowSec }) {
  const week = [];
  for (let back = WEEK_LENGTH - 1; back >= 0; back--) {
    const day = addDays(dayKey, -back);
    week.push(
      isDayKey(day)
        ? castReading({ rounds, frontier, clock, subject, dayKey: day, nowSec })
        : { status: 'before-wheel', frame: { dayKey: day } },
    );
  }
  return week;
}

/* ---------- two wallets, one day ---------- */

/** Steps between two cards the short way round the 22-card wheel: 0 (same card) to 11 (opposite). */
export function wheelDistance(a, b) {
  const d = Math.abs(a - b) % DECK_SIZE;
  return Math.min(d, DECK_SIZE - d);
}

/** keccak256(abi.encodePacked(bytes32 lower seed, bytes32 higher seed)): the same whichever wallet comes first. */
export function pairSeed(seedA, seedB) {
  const [lo, hi] = BigInt(seedA) <= BigInt(seedB) ? [seedA, seedB] : [seedB, seedA];
  return keccak256(encodePacked(['bytes32', 'bytes32'], [lo, hi]));
}

// Distance -> band 0..4 (copy lives in arcana.js): twin, neighbours, same half, across the cage, opposite spokes.
export const BOND_STEPS = Object.freeze([0, 1, 3, 6, 9]);

/**
 * Wheel compatibility of two drawn readings for the same day.
 *   distance    = min(|a - b|, 22 - |a - b|)
 *   score       = (11 - distance) * 8 + (same orientation ? 12 : 0)      -> 0..100
 *   sharedRound = firstRound + ((pairSeed >> 64) mod roundsPerDay)       -> a ten-minute slot to run together
 */
export function castPair(a, b) {
  if (a?.status !== 'drawn' || b?.status !== 'drawn' || a.frame.dayKey !== b.frame.dayKey) return null;
  const distance = wheelDistance(a.cardIndex, b.cardIndex);
  const sameWay = a.reversed === b.reversed;
  const seed = pairSeed(a.seed, b.seed);
  const slot = (BigInt(seed) >> 64n) % a.frame.perDay;
  let band = 0;
  BOND_STEPS.forEach((min, i) => {
    if (distance >= min) band = i;
  });
  return {
    distance,
    sameWay,
    score: (11 - distance) * 8 + (sameWay ? 12 : 0),
    band,
    seed,
    sharedSlot: slot,
    sharedRound: a.frame.firstRound + slot,
  };
}
