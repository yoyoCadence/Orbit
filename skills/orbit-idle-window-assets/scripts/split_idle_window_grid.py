#!/usr/bin/env python3
"""Split Orbit idle-window grid sheets into trimmed transparent runtime assets."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from PIL import Image

from split_idle_window_sheet import (
    alpha_bbox,
    clear_transparent_rgb,
    count_opaque_magenta,
    despill_magenta_fringe,
    padded_bbox,
    print_asset,
    remove_magenta,
    remove_magenta_fringe,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Split an Orbit idle-window grid sheet.")
    parser.add_argument("--input", required=True, type=Path, help="Source PNG sheet.")
    parser.add_argument("--out-dir", required=True, type=Path, help="Directory for split PNG outputs.")
    parser.add_argument("--cols", required=True, type=int, help="Number of grid columns.")
    parser.add_argument("--rows", required=True, type=int, help="Number of grid rows.")
    parser.add_argument("--names", required=True, help="Comma-separated output basenames, without .png.")
    parser.add_argument("--raw-copy", type=Path, help="Optional path to copy the raw sheet for provenance.")
    parser.add_argument("--pad", type=int, default=8, help="Trim padding in pixels.")
    parser.add_argument("--fringe-radius", type=int, default=2, help="Edge-fringe cleanup radius.")
    parser.add_argument("--fringe-passes", type=int, default=2, help="Edge-fringe cleanup passes.")
    parser.add_argument("--max-opaque-key-pixels", type=int, default=0)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    names = [entry.strip() for entry in args.names.split(",") if entry.strip()]
    expected = args.cols * args.rows
    if len(names) != expected:
        raise SystemExit(f"--names must contain exactly {expected} comma-separated basenames.")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    if args.raw_copy:
        args.raw_copy.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(args.input, args.raw_copy)

    image = Image.open(args.input).convert("RGBA")
    width, height = image.size

    for index, name in enumerate(names):
        col = index % args.cols
        row = index // args.cols
        crop = image.crop(grid_box(width, height, args.cols, args.rows, col, row)).copy()
        remove_magenta(crop)
        removed_fringe_pixels = remove_magenta_fringe(crop, args.fringe_radius, args.fringe_passes)
        despilled_fringe_pixels = despill_magenta_fringe(crop, args.fringe_radius + 2)
        bbox = alpha_bbox(crop)
        if bbox:
            crop = crop.crop(padded_bbox(bbox, crop.size, args.pad))
        clear_transparent_rgb(crop)
        opaque_key_pixels = count_opaque_magenta(crop)
        if opaque_key_pixels > args.max_opaque_key_pixels:
            raise SystemExit(
                f"{name}.png contains {opaque_key_pixels} opaque magenta pixels; "
                f"allowed {args.max_opaque_key_pixels}."
            )
        output = args.out_dir / f"{name}.png"
        crop.save(output)
        print_asset(output, crop, opaque_key_pixels, removed_fringe_pixels, despilled_fringe_pixels)


def grid_box(
    width: int,
    height: int,
    cols: int,
    rows: int,
    col: int,
    row: int,
) -> tuple[int, int, int, int]:
    return (
        round(width * col / cols),
        round(height * row / rows),
        round(width * (col + 1) / cols),
        round(height * (row + 1) / rows),
    )


if __name__ == "__main__":
    main()
