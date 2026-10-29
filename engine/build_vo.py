# -*- coding: utf-8 -*-
"""build_vo_full.py — 按锁定时间轴把逐句配音拼成一条整轨（48k/16bit/mono）

用法：
    python -X utf8 build_vo_full.py                       # 输出 02_音频/voice_mm/voice_full.wav
    python -X utf8 build_vo_full.py --out x.wav --from 72.07 --to 89.5

为什么不用 ffmpeg 的 51 路 amix：慢且容易炸；这里直接按样本叠加，秒级完成。
"""
import argparse
import json
import wave
from pathlib import Path

PROJ = Path(__file__).resolve().parent.parent
VO = PROJ / "02_音频" / "voice"
TL = PROJ / "02_音频" / "timeline.json"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(VO / "voice_full.wav"))
    ap.add_argument("--from", dest="t_from", type=float, default=0.0)
    ap.add_argument("--to", dest="t_to", type=float, default=0.0)
    a = ap.parse_args()

    tl = json.loads(TL.read_text(encoding="utf-8"))
    segs = tl["segments"] if isinstance(tl, dict) else tl
    total = float(tl.get("total", 159.646)) if isinstance(tl, dict) else max(s["t1"] for s in segs)

    t0 = a.t_from
    t1 = a.t_to if a.t_to > 0 else total
    dur = t1 - t0

    ref_path = next((VO / (s["id"] + ".wav") for s in segs if (VO / (s["id"] + ".wav")).exists()), None)
    if ref_path is None:
        raise SystemExit("02_音频/voice 里没有 <句子id>.wav，先把配音放进去")
    ref = wave.open(str(ref_path))
    rate, ch, sw = ref.getframerate(), ref.getnchannels(), ref.getsampwidth()
    ref.close()
    assert ch == 1 and sw == 2, f"预期 mono/16bit，实际 {ch}ch/{sw * 8}bit"

    n = int(round(dur * rate)) + 1
    buf = bytearray(n * 2)          # 全零 = 静音

    placed, missing = 0, []
    for s in segs:
        st, en = float(s["t0"]), float(s["t1"])
        if en <= t0 or st >= t1:
            continue
        f = VO / f"{s['id']}.wav"
        if not f.exists():
            missing.append(s["id"])
            continue
        w = wave.open(str(f))
        if (w.getframerate(), w.getnchannels(), w.getsampwidth()) != (rate, ch, sw):
            w.close()
            raise SystemExit(f"{f.name} 采样格式不一致")
        pcm = w.readframes(w.getnframes())
        w.close()
        # 目标样本起点（相对切片）
        src_off = int(round(max(0.0, t0 - st) * rate)) * 2
        dst = int(round((st - t0) * rate)) * 2
        if dst < 0:
            # 句子起点比切片起点早几毫秒（段边界常这样）：src_off 已经跳过了被切掉的那一点，
            # 这里只需落点归零 —— 以前直接 continue，会整句丢掉（S2/S4/S6/S8/S12/S14 首句都中过）。
            dst = 0
        take = min(len(pcm) - src_off, n * 2 - dst)
        if take > 0:
            buf[dst:dst + take] = pcm[src_off:src_off + take]
            placed += 1

    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out), "wb") as w:
        w.setnchannels(ch)
        w.setsampwidth(sw)
        w.setframerate(rate)
        w.writeframes(bytes(buf))
    print(f"配音轨: {out}  {dur:.3f}s  放入 {placed} 句" + (f"  缺 {missing}" if missing else ""))


if __name__ == "__main__":
    main()
