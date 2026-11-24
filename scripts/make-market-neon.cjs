// Build an RGBA light pass from the existing painted sign. Paths below follow
// the centre of each painted red tube in the source crop, in source pixels.
// Run with: node make-market-neon.cjs seattle-promenade.webp pike-market-neon.webp
const sharp = require('sharp');

const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error('Expected panorama input and WebP output paths.');

const sourceLeft = 2260;
const left = 55;
const top = -22;
const width = 676;
const height = 554;
const clamp = n => Math.min(1, Math.max(0, n));

const lettering = [
  // PUBLIC
  'M203 104V15H219C258 12 266 75 225 77H204',
  'M287 14V77C287 111 336 115 338 78V13',
  'M380 102V14H403C429 14 430 49 405 54H380 M402 54C440 53 440 99 405 101H380',
  'M467 13V101H503', 'M536 13V101',
  'M626 14C600 2 574 23 573 56C571 92 601 117 630 98',
  // MARKET
  'M85 238L89 150L120 222L153 149L155 238',
  'M188 239L218 149L248 238 M196 217H241',
  'M284 237L283 149H300C338 149 341 203 305 205H284 M311 205L332 238',
  'M369 238V148 M417 148L369 211 M390 186L419 237',
  'M487 149H454V236H488 M455 191H486',
  'M519 149H567 M543 150V237',
  // CENTER
  'M199 288C168 277 148 302 147 332C147 360 173 387 203 370',
  'M273 287H240V374H274 M241 328H272',
  'M313 374V287L360 373V286',
  'M393 287H437 M414 287V374',
  'M502 287H469V373H503 M470 328H501',
  'M540 374V287H553C589 286 596 337 558 339H541 M565 339L585 374'
].join(' ');

async function tubeMask(strokeWidth) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height +
    '" viewBox="' + [left, top, width, height].join(' ') +
    '"><rect x="' + left + '" y="' + top + '" width="' + width + '" height="' + height +
    '" fill="black"/><path fill="none" stroke="white" stroke-width="' + strokeWidth +
    '" stroke-linejoin="round" stroke-linecap="round" d="' + lettering + '"/></svg>';
  return sharp(Buffer.from(svg)).removeAlpha().greyscale().raw().toBuffer();
}

function blur(mask, radius) {
  return sharp(mask, {raw: {width, height, channels: 1}}).blur(radius).greyscale().raw().toBuffer();
}

async function build() {
  const rgba = await sharp(source)
    .extract({left: sourceLeft + left, top: 0, width, height: height + top})
    .ensureAlpha().raw().toBuffer();
  const face = Buffer.alloc(width * height);
  const ivory = Buffer.alloc(width * height);
  const wornSurface = Buffer.alloc(width * height);
  for (let y = 0; y < height + top; y++) {
    for (let x = 0; x < width; x++) {
      const inPixel = (y * width + x) * 4;
      const pixel = (y - top) * width + x;
      const px = x + left;
      const r = rgba[inPixel], g = rgba[inPixel + 1], b = rgba[inPixel + 2];
      const a = rgba[inPixel + 3] / 255;
      const publicRow = y < 117 && px > 191 && px < 641;
      const marketRow = y > 135 && y < 251 && px > 71 && px < 578;
      const centerRow = y > 272 && y < 388 && px > 130 && px < 603;
      const outsideClock = (px - 678) ** 2 + (y - 227) ** 2 > 102 ** 2;
      if (outsideClock && (publicRow || marketRow || centerRow)) {
        face[pixel] = 255 * a * clamp(Math.min((r - 85) / 57, (r - g - 14) / 31, (r - b - 16) / 33));
        wornSurface[pixel] = r;
      }
      if (px >= 328 && px <= 698 && y >= 473 && y < 504) {
        ivory[pixel] = 255 * a * clamp(Math.min((r - 154) / 49, (g - 112) / 51, (b - 74) / 45));
      }
    }
  }
  const [wideTube, hotCore, bloom, nearBloom, ivoryBloom] = await Promise.all([
    tubeMask(6), tubeMask(2.5), blur(face, 8), blur(face, 2.5), blur(ivory, 2)
  ]);
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < face.length; i++) {
    let red = 0, green = 0, blue = 0, alpha = 0;
    function paint(r, g, b, opacity) {
      const under = 1 - opacity;
      red = r * opacity + red * under;
      green = g * opacity + green * under;
      blue = b * opacity + blue * under;
      alpha = opacity + alpha * under;
    }
    const glass = face[i] / 255;
    // A soft external glow, a thinner reflection near the case, and a textured face.
    paint(255, 44, 55, .85 * bloom[i] / 255);
    paint(255, 53, 48, .45 * nearBloom[i] / 255);
    paint(255, 55 + wornSurface[i] * .12, 52 + wornSurface[i] * .04, glass * .66);
    // Keep even tiny registration deviations inside real red metal.
    const casing = clamp((glass + nearBloom[i] / 255) * 1.45);
    paint(255, 125, 113, .84 * casing * wideTube[i] / 255);
    paint(255, 226, 202, .95 * casing * hotCore[i] / 255);
    paint(255, 179, 88, .34 * ivoryBloom[i] / 255);
    paint(255, 230, 166, .72 * ivory[i] / 255);
    if (alpha < 1 / 255) continue;
    pixels[4 * i] = Math.round(red / alpha);
    pixels[4 * i + 1] = Math.round(green / alpha);
    pixels[4 * i + 2] = Math.round(blue / alpha);
    pixels[4 * i + 3] = Math.round(255 * alpha);
  }
  await sharp(pixels, {raw: {width, height, channels: 4}})
    .webp({quality: 90, alphaQuality: 94, effort: 6, smartSubsample: true}).toFile(destination);
}
build().catch(error => {console.error(error); process.exitCode = 1;});
