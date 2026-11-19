#!/usr/bin/env python3
"""
Packs all unit & monster 192x192 RGBA source sprites from `art/sprites_src/*.png`
into a single lossless WebP sprite atlas (`public/assets/sprites_atlas.webp` + `sprites_atlas.json`)
in strict compliance with AGENTS.md §6 & docs/ARCHITECTURE.md §10-4 / §11.
"""
from collections import deque
import glob
import json
import math
import os
from PIL import Image


def extract_transparent_sprite(raw_path: str, out_path: str, size: int = 192) -> None:
    im = Image.open(raw_path).convert('RGBA')
    w, h = im.size
    px = im.load()

    visited = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def is_bg(r: int, g: int, b: int, a: int) -> bool:
        if a < 16:
            return True
        # Pure/near-white studio backdrop
        return r >= 238 and g >= 238 and b >= 238 and (max(r, g, b) - min(r, g, b) <= 18)

    for x in range(w):
        for y in (0, h - 1):
            r, g, b, a = px[x, y]
            if is_bg(r, g, b, a):
                idx = y * w + x
                if not visited[idx]:
                    visited[idx] = 1
                    q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            r, g, b, a = px[x, y]
            if is_bg(r, g, b, a):
                idx = y * w + x
                if not visited[idx]:
                    visited[idx] = 1
                    q.append((x, y))

    while q:
        cx, cy = q.popleft()
        px[cx, cy] = (0, 0, 0, 0)
        for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
            if 0 <= nx < w and 0 <= ny < h:
                nidx = ny * w + nx
                if not visited[nidx]:
                    r, g, b, a = px[nx, ny]
                    if is_bg(r, g, b, a):
                        visited[nidx] = 1
                        q.append((nx, ny))

    # Clean faint white halo fringe adjacent to transparent pixels
    alpha_mask = [px[x, y][3] for y in range(h) for x in range(w)]
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if alpha_mask[y * w + x] == 0:
                continue
            r, g, b, a = px[x, y]
            if r >= 228 and g >= 228 and b >= 228 and (max(r, g, b) - min(r, g, b) <= 20):
                has_trans_nb = (
                    alpha_mask[(y - 1) * w + x] == 0
                    or alpha_mask[(y + 1) * w + x] == 0
                    or alpha_mask[y * w + (x - 1)] == 0
                    or alpha_mask[y * w + (x + 1)] == 0
                )
                if has_trans_nb:
                    px[x, y] = (0, 0, 0, 0)

    bbox = im.getbbox()
    if not bbox:
        raise RuntimeError(f'Empty sprite after background removal: {raw_path}')
    cropped = im.crop(bbox)
    cw, ch = cropped.size

    # Downsample crisp pixel grid via BOX -> NEAREST snap to 180x182 max bounds, bottom-anchored at y=188
    max_w, max_h = 180, 182
    scale = min(max_w / cw, max_h / ch)
    tw = max(1, int(round(cw * scale)))
    th = max(1, int(round(ch * scale)))

    # Crisp 2-step pixel-art downsample (preserves dark 1-2px outlines cleanly)
    mid_w = max(tw, tw * 2)
    mid_h = max(th, th * 2)
    mid = cropped.resize((mid_w, mid_h), Image.Resampling.BOX)
    resized = mid.resize((tw, th), Image.Resampling.NEAREST)

    # Snap semi-transparent border noise to crisp pixel alpha
    rpx = resized.load()
    for yy in range(th):
        for xx in range(tw):
            rr, gg, bb, aa = rpx[xx, yy]
            if aa < 96:
                rpx[xx, yy] = (0, 0, 0, 0)
            else:
                rpx[xx, yy] = (rr, gg, bb, 255)

    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    paste_x = (size - tw) // 2
    paste_y = (size - 4) - th  # bottom = 188
    out.paste(resized, (paste_x, max(0, paste_y)), resized)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    out.save(out_path, 'PNG', optimize=True)


def pack_atlas(src_dir: str, out_webp: str, out_json: str, cell_size: int = 192, pad: int = 2) -> None:
    png_files = sorted(glob.glob(os.path.join(src_dir, '*.png')))
    if not png_files:
        raise RuntimeError(f'No source PNGs found in {src_dir}')

    count = len(png_files)
    cols = int(math.ceil(math.sqrt(count)))
    rows = int(math.ceil(count / cols))
    stride = cell_size + pad * 2
    atlas_w = cols * stride
    atlas_h = rows * stride

    atlas = Image.new('RGBA', (atlas_w, atlas_h), (0, 0, 0, 0))
    frames: dict[str, dict[str, int]] = {}

    for idx, fpath in enumerate(png_files):
        sprite_id = os.path.splitext(os.path.basename(fpath))[0]
        sp = Image.open(fpath).convert('RGBA')
        if sp.size != (cell_size, cell_size):
            sp = sp.resize((cell_size, cell_size), Image.Resampling.NEAREST)
        col = idx % cols
        row = idx // cols
        dx = col * stride + pad
        dy = row * stride + pad
        atlas.paste(sp, (dx, dy), sp)
        frames[sprite_id] = {
            'x': dx,
            'y': dy,
            'w': cell_size,
            'h': cell_size,
        }

    # Clean 3-LSB JPEG sub-pixel noise while preserving 32,768 RGB shades & razor-sharp pixel alpha
    apx = atlas.load()
    for yy in range(atlas_h):
        for xx in range(atlas_w):
            rr, gg, bb, aa = apx[xx, yy]
            if aa == 0:
                apx[xx, yy] = (0, 0, 0, 0)
            else:
                apx[xx, yy] = (rr & 0xF8, gg & 0xF8, bb & 0xF8, 255 if aa > 200 else aa)

    os.makedirs(os.path.dirname(out_webp), exist_ok=True)
    atlas.save(out_webp, 'WEBP', lossless=True, quality=100, method=6)
    meta = {
        'version': 1,
        'image': 'assets/sprites_atlas.webp',
        'width': atlas_w,
        'height': atlas_h,
        'cellSize': cell_size,
        'frames': frames,
    }
    with open(out_json, 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
        f.write('\n')

    webp_kb = os.path.getsize(out_webp) / 1024.0
    print(f'Packed {count} sprites into {out_webp} ({atlas_w}x{atlas_h}, {webp_kb:.1f} KB)')


if __name__ == '__main__':
    pack_atlas(
        src_dir='art/sprites_src',
        out_webp='public/assets/sprites_atlas.webp',
        out_json='public/assets/sprites_atlas.json',
    )
