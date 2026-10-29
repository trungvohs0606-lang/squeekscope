// Prints a reading onto a 1080 x 1350 <canvas> for "Save image": the card itself (same plates
// as the page via ink.js, same proportions as the CSS card: u = 1% of the card width, the canvas
// twin of the cqi unit), then its name and way up, a one-line reading, the lucky round and colour,
// the day and the site name. The paper grain is seeded by the draw. Nothing leaves the browser.

import { paintGlyph } from './ink.js';

export const SHEET = Object.freeze({ width: 1080, height: 1350 });

const W = SHEET.width;
const H = SHEET.height;
const M = 64; // outer margin
const INK = {
  page: '#f3ecdd',
  stock: '#fbf7ee',
  ink: '#1d1915',
  graphite: '#574f47',
  ox: '#74202a',
  gold: '#d9bc6e',
  goldPale: '#f0e3bd',
  rule: 'rgba(29, 25, 21, 0.22)',
};
const GLYPH_COLOURS = { ink: INK.ink, gold: INK.gold, ox: INK.ox, paper: INK.stock };
const SERIF = "Fraunces, 'Iowan Old Style', Georgia, serif";
const SANS = "'Work Sans', 'Segoe UI', system-ui, sans-serif";
const MONO = "ui-monospace, 'SFMono-Regular', Consolas, 'Liberation Mono', monospace";

// the card keeps the page's 7:12 proportions
const CARD_W = 480;
const CARD_H = Math.round((CARD_W * 12) / 7);
const CARD_X = (W - CARD_W) / 2;
const CARD_Y = 108;

// the sheet, top to bottom
const ROW = {
  header: 52,
  headerRule: 72,
  title: CARD_Y + CARD_H + 83,
  pills: CARD_Y + CARD_H + 125,
  lineTop: CARD_Y + CARD_H + 147,
  lineBottom: CARD_Y + CARD_H + 249,
  facts: CARD_Y + CARD_H + 257,
  footerRule: H - 74,
  footer: H - 36,
};

async function fontsReady() {
  if (!document.fonts?.load) return;
  await Promise.all([
    document.fonts.load(`600 58px ${SERIF}`),
    document.fonts.load(`italic 500 58px ${SERIF}`),
    document.fonts.load(`italic 400 32px ${SERIF}`),
    document.fonts.load(`400 30px ${SANS}`),
    document.fonts.load(`500 17px ${SANS}`),
    document.fonts.load(`600 18px ${SANS}`),
  ]).catch(() => {});
}

/** mulberry32: a tiny deterministic PRNG so the paper grain belongs to this draw. */
function rng(seedHex) {
  let a = Number.parseInt(String(seedHex).slice(2, 10), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function grain(ctx, seedHex) {
  const rand = rng(seedHex);
  for (let i = 0; i < 11000; i++) {
    const r = 0.5 + rand() * 1.1;
    ctx.fillStyle = `rgba(78, 60, 38, ${(0.025 + rand() * 0.05).toFixed(3)})`;
    ctx.fillRect(rand() * W, rand() * H, r, r);
  }
  ctx.strokeStyle = 'rgba(78, 60, 38, 0.05)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 120; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const a = rand() * Math.PI;
    const l = 6 + rand() * 14;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 2, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function trackedWidth(ctx, text, spacing) {
  const chars = [...text];
  return chars.reduce((s, c) => s + ctx.measureText(c).width, 0) + spacing * (chars.length - 1);
}

/** Left-aligned text with manual tracking (canvas letterSpacing is not everywhere yet). Returns the end x. */
function trackedAt(ctx, text, x, y, spacing) {
  ctx.textAlign = 'left';
  for (const c of text) {
    ctx.fillText(c, x, y);
    x += ctx.measureText(c).width + spacing;
  }
  return x - spacing;
}

/** Centred tracked text. */
function tracked(ctx, text, cx, y, spacing) {
  trackedAt(ctx, text, cx - trackedWidth(ctx, text, spacing) / 2, y, spacing);
}

function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function diamond(ctx, x, y, half, fill) {
  ctx.beginPath();
  ctx.moveTo(x, y - half);
  ctx.lineTo(x + half, y);
  ctx.lineTo(x, y + half);
  ctx.lineTo(x - half, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function cardFace(ctx, x, y, w, h, card, reversed) {
  const u = w / 100;
  roundRect(ctx, x, y, w, h, 3.6 * u);
  ctx.fillStyle = INK.stock;
  ctx.fill();
  ctx.lineWidth = 0.4 * u;
  ctx.strokeStyle = INK.ink;
  ctx.stroke();

  // .plate: inset 3.6, border 0.9, inset rule 1.5 further in (0.35 wide)
  const px = x + 3.6 * u;
  const py = y + 3.6 * u;
  const pw = w - 7.2 * u;
  const ph = h - 7.2 * u;
  const B = 0.9 * u;
  ctx.lineWidth = B;
  ctx.strokeRect(px + B / 2, py + B / 2, pw - B, ph - B);
  const rule = B + 1.5 * u + 0.175 * u;
  ctx.lineWidth = 0.35 * u;
  ctx.strokeRect(px + rule, py + rule, pw - 2 * rule, ph - 2 * rule);
  const c = B + 3.5 * u + 1.2 * u;
  for (const [cx, cy] of [[px + c, py + c], [px + pw - c, py + c], [px + c, py + ph - c], [px + pw - c, py + ph - c]]) {
    diamond(ctx, cx, cy, 1.7 * u, INK.gold);
  }

  const mid = x + w / 2;
  const contentW = pw - 2 * (B + 6.4 * u);

  // numeral
  ctx.fillStyle = INK.ink;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 ${9.4 * u}px ${SERIF}`;
  tracked(ctx, card.numeral, mid, py + B + 4.6 * u + 1.2 * u + 7.6 * u, 0.4 * u);

  // window with the pale gold disc and the plate itself
  const wx = px + B + 6.4 * u;
  const ww = contentW;
  const wy = py + B + 4.6 * u + 1.2 * u + 9.4 * u + 4.2 * u;
  const wh = ww * 1.22;
  ctx.fillStyle = INK.goldPale;
  ctx.beginPath();
  ctx.arc(wx + ww / 2, wy + wh / 2, (ww * 0.82) / 2, 0, Math.PI * 2);
  ctx.fill();
  const g = ww * 0.92;
  paintGlyph(ctx, card.glyph, wx + (ww - g) / 2, wy + (wh - g) / 2, g, GLYPH_COLOURS, reversed);
  ctx.lineWidth = 0.45 * u;
  ctx.strokeStyle = INK.ink;
  ctx.strokeRect(wx, wy, ww, wh);

  // name
  const nameTop = wy + wh + 4.6 * u;
  ctx.fillStyle = INK.ink;
  ctx.font = `600 ${6.5 * u}px ${SERIF}`;
  tracked(ctx, card.name.toUpperCase(), mid, nameTop + 5.6 * u, 0.65 * u);

  // rule with a gold diamond
  const ruleY = nameTop + 7.15 * u + 2.6 * u + 1.2 * u;
  ctx.fillStyle = INK.ink;
  ctx.fillRect(mid - 15 * u, ruleY - 0.175 * u, 30 * u, 0.35 * u);
  diamond(ctx, mid, ruleY, 1.34 * u + 1 * u, INK.stock);
  diamond(ctx, mid, ruleY, 1.34 * u, INK.gold);

  // motto (the card's omen), centred in what is left of the plate
  const mottoTop = ruleY + 1.2 * u + 2.2 * u;
  const mottoBottom = py + ph - B - 5.4 * u;
  ctx.font = `italic 400 ${4.7 * u}px ${SERIF}`;
  ctx.fillStyle = INK.graphite;
  ctx.textAlign = 'center';
  const lines = wrap(ctx, card.omen, contentW * 0.9);
  const lh = 4.7 * u * 1.3;
  let ly = (mottoTop + mottoBottom) / 2 - (lines.length * lh) / 2 + lh * 0.78;
  for (const line of lines) {
    ctx.fillText(line, mid, ly);
    ly += lh;
  }

  if (reversed) {
    ctx.font = `600 ${3.9 * u}px ${SANS}`;
    const label = 'REVERSED';
    const spacing = 0.7 * u;
    const bw = trackedWidth(ctx, label, spacing) + 4.4 * u + 1.2 * u;
    const bh = 3.9 * u + 2.4 * u + 1.2 * u;
    ctx.save();
    ctx.translate(wx + ww + 1.5 * u - bw / 2, wy + wh - 4 * u - bh / 2);
    ctx.rotate((-9 * Math.PI) / 180);
    ctx.fillStyle = INK.stock;
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.lineWidth = 0.6 * u;
    ctx.strokeStyle = INK.ox;
    ctx.strokeRect(-bw / 2 + 0.3 * u, -bh / 2 + 0.3 * u, bw - 0.6 * u, bh - 0.6 * u);
    ctx.fillStyle = INK.ox;
    ctx.textBaseline = 'middle';
    tracked(ctx, label, 0, 0.3 * u, spacing);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  }
}

/** Printer's crop marks just outside each corner, as on the page. */
function cropMarks(ctx, x0, y0, w, h) {
  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = 1.5;
  for (const [x, y, sx, sy] of [[x0, y0, -1, -1], [x0 + w, y0, 1, -1], [x0, y0 + h, -1, 1], [x0 + w, y0 + h, 1, 1]]) {
    ctx.beginPath();
    ctx.moveTo(x + sx * 8, y);
    ctx.lineTo(x + sx * 24, y);
    ctx.moveTo(x, y + sy * 8);
    ctx.lineTo(x, y + sy * 24);
    ctx.stroke();
  }
}

/** The masthead's wheel mark (index.html, viewBox 0 0 40 40), centred on (cx, cy). */
function mark(ctx, cx, cy, size) {
  const s = size / 40;
  ctx.save();
  ctx.translate(cx - 20 * s, cy - 20 * s);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.arc(20, 20, 16, 0, Math.PI * 2);
  ctx.strokeStyle = INK.ox;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(20, 20, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.stroke(new Path2D('M20 8v24M8 20h24M11.5 11.5l17 17M28.5 11.5l-17 17'));
  ctx.beginPath();
  ctx.arc(20, 20, 3.4, 0, Math.PI * 2);
  ctx.fillStyle = INK.gold;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Day on the left, whose card on the right, over a rule. */
function header(ctx, r) {
  const y = ROW.header;
  const spacing = 2.2;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 18px ${SANS}`;
  ctx.fillStyle = INK.graphite;
  trackedAt(ctx, r.dayLabel.toUpperCase(), M, y, spacing);
  if (r.subject) {
    ctx.font = `500 19px ${MONO}`;
    const aw = ctx.measureText(r.subject).width;
    ctx.fillStyle = INK.ink;
    ctx.textAlign = 'left';
    ctx.fillText(r.subject, W - M - aw, y);
    ctx.font = `600 18px ${SANS}`;
    ctx.fillStyle = INK.graphite;
    trackedAt(ctx, 'FOR', W - M - aw - 12 - trackedWidth(ctx, 'FOR', spacing), y, spacing);
  } else {
    const label = "SQUEEKTOSHI'S OWN CARD";
    trackedAt(ctx, label, W - M - trackedWidth(ctx, label, spacing), y, spacing);
  }
  ctx.fillStyle = INK.ink;
  ctx.fillRect(M, ROW.headerRule, W - 2 * M, 1.5);
}

/** "XX The Block": numeral in oxblood italic, name in ink, shrunk until it fits. */
function title(ctx, card) {
  let size = 58;
  let wn;
  let wr;
  for (;;) {
    ctx.font = `italic 500 ${size}px ${SERIF}`;
    wn = ctx.measureText(card.numeral).width;
    ctx.font = `600 ${size}px ${SERIF}`;
    wr = ctx.measureText(` ${card.name}`).width;
    if (wn + wr <= W - 2 * M || size <= 30) break;
    size -= 2;
  }
  const x = W / 2 - (wn + wr) / 2;
  ctx.textAlign = 'left';
  ctx.fillStyle = INK.ink;
  ctx.fillText(` ${card.name}`, x + wn, ROW.title);
  ctx.font = `italic 500 ${size}px ${SERIF}`;
  ctx.fillStyle = INK.ox;
  ctx.fillText(card.numeral, x, ROW.title);
}

/** Small boxed labels in a centred row, like the page's orientation tag. */
function pills(ctx, list) {
  const spacing = 2.6;
  const padX = 14;
  const h = 34;
  const gap = 12;
  ctx.font = `600 16px ${SANS}`;
  const widths = list.map((p) => trackedWidth(ctx, p.text, spacing) + 2 * padX);
  let x = W / 2 - (widths.reduce((a, b) => a + b, 0) + gap * (list.length - 1)) / 2;
  list.forEach((p, i) => {
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = p.colour;
    ctx.setLineDash(p.dashed ? [5, 4] : []);
    ctx.strokeRect(x + 0.75, ROW.pills - h / 2 + 0.75, widths[i] - 1.5, h - 1.5);
    ctx.restore();
    ctx.fillStyle = p.colour;
    ctx.textBaseline = 'middle';
    trackedAt(ctx, p.text, x + padX, ROW.pills + 1, spacing);
    ctx.textBaseline = 'alphabetic';
    x += widths[i] + gap;
  });
}

/** The one-line reading, in quotes, on one or two lines. */
function readingLine(ctx, text) {
  let size = 32;
  let lines;
  for (;;) {
    ctx.font = `italic 400 ${size}px ${SERIF}`;
    lines = wrap(ctx, `“${text}”`, W - 2 * M - 40);
    if (lines.length <= 2 || size <= 22) break;
    size -= 2;
  }
  lines = lines.slice(0, 2);
  const lh = Math.round(size * 1.3);
  let y = (ROW.lineTop + ROW.lineBottom) / 2 - (lines.length * lh) / 2 + lh * 0.72;
  ctx.fillStyle = INK.ink;
  ctx.textAlign = 'center';
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += lh;
  }
}

/** Lucky round and lucky colour, two cells under a rule. */
function facts(ctx, r) {
  const top = ROW.facts;
  const colW = (W - 2 * M) / 2;
  ctx.fillStyle = INK.ink;
  ctx.fillRect(M, top, W - 2 * M, 1.5);
  ctx.fillStyle = INK.rule;
  ctx.fillRect(W / 2 - 0.5, top + 16, 1, 58);
  const cells = [
    { label: 'LUCKY ROUND', cx: M + colW / 2, value: r.luckyLabel },
    { label: 'LUCKY COLOUR', cx: M + colW * 1.5, value: r.colour.name, chip: r.colour.hex },
  ];
  for (const cell of cells) {
    ctx.font = `600 14px ${SANS}`;
    ctx.fillStyle = INK.graphite;
    tracked(ctx, cell.label, cell.cx, top + 31, 1.7);
    const chipW = cell.chip ? 22 + 11 : 0;
    let size = 26;
    ctx.font = `600 ${size}px ${SERIF}`;
    while (ctx.measureText(cell.value).width + chipW > colW - 36 && size > 15) {
      size -= 1;
      ctx.font = `600 ${size}px ${SERIF}`;
    }
    const vy = top + 64;
    let x = cell.cx - (ctx.measureText(cell.value).width + chipW) / 2;
    if (cell.chip) {
      ctx.fillStyle = cell.chip;
      ctx.fillRect(x, vy - 19, 22, 22);
      ctx.strokeStyle = INK.ink;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x + 0.6, vy - 18.4, 20.8, 20.8);
      x += chipW;
    }
    ctx.fillStyle = INK.ink;
    ctx.textAlign = 'left';
    ctx.fillText(cell.value, x, vy);
  }
}

/** A double rule like the masthead's, the wordmark, and where to find it. */
function footer(ctx, r) {
  ctx.fillStyle = INK.ink;
  ctx.fillRect(M, ROW.footerRule, W - 2 * M, 1.2);
  ctx.fillRect(M, ROW.footerRule + 3.6, W - 2 * M, 1.2);
  const y = ROW.footer;
  mark(ctx, M + 17, y - 9, 34);
  ctx.font = `600 27px ${SERIF}`;
  ctx.fillStyle = INK.ink;
  ctx.textAlign = 'left';
  ctx.fillText('Squeekscope', M + 44, y);
  const where = r.host ? `daily hamster tarot · ${r.host}` : "a daily hamster tarot, cut by a hamster's onchain work";
  let size = 17;
  ctx.font = `500 ${size}px ${SANS}`;
  while (ctx.measureText(where).width > W - 2 * M - 250 && size > 11) {
    size -= 1;
    ctx.font = `500 ${size}px ${SANS}`;
  }
  ctx.fillStyle = INK.graphite;
  ctx.textAlign = 'right';
  ctx.fillText(where, W - M, y);
  ctx.textAlign = 'left';
}

/**
 * Print a reading and return the canvas (always SHEET.width x SHEET.height).
 * r: { card, reversed, line, seed, dayLabel, subject (short address, or null for the hamster),
 *      luckyLabel, colour: { name, hex }, provisional, host }
 */
export async function printReading(canvas, r) {
  await fontsReady();
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = INK.page;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, r.seed);

  header(ctx, r);
  cropMarks(ctx, CARD_X, CARD_Y, CARD_W, CARD_H);
  cardFace(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, r.card, r.reversed);
  ctx.textBaseline = 'alphabetic';
  title(ctx, r.card);
  pills(ctx, [
    { text: r.reversed ? 'REVERSED' : 'UPRIGHT', colour: r.reversed ? INK.ox : INK.ink },
    ...(r.provisional ? [{ text: 'PROVISIONAL', colour: INK.ox, dashed: true }] : []),
  ]);
  readingLine(ctx, r.line);
  facts(ctx, r);
  footer(ctx, r);
  return canvas;
}
