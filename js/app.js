// Squeekscope page controller. All chain and API values reach the DOM through
// textContent or attributes we build ourselves; nothing from the network is parsed as HTML.

import { config } from './config.js';
import { ARCANA, BONDS, BOND_WAYS, ENERGY, PALETTE, PHASES, SNOOZE } from './arcana.js';
import { glyphSvg } from './ink.js';
import { createLedger, makeClient, readClock, resolveCore } from './ledger.js';
import {
  BOND_STEPS,
  DECK_SIZE,
  PALETTE_SIZE,
  castPair,
  castReading,
  castWeek,
  currentRound,
  dayKeyOf,
  dayStartUnix,
  isDayKey,
  normalizeSubject,
} from './oracle.js';
import { printReading } from './printer.js';
import { createApi, readSky } from './wire.js';

if (ARCANA.length !== DECK_SIZE || PALETTE.length !== PALETTE_SIZE || BONDS.length !== BOND_STEPS.length) {
  throw new Error('deck and oracle disagree');
}

const $ = (sel) => document.querySelector(sel);
const setText = (sel, value) => {
  const el = $(sel);
  if (el) el.textContent = value;
  return el;
};
const make = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const nowSec = () => Math.floor(Date.now() / 1000);
const fmt = (n) => BigInt(n).toLocaleString('en-US');
const shortHex = (hex, head = 6, tail = 4) => `${hex.slice(0, head)}…${hex.slice(-tail)}`;
const asDate = (dayKey) => new Date(`${dayKey}T00:00:00Z`);
const longDay = (dayKey) =>
  asDate(dayKey).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDay = (dayKey) => asDate(dayKey).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dayMonth = (dayKey) => asDate(dayKey).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const weekday = (dayKey) => asDate(dayKey).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
const hhmmUtc = (sec) => new Date(Number(sec) * 1000).toISOString().slice(11, 16);
const hhmmLocal = (sec) => new Date(Number(sec) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const livesInUtc = () => new Date().getTimezoneOffset() === 0;

function span(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d} day${d > 1 ? 's' : ''}${h ? ` ${h} h` : ''}`;
  if (h) return `${h} h${m ? ` ${m} min` : ''}`;
  if (m) return `${m} min`;
  return `${s} s`;
}

const state = {
  subject: null,
  day: null,
  source: null, // how the subject arrived: link | paste | wallet | hamster
  env: null, // { client, clock, ledger, core, deploymentBlock, source }
  booting: null,
  reading: null,
  faceKey: null,
  turnSeq: 0,
  sky: null,
  skyPhase: null,
  weekSig: null, // what the week strip currently shows
  weekWindow: null, // subject|day it ends on; a new window turns the cards over again
  partner: null, // optional second wallet for the pair reading
  view: 'draw', // draw | deck (?deck, the gallery)
  spotlight: false, // no address in the link: the page leads with Squeektoshi's own card
};

/* ---------- small UI helpers ---------- */

function note(message, isError = false) {
  const el = setText('#ask-note', message);
  el.classList.toggle('is-error', isError);
}

function markInvalid(field, message) {
  const input = $(field);
  input.setAttribute('aria-invalid', 'true');
  input.focus();
  note(message, true);
}

function clearInvalid() {
  for (const input of document.querySelectorAll('.ask input')) input.removeAttribute('aria-invalid');
}

function coreAddress() {
  return normalizeSubject(state.env?.core ?? config.coreFallback);
}

function isHamster(address) {
  return address && address.toLowerCase() === (state.env?.core ?? config.coreFallback).toLowerCase();
}

/** "Wednesday, 28 October 2026 · for 0x9f3a…12cd", keeping the address out of the eyebrow's capitals. */
function setEyebrow(sel, dayKey, address) {
  const el = $(sel);
  const parts = [document.createTextNode(longDay(dayKey))];
  if (address) {
    parts.push(document.createTextNode(' · '));
    parts.push(isHamster(address) ? document.createTextNode("Squeektoshi's own card") : make('span', 'eyebrow__who', `for ${shortHex(address)}`));
  }
  el.replaceChildren(...parts);
}

function permalink(subject, day, partner = null) {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('a', subject);
  url.searchParams.set('d', day);
  if (partner) url.searchParams.set('b', partner);
  return url.toString();
}

const readingQuery = () => `?a=${state.subject}&d=${state.day}${state.partner ? `&b=${state.partner}` : ''}`;

/** A link without an address: Squeektoshi's card for today, or for ?d= when that is another day. */
const landingUrl = () => (state.day && state.day !== dayKeyOf(Date.now()) ? `${location.pathname}?d=${state.day}` : location.pathname);

/** Where the draw view stands right now, so "Draw a card" opened in a new tab shows the same thing. */
const drawUrl = () => (!state.subject || (state.spotlight && !state.partner) ? landingUrl() : readingQuery());

function refreshDrawLinks() {
  const href = drawUrl();
  for (const a of document.querySelectorAll('a[data-view-link="draw"]')) a.setAttribute('href', href);
}

/** The address bar follows the reading, so a reload or a copied URL shows the same thing. */
function syncUrl() {
  if (state.view === 'deck') return;
  if (state.spotlight && !state.partner) history.replaceState(null, '', landingUrl());
  else if (state.subject && state.day) history.replaceState(null, '', readingQuery());
  refreshDrawLinks();
}

/** Where the saved image says the deck lives; nothing for a local preview. */
function publicHost() {
  const host = location.hostname;
  if (!host || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host) || /\.(local|localhost|test)$/.test(host)) return null;
  return location.host;
}

function showState(name) {
  for (const el of document.querySelectorAll('.verdict__state')) el.hidden = el.dataset.state !== name;
  if (name !== 'drawn') {
    state.reading = null;
    faceDown();
    setText('#slug', 'Wheel Arcana · plate unturned');
    setSpot(null);
    markDeck(-1);
    $('#week').hidden = true;
    state.weekSig = null;
    state.weekWindow = null;
    $('#w-pair').hidden = true;
    $('#w-steps').hidden = true;
    $('#w-recompute').hidden = true;
    setText('#w-source', '');
    setText(
      '#w-lede',
      'Draw a card and every input shows up here: the round it was cut from, the settlement transaction, the hash, the arithmetic. Nothing is hidden and nothing is random.',
    );
  }
}

function setSpot(colour) {
  const chip = $('#spot-chip');
  chip.style.background = colour ? colour.hex : '';
  setText('#spot-label', colour ? `spot ink: ${colour.name}` : 'spot ink: not yet drawn');
}

/** Ring the drawn card in the deck; in the gallery its tile also says whose card it is. */
function markDeck(index, r = null) {
  for (const item of document.querySelectorAll('.deck__item')) {
    const on = Number(item.dataset.index) === index;
    item.classList.toggle('is-drawn', on);
    item.querySelector('.mini').classList.toggle('is-drawn', on);
    const tag = item.querySelector('.deck__tag');
    tag.textContent = on && r ? deckTag(r) : '';
    tag.hidden = !(on && r);
  }
}

function deckTag(r) {
  const when = r.frame.dayKey === dayKeyOf(Date.now()) ? 'today' : `on ${dayMonth(r.frame.dayKey)}`;
  const way = r.reversed ? ', reversed' : '';
  if (isHamster(r.subject)) return `Squeektoshi drew this ${when}${way}.`;
  if (state.source === 'wallet') return `Your card ${when}${way}.`;
  return `Drawn for ${shortHex(r.subject)} ${when}${way}.`;
}

/* ---------- the card ---------- */

function settle(tarot) {
  if (reducedMotion()) return new Promise((resolve) => setTimeout(resolve, 180));
  return new Promise((resolve) => {
    const inner = tarot.querySelector('.tarot__inner');
    const done = () => {
      inner.removeEventListener('transitionend', done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, 1200);
    inner.addEventListener('transitionend', done);
  });
}

function faceDown() {
  const tarot = $('#tarot');
  state.faceKey = null;
  state.turnSeq += 1;
  tarot.dataset.face = 'back';
  tarot.setAttribute('aria-label', 'A face-down card');
}

async function turnUp(card, reversed, key) {
  const tarot = $('#tarot');
  const seq = ++state.turnSeq;
  if (tarot.dataset.face === 'front') {
    tarot.dataset.face = 'back';
    await settle(tarot);
    if (seq !== state.turnSeq) return;
  }
  setText('#plate-numeral', card.numeral);
  setText('#plate-name', card.name);
  setText('#plate-motto', card.omen);
  $('#plate-window').replaceChildren(glyphSvg(card.glyph));
  tarot.dataset.reversed = String(reversed);
  tarot.setAttribute('aria-label', `${card.numeral}, ${card.name}${reversed ? ', reversed' : ''}`);
  void tarot.offsetWidth;
  tarot.dataset.face = 'front';
  state.faceKey = key;
}

/* ---------- loading the chain ---------- */

async function loadEnv() {
  setText('#loading-line', 'Asking the Squeekchain API which SqueekCore is live.');
  const where = await resolveCore(config.apiBase);
  const client = makeClient(config.rpcUrl);
  setText('#loading-line', `Reading every settled round from SqueekCore ${shortHex(where.core)} on Sepolia.`);
  const clock = await readClock(client, where.core);
  const ledger = createLedger({ client, core: where.core, fromBlock: where.deploymentBlock });
  await ledger.sync();
  state.env = { client, clock, ledger, ...where };
  const link = $('#core-link');
  link.href = `${config.explorer}/address/${where.core}`;
  link.textContent = shortHex(where.core);
  renderSkyDials();
  setInterval(refreshLedger, config.ledgerEveryMs);
  return state.env;
}

function ensureEnv() {
  if (!state.booting) {
    state.booting = loadEnv().catch((err) => {
      state.booting = null;
      throw err;
    });
  }
  return state.booting;
}

async function refreshLedger() {
  if (document.hidden || !state.env) return;
  const { ledger } = state.env;
  const before = `${ledger.frontier}|${ledger.rounds().length}`;
  try {
    await ledger.sync();
  } catch {
    return;
  }
  renderSkyDials();
  if (before !== `${ledger.frontier}|${ledger.rounds().length}` && state.subject) reveal();
}

/* ---------- drawing ---------- */

async function reveal() {
  if (state.spotlight) state.subject = coreAddress();
  const { subject, day } = state;
  if (!subject) {
    showState('idle');
    return;
  }
  if (day > dayKeyOf(Date.now())) {
    showFuture(day);
    return;
  }
  const genesis = state.env?.clock.genesis ?? config.genesisFallback;
  if (dayStartUnix(day) + 86400n <= genesis) {
    showBefore(day);
    return;
  }
  if (!state.env) {
    showState('loading');
    try {
      await ensureEnv();
    } catch (err) {
      showError(err);
      return;
    }
    // The spotlight follows the core the API names, which only became known just now.
    if (state.spotlight) state.subject = coreAddress();
    else if (subject !== state.subject) return;
    if (day !== state.day) return;
  }
  const { ledger, clock } = state.env;
  const r = castReading({ rounds: ledger.rounds(), frontier: ledger.frontier, clock, subject: state.subject, dayKey: day, nowSec: nowSec() });
  if (r.status === 'future') showFuture(day);
  else if (r.status === 'before-wheel') showBefore(day);
  else if (r.status === 'no-work') showFuture(day, true);
  else showDrawn(r);
}

function showFuture(day, noWorkYet = false) {
  showState('future');
  setEyebrow('#future-eyebrow', day, state.subject);
  if (noWorkYet) {
    setText('#future-line', 'SqueekCore has not settled a single active round yet, so there is nothing to cut the deck with. Come back after his first night shift.');
    return;
  }
  const start = Number(dayStartUnix(day)) * 1000;
  const nights = Math.round((start - Number(dayStartUnix(dayKeyOf(Date.now()))) * 1000) / 86400000);
  const local = livesInUtc() ? '' : ` (${new Date(start).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })} your time)`;
  setText(
    '#future-line',
    `This card gets cut at 00:00 UTC on ${shortDay(day)}, ${span(start - Date.now())} from now${local}. The deck is cut from the hamster's settled work up to that moment, and he still has ${nights === 1 ? "tonight's shift" : `${nights} night shifts`} to run. Check back then; this link will work.`,
  );
}

function showBefore(day) {
  showState('before');
  setText('#before-eyebrow', longDay(day));
}

function showError(err) {
  showState('error');
  const reason = err?.shortMessage || err?.message || String(err);
  setText(
    '#error-line',
    `The Sepolia RPC (${new URL(config.rpcUrl).host}) didn't return the round history: ${reason.slice(0, 160)}. The card can only be cut from settled chain data, so try again in a moment.`,
  );
}

function showDrawn(r) {
  const card = ARCANA[r.cardIndex];
  const colour = PALETTE[r.colourIndex];
  const key = `${r.subject}|${r.frame.dayKey}|${r.cardIndex}|${r.reversed}`;
  const fresh = state.faceKey !== key;
  showState('drawn');
  state.reading = { ...r, card, colour };
  fillVerdict(r, card, colour);
  fillWorkings(r, card, colour);
  setSpot(colour);
  markDeck(card.index, r);
  setText('#slug', `Plate ${card.numeral} · proof for ${shortDay(r.frame.dayKey)}`);
  if (fresh) {
    turnUp(card, r.reversed, key);
    note(`Drawn: ${card.numeral} · ${card.name}${r.reversed ? ', reversed' : ''}.`);
  } else {
    const tarot = $('#tarot');
    tarot.dataset.face = 'front';
    state.faceKey = key;
  }
  renderWeek(r);
  renderPair(r);
  enrichSettlement(r);
}

/** The one-line reading for the way the card came up (saved image and post). */
const oneLine = (r) => (r.reversed ? r.card.line.reversed : r.card.line.upright);

/** The lucky round as a ten-minute window of the day. */
function luckyWindow(r, round = r.luckyRound, slot = r.luckySlot) {
  const { clock } = state.env;
  const slotStart = r.frame.start + slot * clock.roundDuration;
  const slotEnd = slotStart + clock.roundDuration;
  const window = `${hhmmUtc(slotStart)}–${hhmmUtc(slotEnd)} UTC`;
  return { slotStart, slotEnd, window, label: round >= 1n ? `Round ${fmt(round)} · ${window}` : window };
}

/** x.com/intent/post with a short line in the deck's voice and the permalink (?a=&d=). */
function postIntent(r) {
  const day = shortDay(r.frame.dayKey);
  const title = `${r.card.numeral} · ${r.card.name}${r.reversed ? ', reversed' : ''}`;
  const lead = isHamster(r.subject)
    ? `Squeektoshi drew his own Squeekscope card for ${day}: ${title}.`
    : state.source === 'wallet'
      ? `My Squeekscope card for ${day}: ${title}.`
      : `Squeekscope card for ${shortHex(r.subject)} on ${day}: ${title}.`;
  const text = `${lead} “${oneLine(r)}” Cut by a hamster's onchain wheel work, and anyone can recompute it.`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(permalink(r.subject, r.frame.dayKey))}`;
}

function fillVerdict(r, card, colour) {
  const { ledger } = state.env;
  setEyebrow('#v-eyebrow', r.frame.dayKey, r.subject);
  setText('#v-numeral', card.numeral);
  setText('#v-name', card.name);
  const orient = setText('#v-orient', r.reversed ? 'Reversed' : 'Upright');
  orient.classList.toggle('is-reversed', r.reversed);
  setText('#v-keys', card.keys.join(' · '));
  setText('#v-meaning', r.reversed ? card.reversed : card.upright);
  setText('#v-omen', card.omen);

  // lucky round: a ten-minute slot of this UTC day
  const { slotStart, slotEnd, label } = luckyWindow(r);
  setText('#v-lucky', label);
  const local = livesInUtc() ? '' : `${hhmmLocal(slotStart)} your time. `;
  let luckyNote;
  if (r.luckyRound < 1n) luckyNote = 'That slot came before the wheel existed, so it is a free one.';
  else if (r.luckyRound <= ledger.frontier) {
    const hit = ledger.rounds().find((x) => x.roundId === r.luckyRound);
    luckyNote = hit
      ? `Squeektoshi logged ${fmt(hit.work)} work in it, about ${Math.round(Number(hit.work) * config.metresPerWork)} m of wheel.`
      : 'The wheel was still that round. A quiet one.';
  } else if (Number(slotEnd) <= nowSec()) luckyNote = 'Over, but not settled onchain yet.';
  else if (Number(slotStart) <= nowSec()) luckyNote = 'It is happening right now.';
  else luckyNote = `Still ahead, in ${span(Number(slotStart) * 1000 - Date.now())}.`;
  setText('#v-lucky-note', local + luckyNote);

  $('#v-swatch').style.background = colour.hex;
  setText('#v-colour', colour.name);
  setText('#v-colour-note', colour.note);

  const e = r.energy;
  const level = ENERGY[e.level];
  document.querySelectorAll('#v-pips i').forEach((pip, i) => pip.classList.toggle('is-on', i < e.level));
  setText('#v-energy', level.name);
  let energyNote;
  if (e.to < 1n) energyNote = 'The 24 hours before this day came before the wheel existed.';
  else {
    const km = (Number(e.work) * config.metresPerWork) / 1000;
    energyNote = `${fmt(e.work)} work${e.work > 0n ? `, about ${km.toFixed(1)} km` : ''}, in rounds ${fmt(e.from < 1n ? 1n : e.from)}–${fmt(e.to)}: the 24 hours before the day began. ${level.line}`;
    if (!e.complete) energyNote += ' Still counting: some of those rounds are not settled yet.';
  }
  setText('#v-energy-note', energyNote);

  const seal = $('#v-seal');
  seal.className = `seal is-${r.anchor.kind}`;
  const first = r.frame.firstRound;
  const lines = {
    sealed: [
      'Sealed',
      `Every round before this day is certified on SqueekCore (settled through round ${fmt(ledger.frontier)}), so this card will never change.`,
    ],
    provisional: [
      'Provisional',
      `SqueekCore has certified rounds through ${fmt(ledger.frontier)}, but this card is cut from round ${fmt(first - 1n)} and earlier. If the hamster ran in rounds ${fmt(ledger.frontier + 1n)}–${fmt(first - 1n)}, the card can still change. Settlements land about every ten minutes, and this page checks again on its own.`,
    ],
    borrowed: [
      'Borrowed anchor',
      `No settled work existed before this day began, so the deck borrows the very first active round on record, round ${fmt(r.anchor.round.roundId)}.`,
    ],
  }[r.anchor.kind];
  seal.replaceChildren(make('b', '', lines[0]), document.createTextNode(lines[1]));

  $('#share').href = postIntent({ ...r, card });

  const today = dayKeyOf(Date.now());
  if (r.frame.dayKey === today) {
    const next = Number(dayStartUnix(today) + 86400n);
    const local2 = livesInUtc() ? '' : ` (${hhmmLocal(next)} your time)`;
    setText('#v-next', `The next card turns over at 00:00 UTC, in ${span(next * 1000 - Date.now())}${local2}.`);
  } else setText('#v-next', `A card from a past day. It will read the same forever; pick today's date for a fresh one.`);
}

function fillWorkings(r, card, colour) {
  const { clock, ledger, core, source } = state.env;
  const f = r.frame;
  const day = f.dayKey;
  $('#w-steps').hidden = false;
  $('#w-recompute').hidden = false;
  setText('#w-lede', 'Every input is public. Run the same arithmetic on the same chain data and you get this exact card.');
  setText('#w-day', day);
  setText('#w-day-2', day);
  setText('#w-start', f.start.toString());
  setText('#w-start-2', f.start.toString());
  setText('#w-genesis', clock.genesis.toString());
  setText('#w-duration', clock.roundDuration.toString());
  setText('#w-first', f.firstRound.toString());
  setText('#w-first-2', f.firstRound.toString());
  setText('#w-perday', f.perDay.toString());
  const why = {
    sealed: `The last active round before round ${f.firstRound} (rounds with zero work are skipped).`,
    provisional: `The last active round before round ${f.firstRound} that SqueekCore has certified so far.`,
    borrowed: 'No active round existed before this day, so the first active round on record stands in.',
  }[r.anchor.kind];
  setText('#w-anchor-why', why);
  setText('#w-anchor', r.anchor.round.roundId.toString());
  setText('#w-hash', r.anchor.round.dataHash);
  setText('#w-subject', r.subject);
  setText('#w-seed', r.seed);
  setText('#w-card', `${r.cardIndex} → ${card.numeral} ${card.name}`);
  setText('#w-orient', `${r.reversed ? 1 : 0} → ${r.reversed ? 'reversed' : 'upright'}`);
  setText('#w-lucky', r.luckyRound.toString());
  setText('#w-colour', `${r.colourIndex} → ${colour.name}`);
  setText(
    '#w-energy-range',
    r.energy.from >= 1n ? `${r.energy.from}–${r.energy.to}` : `${r.energy.from}–${r.energy.to} (only ${r.energy.to < 1n ? 'pre-genesis rounds, which never existed' : `1–${r.energy.to} existed`})`,
  );
  setText('#w-energy', `${r.energy.work} work (${r.energy.activeRounds} active rounds) → ${ENERGY[r.energy.level].name}`);

  const txLine = $('#w-tx-line');
  if (!r.anchor.round.txHash) {
    txLine.replaceChildren(document.createTextNode('Looking up the settlement transaction…'));
  } else paintTx(r.anchor.round.txHash, r.anchor.round.blockNumber, null);

  setText(
    '#w-snippet',
    [
      "import { keccak256, encodePacked } from 'viem';",
      '',
      'const seed = BigInt(keccak256(encodePacked(',
      "  ['bytes32', 'address', 'string'],",
      `  ['${r.anchor.round.dataHash}',`,
      `   '${r.subject}',`,
      `   '${day}'],`,
      ')));',
      'console.log({',
      `  card: seed % 22n,                                  // ${r.cardIndex}n = ${card.name}`,
      `  reversed: (seed >> 255n) === 1n,                  // ${r.reversed}`,
      `  luckyRound: ${f.firstRound}n + ((seed >> 64n) % ${f.perDay}n), // ${r.luckyRound}n`,
      `  colour: (seed >> 128n) % 12n,                     // ${r.colourIndex}n = ${colour.name}`,
      '});',
    ].join('\n'),
  );

  const how = {
    logs: 'RoundRecorded logs (eth_getLogs, 45k-block chunks)',
    roundPage: 'roundPage() reads, because eth_getLogs failed',
    'logs+roundPage': 'RoundRecorded logs, with a gap filled from roundPage()',
  }[ledger.source];
  setText(
    '#w-source',
    `Rounds come from ${how} on SqueekCore ${core} from block ${fmt(ledger.fromBlock ?? 0n)}, read at Sepolia block ${fmt(ledger.snapshotBlock)} when the core was certified through round ${fmt(ledger.frontier)}. Core address from ${source === 'api' ? 'the API (/v1/core)' : 'the fallback in config.js'}; genesis and round length from ${clock.source === 'chain' ? 'the core’s configuration()' : 'config.js'}.`,
  );
}

function paintTx(txHash, blockNumber, when) {
  const txLine = $('#w-tx-line');
  const a = make('a', '', shortHex(txHash, 10, 8));
  a.href = `${config.explorer}/tx/${txHash}`;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  const bits = [];
  if (blockNumber !== null && blockNumber !== undefined) bits.push(`block ${fmt(blockNumber)}`);
  if (when) bits.push(`${shortDay(dayKeyOf(when * 1000))} ${hhmmUtc(when)} UTC`);
  txLine.replaceChildren(document.createTextNode('Settled in '), a, document.createTextNode(bits.length ? ` (${bits.join(', ')}).` : '.'));
}

async function enrichSettlement(r) {
  const { ledger, core } = state.env;
  const round = r.anchor.round;
  const found = await ledger.settlementOf(round);
  if (state.reading?.seed !== r.seed) return;
  if (!found) {
    const a = make('a', '', 'the core’s events on Etherscan');
    a.href = `${config.explorer}/address/${core}#events`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    $('#w-tx-line').replaceChildren(
      document.createTextNode(`The settlement transaction could not be looked up right now. Round ${round.roundId} is listed in `),
      a,
      document.createTextNode('.'),
    );
    return;
  }
  paintTx(found.txHash, found.blockNumber, null);
  const when = await ledger.blockTime(found.blockNumber);
  if (state.reading?.seed === r.seed && when) paintTx(found.txHash, found.blockNumber, when);
}

/* ---------- the week ---------- */

const COUNT = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'];

/** "23–25 Oct", "30 Sep – 2 Oct" or "29 Oct" for a run of days. */
function dayRange(days) {
  const first = days[0];
  const last = days[days.length - 1];
  if (first === last) return dayMonth(first);
  if (first.slice(0, 7) === last.slice(0, 7)) return `${Number(first.slice(8))}–${dayMonth(last)}`;
  return `${dayMonth(first)} – ${dayMonth(last)}`;
}

function weekOwner(subject) {
  if (isHamster(subject)) return "Squeektoshi's week";
  return state.source === 'wallet' ? 'Your week' : "This wallet's week";
}

function weekSig(w) {
  return w.status === 'drawn'
    ? `${w.frame.dayKey}:${w.cardIndex}:${w.reversed ? 1 : 0}:${w.anchor.kind}:${w.anchor.round.roundId}`
    : `${w.frame.dayKey}:${w.status}`;
}

/** A small card: the plate's art, or the deck's back when there is nothing to show. */
function chit(card, reversed) {
  const face = make('span', card ? 'chit' : 'chit chit--down');
  face.setAttribute('aria-hidden', 'true');
  if (card) {
    face.classList.toggle('is-reversed', reversed);
    face.append(glyphSvg(card.glyph));
  }
  return face;
}

function weekDay(w, i, isLast) {
  const day = w.frame.dayKey;
  const li = make('li', 'week__day');
  li.style.setProperty('--i', String(i));
  const date = make('span', 'week__date');
  date.append(make('span', 'week__dow', weekday(day)), make('span', 'week__dom', String(Number(day.slice(8)))));
  if (w.status !== 'drawn') {
    const genesis = state.env.clock.genesis;
    const why = {
      'before-wheel': ['Before the wheel', `Squeektoshi clocked in on ${shortDay(dayKeyOf(Number(genesis) * 1000))} at ${hhmmUtc(genesis)} UTC, so there is no work to cut this day from.`],
      'no-work': ['Nothing yet', 'SqueekCore has not settled a single active round yet, so there is nothing to cut.'],
      future: ['Not cut yet', 'This day has not begun, so the wheel has not spoken.'],
    }[w.status] ?? ['Face down', 'Nothing to cut this day from.'];
    const box = make('div', 'week__card is-down');
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', `${longDay(day)}: face down. ${why[1]}`);
    box.title = why[1];
    box.append(date, chit(null), make('span', 'week__numeral', '–'), make('span', 'week__name', why[0]));
    li.append(box);
    return li;
  }
  const card = ARCANA[w.cardIndex];
  const anchor = w.anchor.round.roundId;
  const btn = make('button', 'week__card');
  btn.type = 'button';
  btn.classList.toggle('is-provisional', w.anchor.kind === 'provisional');
  if (isLast) btn.setAttribute('aria-current', 'date');
  btn.append(
    date,
    chit(card, w.reversed),
    make('span', 'week__numeral', card.numeral),
    make('span', 'week__name', card.name),
    make('span', 'week__meta', `${w.reversed ? 'Reversed' : 'Upright'} · round ${anchor}`),
  );
  const kind = {
    sealed: '',
    provisional: ' Provisional: it can still change.',
    borrowed: ` Borrows round ${anchor}, the first work on record.`,
  }[w.anchor.kind];
  btn.setAttribute(
    'aria-label',
    `${longDay(day)}: ${card.numeral}, ${card.name}, ${w.reversed ? 'reversed' : 'upright'}, cut from round ${anchor}.${kind}${isLast ? ' This is the card above.' : ' Open this day.'}`,
  );
  btn.title = `${card.numeral} ${card.name}${w.reversed ? ', reversed' : ''}. Anchor round ${anchor}.`;
  btn.addEventListener('click', () => (isLast ? focusReading() : choose(state.subject, day, state.source, { scroll: true })));
  li.append(btn);
  return li;
}

function weekNote(week) {
  const drawn = week.filter((w) => w.status === 'drawn');
  const parts = [];
  if (drawn.length) {
    const rev = drawn.filter((w) => w.reversed).length;
    const ways = rev === 0 ? 'all upright' : rev === drawn.length && rev > 1 ? 'every one reversed' : `${COUNT[rev].toLowerCase()} reversed`;
    parts.push(`${COUNT[drawn.length]} card${drawn.length === 1 ? '' : 's'} turned, ${ways}.`);
    const seen = new Map();
    for (const w of drawn) seen.set(w.cardIndex, (seen.get(w.cardIndex) ?? 0) + 1);
    const [repeat, times] = [...seen.entries()].sort((a, b) => b[1] - a[1])[0];
    if (times > 1) parts.push(`${ARCANA[repeat].name} came up ${times === 2 ? 'twice' : `${COUNT[times].toLowerCase()} times`}: the wheel is repeating itself.`);
  }
  const before = week.filter((w) => w.status === 'before-wheel').map((w) => w.frame.dayKey);
  if (before.length) parts.push(`${dayRange(before)} ${before.length > 1 ? 'stay' : 'stays'} face down: the wheel had not started yet.`);
  if (week.some((w) => w.status === 'no-work')) parts.push('Nothing is settled onchain yet, so every card waits face down for his first shift.');
  const provisional = drawn.filter((w) => w.anchor.kind === 'provisional').map((w) => w.frame.dayKey);
  if (provisional.length) parts.push(`${dayRange(provisional)} ${provisional.length > 1 ? 'are' : 'is'} provisional (dashed) until SqueekCore certifies the rounds before midnight UTC.`);
  const borrowed = drawn.find((w) => w.anchor.kind === 'borrowed');
  if (borrowed) parts.push(`${dayMonth(borrowed.frame.dayKey)} borrows round ${borrowed.anchor.round.roundId}, the first work on record.`);
  return parts.join(' ');
}

function renderWeek(r) {
  const { ledger, clock } = state.env;
  const week = castWeek({ rounds: ledger.rounds(), frontier: ledger.frontier, clock, subject: r.subject, dayKey: r.frame.dayKey, nowSec: nowSec() });
  $('#week').hidden = false;
  setText('#week-title', weekOwner(r.subject));
  setText(
    '#week-lede',
    `The seven UTC days ending ${longDay(r.frame.dayKey)}. Same rule as the card above, and every day is cut from its own anchor round. Tap a day to open it.`,
  );
  const sig = `${r.subject}|${week.map(weekSig).join('|')}`;
  if (sig === state.weekSig) return;
  const windowKey = `${r.subject}|${r.frame.dayKey}`;
  const row = $('#week-row');
  row.classList.toggle('is-turning', state.weekWindow !== windowKey && !reducedMotion());
  state.weekSig = sig;
  state.weekWindow = windowKey;
  row.replaceChildren(...week.map((w, i) => weekDay(w, i, i === week.length - 1)));
  setText('#week-note', weekNote(week));
}

/* ---------- two wallets ---------- */

function pairNote(message, isError = false) {
  const el = setText('#pair-note', message);
  el.classList.toggle('is-error', isError);
}

function nameOf(address, mine) {
  if (isHamster(address)) return 'Squeektoshi';
  if (mine && state.source === 'wallet') return 'You';
  return shortHex(address);
}

function renderPair(r) {
  const box = $('#pair-result');
  const step = $('#w-pair');
  const partner = state.partner && state.partner !== r.subject ? state.partner : null;
  const other = partner
    ? castReading({ rounds: state.env.ledger.rounds(), frontier: state.env.ledger.frontier, clock: state.env.clock, subject: partner, dayKey: r.frame.dayKey, nowSec: nowSec() })
    : null;
  const pair = other ? castPair(r, other) : null;
  box.hidden = !pair;
  step.hidden = !pair;
  if (!pair) return;
  const mine = ARCANA[r.cardIndex];
  const theirs = ARCANA[other.cardIndex];
  const a = nameOf(r.subject, true);
  const b = nameOf(partner, false);
  const way = (rev) => (rev ? ', reversed' : '');

  const eyebrow = $('#pair-eyebrow');
  eyebrow.replaceChildren(
    document.createTextNode('Wheel compatibility · with '),
    isHamster(partner) ? document.createTextNode('Squeektoshi') : make('span', 'eyebrow__who', shortHex(partner)),
  );
  $('#pair-cards').replaceChildren(chit(mine, r.reversed), make('span', 'pair__steps', pair.distance === 0 ? 'same plate' : `${pair.distance} step${pair.distance === 1 ? '' : 's'}`), chit(theirs, other.reversed));
  setText('#pair-score', String(pair.score));
  setText('#pair-band', BONDS[pair.band].name);
  const apart = pair.distance === 0 ? 'the very same plate' : `${pair.distance} step${pair.distance === 1 ? '' : 's'} apart the short way round the wheel`;
  setText(
    '#pair-text',
    `${a} drew ${mine.numeral} ${mine.name}${way(r.reversed)}; ${b} drew ${theirs.numeral} ${theirs.name}${way(other.reversed)}. That is ${apart}. ${BONDS[pair.band].line} ${BOND_WAYS[pair.sameWay ? (r.reversed ? 'reversed' : 'upright') : 'mixed']}`,
  );
  const shared = luckyWindow(r, pair.sharedRound, pair.sharedSlot);
  setText('#pair-round', `Run together in ${pair.sharedRound >= 1n ? `round ${fmt(pair.sharedRound)}, ` : ''}${shared.window}.`);

  // the workings panel
  setText('#w-pair-subject', partner);
  setText('#w-pair-seed', other.seed);
  setText('#w-pair-card', `${other.cardIndex} → ${theirs.numeral} ${theirs.name}, ${other.reversed ? 'reversed' : 'upright'}`);
  setText('#w-pair-distance', `min(|${r.cardIndex} − ${other.cardIndex}|, 22 − |${r.cardIndex} − ${other.cardIndex}|) = ${pair.distance} → ${BONDS[pair.band].name}`);
  setText('#w-pair-score', `(11 − ${pair.distance}) × 8 + ${pair.sameWay ? 12 : 0} = ${pair.score}`);
  setText('#w-pair-seed2', pair.seed);
  setText('#w-pair-first', r.frame.firstRound.toString());
  setText('#w-pair-perday', r.frame.perDay.toString());
  setText('#w-pair-round', pair.sharedRound.toString());
}

/* ---------- actions ---------- */

function choose(subject, day, source, { scroll = false } = {}) {
  if (state.spotlight) endSpotlight();
  if (subject !== state.subject && state.partner) {
    // a pair belongs to one wallet; a new wallet starts single
    state.partner = null;
    $('#partner').value = '';
    pairNote('');
  }
  state.subject = subject;
  state.day = day;
  state.source = source;
  $('#who').value = subject;
  $('#day').value = day;
  clearInvalid();
  note('');
  syncUrl();
  reveal();
  if (scroll) focusReading();
  else if (matchMedia('(max-width: 879px)').matches) {
    $('#reading').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }
}

/** Bring the reading into view and put focus on its title (used by the week strip). */
function focusReading() {
  $('#reading').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  const title = document.querySelector('[data-state="drawn"]:not([hidden]) .verdict__title');
  if (title) title.focus({ preventScroll: true });
}

function explainBadAddress(raw) {
  if (/\.eth$/i.test(raw)) return 'ENS names are not looked up here. Paste the 0x address instead.';
  if (!raw.startsWith('0x')) return 'An address starts with 0x followed by 40 hex characters.';
  if (raw.length !== 42) return `An address is 42 characters long including the 0x; that one is ${raw.length}.`;
  if (/[^0-9a-fA-F]/.test(raw.slice(2))) return 'That has characters that are not hex (0–9, a–f).';
  return 'The capital letters do not match the address checksum, so there is probably a typo. Paste it again, or use all lowercase.';
}

function selectedDay() {
  const v = $('#day').value;
  return isDayKey(v) ? v : dayKeyOf(Date.now());
}

function wireForm() {
  $('#ask').addEventListener('submit', (event) => {
    event.preventDefault();
    const raw = $('#who').value.trim();
    if (!raw) {
      markInvalid('#who', 'Paste an address first, or use one of the buttons below.');
      return;
    }
    const subject = normalizeSubject(raw);
    if (!subject) {
      markInvalid('#who', explainBadAddress(raw));
      return;
    }
    choose(subject, selectedDay(), isHamster(subject) ? 'hamster' : 'paste');
  });

  $('#day').addEventListener('change', () => {
    const day = $('#day').value;
    if (!isDayKey(day)) return;
    if (state.spotlight) {
      // Still on the landing: Squeektoshi's card follows the date, and the address field stays yours to fill.
      state.day = day;
      fillSpot();
      syncUrl();
      reveal();
    } else if (state.subject) choose(state.subject, day, state.source);
  });

  $('#hamster-card').addEventListener('click', () => choose(coreAddress(), selectedDay(), 'hamster'));

  $('#connect').addEventListener('click', async () => {
    const wallet = window.ethereum;
    if (!wallet || typeof wallet.request !== 'function') {
      note('No browser wallet found. Paste an address instead; it draws exactly the same card.', true);
      return;
    }
    note('Asking your wallet for its address. Squeekscope never asks for a signature or a transaction.');
    try {
      const accounts = await wallet.request({ method: 'eth_requestAccounts' });
      const subject = normalizeSubject(Array.isArray(accounts) ? accounts[0] : '');
      if (!subject) {
        note('The wallet did not share an address.', true);
        return;
      }
      choose(subject, selectedDay(), 'wallet');
    } catch (err) {
      if (err?.code === 4001) note('Request declined. You can still paste an address.', true);
      else note(`The wallet said no: ${String(err?.message || err).slice(0, 120)}`, true);
    }
  });

  $('#retry').addEventListener('click', () => reveal());

  $('#pair').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('#partner');
    input.removeAttribute('aria-invalid');
    const raw = input.value.trim();
    if (!raw) {
      input.setAttribute('aria-invalid', 'true');
      pairNote('Paste a second address first: a friend, a rival, a contract.', true);
      return;
    }
    const partner = normalizeSubject(raw);
    if (!partner) {
      input.setAttribute('aria-invalid', 'true');
      pairNote(explainBadAddress(raw), true);
      return;
    }
    if (partner === state.subject) {
      input.setAttribute('aria-invalid', 'true');
      pairNote('That is the same wallet. A card is always perfectly compatible with itself.', true);
      return;
    }
    state.partner = partner;
    syncUrl();
    if (state.reading) renderPair(state.reading);
    pairNote(`Read against ${isHamster(partner) ? 'Squeektoshi' : shortHex(partner)}. The pair is in the link now.`);
  });

  $('#pair-clear').addEventListener('click', () => {
    state.partner = null;
    $('#partner').value = '';
    syncUrl();
    if (state.reading) renderPair(state.reading);
    pairNote('Second wallet cleared.');
    $('#partner').focus();
  });

  $('#save').addEventListener('click', async () => {
    const r = state.reading;
    if (!r) return;
    const button = $('#save');
    button.disabled = true;
    try {
      const canvas = await printReading($('#press'), {
        card: r.card,
        reversed: r.reversed,
        line: oneLine(r),
        seed: r.seed,
        dayLabel: longDay(r.frame.dayKey),
        subject: isHamster(r.subject) ? null : shortHex(r.subject),
        luckyLabel: luckyWindow(r).label,
        colour: r.colour,
        provisional: r.anchor.kind === 'provisional',
        host: publicHost(),
      });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('the browser would not export the canvas');
      const url = URL.createObjectURL(blob);
      const a = make('a');
      a.href = url;
      a.download = `squeekscope-${r.frame.dayKey}-${r.subject.slice(2, 8).toLowerCase()}.png`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      note(`Image saved (${canvas.width} × ${canvas.height}). Attach it to your post on X; it never left this browser.`);
    } catch (err) {
      note(`Could not make the image: ${err?.message || err}`, true);
    } finally {
      button.disabled = false;
    }
  });

  $('#copy-link').addEventListener('click', async () => {
    const r = state.reading;
    if (!r) return;
    const link = permalink(r.subject, r.frame.dayKey, state.partner);
    try {
      await navigator.clipboard.writeText(link);
      note(`Link copied. Anyone who opens it sees this exact card${state.partner ? ' and the pair reading' : ''}.`);
    } catch {
      note(`Copy this link: ${link}`);
    }
  });

  $('#copy-snippet').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#w-snippet').textContent);
      note('Snippet copied.');
    } catch {
      note('Select the snippet and copy it by hand.', true);
    }
  });
}

/* ---------- the deck ---------- */

/**
 * One tile per card. On the reading page only the small card shows; in the gallery (?deck) the
 * name and both one-line readings sit beside it. The words are the deck's own constants.
 */
function renderDeck() {
  const grid = $('#deck-grid');
  for (const card of ARCANA) {
    const li = make('li', 'deck__item');
    li.dataset.index = String(card.index);
    const button = make('button', 'mini');
    button.type = 'button';
    button.dataset.index = String(card.index);
    button.setAttribute('aria-label', `${card.numeral}, ${card.name}: read its meanings`);
    button.append(make('span', 'mini__numeral', card.numeral), glyphSvg(card.glyph), make('span', 'mini__name', card.name));
    button.addEventListener('click', () => openLeaf(card));
    const name = make('h3', 'deck__name');
    name.append(make('span', 'deck__numeral', card.numeral), document.createTextNode(` ${card.name}`));
    const tag = make('p', 'deck__tag');
    tag.hidden = true;
    const lines = make('dl', 'deck__lines');
    lines.append(
      make('dt', 'deck__way', 'Upright'),
      make('dd', 'deck__line', card.line.upright),
      make('dt', 'deck__way deck__way--reversed', 'Reversed'),
      make('dd', 'deck__line', card.line.reversed),
    );
    const words = make('div', 'deck__words');
    words.append(name, tag, lines);
    li.append(button, words);
    grid.append(li);
  }
}

function openLeaf(card) {
  const dialog = $('#leaf');
  $('#leaf-art').replaceChildren(glyphSvg(card.glyph));
  setText('#leaf-numeral', `Plate ${card.numeral}`);
  setText('#leaf-name', card.name);
  setText('#leaf-keys', card.keys.join(' · '));
  setText('#leaf-upright', card.upright);
  setText('#leaf-reversed', card.reversed);
  setText('#leaf-omen', card.omen);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

/* ---------- tonight's moon ---------- */

const SKY_ART = {
  running: ARCANA[7].glyph,
  asleep: SNOOZE,
  stale: PHASES.stale,
  fault: PHASES.fault,
  unknown: PHASES.unknown,
};

function renderSky() {
  const sky = state.sky ?? { phase: 'unknown' };
  if (state.skyPhase !== sky.phase) {
    state.skyPhase = sky.phase;
    $('#sky-art').replaceChildren(glyphSvg(SKY_ART[sky.phase] ?? PHASES.unknown));
  }
  const heard = sky.receivedAt ? span(Date.now() - sky.receivedAt) : null;
  const copy = {
    running: [
      'Full wheel: Squeektoshi is running',
      `He is on the wheel right now${sky.rpm !== null ? ` at ${Math.round(sky.rpm)} rpm` : ''}. Tomorrow's cards are being mined as you read this.`,
    ],
    asleep: [
      'New moon: Squeektoshi is asleep',
      'The wheel is still and the sensor keeps listening anyway. Asleep is his normal state for most of the day, and the cards do not mind: they are cut from work he already settled.',
    ],
    stale: [
      'Clouded over: the feed went quiet',
      `No word from the wheel${heard ? ` for ${heard}` : ''}. He is probably asleep; the feed definitely is.`,
    ],
    fault: ['Eclipse: the counter is confused', 'The wheel counter reported a fault, so no new work counts until a human checks the magnet.'],
    unknown: [
      'No moon tonight',
      "The live feed didn't answer. Cards are cut from settled chain data, so readings still work without it.",
    ],
  }[sky.phase] ?? ['No moon tonight', ''];
  setText('#sky-title', copy[0]);
  setText('#sky-line', copy[1]);
  renderSkyDials();
}

function dial(sel, main, small) {
  const dd = $(sel);
  dd.replaceChildren(document.createTextNode(main), ...(small ? [make('small', '', small)] : []));
}

function renderSkyDials() {
  const sky = state.sky;
  if (sky && sky.phase !== 'unknown') {
    dial('#sky-rpm', sky.rpm === null ? '–' : `${Math.round(sky.rpm)} rpm`, sky.metresPerSecond === null ? '' : `${sky.metresPerSecond.toFixed(2)} m/s`);
    dial('#sky-km', sky.kmToday === null ? '–' : `${sky.kmToday.toFixed(2)} km`, 'on the wheel today');
    dial('#sky-fresh', sky.freshness ?? '–', sky.receivedAt ? `heard ${span(Date.now() - sky.receivedAt)} ago` : '');
  } else {
    dial('#sky-rpm', '–');
    dial('#sky-km', '–');
    dial('#sky-fresh', 'no answer');
  }
  const clock = state.env?.clock ?? { genesis: config.genesisFallback, roundDuration: config.roundDurationFallback };
  const frontier = state.env?.ledger.frontier ?? sky?.settledThroughRound ?? null;
  dial('#sky-round', `#${fmt(currentRound(nowSec(), clock))}`, frontier === null ? '' : `settled through #${fmt(frontier)}`);
}

function habitHours() {
  if (livesInUtc()) return '';
  const base = Number(dayStartUnix(dayKeyOf(Date.now())));
  const at = (h, m) => hhmmLocal(base + h * 3600 + m * 60);
  return ` (${at(21, 0)}–${at(3, 0)} and ${at(5, 30)}–${at(7, 0)} your time)`;
}

function startSky() {
  const api = createApi(config.apiBase);
  setText('#sky-local', habitHours());
  const tick = async () => {
    try {
      state.sky = readSky(await api.get('/status', { minAgeMs: 1000 }));
    } catch {
      if (!state.sky || state.sky.phase !== 'unknown') state.sky = { phase: 'unknown' };
    }
    renderSky();
  };
  tick();
  setInterval(() => {
    if (!document.hidden) tick();
  }, config.statusEveryMs);
  setInterval(() => {
    if (!document.hidden) renderSkyDials();
  }, 5000);
}

/* ---------- the landing spotlight: Squeektoshi draws first ---------- */

/** No address in the link: draw the hamster's own card (the "Squeektoshi's own card" draw) and keep the form folded away. */
function startSpotlight(day) {
  state.spotlight = true;
  state.subject = coreAddress();
  state.source = 'hamster';
  state.day = day;
  state.partner = null;
  $('#who').value = '';
  $('#partner').value = '';
  $('#day').value = day;
  pairNote('');
  document.documentElement.dataset.spot = 'on';
  fillSpot();
  reveal();
}

function endSpotlight() {
  state.spotlight = false;
  delete document.documentElement.dataset.spot;
}

function fillSpot() {
  const when = state.day === dayKeyOf(Date.now()) ? 'today' : shortDay(state.day);
  setText(
    '#spot-line',
    `This is Squeektoshi's own card for ${when}, cut from the wheel work he settled on Sepolia. Every wallet gets a card of its own from the same cut, and nobody picks it.`,
  );
}

/** "Now draw yours": unfold the form where the spotlight note was and put the cursor in the address field. */
function openAsk() {
  if (document.documentElement.dataset.spot) {
    delete document.documentElement.dataset.spot;
    note("Paste any wallet address, or use your wallet: it only asks for the address. Squeektoshi's card stays until you draw.");
  }
  $('#who').focus();
}

/* ---------- views: the reading and the deck (?deck) ---------- */

function setView(view) {
  state.view = view;
  document.documentElement.dataset.view = view;
  for (const tab of document.querySelectorAll('.masthead__tab')) {
    if (tab.dataset.viewLink === view) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  const skip = $('.skip');
  skip.href = view === 'deck' ? '#deck' : '#reading';
  skip.textContent = view === 'deck' ? 'Skip to the deck' : 'Skip to the reading';
  document.title = view === 'deck' ? 'The Wheel Arcana · Squeekscope' : 'Squeekscope · daily hamster tarot';
  refreshDrawLinks();
}

function openDeck() {
  if (state.view !== 'deck') history.pushState(null, '', `${location.pathname}?deck`);
  setView('deck');
  window.scrollTo(0, 0);
  $('#deck-title').focus({ preventScroll: true });
}

/** Back from the gallery: to your own reading if you have one, otherwise straight to the address field. */
function openDraw() {
  const fromDeck = state.view === 'deck';
  if (fromDeck) {
    history.pushState(null, '', drawUrl());
    setView('draw');
    window.scrollTo(0, 0); // a new page, so jump rather than glide down from the gallery's scroll position
  }
  const title = document.querySelector('[data-state="drawn"]:not([hidden]) .verdict__title');
  if (fromDeck && state.subject && !state.spotlight && title) title.focus({ preventScroll: true });
  else openAsk();
}

/**
 * Read the address bar: ?deck picks the gallery; ?a=&d=&b= pick the reading exactly as before;
 * no ?a= at all leads with Squeektoshi's card. On Back/Forward it only redraws when the bar asks for something else.
 */
function applyLocation({ boot = false } = {}) {
  const params = new URLSearchParams(location.search);
  const deck = params.has('deck');
  setView(deck ? 'deck' : 'draw');
  if (deck && !boot) return;
  const a = params.get('a');
  const d = params.get('d');
  const b = params.get('b');
  const day = d !== null && isDayKey(d) ? d : dayKeyOf(Date.now());
  if (!boot) {
    const subject = a === null ? null : normalizeSubject(a);
    const partner = subject && b !== null ? normalizeSubject(b) : null;
    const same =
      day === state.day &&
      (a === null ? state.spotlight && !state.partner : !state.spotlight && subject === state.subject && (partner ?? null) === state.partner);
    if (same) return;
    note('');
    pairNote('');
  }
  if (d !== null && !isDayKey(d)) note(`"${d.slice(0, 24)}" is not a date in YYYY-MM-DD form, so this is today's card.`, true);
  if (a === null) {
    startSpotlight(day);
    refreshDrawLinks();
    return;
  }
  endSpotlight();
  state.day = day;
  $('#day').value = day;
  state.subject = null;
  state.partner = null;
  $('#partner').value = '';
  const subject = normalizeSubject(a);
  if (subject) {
    state.subject = subject;
    state.source = isHamster(subject) ? 'hamster' : 'link';
    $('#who').value = subject;
  } else note(`"${a.slice(0, 50)}" is not an address. ${explainBadAddress(a)}`, true);
  if (b !== null && state.subject) {
    const partner = normalizeSubject(b);
    if (partner && partner !== state.subject) {
      state.partner = partner;
      $('#partner').value = partner;
    } else pairNote(`The second wallet in this link ("${b.slice(0, 50)}") is not a different valid address, so this is a single reading.`, true);
  }
  refreshDrawLinks();
  reveal();
}

function wireViews() {
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[data-view-link]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (link.dataset.viewLink === 'deck') openDeck();
    else openDraw();
  });
  $('#spot-go').addEventListener('click', () => openAsk());
  window.addEventListener('popstate', () => applyLocation());
}

/* ---------- boot ---------- */

function boot() {
  renderDeck();
  wireForm();
  wireViews();
  startSky();
  ensureEnv().catch(() => {});
  applyLocation({ boot: true });
}

boot();
