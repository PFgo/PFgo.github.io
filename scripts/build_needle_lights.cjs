// Rebuild the Space Needle's transparent night light pass from the watercolor.
// Run with sharp installed: node scripts/build_needle_lights.cjs
const path = require('node:path');
const sharp = require('sharp');
const assets = path.join(__dirname, '../dist/assets');
const crop = { left: 1436, top: 8, width: 192, height: 308 };
const { left, top, width, height } = crop;
const clamp = value => Math.max(0, Math.min(1, value));

// The observation deck bows upward towards its centre in the illustration.
function projectPane(angle, lower) {
  const arc = 1 - Math.cos(angle);
  const x = 1532.5 + (lower ? 51.5 : 56) * Math.sin(angle);
  const y = (lower ? 114.5 : 104.6) + (lower ? 6.1 : 7.7) * arc;
  return x.toFixed(2) + ',' + y.toFixed(2);
}
async function bandMask() {
  const panes = [];
  const count = 16;
  for (let i = 0; i < count; i++) {
    const start = -Math.PI / 2 + (i + .12) * Math.PI / count;
    const end = -Math.PI / 2 + (i + .89) * Math.PI / count;
    const points = [projectPane(start, false), projectPane(end, false),
      projectPane(end, true), projectPane(start, true)].join(' ');
    const intensity = [.84, 1, .92, .75, .95][i % 5];
    panes.push('<polygon points="' + points + '" fill-opacity="' + intensity + '"/>');
  }
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height +
    '" viewBox="' + [left, top, width, height].join(' ') + '"><g fill="white">' +
    panes.join('') + '</g></svg>';
  return sharp(Buffer.from(svg)).extractChannel('alpha').raw().toBuffer();
}
async function build() {
  const [source, glass] = await Promise.all([
    sharp(path.join(assets, 'seattle-promenade.webp')).extract(crop).ensureAlpha().raw().toBuffer(),
    bandMask()
  ]);
  const light = Buffer.alloc(width * height * 4);
  const glowSeed = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * 4;
      const px = left + x;
      const py = top + y;
      const r = source[i], g = source[i + 1], b = source[i + 2];
      const coverage = source[i + 3] / 255;
      const tone = (r * .213 + g * .715 + b * .072) / 255;
      const creamPaint = clamp((r - b + 12) / 47) * clamp((tone - .20) / .63);
      let core = 0;
      if (py >= 67 && py <= 136) {
        // Use actual cream-colored pencil marks on both roofs and the ribbed soffit.
        core = creamPaint * .88;
      } else if (py > 136 && py < 313 && Math.abs(px - 1532) < 35) {
        const uplight = .55 + .19 * clamp((py - 170) / 140);
        core = creamPaint * uplight;
      }
      const pane = glass[p] / 255 * (.80 + .20 * clamp((tone - .06) / .33));
      const strength = coverage * Math.max(core, pane);
      light[i] = 255;
      light[i + 1] = pane > core ? 209 + 21 * tone : 229 + 22 * tone;
      light[i + 2] = pane > core ? 138 + 44 * tone : 179 + 64 * tone;
      light[i + 3] = Math.round(255 * strength);
      // The gallery emits light; the tower below only catches a little of it.
      glowSeed[p] = Math.round(255 * strength * (py < 137 ? 1 : .28));
    }
  }
  const halo = await sharp(glowSeed, {raw:{width, height, channels:1}})
    .blur(5.2).greyscale().raw().toBuffer();
  for (let p = 0; p < glowSeed.length; p++) {
    const i = p * 4;
    const a = light[i + 3] / 255;
    const spill = .49 * halo[p] / 255 * (1 - a);
    const combined = a + spill;
    if (combined <= 0) continue;
    light[i] = 255;
    light[i + 1] = (light[i + 1] * a + 200 * spill) / combined;
    light[i + 2] = (light[i + 2] * a + 139 * spill) / combined;
    light[i + 3] = Math.round(255 * combined);
  }
  const beacon = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="192" height="308">' +
    '<defs><radialGradient id="r"><stop stop-color="#ff6757" stop-opacity=".94"/>' +
    '<stop offset=".29" stop-color="#ff594d" stop-opacity=".76"/>' +
    '<stop offset="1" stop-color="#ff5148" stop-opacity="0"/></radialGradient></defs>' +
    '<circle cx="96.8" cy="17.7" r="8.5" fill="url(#r)"/>' +
    '<circle cx="96.8" cy="17.7" r="2.25" fill="#ff9a85"/>' +
    '<circle cx="96.8" cy="17.4" r="1.05" fill="#ffe0ce"/></svg>');
  await sharp(light, {raw: {width, height, channels: 4}}).composite([{input: beacon}])
    .webp({lossless: true, effort: 6}).toFile(path.join(assets, 'space-needle-lights.webp'));
}
build().catch(error => {console.error(error); process.exitCode = 1;});
