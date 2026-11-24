"""Pack the Seattle street paintings on one horizon, in source-pixel coordinates."""
from pathlib import Path

from PIL import Image, ImageOps

root = Path(__file__).resolve().parents[1]
assets = root / "dist" / "assets"
artwork = root / "art"
paintings = ("seattle-street", "market-pike-place", "seattle-campus", "seattle-waterfront")
block_width, height, edge = 2100, 724, 36
world = Image.new("RGBA", (block_width * len(paintings), height))
for i, name in enumerate(paintings):
    source = artwork
    scene = Image.open(source / (name + ".webp")).convert("RGBA")
    x = i * block_width - edge
    if name == "market-pike-place":
        # The market painting ends in half a window. End at the stone pier.
        scene = scene.crop((0, 0, 2065, height))
    elif name == "seattle-campus":
        # Continue the lawn up to the stone pier behind the cherry tree.
        lawn_edge = ImageOps.mirror(scene.crop((0, 0, edge, height)))
        world.alpha_composite(lawn_edge, (x - edge, 0))
    world.alpha_composite(scene, (x, -5 if name == "market-pike-place" else 0))

# The campus cherry tree is a separate animated layer in the browser.
storefront = Image.open(artwork / "join-market.webp").convert("RGBA")
storefront = storefront.resize((round(storefront.width * 410 / storefront.height), 410), Image.Resampling.LANCZOS)
world.alpha_composite(storefront, (block_width - storefront.width // 2, 684 - storefront.height))

# Use one strip of the original illustrated curb under the entire block.
street = Image.open(artwork / "seattle-street.webp").convert("RGBA")
pavement = street.crop((95, 690, 1667, height))
fade = Image.new("L", (1, pavement.height), 255)
for y in range(10):
    fade.putpixel((0, y), round(255 * y / 9))
pavement.putalpha(fade.resize(pavement.size))
for i, x in enumerate(range(0, world.width, pavement.width)):
    world.alpha_composite(ImageOps.mirror(pavement) if i % 2 else pavement, (x, 690))

world.save(assets / "seattle-promenade.webp", quality=89, method=6)

for width, size in ((4200, "small"), (5040, "medium")):
    scaled = world.resize((width, round(height * width / world.width)), Image.Resampling.LANCZOS)
    scaled.save(assets / f"seattle-promenade-{size}.webp", quality=89, method=6)
