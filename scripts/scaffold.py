# -*- coding: utf-8 -*-
"""scaffold.py — 建一个新视频工程（复制 engine/ + 配置 + 空目录）

用法：
    python scripts/scaffold.py ../我的视频
    python scripts/scaffold.py ../我的视频 --from-example   # 连实例段表一起带上
"""
import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('target', help='工程目录（不存在会创建）')
    ap.add_argument('--from-example', action='store_true', help='用实例的段表/配置起步')
    a = ap.parse_args()

    dst = Path(a.target).resolve()
    if dst.exists() and any(dst.iterdir()):
        print(f'✗ 目标目录非空：{dst}')
        sys.exit(1)
    dst.mkdir(parents=True, exist_ok=True)

    # engine/（不含 renderm 中间产物）
    shutil.copytree(ROOT / 'engine', dst / 'engine',
                    ignore=shutil.ignore_patterns('timeline.data.js', '__pycache__'))

    # 目录骨架
    for d in ('02_音频/voice', '02_音频/sfx', '03_画面/预览', '04_成片'):
        (dst / d).mkdir(parents=True, exist_ok=True)

    # 配置 + 声点表范式
    shutil.copy(ROOT / 'templates' / 'video.config.mjs', dst / 'video.config.mjs')
    shutil.copy(ROOT / 'templates' / 'sfx_map范式.json', dst / 'sfx_map.json')

    if a.from_example:
        ex = ROOT / 'examples' / 'code-video-demo'
        if ex.exists():
            shutil.copy(ex / 'timeline.demo.json', dst / '02_音频' / 'timeline.json')
            shutil.copy(ex / 'sfx_map.demo.json', dst / 'sfx_map.json')
            shutil.copy(ex / 'open_anim.demo.js', dst / 'engine' / 'open_anim.js')

    print(f'✓ 工程已建：{dst}')
    print('  下一步：')
    print('   1. 把配音 wav 放进 02_音频/voice/（vo_<段名>.wav）')
    print('   2. 写 02_音频/timeline.json（句级时间轴）')
    print('   3. 编辑 engine/beatrender.core.js 的 BEATS（或先试跑实例）')
    print('   4. node engine/build.mjs')


if __name__ == '__main__':
    main()
