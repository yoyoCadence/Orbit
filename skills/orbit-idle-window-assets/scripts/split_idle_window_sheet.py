#!/usr/bin/env python3
"""Split Orbit idle-window three-panel sheets into runtime assets.

Requires Pillow:
  py -m pip install pillow
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Split a 3-panel Orbit idle-window sheet.")
    parser.add_argument("--input", required=True, type=Path, help="Source PNG sheet.")
    parser.add_argument("--out-dir", required=True, type=Path, help="Directory for split PNG outputs.")
    parser.add_argument(
        "--mode",
        required=True,
        choices=("furniture", "background"),
        help="Furniture removes magenta and trims alpha; background trims dark sheet padding.",
    )
    parser.add_argument(
        "--names",
        required=True,
        help="Comma-separated output basenames for the three panels, without .png.",
    )
    parser.add_argument("--raw-copy", type=Path, help="Optional path to copy the raw sheet for provenance.")
    parser.add_argument("--pad", type=int, default=8, help="Trim padding in pixels.")
    parser.add_argument(
        "--max-opaque-key-pixels",
        type=int,
        default=0,
        help="Maximum allowed nontransparent magenta pixels in each furniture output.",
    )
    parser.add_argument(
        "--fringe-radius",
        type=int,
        default=2,
        help="Furniture cleanup radius for removing opaque key-color fringe near transparent edges.",
    )
    parser.add_argument(
        "--fringe-passes",
        type=int,
        default=2,
        help="Number of furniture edge-fringe cleanup passes.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    names = [entry.strip() for entry in args.names.split(",") if entry.strip()]
    if len(names) != 3:
        raise SystemExit("--names must contain exactly three comma-separated basenames.")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    if args.raw_copy:
        args.raw_copy.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(args.input, args.raw_copy)

    if args.mode == "furniture":
        split_furniture(
            args.input,
            args.out_dir,
            names,
            args.pad,
            args.max_opaque_key_pixels,
            args.fringe_radius,
            args.fringe_passes,
        )
    else:
        split_background(args.input, args.out_dir, names, args.pad)


def split_furniture(
    input_path: Path,
    out_dir: Path,
    names: list[str],
    pad: int,
    max_opaque_key_pixels: int,
    fringe_radius: int,
    fringe_passes: int,
) -> None:
    image = Image.open(input_path).convert("RGBA")
    width, height = image.size

    for index, name in enumerate(names):
        crop = image.crop(panel_box(width, height, index)).copy()
        remove_magenta(crop)
        removed_fringe_pixels = remove_magenta_fringe(crop, fringe_radius, fringe_passes)
        despilled_fringe_pixels = despill_magenta_fringe(crop, fringe_radius + 2)
        bbox = alpha_bbox(crop)
        if bbox:
            crop = crop.crop(padded_bbox(bbox, crop.size, pad))
        clear_transparent_rgb(crop)
        opaque_key_pixels = count_opaque_magenta(crop)
        if opaque_key_pixels > max_opaque_key_pixels:
            raise SystemExit(
                f"{name}.png contains {opaque_key_pixels} opaque magenta pixels; "
                f"allowed {max_opaque_key_pixels}."
            )
        output = out_dir / f"{name}.png"
        crop.save(output)
        print_asset(
            output,
            crop,
            opaque_key_pixels=opaque_key_pixels,
            removed_fringe_pixels=removed_fringe_pixels,
            despilled_fringe_pixels=despilled_fringe_pixels,
        )


def split_background(input_path: Path, out_dir: Path, names: list[str], pad: int) -> None:
    image = Image.open(input_path).convert("RGB")
    width, height = image.size

    for index, name in enumerate(names):
        crop = image.crop(panel_box(width, height, index)).copy()
        bbox = nonblack_bbox(crop)
        if bbox:
            crop = crop.crop(padded_bbox(bbox, crop.size, min(pad, 2)))
        output = out_dir / f"{name}.png"
        crop.save(output)
        print_asset(output, crop)


def panel_box(width: int, height: int, index: int) -> tuple[int, int, int, int]:
    return (round(width * index / 3), 0, round(width * (index + 1) / 3), height)


def remove_magenta(image: Image.Image) -> None:
    pixels = image.load()
    width, height = image.size
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if red > 210 and green < 80 and blue > 210:
                pixels[x, y] = (0, 0, 0, 0)


def clear_transparent_rgb(image: Image.Image) -> None:
    pixels = image.load()
    width, height = image.size
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0 and (red or green or blue):
                pixels[x, y] = (0, 0, 0, 0)


def remove_magenta_fringe(image: Image.Image, radius: int, passes: int) -> int:
    if radius <= 0 or passes <= 0:
        return 0

    removed = 0
    for _ in range(passes):
        pixels = image.load()
        width, height = image.size
        targets = []
        for y in range(height):
            for x in range(width):
                red, green, blue, alpha = pixels[x, y]
                if alpha == 0:
                    continue
                if is_magenta_fringe(red, green, blue) and touches_transparency(pixels, width, height, x, y, radius):
                    targets.append((x, y))
        if not targets:
            break
        for x, y in targets:
            pixels[x, y] = (0, 0, 0, 0)
        removed += len(targets)
    return removed


def despill_magenta_fringe(image: Image.Image, radius: int) -> int:
    if radius <= 0:
        return 0

    pixels = image.load()
    width, height = image.size
    changed = 0
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                continue
            if not is_magenta_despill_candidate(red, green, blue):
                continue
            if not touches_transparency(pixels, width, height, x, y, radius):
                continue
            pixels[x, y] = (
                min(red, max(green, round(red * 0.48))),
                green,
                min(blue, max(green, round(blue * 0.48))),
                alpha,
            )
            changed += 1
    return changed


def is_magenta_fringe(red: int, green: int, blue: int) -> bool:
    if red < 60 or blue < 60 or green > 70:
        return False
    if abs(red - blue) > 80:
        return False
    return red > green * 1.2 and blue > green * 1.2


def is_magenta_despill_candidate(red: int, green: int, blue: int) -> bool:
    if red < 45 or blue < 45 or green > 90:
        return False
    if abs(red - blue) > 90:
        return False
    return red > green * 1.1 and blue > green * 1.1


def touches_transparency(pixels, width: int, height: int, x: int, y: int, radius: int) -> bool:
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dx == 0 and dy == 0:
                continue
            sample_x = x + dx
            sample_y = y + dy
            if sample_x < 0 or sample_y < 0 or sample_x >= width or sample_y >= height:
                continue
            if pixels[sample_x, sample_y][3] == 0:
                return True
    return False


def count_opaque_magenta(image: Image.Image) -> int:
    pixels = image.load()
    width, height = image.size
    count = 0
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if alpha > 0 and red > 210 and green < 80 and blue > 210:
                count += 1
    return count


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    pixels = image.load()
    width, height = image.size
    bbox = None
    for y in range(height):
        for x in range(width):
            if pixels[x, y][3] == 0:
                continue
            bbox = extend_bbox(bbox, x, y)
    return bbox


def nonblack_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    pixels = image.load()
    width, height = image.size
    bbox = None
    for y in range(height):
        for x in range(width):
            if max(pixels[x, y]) <= 7:
                continue
            bbox = extend_bbox(bbox, x, y)
    return bbox


def extend_bbox(
    bbox: tuple[int, int, int, int] | None,
    x: int,
    y: int,
) -> tuple[int, int, int, int]:
    if bbox is None:
        return (x, y, x + 1, y + 1)
    return (min(bbox[0], x), min(bbox[1], y), max(bbox[2], x + 1), max(bbox[3], y + 1))


def padded_bbox(
    bbox: tuple[int, int, int, int],
    size: tuple[int, int],
    pad: int,
) -> tuple[int, int, int, int]:
    width, height = size
    return (
        max(0, bbox[0] - pad),
        max(0, bbox[1] - pad),
        min(width, bbox[2] + pad),
        min(height, bbox[3] + pad),
    )


def print_asset(
    path: Path,
    image: Image.Image,
    opaque_key_pixels: int | None = None,
    removed_fringe_pixels: int | None = None,
    despilled_fringe_pixels: int | None = None,
) -> None:
    details = [f"{path}", f"{image.size[0]}x{image.size[1]}", image.mode]
    if image.mode == "RGBA":
        details.append(f"corner-alpha={corner_alpha(image)}")
    if opaque_key_pixels is not None:
        details.append(f"opaque-key-pixels={opaque_key_pixels}")
    if removed_fringe_pixels is not None:
        details.append(f"removed-fringe-pixels={removed_fringe_pixels}")
    if despilled_fringe_pixels is not None:
        details.append(f"despilled-fringe-pixels={despilled_fringe_pixels}")
    print(" ".join(details))


def corner_alpha(image: Image.Image) -> str:
    width, height = image.size
    corners = (
        image.getpixel((0, 0))[3],
        image.getpixel((width - 1, 0))[3],
        image.getpixel((0, height - 1))[3],
        image.getpixel((width - 1, height - 1))[3],
    )
    return ",".join(str(alpha) for alpha in corners)


if __name__ == "__main__":
    main()
