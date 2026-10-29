# -*- coding: utf-8 -*-
"""check_static.py — 对最终成片做「有没有停下来」检查（像素差）

用法（在工程根目录）：
    python engine/check_static.py "04_成片/S1.mp4" [--fps 24] [--thr 0.35] [--min 0.5]
输出：变化帧占比 + 最长静止窗口（超过 --min 秒就报位置）
通过标准：没有超过 --min 的静止窗口。
"""
import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

FF = os.environ.get("FFMPEG_PATH", "ffmpeg")


def measure(path, fps):
    """返回每帧的「与上一帧的平均亮度差」列表（第 0 帧为 None）。"""
    # tblend=difference 把相邻两帧相减；再取 Y 通道均值
    cmd = [FF, '-hide_banner', '-i', str(path),
           '-vf', 'scale=270:480,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG',
           '-an', '-f', 'null', '-']
    cp = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    vals = [float(m) for m in re.findall(r'lavfi\.signalstats\.YAVG=([0-9.]+)', cp.stderr + cp.stdout)]
    return vals


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('file')
    ap.add_argument('--fps', type=float, default=24)
    ap.add_argument('--thr', type=float, default=0.01, help='平均亮度差低于此值算“这帧没变”（实测噪声底 0.0002，真实运动 ≥0.01）')
    ap.add_argument('--min', type=float, default=0.5, help='连续多少秒算静止窗口')
    a = ap.parse_args()

    p = Path(a.file)
    if not p.exists():
        sys.exit(f'找不到 {p}')
    vals = measure(p, a.fps)
    if len(vals) < 3:
        sys.exit('测不到帧差（ffmpeg 输出为空）')

    worst_len, worst_at, run, run_start = 0, None, 0, 0
    for i, v in enumerate(vals):
        if v < a.thr:
            if run == 0:
                run_start = i
            run += 1
            if run > worst_len:
                worst_len, worst_at = run, run_start
        else:
            run = 0

    moved = sum(1 for v in vals if v >= a.thr)
    secs = worst_len / a.fps
    print(f'{p.name}: {len(vals)} 帧 / 变化帧 {moved / len(vals) * 100:.1f}%')
    if secs >= a.min:
        print(f'⚠ 静止 {secs:.2f}s，从 {(worst_at - 1) / a.fps:.2f}s 起')
        sys.exit(2)
    print('✅ 无超过阈值的静止窗口')
    if worst_len:
        print(f'  （最长静止 {(worst_at - 1) / a.fps:.2f}s 起 {secs:.2f}s，未到阈值）')


if __name__ == '__main__':
    main()
