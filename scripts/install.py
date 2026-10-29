# -*- coding: utf-8 -*-
"""install.py — 把 code-video-skill 安装为本地 skill（~/.agents/skills/code-video）

用法：
    python scripts/install.py                # 默认装到 ~/.agents/skills/code-video
    python scripts/install.py --dir D:\\skills  # 自定义 skills 目录
    python scripts/install.py --check        # 只检查依赖，不安装
"""
import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def check_deps():
    ok = True
    print('=== 依赖检查 ===')
    for name, cmd in (('node', ['node', '-v']), ('ffmpeg', ['ffmpeg', '-version']),
                      ('python', [sys.executable, '--version'])):
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
            print(f'  {name}: {(r.stdout or r.stderr).strip().splitlines()[0]}')
        except Exception as e:  # noqa: BLE001
            ok = False
            print(f'  ✗ {name}: {e}')
    chrome_paths = [Path(r'C:\Program Files\Google\Chrome\Application\chrome.exe'),
                    Path(r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe')]
    if any(p.exists() for p in chrome_paths):
        print('  chrome: ✓')
    else:
        print('  chrome: 未在默认路径找到（设置 CHROME_PATH 环境变量）')
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', default=str(Path.home() / '.agents' / 'skills'))
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()

    ok = check_deps()
    if a.check:
        sys.exit(0 if ok else 1)
    if not ok:
        print('\n依赖不全，先装依赖再安装。')

    dst = Path(a.dir) / 'code-video'
    if dst.exists():
        shutil.rmtree(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(ROOT, dst, ignore=shutil.ignore_patterns('.git', 'examples', 'docs', '__pycache__'))
    print(f'\n✓ 已安装到 {dst}')
    print('  重启 DSH/Claude Code 后生效；然后对自己的 Agent 说「用 code-video 建一个视频工程」')


if __name__ == '__main__':
    main()
