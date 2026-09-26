"""Build the native CoSkin icon from the repository SVG, without network assets."""
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
source = root / "assets" / "coskin.svg"
document = ET.parse(source).getroot()
scale = 8
image = Image.new("RGBA", (128 * scale, 128 * scale))
draw = ImageDraw.Draw(image)
for element in document:
    tag = element.tag.rsplit("}", 1)[-1]
    if tag == "rect":
        x, y, width, height, radius = [float(element.attrib[k]) for k in ("x", "y", "width", "height", "rx")]
        draw.rounded_rectangle(tuple(int(v * scale) for v in (x, y, x + width, y + height)), radius=int(radius * scale), fill=element.attrib["fill"])
    elif tag == "path":
        if element.attrib.get("d") != "M74.6777 38.3223 A25 25 0 1 0 74.6777 73.6777":
            raise ValueError("C path changed; update the native raster geometry before rebuilding")
        # The single C path is a 270-degree circular stroke with round terminals.
        draw.arc(tuple(v * scale for v in (27, 26, 87, 86)), 45, 315, fill=element.attrib["stroke"], width=10 * scale)
        for x, y in ((74.6777, 38.3223), (74.6777, 73.6777)):
            draw.ellipse(tuple(int(v * scale) for v in (x - 5, y - 5, x + 5, y + 5)), fill=element.attrib["stroke"])
    else:
        raise ValueError("Unsupported brand primitive: " + tag)
image = image.resize((256, 256), Image.Resampling.LANCZOS)
image.save(root / "assets" / "coskin.ico", sizes=[(n, n) for n in (16, 20, 24, 32, 48, 64, 128, 256)])
image.save(root / "assets" / "coskin-preview.png")
