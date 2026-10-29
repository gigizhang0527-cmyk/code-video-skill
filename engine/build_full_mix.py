# -*- coding: utf-8 -*-
"""build_full_mix.py — 全片音轨 = 配音整轨 + 全部音效（审片_V2 · A3）

PR XML 的第二条音轨用这条混好的整轨；段内 mp4 自己的音轨只做抽检用。

用法：
    python -X utf8 build_full_mix.py                 # → 04_成片/全片_音轨.wav
    python -X utf8 build_full_mix.py --out x.wav

为什么单独做：PR 导入只挂一条音轨，如果直接挂 voice_full.wav，音效就丢了。
"""
import argparse
import json
import wave
from pathlib import Path

import numpy as np

PROJ = Path(r"E:\DeepSeek\视频制作\2026-10-25 手把手教你用代码做视频")
VO = PROJ / "02_音频" / "voice_mm"
SFX = PROJ / "02_音频" / "sfx"
MAP = PROJ / "03_画面" / "设计" / "sfx_map.json"
OUT = PROJ / "04_成片" / "全片_音轨.wav"
RATE = 48000


def read_wav(path):
    """→ (float32 mono, rate)"""
    w = wave.open(str(path))
    rate, ch, sw, n = w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes()
    pcm = w.readframes(n)
    w.close()
    if sw == 2:
        v = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0
    elif sw == 3:
        b = np.frombuffer(pcm, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        i = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)
        i = np.where(i >= (1 << 23), i - (1 << 24), i).astype(np.float32)
        v = i / float(1 << 23)
    elif sw == 4:
        v = np.frombuffer(pcm, dtype="<i4").astype(np.float32) / 2147483648.0
    else:
        raise SystemExit(f"{path.name}: 不支持的位深 {sw * 8}bit")
    if ch == 2:
        v = v.reshape(-1, 2).mean(axis=1)
    if rate != RATE:
        idx = np.arange(0, len(v), rate / RATE)
        v = np.interp(idx, np.arange(len(v)), v).astype(np.float32)
    return v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--voice", default=str(VO / "voice_full.wav"))
    a = ap.parse_args()

    voice = read_wav(Path(a.voice))
    tl = json.loads((VO / "timeline.json").read_text(encoding="utf-8"))
    segs = tl["segments"] if isinstance(tl, dict) else tl
    total = float(tl.get("total", 159.646)) if isinstance(tl, dict) else max(s["t1"] for s in segs)

    n = max(len(voice), int(round(total * RATE)))
    mix = np.zeros(n, dtype=np.float32)
    mix[: len(voice)] += voice

    smap = json.loads(MAP.read_text(encoding="utf-8"))
    cache, points = {}, 0
    for s in segs:
        for name, off, vol in smap.get(s["id"], []):
            if name not in cache:
                cache[name] = read_wav(SFX / (name + ".wav"))
            buf = cache[name]
            st = int(round((float(s["t0"]) + float(off)) * RATE))
            en = min(n, st + len(buf))
            if st < 0 or en <= st:
                continue
            mix[st:en] += buf[: en - st] * float(vol)
            points += 1

    # BGM（Mimo V1）：S1 炫技版（126.5BPM），正文段讲解版（84BPM，循环铺满）
    def lay_loop(buf, start, end, vol):
        i0, i1 = int(round(start * RATE)), min(n, int(round(end * RATE)))
        off = 0
        while i0 + off < i1:
            take = min(len(buf), i1 - i0 - off)
            if take <= 0:
                break
            mix[i0 + off:i0 + off + take] += buf[:take] * vol
            off += take

    bgm1 = PROJ / "03_画面" / "外部参考" / "BGM_自制_1265.wav"
    bgm2 = PROJ / "02_音频" / "BGM_正文_84.wav"
    lay_loop(read_wav(bgm1), 0.35, 17.03, 0.22)
    lay_loop(read_wav(bgm2), 17.03, total, 0.14)

    peak = float(np.max(np.abs(mix))) if len(mix) else 0.0
    if peak > 0.97:
        mix *= 0.97 / peak
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((np.clip(mix, -1, 1) * 32767).astype("<i2").tobytes())
    print(f"全片音轨: {out}  {len(mix) / RATE:.3f}s  音效 {points} 个  峰值 {20 * np.log10(max(peak, 1e-9)):.1f} dBFS")


if __name__ == "__main__":
    main()
