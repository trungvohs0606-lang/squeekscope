// Two printers for the same plates: inline SVG for the page, Path2D for the
// <canvas> export. Every glyph is a list of parts on a 100 x 100 grid:
//   { d: 'M...', s: 'line' }               one path in one ink style
//   { g: [...parts], m: [a,b,c,d,e,f], k }  a group under a matrix (k = scale)
// Strokes are divided by k so a scaled-down hamster keeps the deck's line weight.

export const WEIGHT = { main: 1.9, fine: 1.05 };

// fill / stroke use ink names, resolved per medium (CSS classes or canvas colours).
export const STYLE = {
  line: { stroke: 'ink', w: 'main' },
  hair: { stroke: 'ink', w: 'fine' },
  dash: { stroke: 'ink', w: 'fine', dash: [2.4, 2.8] },
  gold: { fill: 'gold' },
  goldline: { fill: 'gold', stroke: 'ink', w: 'main' },
  goldhair: { fill: 'gold', stroke: 'ink', w: 'fine' },
  ox: { fill: 'ox' },
  oxline: { fill: 'ox', stroke: 'ink', w: 'main' },
  oxhair: { stroke: 'ox', w: 'fine' },
  ink: { fill: 'ink' },
  paper: { fill: 'paper' },
  paperline: { fill: 'paper', stroke: 'ink', w: 'main' },
  paperhair: { fill: 'paper', stroke: 'ink', w: 'fine' },
  knock: { stroke: 'paper', w: 'main', widen: 1.9 },
  paperstroke: { stroke: 'paper', w: 'fine' },
};

const SVGNS = 'http://www.w3.org/2000/svg';

function svgParts(parent, parts, k) {
  for (const part of parts) {
    if (part.g) {
      const g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('transform', `matrix(${part.m.join(' ')})`);
      svgParts(g, part.g, k * part.k);
      parent.append(g);
      continue;
    }
    const st = STYLE[part.s];
    const path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('d', part.d);
    const cls = [];
    if (st.fill) cls.push(`f-${st.fill}`);
    if (st.stroke) {
      cls.push(`s-${st.stroke}`);
      path.setAttribute('stroke-width', String(+((WEIGHT[st.w] * (st.widen || 1)) / k).toFixed(3)));
      if (st.dash) path.setAttribute('stroke-dasharray', st.dash.map((v) => +(v / k).toFixed(3)).join(' '));
    }
    if (part.rule === 'evenodd') path.setAttribute('fill-rule', 'evenodd');
    path.setAttribute('class', cls.join(' '));
    parent.append(path);
  }
}

/** Build an <svg> element for a glyph. Only ever fed the deck's own constant art. */
export function glyphSvg(parts, className = 'glyph') {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const root = document.createElementNS(SVGNS, 'g');
  root.setAttribute('fill', 'none');
  root.setAttribute('stroke-linecap', 'round');
  root.setAttribute('stroke-linejoin', 'round');
  svgParts(root, parts, 1);
  svg.append(root);
  return svg;
}

function paintParts(ctx, parts, k, colours) {
  for (const part of parts) {
    if (part.g) {
      ctx.save();
      ctx.transform(...part.m);
      paintParts(ctx, part.g, k * part.k, colours);
      ctx.restore();
      continue;
    }
    const st = STYLE[part.s];
    const path = new Path2D(part.d);
    if (st.fill) {
      ctx.fillStyle = colours[st.fill];
      ctx.fill(path, part.rule === 'evenodd' ? 'evenodd' : 'nonzero');
    }
    if (st.stroke) {
      ctx.strokeStyle = colours[st.stroke];
      ctx.lineWidth = (WEIGHT[st.w] * (st.widen || 1)) / k;
      ctx.setLineDash(st.dash ? st.dash.map((v) => v / k) : []);
      ctx.stroke(path);
    }
  }
}

/** Paint a glyph into the square (x, y, size). `upsideDown` turns the plate for reversed cards. */
export function paintGlyph(ctx, parts, x, y, size, colours, upsideDown = false) {
  ctx.save();
  ctx.translate(x, y);
  if (upsideDown) {
    ctx.translate(size, size);
    ctx.rotate(Math.PI);
  }
  ctx.scale(size / 100, size / 100);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  paintParts(ctx, parts, 1, colours);
  ctx.restore();
}
