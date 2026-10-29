// The Wheel Arcana: twenty-two cards for a hamster who mines on Sepolia.
// Art is plain path data on a 100 x 100 grid (see ink.js for the two printers).

/* ---------- drawing helpers ---------- */

const r2 = (n) => Math.round(n * 100) / 100;
const pt = (x, y) => `${r2(x)} ${r2(y)}`;
const rad = (deg) => (deg * Math.PI) / 180;
const polar = (cx, cy, r, deg) => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))];
const turn = (x, y, deg, cx, cy) => {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [cx + x * c - y * s, cy + x * s + y * c];
};

const circle = (cx, cy, r) =>
  `M${pt(cx - r, cy)}a${r2(r)} ${r2(r)} 0 1 0 ${r2(2 * r)} 0a${r2(r)} ${r2(r)} 0 1 0 ${r2(-2 * r)} 0Z`;
const oval = (cx, cy, rx, ry, deg = 0) => {
  const a = turn(-rx, 0, deg, cx, cy);
  const b = turn(rx, 0, deg, cx, cy);
  return `M${pt(...a)}A${r2(rx)} ${r2(ry)} ${r2(deg)} 1 0 ${pt(...b)}A${r2(rx)} ${r2(ry)} ${r2(deg)} 1 0 ${pt(...a)}Z`;
};
const seg = (x1, y1, x2, y2) => `M${pt(x1, y1)}L${pt(x2, y2)}`;
const segP = (a, b) => seg(a[0], a[1], b[0], b[1]);
const poly = (pts, close = false) => `M${pts.map(([x, y]) => pt(x, y)).join('L')}${close ? 'Z' : ''}`;
const rrect = (x, y, w, h, r) =>
  `M${pt(x + r, y)}L${pt(x + w - r, y)}Q${pt(x + w, y)} ${pt(x + w, y + r)}L${pt(x + w, y + h - r)}Q${pt(x + w, y + h)} ${pt(x + w - r, y + h)}L${pt(x + r, y + h)}Q${pt(x, y + h)} ${pt(x, y + h - r)}L${pt(x, y + r)}Q${pt(x, y)} ${pt(x + r, y)}Z`;

/** Four-point twinkle, the deck's star. */
const spark = (cx, cy, r) => {
  const q = r * 0.2;
  return `M${pt(cx, cy - r)}Q${pt(cx + q, cy - q)} ${pt(cx + r, cy)}Q${pt(cx + q, cy + q)} ${pt(cx, cy + r)}Q${pt(cx - q, cy + q)} ${pt(cx - r, cy)}Q${pt(cx - q, cy - q)} ${pt(cx, cy - r)}Z`;
};
const rays = (cx, cy, r1, r2_, n, offset = 0) =>
  Array.from({ length: n }, (_, i) => segP(polar(cx, cy, r1, offset + (360 / n) * i), polar(cx, cy, r2_, offset + (360 / n) * i))).join('');
const almond = (cx, cy, len, wid, deg = 0) => {
  const h = len / 2;
  const k = wid * 0.667;
  const P = (x, y) => pt(...turn(x, y, deg, cx, cy));
  return `M${P(0, -h)}C${P(k, -h * 0.55)} ${P(k, h * 0.55)} ${P(0, h)}C${P(-k, h * 0.55)} ${P(-k, -h * 0.55)} ${P(0, -h)}Z`;
};
const seedShape = (cx, cy, len, wid, deg = 0) => {
  const h = len / 2;
  const k = wid * 0.7;
  const P = (x, y) => pt(...turn(x, y, deg, cx, cy));
  return `M${P(0, -h)}C${P(k, -h * 0.3)} ${P(k * 0.92, h * 0.78)} ${P(0, h)}C${P(-k * 0.92, h * 0.78)} ${P(-k, -h * 0.3)} ${P(0, -h)}Z`;
};
const seed = (cx, cy, len, wid, deg = 0, s = 'goldline') => {
  const P = (x, y) => pt(...turn(x, y, deg, cx, cy));
  return [
    { d: seedShape(cx, cy, len, wid, deg), s },
    { d: `M${P(0, -len * 0.3)}L${P(0, len * 0.36)}`, s: 'hair' },
  ];
};
/** Crescent with its lit side facing `deg` + 180 (deg 0 = opening to the right). */
const crescent = (cx, cy, r, deg = 0) => {
  const R = r * 1.18;
  const [tx, ty] = turn(0, -r, deg, cx, cy);
  const [bx, by] = turn(0, r, deg, cx, cy);
  return `M${pt(tx, ty)}A${r2(r)} ${r2(r)} 0 0 0 ${pt(bx, by)}A${r2(R)} ${r2(R)} 0 0 1 ${pt(tx, ty)}Z`;
};
const sector = (cx, cy, r1, r2_, a1, a2) => {
  const large = a2 - a1 > 180 ? 1 : 0;
  return `M${pt(...polar(cx, cy, r2_, a1))}A${r2_} ${r2_} 0 ${large} 1 ${pt(...polar(cx, cy, r2_, a2))}L${pt(...polar(cx, cy, r1, a2))}A${r1} ${r1} 0 ${large} 0 ${pt(...polar(cx, cy, r1, a1))}Z`;
};
const star = (cx, cy, ro, ri, n, deg = -90) =>
  poly(Array.from({ length: n * 2 }, (_, i) => polar(cx, cy, i % 2 ? ri : ro, deg + (i * 180) / n)), true);
const gear = (cx, cy, ri, ro, teeth) => {
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const a = (360 / teeth) * i;
    const w = 360 / teeth / 4;
    pts.push(polar(cx, cy, ri, a - w * 1.5), polar(cx, cy, ro, a - w * 0.7), polar(cx, cy, ro, a + w * 0.7), polar(cx, cy, ri, a + w * 1.5));
  }
  return poly(pts, true);
};
const zee = (x, y, s) => poly([[x, y], [x + s, y], [x, y + s], [x + s, y + s]]);
const heart = (cx, cy, s) =>
  `M${pt(cx, cy + 6 * s)}C${pt(cx - 7.4 * s, cy + 0.6 * s)} ${pt(cx - 5 * s, cy - 6.2 * s)} ${pt(cx, cy - 2.4 * s)}C${pt(cx + 5 * s, cy - 6.2 * s)} ${pt(cx + 7.4 * s, cy + 0.6 * s)} ${pt(cx, cy + 6 * s)}Z`;
const drop = (cx, cy, r) =>
  `M${pt(cx, cy - r * 1.7)}C${pt(cx + r * 0.9, cy - r * 0.5)} ${pt(cx + r * 1.05, cy + r)} ${pt(cx, cy + r)}C${pt(cx - r * 1.05, cy + r)} ${pt(cx - r * 0.9, cy - r * 0.5)} ${pt(cx, cy - r * 1.7)}Z`;
/** A hamster paw print; toes point toward `deg` (0 = up). */
const paw = (cx, cy, s, deg = 0) => {
  const P = (x, y) => turn(x * s, y * s, deg, cx, cy);
  const [px, py] = P(0, 1.1);
  return [
    oval(px, py, 1.7 * s, 1.35 * s, deg),
    ...[[-1.9, -0.7], [-0.7, -1.75], [0.7, -1.75], [1.9, -0.7]].map(([x, y]) => circle(...P(x, y), 0.62 * s)),
  ].join('');
};
const arrowArc = (cx, cy, r, a1, a2, head = 2.8) => {
  const [x1, y1] = polar(cx, cy, r, a1);
  const [x2, y2] = polar(cx, cy, r, a2);
  const tx = -Math.sin(rad(a2));
  const ty = Math.cos(rad(a2));
  const back = (ang) => {
    const c = Math.cos(rad(ang));
    const s = Math.sin(rad(ang));
    return [x2 - head * (tx * c - ty * s), y2 - head * (tx * s + ty * c)];
  };
  return `M${pt(x1, y1)}A${r2(r)} ${r2(r)} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${pt(x2, y2)}M${pt(...back(34))}L${pt(x2, y2)}L${pt(...back(-34))}`;
};
const DIGITS = {
  2: [[[0, 0], [1, 0], [1, 0.5], [0, 0.5], [0, 1], [1, 1]]],
  4: [[[0, 0], [0, 0.5], [1, 0.5]], [[1, 0], [1, 1]]],
  5: [[[1, 0], [0, 0], [0, 0.5], [1, 0.5], [1, 1], [0, 1]]],
};
const digit = (n, x, y, w, h) => DIGITS[n].map((l) => poly(l.map(([u, v]) => [x + u * w, y + v * h]))).join('');
const bez = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return [0, 1].map((i) => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i]);
};
const bezAngle = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  const d = [0, 1].map((i) => 3 * u * u * (p1[i] - p0[i]) + 6 * u * t * (p2[i] - p1[i]) + 3 * t * t * (p3[i] - p2[i]));
  return (Math.atan2(d[1], d[0]) * 180) / Math.PI;
};
const dots = (list, r) => list.map(([x, y]) => circle(x, y, r)).join('');

/** Group parts under a transform: scale s (and mirror), rotate, then move to (x, y). */
const place = (parts, { x = 0, y = 0, s = 1, rot = 0, flip = false } = {}) => {
  const c = Math.cos(rad(rot));
  const n = Math.sin(rad(rot));
  const f = flip ? -1 : 1;
  const m = [s * f * c, s * f * n, -s * n, s * c, x, y].map((v) => Math.round(v * 10000) / 10000 + 0);
  return { g: parts, k: s, m };
};

/* ---------- the hamster, facing right, sitting on y = 80 ---------- */

const HAMSTER_BODY = 'M30 80C20 80 16 72 18 63C20 48 33 36 50 35C64 34 76 41 81 52C84 58 84 63 80 67C76 72 70 76 62 79L30 80Z';

function hamster({ shut = false, ear = true } = {}) {
  return [
    { d: 'M18.6 66C15 65.5 14.4 69 17.4 70.2', s: 'hair' },
    ...(ear ? [{ d: 'M58.5 37C55 28.5 63.5 23.5 68 30.5C69.2 32.6 69 35 67.4 37.2', s: 'goldline' }] : []),
    { d: HAMSTER_BODY, s: 'paper' },
    { d: 'M18.5 63C20 48 33 36 50 35C64 34 76 41 81 52C74 52 70 56 68 62C64 70 52 70 40 70C30 70 22 68 18.5 63Z', s: 'gold' },
    { d: HAMSTER_BODY, s: 'line' },
    ...(ear ? [{ d: 'M61 35C60 30.5 63.8 28.6 66 32', s: 'hair' }] : []),
    ...(shut
      ? [{ d: 'M68.4 47.6C69.8 49.4 72.4 49.4 73.6 47.4', s: 'line' }]
      : [{ d: circle(71, 47.6, 2.4), s: 'ink' }, { d: circle(71.9, 46.7, 0.75), s: 'paper' }]),
    { d: circle(82.1, 58.4, 1.6), s: 'ox' },
    { d: 'M80.2 63.2C79 64.8 77.4 65.2 76.2 64.4', s: 'hair' },
    { d: 'M80 59.4L93 55.6M80.6 61.2L94 61.6M79.6 63.2L91 67.2', s: 'hair' },
    { d: 'M63.5 79.6C63.4 76.2 69.6 75.6 70.2 79.6Z', s: 'paperline' },
    { d: 'M26 80C26.2 77.4 31.4 77 33 80', s: 'line' },
  ];
}

/* ---------- plates ---------- */

const KEYHOLE = 'M47 53L45 64L55 64L53 53A5 5 0 1 0 47 53Z';

function wheelParts(cx, cy, ro, ri, { gilded }) {
  const parts = [];
  parts.push({ d: segP(polar(cx, cy, ro, 118), [cx - 23, 92]) + segP(polar(cx, cy, ro, 62), [cx + 23, 92]), s: 'line' });
  parts.push({ d: seg(cx - 34, 92, cx + 34, 92), s: 'line' });
  if (gilded) parts.push({ d: circle(cx, cy, ro) + circle(cx, cy, ri), s: 'gold', rule: 'evenodd' });
  parts.push({ d: Array.from({ length: 24 }, (_, i) => segP(polar(cx, cy, ri, i * 15), polar(cx, cy, ro, i * 15))).join(''), s: 'hair' });
  parts.push({ d: circle(cx, cy, ro) + circle(cx, cy, ri), s: 'line' });
  parts.push({ d: Array.from({ length: 6 }, (_, i) => segP(polar(cx, cy, 4.6, i * 60 + 30), polar(cx, cy, ri, i * 60 + 30))).join(''), s: 'hair' });
  parts.push({ d: circle(cx, cy, 4.6), s: gilded ? 'goldline' : 'paperline' });
  parts.push({ d: circle(cx, cy, 1.5), s: 'ink' });
  return parts;
}

const PLATES = {
  hamster: () => [
    { d: circle(79, 20, 10), s: 'gold' },
    { d: rays(79, 20, 13.5, 18, 8, 22.5), s: 'hair' },
    { d: 'M3 80L75 80C76.6 84.5 73.8 88.5 76 94', s: 'line' },
    { d: 'M8 85.5L27 85.5M33 89.5L56 89.5M14 93.5L40 93.5M46 85.5L64 85.5', s: 'hair' },
    place(hamster(), { x: -11 }),
    { d: spark(20, 17, 4.5), s: 'gold' },
    { d: spark(33, 8, 2.4), s: 'gold' },
  ],

  wheel: () => [
    ...wheelParts(50, 46, 34, 28.5, { gilded: true }),
    { d: arrowArc(50, 46, 40, -64, -24), s: 'hair' },
    { d: arrowArc(50, 46, 40, 116, 156), s: 'hair' },
    { d: spark(12, 12, 4.2), s: 'gold' },
    { d: spark(89, 84, 3.6), s: 'gold' },
  ],

  seed: () => [
    { d: crescent(14, 50, 9, 0), s: 'gold' },
    { d: crescent(86, 50, 9, 180), s: 'gold' },
    { d: 'M50 9C67 25 72 58 50 91C28 58 33 25 50 9Z', s: 'goldline' },
    { d: 'M50 15C54.5 36 54.5 64 50 85M43.2 23C39 40 39.4 60 44.6 78M56.8 23C61 40 60.6 60 55.4 78', s: 'hair' },
    { d: KEYHOLE, s: 'knock' },
    { d: KEYHOLE, s: 'ink' },
    { d: spark(22, 17, 3.6), s: 'gold' },
    { d: spark(78, 83, 3.6), s: 'gold' },
  ],

  burrow: () => [
    { d: 'M3 28C18 25.5 33 30 50 28C66 26 80 29.5 97 26.5', s: 'line' },
    { d: 'M9 27.5L11.5 21L13.5 27.2M68 27.2L70.5 21.5L72.6 27M74 27L76.8 22.5M88 26.8L90 21.8', s: 'hair' },
    { d: 'M27 28.6C27 42 36 50 48.6 52.4', s: 'line' },
    { d: 'M17 28.4C16 46 27 58 36.6 62', s: 'line' },
    { d: 'M48.6 52.4A27 18 0 1 1 36.6 62', s: 'line' },
    { d: 'M41 76.5l4.5-1.6M48 80.6l5-1.2M57 82.4l5-0.4M66 81.6l5-1.4M75 78.6l4.4-2', s: 'hair' },
    { d: 'M58.5 61.5C56.5 56.5 61.5 54 63.5 58.6', s: 'goldline' },
    { d: 'M49 73C48 63.5 56.5 59 65 59C73.5 59 78 65.5 77 72C76 78.5 68.5 80.5 62 80.5C55.5 80.5 50 78.5 49 73Z', s: 'paper' },
    { d: 'M55 60.6C58.4 59.4 61.6 59 65 59C73.5 59 78 65.5 77 72C76 78.5 68.5 80.5 62 80.5C64.6 74 63 66 55 60.6Z', s: 'gold' },
    { d: 'M49 73C48 63.5 56.5 59 65 59C73.5 59 78 65.5 77 72C76 78.5 68.5 80.5 62 80.5C55.5 80.5 50 78.5 49 73Z', s: 'line' },
    { d: 'M53.4 70.4C54.6 72 56.8 72 57.8 70.2', s: 'line' },
    { d: circle(49.6, 73.2, 1.15), s: 'ox' },
    { d: 'M53 78.6c1-1.6 3.2-1.6 3.8 0', s: 'hair' },
    { d: zee(68.5, 51.5, 3.4), s: 'hair' },
    { d: zee(74, 55.5, 2.4), s: 'hair' },
    ...seed(82.6, 75.6, 6.4, 3.2, 32, 'goldhair'),
    ...seed(79.2, 79.4, 6.4, 3.2, -58, 'goldhair'),
    { d: dots([[8, 40], [11, 58], [24, 72], [8, 90], [30, 92], [52, 93], [92, 40], [95, 62], [93, 88], [72, 40], [84, 36], [40, 40], [62, 44], [16, 82]], 0.75), s: 'ink' },
    { d: oval(88, 50, 3.2, 2.2, 10) + oval(12, 70, 2.6, 1.8, -10), s: 'hair' },
  ],

  nightShift: () => {
    const ticks = Array.from({ length: 12 }, (_, i) => ({
      d: segP(polar(50, 56, i % 3 ? 20 : 18.2, i * 30), polar(50, 56, 22.4, i * 30)),
      s: i % 3 ? 'hair' : 'line',
    }));
    return [
      { d: 'M36.5 22C41.5 16 58.5 16 63.5 22', s: 'line' },
      { d: circle(27.5, 33.5, 7.5), s: 'goldline' },
      { d: circle(72.5, 33.5, 7.5), s: 'goldline' },
      { d: 'M33 79L27 88M67 79L73 88', s: 'line' },
      { d: circle(50, 56, 27.5), s: 'paperline' },
      { d: circle(50, 56, 24.2), s: 'hair' },
      ...ticks,
      { d: seg(50, 56, 36.5, 56) + seg(50, 56, 50, 38.6), s: 'line' },
      { d: circle(50, 56, 2.3), s: 'ink' },
      { d: crescent(87, 12, 7.5, 0), s: 'gold' },
      { d: spark(13, 12, 3.8), s: 'gold' },
      { d: spark(91, 44, 2.4), s: 'gold' },
      { d: spark(8, 47, 2.2), s: 'gold' },
    ];
  },

  reporter: () => [
    { d: 'M14 12L51 12L61 22L61 88L14 88Z', s: 'paperline' },
    { d: 'M51 12L51 22L61 22', s: 'line' },
    { d: 'M21 29L43 29M21 36L53 36M21 43L50 43M21 50L46 50M21 57L52 57', s: 'hair' },
    { d: 'M20.5 73C23.5 64.5 26 78 29.8 70.6C32 66.4 33.6 74.4 36.8 70.4C38.8 67.8 40.6 71.6 43.6 69.4', s: 'line' },
    { d: 'M45.2 80.6L41.6 92L45.2 89.4L47.6 93.2L49.2 82.4Z', s: 'ox' },
    { d: circle(50, 77, 7.6), s: 'ox' },
    { d: circle(50, 77, 4.7) + spark(50, 77, 2.4), s: 'paperstroke' },
    { d: 'M90.5 5C98.5 20 89.5 37 71.5 45C71 32 78.5 15 90.5 5Z', s: 'goldline' },
    { d: 'M86.3 16.6L93.4 12.6M83.6 23.6L94.2 20M80.4 30.4L92 28.6M77 37L88 37.6M83.4 18.6L79.4 14.6M80 27L75.4 24.6', s: 'hair' },
    { d: 'M90.5 5C82 25 70 47 56 66', s: 'line' },
    { d: 'M56 66L53.2 71.4L58.8 68.6Z', s: 'ink' },
  ],

  magnet: () => [
    { d: heart(50, 9.5, 0.95), s: 'ox' },
    { d: 'M23 79C17 101 83 101 77 79', s: 'dash' },
    { d: 'M32 78C30 90 39 92.5 43 89M68 78C70 90 61 92.5 57 89', s: 'hair' },
    { d: 'M26 64L26 42A24 24 0 0 1 74 42L74 64L62 64L62 42A12 12 0 0 0 38 42L38 64Z', s: 'oxline' },
    { d: 'M26 64L38 64L38 75L26 75Z', s: 'paperline' },
    { d: 'M62 64L74 64L74 75L62 75Z', s: 'paperline' },
    { d: 'M29 67.5L35 67.5M29 71.5L35 71.5M65 67.5L71 67.5M65 71.5L71 71.5', s: 'hair' },
    { d: 'M43 85.6L57 85.6L57 91.6L43 91.6Z', s: 'ink' },
    { d: 'M46 91.6L46 95.6M50 91.6L50 95.6M54 91.6L54 95.6', s: 'hair' },
    { d: spark(50, 78.4, 3.4), s: 'gold' },
    { d: spark(12, 27, 3.8), s: 'gold' },
    { d: spark(88, 27, 3.8), s: 'gold' },
  ],

  sprint: () => [
    { d: 'M3 45L17 45M6 53L16 53M2 61L13 61', s: 'hair' },
    { d: 'M6 81C30 91 70 91 94 81', s: 'line' },
    { d: 'M16 85.6L14.6 89.4M30 89L29.2 92.6M50 90.6L50 94.2M70 89L70.8 92.6M84 85.6L85.4 89.4', s: 'hair' },
    { d: oval(21.4, 66.6, 7.6, 3.3, 16), s: 'paperline' },
    { d: oval(36.4, 68.2, 6.4, 3.1, 34), s: 'paperline' },
    { d: 'M64.4 41.5C62 34.5 68.6 31.5 72 37.6', s: 'goldline' },
    { d: 'M17.6 57.4C14.6 57 13.4 60 15.8 61.4', s: 'hair' },
    { d: 'M22 58C22 46 36 38 54 40C68 41 80 47 85 55C87 59 85 62.5 81 63C74 64.5 66 66 56 66C42 66 22 68 22 58Z', s: 'paper' },
    { d: 'M22.2 57.2C22 46 36 38.5 54 40C68 41 80 47 85 55C78.5 53.2 72.5 54.4 66.4 58C56 63 40 61 22.2 57.2Z', s: 'gold' },
    { d: 'M22 58C22 46 36 38 54 40C68 41 80 47 85 55C87 59 85 62.5 81 63C74 64.5 66 66 56 66C42 66 22 68 22 58Z', s: 'line' },
    { d: 'M66.6 39.6C66.4 36.6 69 35.6 70.4 38', s: 'hair' },
    { d: circle(74.6, 49.4, 2.3), s: 'ink' },
    { d: circle(75.4, 48.6, 0.72), s: 'paper' },
    { d: circle(85.4, 56.6, 1.5), s: 'ox' },
    { d: 'M83.4 59.2L95 56M83.6 61L96 61.8', s: 'hair' },
    { d: oval(66.4, 69.4, 5.4, 3, 62), s: 'paperline' },
    { d: oval(80.6, 67.6, 7.2, 3.2, -14), s: 'paperline' },
    { d: circle(8.5, 77.5, 2.4) + circle(4, 72.8, 1.6), s: 'hair' },
    { d: spark(88, 24, 4.2), s: 'gold' },
    { d: spark(76, 14, 2.4), s: 'gold' },
  ],

  difficulty: () => {
    const ticks = Array.from({ length: 11 }, (_, i) => ({
      d: segP(polar(50, 74, 30.6, 180 + i * 18), polar(50, 74, i % 5 ? 34.2 : 36.6, 180 + i * 18)),
      s: i % 5 ? 'hair' : 'line',
    }));
    return [
      { d: 'M50 17C45 9 33 9 33 17C33 25 45 25 50 17C55 9 67 9 67 17C67 25 55 25 50 17Z', s: 'line' },
      { d: 'M9 74L91 74L87 83L13 83Z', s: 'goldline' },
      { d: 'M12 74A38 38 0 0 1 88 74Z', s: 'paperline' },
      { d: sector(50, 74, 30.6, 37.4, -66, -46), s: 'gold' },
      { d: 'M19.4 74A30.6 30.6 0 0 1 80.6 74', s: 'hair' },
      ...ticks,
      { d: segP([50, 74], polar(50, 74, 33, -56)) + segP([50, 74], polar(50, 74, 9, 124)), s: 'line' },
      { d: circle(50, 74, 3.6), s: 'ink' },
      { d: circle(50, 74, 1.2), s: 'paper' },
      { d: spark(13, 31, 3.4), s: 'gold' },
      { d: spark(87, 31, 3.4), s: 'gold' },
    ];
  },

  postman: () => [
    { d: 'M4 78.8L96 78.8', s: 'line' },
    { d: paw(7, 74.2, 0.8, 90) + paw(14.5, 76, 0.8, 90), s: 'ox' },
    place(
      [
        ...hamster({ ear: false }),
        { d: 'M64.5 40.5L36 61', s: 'line' },
        { d: 'M24.4 50.6L36.4 49.4L37.2 58L25.2 59.2Z', s: 'paperline' },
        { d: 'M24.4 50.6L30.8 54.2L36.4 49.4', s: 'hair' },
        { d: rrect(20, 57.5, 22, 17, 2.6), s: 'goldline' },
        { d: 'M20.6 58.5L41.4 58.5L40.4 65C34.6 67.2 27.4 67.2 21.6 65Z', s: 'goldline' },
        { d: circle(31, 66.4, 1.5), s: 'ink' },
        { d: 'M52 38.6L53.4 31C54 27 72 25.4 73.6 29.6L74.6 38.6C67 36.6 59.6 36.6 52 38.6Z', s: 'oxline' },
        { d: 'M53.2 31.6C59.6 30.2 67.4 29.8 73.8 31', s: 'hair' },
        { d: 'M73.2 37.4C78.4 36.6 83 37.8 86 40.6C81 41 76.4 40.6 72.6 39.6Z', s: 'ink' },
        { d: spark(63.4, 34.2, 2.2), s: 'gold' },
      ],
      { x: 10, y: 10, s: 0.86 },
    ),
    { d: spark(86, 16, 3.8), s: 'gold' },
    { d: spark(16, 22, 2.6), s: 'gold' },
  ],

  odometer: () => {
    const wins = [0, 1, 2, 3, 4].map((i) => 12.6 + i * 15.6);
    const digits = [2, 2, 5, 4, 2];
    return [
      { d: seg(50, 68, 50, 74.5), s: 'line' },
      { d: rrect(8, 34, 84, 34, 6), s: 'goldline' },
      { d: wins.map((x) => rrect(x, 40, 12.4, 22, 1.6)).join(''), s: 'paperhair' },
      { d: wins.map((x) => seg(x + 1.4, 43, x + 11, 43) + seg(x + 1.4, 59, x + 11, 59)).join(''), s: 'hair' },
      { d: wins.map((x, i) => digit(digits[i], x + 3.4, 45.2, 5.6, 11.6)).join(''), s: 'line' },
      { d: gear(50, 84, 7.6, 10.6, 10), s: 'paperline' },
      { d: circle(50, 84, 2.6), s: 'ink' },
      { d: arrowArc(50, 84, 15, 200, 250) + arrowArc(50, 84, 15, 20, 70), s: 'hair' },
      { d: spark(14, 19, 3.8), s: 'gold' },
      { d: spark(86, 17, 4.2), s: 'gold' },
      { d: spark(70, 25, 2.2), s: 'gold' },
    ];
  },

  settlement: () => [
    { d: 'M50 24L50 83', s: 'line' },
    { d: 'M37 88L63 88L59 83L41 83Z', s: 'goldline' },
    { d: 'M17 30L83 30M17 30L9 55M17 30L25 55M83 30L75 55M83 30L91 55', s: 'hair' },
    { d: 'M17 30L83 30', s: 'line' },
    { d: circle(50, 22, 3.2), s: 'goldline' },
    { d: circle(50, 30, 1.5), s: 'ink' },
    { d: 'M7 55C9 63.5 25 63.5 27 55Z', s: 'goldline' },
    { d: 'M73 55C75 63.5 91 63.5 93 55Z', s: 'goldline' },
    { d: 'M11 47L17 50L17 55.4L11 52.4Z', s: 'paperline' },
    { d: 'M23 47L17 50L17 55.4L23 52.4Z', s: 'paperline' },
    { d: 'M11 47L17 44L23 47L17 50Z', s: 'goldline' },
    ...seed(83, 51.4, 12, 6, 82),
    { d: spark(50, 10, 4), s: 'gold' },
    { d: spark(32, 74, 2.6), s: 'gold' },
    { d: spark(70, 72, 2.6), s: 'gold' },
  ],

  nap: () => [
    { d: 'M12 10L88 10', s: 'line' },
    { d: circle(12, 10, 2) + circle(88, 10, 2), s: 'ink' },
    place(
      [
        ...hamster({ shut: true, ear: false }),
        { d: 'M45.6 38.8C44.6 29 41 22 31.4 18.2C43.6 16.2 57 22.6 66.6 35.8C60 34.6 52 35.6 45.6 38.8Z', s: 'oxline' },
        { d: 'M45.4 38.8C52 35.2 60 34.4 66.8 35.8', s: 'line' },
        { d: circle(30.2, 17.8, 3.2), s: 'goldline' },
      ],
      { rot: 180, x: 100, y: 96 },
    ),
    { d: seg(70.5, 17.4, 70.5, 10), s: 'line' },
    { d: zee(13.4, 64.5, 4.4), s: 'hair' },
    { d: zee(8, 74.5, 3), s: 'hair' },
    { d: spark(80, 77, 3.8), s: 'gold' },
    { d: spark(58, 87, 2.4), s: 'gold' },
  ],

  emptyWheel: () => [
    { d: 'M3 3L3 31M3 3L16 26M3 3L26 16M3 3L31 3', s: 'hair' },
    {
      d: [9, 17, 25]
        .map((r) => poly([polar(3, 3, r, 90), polar(3, 3, r * 0.93, 60.5), polar(3, 3, r * 0.93, 29.5), polar(3, 3, r, 0)]))
        .join(''),
      s: 'hair',
    },
    { d: seg(14.5, 14.5, 14.5, 33), s: 'hair' },
    { d: circle(14.5, 34.6, 1.7), s: 'ink' },
    { d: 'M12 33.2L10 31.4M12 35.6L10 37.6M17 33.2L19 31.4M17 35.6L19 37.6', s: 'hair' },
    ...wheelParts(52, 47, 31, 26, { gilded: false }),
    { d: dots([[40, 36], [63, 57], [58, 33.5], [44, 58]], 0.7), s: 'ink' },
    ...seed(84.5, 88.4, 8.6, 4.2, 66, 'paperline'),
    ...seed(92.6, 86.6, 8, 3.8, 118, 'paperline'),
  ],

  waterBottle: () => [
    { d: 'M10 4L10 96M90 4L90 96M10 24L90 24', s: 'hair' },
    { d: rrect(36, 10, 28, 52, 9), s: 'paper' },
    { d: 'M37 30.5C42 27.5 46 33.5 50 30.5C54 27.5 58 33.5 63 30.5L63 53C63 58.6 59.6 61 54.4 61L45.6 61C40.4 61 37 58.6 37 53Z', s: 'gold' },
    { d: circle(45, 50, 1.8) + circle(55.5, 43, 1.2) + circle(51, 55.6, 1.3), s: 'paperhair' },
    { d: rrect(36, 10, 28, 52, 9), s: 'line' },
    { d: 'M41.4 15L41.4 25', s: 'hair' },
    { d: 'M47.6 70L56 86.6L60 84.6L52.4 70Z', s: 'paperline' },
    { d: rrect(42, 62, 16, 8, 1.6), s: 'ink' },
    { d: 'M45.6 63.6L45.6 68.4M50 63.6L50 68.4M54.4 63.6L54.4 68.4', s: 'paperstroke' },
    { d: circle(58.4, 87.4, 2.6), s: 'ink' },
    { d: drop(63.6, 94, 2), s: 'paperline' },
    { d: spark(22, 52, 3.6), s: 'gold' },
    { d: spark(78, 40, 3.2), s: 'gold' },
    { d: spark(76, 74, 2.2), s: 'gold' },
  ],

  cheekPouch: () => {
    const head = 'M50 22C64 22 72 30 74 38C88 40 94 56 88 68C84 78 70 86 50 86C30 86 16 78 12 68C6 56 12 40 26 38C28 30 36 22 50 22Z';
    return [
      { d: 'M29.5 35C21.5 26.5 25.5 16.5 33.5 19.5C36.5 21 38 24.5 38 28', s: 'goldline' },
      { d: 'M70.5 35C78.5 26.5 74.5 16.5 66.5 19.5C63.5 21 62 24.5 62 28', s: 'goldline' },
      { d: head, s: 'paper' },
      { d: 'M26.4 38.6C28 30 36 22 50 22C64 22 72 30 73.6 38.6C66 41 59 42.4 50 42.4C41 42.4 34 41 26.4 38.6Z', s: 'gold' },
      { d: head, s: 'line' },
      { d: 'M31 30C28 25.5 30.2 22 33.4 23.4M69 30C72 25.5 69.8 22 66.6 23.4', s: 'hair' },
      { d: circle(40, 47, 3) + circle(60, 47, 3), s: 'ink' },
      { d: circle(41.1, 45.9, 1) + circle(61.1, 45.9, 1), s: 'paper' },
      { d: 'M47.4 54.6L52.6 54.6L50 57.8Z', s: 'ox' },
      { d: 'M50 57.8L50 60.6M50 60.6C48.6 62.8 46.4 62.8 45.4 61.2M50 60.6C51.4 62.8 53.6 62.8 54.6 61.2', s: 'hair' },
      { d: 'M34 55.4L19 51.6M34 58.4L18 58.8M66 55.4L81 51.6M66 58.4L82 58.8', s: 'hair' },
      { d: 'M19.6 60C17.6 67 21.6 73 29.6 75M80.4 60C82.4 67 78.4 73 70.4 75', s: 'hair' },
      { d: seedShape(23.6, 66, 7, 3.4, 30) + seedShape(29.6, 70.4, 7, 3.4, -24) + seedShape(76.4, 66, 7, 3.4, -30) + seedShape(70.4, 70.4, 7, 3.4, 24), s: 'dash' },
      ...seed(50, 75.6, 12, 6.2, 0),
      { d: oval(43.2, 78.6, 3.4, 2.7, -20), s: 'paperline' },
      { d: oval(56.8, 78.6, 3.4, 2.7, 20), s: 'paperline' },
    ];
  },

  cageDoor: () => {
    const domeY = (x) => 38 - 26 * Math.sqrt(1 - ((x - 50) / 36) ** 2);
    const doorBar = (x) => seg(x, 54 - ((x - 62) * 4.5) / 15.5, x, 82 + ((x - 62) * 4.5) / 15.5);
    return [
      { d: 'M86 2L77.5 14.5L83 14.5L74.5 28L80 16.6L74.6 16.6L80 2Z', s: 'goldline' },
      { d: seg(26, domeY(26), 26, 82) + seg(74, domeY(74), 74, 82) + seg(50, domeY(50), 50, 54), s: 'hair' },
      { d: seg(38, domeY(38), 38, 82) + seg(62, domeY(62), 62, 82), s: 'line' },
      { d: 'M14 38A36 26 0 0 1 86 38M14 38L14 82M86 38L86 82M38 54L62 54', s: 'line' },
      { d: seg(14, 38, 86, 38), s: 'hair' },
      { d: circle(50, 9.6, 2.6), s: 'goldline' },
      { d: 'M9 82L91 82L88.6 89L11.4 89Z', s: 'goldline' },
      { d: 'M62 54L77.5 49.5L77.5 86.5L62 82Z', s: 'paperline' },
      { d: doorBar(67.2) + doorBar(72.4), s: 'hair' },
      { d: 'M77.5 66C80.8 66 80.8 71 77.5 71', s: 'line' },
      { d: paw(30, 94.6, 0.82, -90) + paw(18, 93, 0.82, -90) + paw(6.5, 94.8, 0.82, -90), s: 'ox' },
    ];
  },

  guardian: () => [
    { d: star(50, 14, 10.5, 4.2, 8), s: 'goldline' },
    { d: 'M50 30C60 36 70 36 80 34C80 62 70 80 50 92C30 80 20 62 20 34C30 36 40 36 50 30Z', s: 'paperline' },
    { d: 'M50 36.4C58.8 41.2 66.6 41.6 74 40.6C73 62 65 76 50 85.6C35 76 27 62 26 40.6C33.4 41.6 41.2 41.2 50 36.4Z', s: 'hair' },
    { d: rrect(39.4, 48, 7.2, 25, 1.6) + rrect(53.4, 48, 7.2, 25, 1.6), s: 'ox' },
    { d: spark(15, 20, 4), s: 'gold' },
    { d: spark(86, 22, 3.2), s: 'gold' },
    { d: spark(10, 55, 2.6), s: 'gold' },
    { d: spark(91, 58, 2.6), s: 'gold' },
  ],

  midnightLap: () => [
    { d: crescent(42, 32, 20, 0), s: 'goldline' },
    { d: 'M29.6 27.4C31.2 29.8 34.2 29.8 35.6 27.4', s: 'line' },
    { d: circle(33, 35.4, 0.95), s: 'ox' },
    { d: spark(70, 16, 4.2), s: 'gold' },
    { d: spark(85, 35, 2.6), s: 'gold' },
    { d: spark(63, 42, 2), s: 'gold' },
    { d: spark(14, 10, 2.6), s: 'gold' },
    { d: oval(50, 77, 42, 12.5), s: 'dash' },
    { d: oval(50, 77, 30.5, 7.6), s: 'hair' },
    { d: paw(28.5, 86.6, 0.74, 78) + paw(42, 89, 0.74, 88) + paw(56, 89, 0.74, 94) + paw(70, 87, 0.74, 104), s: 'ox' },
  ],

  sunflower: () => {
    const petals = Array.from({ length: 16 }, (_, i) => almond(...polar(50, 40, 20.5, i * 22.5), 14.5, 6.6, i * 22.5 + 90)).join('');
    const pips = Array.from({ length: 44 }, (_, i) => {
      const r = 1.62 * Math.sqrt(i + 0.6);
      return polar(50, 40, r, i * 137.508);
    });
    return [
      { d: 'M50 53C50 66 47.6 80 50 96', s: 'line' },
      { d: 'M49.2 76C40 69 28 71 22 79C32 83.4 42 81.4 49.2 76Z', s: 'paperline' },
      { d: 'M51 65C60 58 72 60 78 66C70 72 58 72 51 65Z', s: 'paperline' },
      { d: 'M49.2 76C40 74.6 32 76 25.4 78.8M51 65C60 64.6 68 65 74.4 66.2', s: 'hair' },
      { d: petals, s: 'goldhair' },
      { d: circle(50, 40, 12.6), s: 'ink' },
      { d: dots(pips.filter(([x, y]) => Math.hypot(x - 50, y - 40) < 11.2), 0.62), s: 'paper' },
      { d: spark(12, 14, 3.6), s: 'gold' },
      { d: spark(88, 84, 3), s: 'gold' },
    ];
  },

  block: () => {
    const hatch = [56, 62, 68, 72.6].map((x) => seg(x, 50 - (x - 50) / 2 + 1, x, 80 - (x - 50) / 2 - 1)).join('');
    const grid = [1, 2]
      .map((i) => {
        const t = i / 3;
        const a = [24 + 26 * t, 37 - 13 * t];
        const b = [50 + 26 * t, 50 - 13 * t];
        const c = [24 + 26 * t, 37 + 13 * t];
        const d = [50 + 26 * t, 24 + 13 * t];
        return segP(a, b) + segP(c, d);
      })
      .join('');
    return [
      { d: rays(50, 52, 35, 44, 12, 15), s: 'hair' },
      { d: 'M24 37L50 50L50 80L24 67Z', s: 'paperline' },
      { d: 'M76 37L50 50L50 80L76 67Z', s: 'paperline' },
      { d: hatch, s: 'hair' },
      { d: 'M50 24L76 37L50 50L24 37Z', s: 'goldline' },
      { d: grid, s: 'hair' },
      { d: spark(50, 9, 4.4), s: 'gold' },
      { d: spark(17, 16, 2.6), s: 'gold' },
      { d: spark(84, 88, 2.8), s: 'gold' },
    ];
  },

  hoard: () => {
    const branch = [[46, 90], [14, 84], [6, 40], [36, 13]];
    const leaves = [];
    [0.08, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.91].forEach((t, i) => {
      const [x, y] = bez(...branch, t);
      const a = bezAngle(...branch, t);
      const tilt = a + (i % 2 ? 38 : -38);
      const [lx, ly] = polar(x, y, 4.6, tilt);
      leaves.push(almond(lx, ly, 9.6, 4.2, tilt + 90));
      leaves.push(almond(100 - lx, ly, 9.6, 4.2, -(tilt + 90)));
    });
    const pile = [
      [52, 39, 0], [46, 49.5, -10], [58, 49.5, 18], [40, 60, 14], [52, 61, -16], [64, 60, 8],
      [34, 71, -24], [46, 72.4, 10], [58, 72.4, -12], [70, 71, 22],
    ];
    return [
      { d: 'M46 90C14 84 6 40 36 13M54 90C86 84 94 40 64 13', s: 'hair' },
      { d: leaves.join(''), s: 'paperhair' },
      ...pile.flatMap(([x, y, a]) => seed(x, y, 12.6, 6.4, a)),
      { d: 'M48.8 89.6L44 98L47.6 96.8L50 90.6Z', s: 'ox' },
      { d: 'M51.2 89.6L56 98L52.4 96.8L50 90.6Z', s: 'ox' },
      { d: circle(50, 89.4, 3), s: 'oxline' },
      { d: spark(50, 8, 4), s: 'gold' },
      { d: spark(22, 8, 2.4), s: 'gold' },
      { d: spark(78, 8, 2.4), s: 'gold' },
    ];
  },
};

/* ---------- the deck ---------- */

const CARDS = [
  {
    numeral: '0', name: 'The Hamster', plate: 'hamster',
    keys: ['beginnings', 'nerve', 'burner wallets'],
    upright: 'Beginnings with more enthusiasm than research. The leap is right even if the plan is three words long. Go first, go small, and use a burner.',
    reversed: "Aping on vibes. You are three clicks away from approving an unlimited spend on a site you found in a reply guy's bio. Close the tab and read the contract.",
    omen: 'Every legend starts as an unknown address on a testnet.',
  },
  {
    numeral: 'I', name: 'The Wheel', plate: 'wheel',
    keys: ['tools', 'effort', 'making it count'],
    upright: 'Everything you need is already bolted down: wheel, magnet, sensor, will. Today motion turns into record, so put in the laps that only count if you actually run them.',
    reversed: 'Spinning with the sensor unplugged. Plenty of motion, zero accepted passages, no block progress. Check that your effort is wired to something that counts.',
    omen: "The wheel doesn't read your thesis. It counts laps.",
  },
  {
    numeral: 'II', name: 'The Seed', plate: 'seed',
    keys: ['secrets', 'commitments', 'patience'],
    upright: 'A commitment with its contents hidden, like a dataHash: something true is sealed in there and you know it. Trust the hunch before the reveal.',
    reversed: 'Revealing too early. Not every alpha belongs in the group chat. Some seeds sprout better in the dark, and some get front-run in the mempool.',
    omen: 'What is hashed cannot be unhashed.',
  },
  {
    numeral: 'III', name: 'The Burrow', plate: 'burrow',
    keys: ['comfort', 'abundance', 'nesting'],
    upright: 'Nesting season. Abundance looks like deep bedding, a stocked pantry and nothing urgent in your notifications. Build somewhere soft and let it compound.',
    reversed: "Too comfy to move. The burrow turned into a bunker, and the bunker into a portfolio you haven't opened since the last cycle.",
    omen: 'A good burrow has two exits. So should your position.',
  },
  {
    numeral: 'IV', name: 'The Night Shift', plate: 'nightShift',
    keys: ['routine', 'discipline', 'showing up'],
    upright: 'Discipline beats motivation, because motivation sleeps in. Squeektoshi clocks in around 21:00 UTC with no pep talk and no thread about it. The rounds close every ten minutes; be there when they do.',
    reversed: "Same routine, different market. You are running last month's playbook at full speed. Look up from the wheel before the next shift.",
    omen: 'The rounds close on time. Do you?',
  },
  {
    numeral: 'V', name: 'The Reporter', plate: 'reporter',
    keys: ['signatures', 'rules', 'trust'],
    upright: 'Things done by the book, with a typed signature on every page. Authority today comes from being boringly correct. Sign only what you have read.',
    reversed: "Blind signing. A pop-up you didn't read is still your signature, and a retired Reporter key can never be used again. Neither can a reputation.",
    omen: 'Nothing settles without a signature.',
  },
  {
    numeral: 'VI', name: 'The Magnet', plate: 'magnet',
    keys: ['attraction', 'alignment', 'choices'],
    upright: 'Attraction at a precise distance. Every work unit is one pass of the magnet past the sensor: close enough to count, never touching. Choose what you orbit today.',
    reversed: 'Misaligned. You keep passing near the thing you want without ever triggering it. Adjust the gap, not the wheel.',
    omen: 'One pass, one unit, no partial credit.',
  },
  {
    numeral: 'VII', name: 'The Sprint', plate: 'sprint',
    keys: ['momentum', 'drive', 'shipping'],
    upright: 'Momentum is yours: 109 rpm of pure intent. Ship it, mint it, send it while the wheel is still warm.',
    reversed: 'All rpm, no endurance. The night shift is six hours long and you spent it in the first round. Pace yourself or become the quiet round.',
    omen: 'Peak rpm is a moment. The odometer is a career.',
  },
  {
    numeral: 'VIII', name: 'The Difficulty', plate: 'difficulty',
    keys: ['patience', 'steering', 'restraint'],
    upright: 'Strength as gentle steering. The difficulty moves a thirtieth of the way toward its target each active round and never panics. Small corrections, held for a long time, win.',
    reversed: 'Overcorrecting. One red candle and you rewrote the whole strategy. The protocol smooths over 30 rounds; you can wait one.',
    omen: "Rounds under forty work don't steer. Neither does panic.",
  },
  {
    numeral: 'IX', name: 'The Postman', plate: 'postman',
    keys: ['solitude', 'duty', 'the long route'],
    upright: 'The long solitary route. Squeektoshi is named after a postal worker in LA, and today honours the job: walk your route, deliver what you promised, ignore the dog.',
    reversed: 'Lost in the sorting office. Too much introspection, not enough delivery. The message you keep redrafting needed sending yesterday.',
    omen: 'Neither rain nor gas fees.',
  },
  {
    numeral: 'X', name: 'The Odometer', plate: 'odometer',
    keys: ['luck', 'cycles', 'milestones'],
    upright: 'Fortune is a counter that only goes up. The digits are about to roll over, and the number you have been grinding toward finally clicks.',
    reversed: "Watching the counter instead of running. Refreshing the dashboard adds no distance. Unknown is not zero, but it isn't progress either.",
    omen: 'Point eight seven eight metres at a time.',
  },
  {
    numeral: 'XI', name: 'The Settlement', plate: 'settlement',
    keys: ['fairness', 'records', 'consequences'],
    upright: 'Accounts balance. What you did gets recorded exactly, no more and no less: over-cap work is rejected, never rounded down. A fair outcome is on its way.',
    reversed: 'Disputed ledger. Someone, possibly you, is counting unsettled work as final. Wait for confirmations before the victory post.',
    omen: 'The chain remembers what the group chat forgets.',
  },
  {
    numeral: 'XII', name: 'The Nap', plate: 'nap',
    keys: ['pause', 'surrender', 'new angles'],
    upright: 'Surrender is a strategy. The best trade today might be no trade. Hang upside down for a while and look at the chart from there.',
    reversed: 'Sleeping through the mint. There is resting, and there is missing the allowlist window by six hours. Set an alarm, sleepyhead.',
    omen: 'Zero-work rounds still get certified.',
  },
  {
    numeral: 'XIII', name: 'The Empty Wheel', plate: 'emptyWheel',
    keys: ['endings', 'stillness', 'closure'],
    upright: 'An ending, cleanly recorded. Some nights the wheel stands still and the chain certifies the silence anyway. Let the old cycle close; it makes room.',
    reversed: 'Refusing to let a dead position die. You are still spinning a wheel nobody is on. Close it, keep the lesson, keep the screenshot.',
    omen: 'Even nothing gets a receipt.',
  },
  {
    numeral: 'XIV', name: 'The Water Bottle', plate: 'waterBottle',
    keys: ['balance', 'moderation', 'upkeep'],
    upright: 'Balance and steady flow. Drink water, top up gas, take profit in sips. Temperance is a ball-bearing valve: a little, often.',
    reversed: 'Bone dry or flooded cage. Either you skipped the basics or you overcorrected straight into a liquidation. Small sips.',
    omen: 'Hydrate before you speculate.',
  },
  {
    numeral: 'XV', name: 'The Cheek Pouch', plate: 'cheekPouch',
    keys: ['bags', 'attachment', 'excess'],
    upright: 'Bags. Glorious, overstuffed bags. You are carrying more than you can chew and the whole cage can see it. Whatever you refuse to spit out owns you.',
    reversed: 'Spitting out the stash. Let go of one bag you have been holding out of pride. Lighter cheeks, clearer head.',
    omen: 'Cheeks are for carrying, not for marrying.',
  },
  {
    numeral: 'XVI', name: 'The Cage Door', plate: 'cageDoor',
    keys: ['upheaval', 'escape', 'exploits'],
    upright: 'The latch gives and everything changes at once. Sudden exits, sudden exploits, sudden freedom. Whatever breaks today was already loose.',
    reversed: "Escape averted. The door rattled, you checked the latch and revoked the old approvals. Tonight's disaster becomes next week's anecdote.",
    omen: 'Check your approvals like a hamster checks the latch.',
  },
  {
    numeral: 'XVII', name: 'The Guardian', plate: 'guardian',
    keys: ['hope', 'protection', 'recovery'],
    upright: 'Hope after the storm. Someone keeps a paw near the pause switch, and today that feels reassuring rather than sinister. Heal, recalibrate, reopen.',
    reversed: "Over-guarding. You paused everything over a rumour. Not every alert is an exploit; sometimes it's a hamster sneezing on the sensor.",
    omen: 'A paused chain can still be read.',
  },
  {
    numeral: 'XVIII', name: 'The Midnight Lap', plate: 'midnightLap',
    keys: ['intuition', 'uncertainty', 'lag'],
    upright: "Intuition in the dark. Not everything you can't see yet is fake: unsettled means unknown, not zero. Trust the quiet signal and verify at dawn.",
    reversed: "Phantom laps. You are counting work that hasn't settled and gains that haven't happened. The moon flatters; the ledger lags twenty minutes.",
    omen: 'What runs at midnight settles by twenty past.',
  },
  {
    numeral: 'XIX', name: 'The Sunflower', plate: 'sunflower',
    keys: ['joy', 'success', 'green candles'],
    upright: 'Uncomplicated green candles. Warmth, success, a seed the size of your face. Enjoy it out loud; this one is real.',
    reversed: 'Too much of a good thing. Sunflower seeds are hamster junk food, and so is a 40x memecoin. Bank some, then nibble.',
    omen: 'Face the sun. Keep one seed in the pouch.',
  },
  {
    numeral: 'XX', name: 'The Block', plate: 'block',
    keys: ['reckoning', 'completion', 'announcements'],
    upright: 'Judgement day for your block units: a billion of them roll over and something becomes whole. Work you did quietly gets announced loudly.',
    reversed: 'Ninety-seven percent of a block, refreshed like it owes you money. It completes when the work arrives, not when you stare at it.',
    omen: 'Ten to the ninth, then a cheer.',
  },
  {
    numeral: 'XXI', name: 'The Hoard', plate: 'hoard',
    keys: ['fulfilment', 'wholeness', 'harvest'],
    upright: 'Completion. Everything gathered, sorted and stashed where you can find it again. The cycle closes on a full pantry; celebrate, then start the next one.',
    reversed: 'Hoarding without purpose. A stash you never touch is a cheek pouch with extra steps. Deploy it, gift it, or at least count it.',
    omen: 'Full hoard, quiet wheel, round hamster.',
  },
];

/** One line per way up, for the saved image and the post: [upright, reversed]. */
const LINES = {
  'The Hamster': ['Go first, go small, and use a burner.', 'Close the tab and read the contract.'],
  'The Wheel': ['Put in the laps that only count if you run them.', 'Plenty of motion, sensor unplugged. Check the wiring.'],
  'The Seed': ['Something true is sealed in there. Trust the hunch.', 'Not every alpha belongs in the group chat.'],
  'The Burrow': ['Build somewhere soft and let it compound.', 'The burrow became a bunker. Open the portfolio.'],
  'The Night Shift': ['Discipline beats motivation, because motivation sleeps in.', "Last month's playbook at full speed. Look up from the wheel."],
  'The Reporter': ['Be boringly correct. Sign only what you have read.', "A pop-up you didn't read is still your signature."],
  'The Magnet': ['Close enough to count, never touching. Choose your orbit.', 'Adjust the gap, not the wheel.'],
  'The Sprint': ['Ship it while the wheel is still warm.', 'All rpm, no endurance. Pace yourself.'],
  'The Difficulty': ['Small corrections, held for a long time, win.', 'One red candle is not a new strategy.'],
  'The Postman': ['Walk your route, deliver what you promised, ignore the dog.', 'The message you keep redrafting needed sending yesterday.'],
  'The Odometer': ['The digits are about to roll over.', 'Refreshing the dashboard adds no distance.'],
  'The Settlement': ['Accounts balance. A fair outcome is on its way.', 'Wait for confirmations before the victory post.'],
  'The Nap': ['The best trade today might be no trade.', 'Resting is fine. Missing the allowlist is not.'],
  'The Empty Wheel': ['Let the old cycle close. It makes room.', 'Nobody is on that wheel. Close it, keep the lesson.'],
  'The Water Bottle': ['Drink water, top up gas, take profit in sips.', 'Skipped the basics or flooded the cage. Small sips.'],
  'The Cheek Pouch': ['Glorious, overstuffed bags, and the whole cage can see them.', 'Spit out one bag you only hold out of pride.'],
  'The Cage Door': ['Whatever breaks today was already loose.', 'You checked the latch. Disaster becomes anecdote.'],
  'The Guardian': ['Heal, recalibrate, reopen.', 'Not every alert is an exploit.'],
  'The Midnight Lap': ['Unsettled means unknown, not zero. Verify at dawn.', 'You are counting laps that have not settled yet.'],
  'The Sunflower': ['Uncomplicated green candles. Enjoy it out loud.', 'Bank some, then nibble.'],
  'The Block': ['Work you did quietly gets announced loudly.', 'It completes when the work arrives, not when you stare at it.'],
  'The Hoard': ['Everything gathered and stashed. Celebrate, then start again.', 'A stash you never touch is a cheek pouch with extra steps.'],
};

export const ARCANA = Object.freeze(
  CARDS.map((card, index) => {
    const [upright, reversed] = LINES[card.name];
    return Object.freeze({ ...card, index, line: Object.freeze({ upright, reversed }), glyph: PLATES[card.plate]() });
  }),
);

/** Two wallets, one day: copy for the distance bands in oracle.js (BOND_STEPS). */
export const BONDS = Object.freeze([
  { name: 'Twin spin', line: 'Same card, same day. The wheel drew you twice, so share the snacks.' },
  { name: 'Neighbours', line: 'A plate or two apart. Close enough to hear each other running.' },
  { name: 'Same half of the wheel', line: 'Close enough to share a water bottle, far enough to keep your own seeds.' },
  { name: 'Across the cage', line: 'Different corners, same hamster. Wave at each other at feeding time.' },
  { name: 'Opposite spokes', line: 'As far apart as the wheel allows. One of you is up while the other is down, which is how a wheel turns.' },
]);

export const BOND_WAYS = Object.freeze({
  upright: 'Both upright: you run the same way.',
  reversed: 'Both reversed: backwards, but together.',
  mixed: 'One of you is upside down today, so take turns on the wheel.',
});

/** Lucky colours, picked by (seed >> 128) mod 12. */
export const PALETTE = Object.freeze([
  { name: 'Oxblood', hex: '#74202A', note: 'The colour of a wax seal and a liquidation candle.' },
  { name: 'Sunflower Gold', hex: '#D2A637', note: 'Snack-coded. Wear it to the mint.' },
  { name: 'Shaving Blonde', hex: '#DCC08A', note: 'Fresh-bedding energy.' },
  { name: 'Burrow Umber', hex: '#6A4A33', note: 'Low-key, underground, two exits.' },
  { name: 'Cheek-Pouch Pink', hex: '#E3A49A', note: 'Soft on the outside, stuffed on the inside.' },
  { name: 'Water-Bottle Blue', hex: '#5F8FB4', note: 'Hydration as a personality.' },
  { name: 'Sepolia Sage', hex: '#7E9471', note: 'Testnet calm. Nothing here costs real money.' },
  { name: 'Midnight-Lap Navy', hex: '#23304E', note: 'For people who do their best work at 2 a.m. UTC.' },
  { name: 'Seed-Stripe Charcoal', hex: '#3A3732', note: 'Serious, striped, slightly salty.' },
  { name: 'Carrot-Top Orange', hex: '#D7782F', note: 'A treat, not a meal.' },
  { name: 'Bedding Ivory', hex: '#F1E7D2', note: 'Clean slate, fresh wallet.' },
  { name: 'Gas-Fee Grey', hex: '#9A9B96', note: 'Neutral, like gas at 3 a.m.' },
]);

/** Copy for the wheel-energy levels; thresholds live in oracle.js (ENERGY_STEPS). */
export const ENERGY = Object.freeze([
  { name: 'Still', line: 'The wheel never turned. Today starts from a standstill.' },
  { name: 'Stirring', line: 'A few laps, mostly snack runs.' },
  { name: 'Trotting', line: 'A proper outing. No records broken.' },
  { name: 'Running', line: 'A solid night shift. The ledger noticed.' },
  { name: 'Galloping', line: 'A big night. Blocks rolled over all evening.' },
  { name: 'Full tilt', line: 'Record territory. The wheel is still warm.' },
]);

/* ---------- small plates for the live panel ---------- */

export const SNOOZE = Object.freeze([
  { d: 'M8 86C24 83 40 87 56 84C70 82 82 86 94 84', s: 'hair' },
  { d: 'M14 89l5-1.4M30 90.4l5-0.6M62 89.6l5-1M80 89l5-1.2', s: 'hair' },
  { d: 'M36 46C33 37.5 41 34 44.6 41.4', s: 'goldline' },
  { d: 'M20 70C18 54 34 43 54 43C72 43 84 54 82 67C80 79 66 83 50 83C34 83 21 80 20 70Z', s: 'paper' },
  { d: 'M33 46C39 44 46 43 54 43C72 43 84 54 82 67C80 79 66 83 50 83C56 72 52 56 33 46Z', s: 'gold' },
  { d: 'M20 70C18 54 34 43 54 43C72 43 84 54 82 67C80 79 66 83 50 83C34 83 21 80 20 70Z', s: 'line' },
  { d: 'M27 63.4C28.6 65.6 31.6 65.6 33 63.2', s: 'line' },
  { d: circle(20.6, 69.6, 1.5), s: 'ox' },
  { d: 'M21.6 73.6C23 75.2 25.4 75.4 26.8 74.2', s: 'hair' },
  { d: 'M28 80.4c1.6-2.2 5-2.2 5.8 0M38 82c1.4-2 4.4-2 5 0', s: 'hair' },
  { d: 'M84 74C88 73.4 89.6 77 87 78.6', s: 'hair' },
  { d: zee(62, 27, 7), s: 'line' },
  { d: zee(75, 15, 5), s: 'hair' },
  { d: zee(85, 6, 3.4), s: 'hair' },
  { d: crescent(16, 18, 9, 0), s: 'gold' },
]);

export const PHASES = Object.freeze({
  running: [{ d: circle(50, 50, 30), s: 'goldline' }, { d: rays(50, 50, 36, 44, 12, 0), s: 'hair' }],
  asleep: [{ d: circle(50, 50, 30), s: 'line' }, { d: crescent(50, 50, 30, 180), s: 'gold' }],
  stale: [
    { d: circle(46, 44, 26), s: 'goldline' },
    { d: 'M24 76C14 76 14 62 25 62C27 52 42 50 47 58C52 52 66 54 66 64C76 64 78 76 68 76Z', s: 'paperline' },
  ],
  fault: [{ d: circle(50, 50, 30), s: 'ink' }, { d: circle(50, 50, 34), s: 'line' }, { d: rays(50, 50, 38, 44, 8, 22.5), s: 'hair' }],
  unknown: [{ d: circle(50, 50, 30), s: 'dash' }],
});
