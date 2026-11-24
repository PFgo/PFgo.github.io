// Paints the Space Needle flag off the main thread. home.js reads the inline SVG
// (its SMIL keyframes, colors, strokes and lettering) and sends a drawing list,
// so the SVG stays the single source of the artwork.
let canvas, context, art;
let unit = 1;
let playing = false;
let elapsed = 0;
let previous = 0;
let request = 0;
const nextFrame = self.requestAnimationFrame
  ? callback => self.requestAnimationFrame(callback)
  : callback => setTimeout(() => callback(performance.now()), 16);
const cancelFrame = self.cancelAnimationFrame || clearTimeout;

const numberPattern = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

// Every keyframe of a path shares its commands; only the numbers move.
function keyframedPath(values) {
  const frames = values.map(d => Float64Array.from(d.match(numberPattern), Number));
  const pieces = values[0].split(numberPattern);
  return {frames, pieces};
}

function sample(track, progress) {
  const {frames} = track;
  const at = progress * (frames.length - 1);
  const index = Math.min(frames.length - 2, Math.floor(at));
  const mix = at - index;
  const from = frames[index], to = frames[index + 1];
  const numbers = new Float64Array(from.length);
  for (let i = 0; i < from.length; i++) numbers[i] = from[i] + (to[i] - from[i]) * mix;
  return numbers;
}

function pathString(track, numbers) {
  let d = track.pieces[0];
  for (let i = 0; i < numbers.length; i++) d += numbers[i].toFixed(3) + track.pieces[i + 1];
  return d;
}

// Absolute M/L/C/Q outlines (what the flag generator writes) as a polyline
// with cumulative lengths, for placing letters along the baseline.
function polyline(d) {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi);
  const points = [];
  let command = 'M', i = 0, x = 0, y = 0;
  const read = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) command = tokens[i++];
    if (command === 'M' || command === 'L') {
      x = read(); y = read(); points.push([x, y]);
      if (command === 'M') command = 'L';
    } else if (command === 'C' || command === 'Q') {
      const cubic = command === 'C';
      const c = cubic ? [read(), read(), read(), read()] : [read(), read()];
      const ex = read(), ey = read();
      for (let s = 1; s <= 48; s++) {
        const t = s / 48, u = 1 - t;
        points.push(cubic
          ? [u*u*u*x + 3*u*u*t*c[0] + 3*u*t*t*c[2] + t*t*t*ex, u*u*u*y + 3*u*u*t*c[1] + 3*u*t*t*c[3] + t*t*t*ey]
          : [u*u*x + 2*u*t*c[0] + t*t*ex, u*u*y + 2*u*t*c[1] + t*t*ey]);
      }
      x = ex; y = ey;
    } else {
      i++;
    }
  }
  const lengths = [0];
  for (let p = 1; p < points.length; p++) {
    lengths.push(lengths[p - 1] + Math.hypot(points[p][0] - points[p - 1][0], points[p][1] - points[p - 1][1]));
  }
  return {points, lengths, total: lengths[lengths.length - 1]};
}

function pointAt(line, distance) {
  const {points, lengths} = line;
  let low = 1, high = lengths.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (lengths[middle] < distance) low = middle + 1; else high = middle;
  }
  const a = points[low - 1], b = points[low];
  const span = lengths[low] - lengths[low - 1] || 1;
  const t = (distance - lengths[low - 1]) / span;
  return {x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, angle: Math.atan2(b[1] - a[1], b[0] - a[0])};
}

// SVG's objectBoundingBox gradient with spreadMethod="reflect", unrolled into
// plain canvas stops across the shape's width.
function clothGradient(gradient, numbers, progress) {
  let left = Infinity, right = -Infinity;
  for (let i = 0; i < numbers.length; i += 2) {
    left = Math.min(left, numbers[i]);
    right = Math.max(right, numbers[i]);
  }
  const width = right - left || 1;
  const shift = gradient.from + (gradient.to - gradient.from) * progress;
  const period = gradient.x2 - gradient.x1;
  const origin = gradient.x1 + shift;
  const first = Math.floor((0 - origin) / period) - 1;
  const last = Math.ceil((1 - origin) / period) + 1;
  const start = origin + first * period, end = origin + (last + 1) * period;
  const fill = context.createLinearGradient(left + start * width, 0, left + end * width, 0);
  for (let m = first; m <= last; m++) {
    const reflected = gradient.reflect && Math.abs(m % 2) === 1;
    for (const stop of gradient.stops) {
      const offset = reflected ? 1 - stop.offset : stop.offset;
      const u = origin + (m + offset) * period;
      fill.addColorStop(Math.min(1, Math.max(0, (u - start) / (end - start))), stop.color);
    }
  }
  return fill;
}

function place(matrix) {
  context.setTransform(unit, 0, 0, unit, (art.pad - art.viewX) * unit, (art.pad - art.viewY) * unit);
  context.transform(...matrix);
}

function draw() {
  const progress = (elapsed % art.duration) / art.duration;
  const shapes = {};
  for (const [id, track] of Object.entries(art.tracks)) {
    const numbers = sample(track, progress);
    shapes[id] = {numbers, d: pathString(track, numbers)};
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (const op of art.ops) {
    place(op.matrix);
    if (op.kind === 'text') {
      drawLettering(op, polyline(shapes[op.track].d));
      continue;
    }
    const geometry = op.kind === 'circle' ? circle(op) : new Path2D(op.track ? shapes[op.track].d : op.d);
    if (op.fill) {
      context.fillStyle = op.fill === 'gradient'
        ? clothGradient(art.gradient, shapes[op.track].numbers, (elapsed % art.gradient.duration) / art.gradient.duration)
        : op.fill;
      context.fill(geometry);
    }
    if (op.stroke) {
      context.strokeStyle = op.stroke;
      context.lineWidth = op.width;
      context.lineJoin = op.join;
      context.lineCap = op.cap;
      context.setLineDash(op.dash);
      context.stroke(geometry);
    }
  }
}

function circle(op) {
  const path = new Path2D();
  path.arc(op.cx, op.cy, op.r, 0, Math.PI * 2);
  return path;
}

// Like SVG <textPath>: each letter's midpoint sits on the baseline and turns
// with the curve there.
function drawLettering(op, line) {
  context.font = op.font;
  context.fillStyle = op.fill;
  context.textBaseline = 'alphabetic';
  context.textAlign = 'left';
  const total = context.measureText(op.text).width;
  const anchor = op.anchor === 'middle' ? total / 2 : op.anchor === 'end' ? total : 0;
  const start = op.offset * line.total - anchor;
  let before = 0;
  let prefix = '';
  for (const letter of op.text) {
    prefix += letter;
    const after = context.measureText(prefix).width;
    const advance = after - before;
    const middle = start + before + advance / 2;
    before = after;
    if (!letter.trim() || middle < 0 || middle > line.total) continue;
    const point = pointAt(line, middle);
    place(op.matrix);
    context.translate(point.x, point.y);
    context.rotate(point.angle);
    context.fillText(letter, -advance / 2, 0);
  }
}

function tick(now) {
  request = 0;
  if (!playing) return;
  // A stalled worker resumes the wave instead of jumping ahead.
  if (previous) elapsed += Math.min(100, now - previous);
  previous = now;
  draw();
  request = nextFrame(tick);
}

// A worker has its own font set. Load the page's @font-face sources the lettering
// may fall back to, so the canvas picks the same face as the SVG.
async function loadFonts(faces) {
  if (!faces.length) return;
  if (!self.fonts || typeof FontFace !== 'function') throw new Error('Worker fonts unavailable');
  await Promise.all(faces.map(face => {
    const font = new FontFace(face.family, face.source, face.descriptors);
    self.fonts.add(font);
    return font.load();
  }));
}

let queue = Promise.resolve();
self.onmessage = ({data}) => {
  queue = queue.then(() => handle(data)).catch(error => {
    self.postMessage({type: 'failed', message: String(error)});
  });
};

async function handle(data) {
  {
    if (data.type === 'init') {
      canvas = data.canvas;
      context = canvas.getContext('2d');
      art = data.art;
      for (const id of Object.keys(art.tracks)) art.tracks[id] = keyframedPath(art.tracks[id]);
      await loadFonts(art.faces);
    }
    if (data.unit) {
      unit = data.unit;
      canvas.width = Math.ceil((art.viewWidth + 2 * art.pad) * unit);
      canvas.height = Math.ceil((art.viewHeight + 2 * art.pad) * unit);
      draw();
    }
    if (data.type === 'init') self.postMessage({type: 'ready'});
    if ('playing' in data && data.playing !== playing) {
      playing = data.playing;
      previous = 0;
      if (playing && !request) request = nextFrame(tick);
      if (!playing && request) { cancelFrame(request); request = 0; }
    }
  }
}
