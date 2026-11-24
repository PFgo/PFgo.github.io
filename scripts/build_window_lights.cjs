// Generate a sparse night-light layer from the actual glass in the watercolor.
// Run with sharp available: node scripts/build_window_lights.cjs
const path = require('node:path');
const sharp = require('sharp');

const assets = path.join(__dirname, '../dist/assets');
const glass = path.join(__dirname, '../art/window-apertures.svg');
const clamp = value => Math.max(0, Math.min(1, value));

async function build() {
  const [{ data: paint, info }, apertures] = await Promise.all([
    sharp(path.join(assets, 'seattle-promenade.webp')).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(glass).extractChannel('alpha').raw().toBuffer()
  ]);
  const { width, height } = info;
  if (apertures.length !== width * height) throw new Error('The window map must match the original panorama.');
  const glow = Buffer.alloc(width * height);
  const emission = Buffer.alloc(width * height * 4);
  for (let p = 0; p < glow.length; p++) {
    if (!apertures[p]) continue;
    const i = p * 4;
    const luma = .213 * paint[i] + .715 * paint[i + 1] + .072 * paint[i + 2];
    const glassTone = clamp((luma - 27) / 152);
    // Keep the leadwork and shelves in shadow. Let clear glass reach warm ivory.
    const grain = Math.sqrt(glassTone);
    const amber = clamp((luma - 35) / 205);
    emission[i] = 241 + 14 * grain;
    emission[i + 1] = 140 + 93 * amber;
    emission[i + 2] = 55 + 118 * amber;
    glow[p] = Math.round(apertures[p] * paint[i + 3] / 255 * glassTone * (1.75 - .82 * glassTone));
    emission[i + 3] = glow[p];
  }
  const halo = await sharp(glow, { raw: { width, height, channels: 1 } }).blur(4.2).greyscale().raw().toBuffer();
  // Scatter a little light on the stone and window frames immediately around the glass.
  for (let p = 0; p < glow.length; p++) {
    const i = p * 4;
    const spill = halo[p] * .23 * (1 - glow[p] / 255);
    if (spill < .5) continue;
    const total = glow[p] + spill;
    emission[i] = (emission[i] * glow[p] + 255 * spill) / total;
    emission[i + 1] = (emission[i + 1] * glow[p] + 164 * spill) / total;
    emission[i + 2] = (emission[i + 2] * glow[p] + 70 * spill) / total;
    emission[i + 3] = Math.round(total);
  }
  await sharp(emission, { raw: { width, height, channels: 4 } })
    .resize({ width: 4200 }).webp({ quality: 80, alphaQuality: 78, effort: 6 })
    .toFile(path.join(assets, 'street-window-lights.webp'));
}
build().catch(error => { console.error(error); process.exitCode = 1; });
