/*
 * gen_bgm2_mimo.mjs — 正文讲解版 BGM（Mimo V1 · 审片「除 S1 外也要 BGM，炫技与讲解要区分」）
 * 与 S1 的 BGM_自制_1265（126.5BPM 炫技版）同族不同气质：
 *   84 BPM 半速 · A 小调 · Am–F–C–G 慢和声 · 鼓组轻量化（无 clap、软 hat）· 长循环 28.6s
 * 用法： node gen_bgm2_mimo.mjs [输出.wav]   → 默认 02_音频/BGM_正文_84.wav
 */
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 48000, BPM = 84, BEAT = 60 / BPM;
const DUR = 28.6;
const N = Math.round(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);

const rnd = (() => { let s = 20261029; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff * 2 - 1; })();
const add = (i, v, pan) => {
  if (i < 0 || i >= N) return;
  const l = pan > 0 ? 1 - pan : 1, r = pan < 0 ? 1 + pan : 1;
  L[i] += v * l; R[i] += v * r;
};
const env = (t, a, d, s, r, len) => {
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - s) * (t - a) / d;
  if (t < len - r) return s;
  return Math.max(0, s * (len - t) / r);
};

// —— 鼓组（V2 补重音：沿炫技版的重拍语言——有力 kick + 反拍 clap + 8 分 hat 重音）——
function kick(at, strong) {
  const len = Math.round(SR * 0.30), i0 = Math.round(at * SR);
  const amp = strong ? 0.95 : 0.55;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const f = 130 * Math.exp(-t / 0.028) + 44;
    const a = Math.exp(-t / (strong ? 0.10 : 0.07)) * amp;
    add(i0 + i, Math.sin(2 * Math.PI * f * t) * a, 0);
  }
}
function clap(at) {
  const len = Math.round(SR * 0.18), i0 = Math.round(at * SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const a = Math.exp(-t / 0.045) * (1 + 0.6 * Math.exp(-((t - 0.010) ** 2) / 1.6e-5));
    add(i0 + i, rnd() * a * 0.30, 0.1);
  }
}
function hat(at, amp) {
  const len = Math.round(SR * 0.05), i0 = Math.round(at * SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const a = Math.exp(-t / 0.016) * amp;
    add(i0 + i, rnd() * a * 0.5, 0.25);
  }
}
// —— 贝斯：长音符（跟随和弦根音）——
function bass(at, freq, len) {
  const n = Math.round(len * SR), i0 = Math.round(at * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * freq * h * t) / h;
    add(i0 + i, v * env(t, 0.02, 0.2, 0.7, 0.3, len) * 0.16, 0);
  }
}
// —— 钢琴感 pluck：稀疏旋律 ——
function pluck(at, freq, amp) {
  const len = Math.round(SR * 0.9), i0 = Math.round(at * SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const a = Math.exp(-t / 0.28) * env(t, 0.004, 0.1, 0.5, 0.4, 0.9);
    add(i0 + i, (Math.sin(2 * Math.PI * freq * t) + 0.22 * Math.sin(4 * Math.PI * freq * t)) * a * amp, Math.sin(at * 1.7) * 0.35);
  }
}
// —— Pad：和弦铺底（讲解版的底色）——
function pad(at, freqs, len, amp) {
  const n = Math.round(len * SR), i0 = Math.round(at * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const a = env(t, 0.8, 0.5, 0.85, 1.2, len) * amp;
    let v = 0;
    for (const f of freqs) v += Math.sin(2 * Math.PI * f * t + Math.sin(t * 0.9) * 0.15);
    add(i0 + i, v / freqs.length * a, -0.15);
    add(i0 + i, v / freqs.length * a * 0.9, 0.15);
  }
}

// Am – F – C – G（每小节 4 拍，共 6 小节一轮 = 28.6s@84BPM≈12拍/两小节…按拍推进）
const CHORDS = [
  { root: 110.00, pad: [220.0, 261.63, 329.63] },   // Am
  { root: 87.31,  pad: [174.61, 220.0, 261.63] },   // F
  { root: 130.81, pad: [261.63, 329.63, 392.00] },  // C
  { root: 98.00,  pad: [196.0, 246.94, 293.66] },   // G
];
const MELODY = [440.0, 523.25, 659.25, 523.25, 493.88, 440.0, 392.0, 440.0];

const totalBeats = Math.floor(DUR / BEAT);
for (let b = 0; b < totalBeats; b++) {
  const t = b * BEAT;
  const ch = CHORDS[Math.floor(b / 4) % CHORDS.length];
  // 鼓（V2 补重音）：1 拍强 kick、3 拍 kick + 3.5 幽灵 kick、2/4 拍 clap 反拍、8 分 hat 带重音
  if (b % 4 === 0) kick(t, true);
  if (b % 4 === 2) { kick(t, true); kick(t + BEAT * 0.5, false); }
  if (b % 4 === 1 || b % 4 === 3) clap(t);
  hat(t, 0.05);
  hat(t + BEAT / 2, 0.13);
  // 贝斯：小节头长音
  if (b % 4 === 0) bass(t, ch.root, BEAT * 4 * 0.95);
  // Pad：小节头铺和弦
  if (b % 4 === 0) pad(t, ch.pad, BEAT * 4.2, 0.11);
  // 旋律：每两拍一颗，偶数小节才走（稀疏）
  if (b % 2 === 1 && Math.floor(b / 4) % 2 === 1) {
    pluck(t, MELODY[(b >> 1) % MELODY.length], 0.16);
  }
}

// 简易混响感：右声道微量延迟
for (let i = 3000; i < N; i++) R[i] += L[i - 3000] * 0.12;

let peak = 0;
for (let i = 0; i < N; i++) {
  const a = Math.abs(L[i]), b = Math.abs(R[i]);
  if (a > peak) peak = a;
  if (b > peak) peak = b;
}
const g = 0.85 / (peak || 1);
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * g * 32767))), 44 + i * 4);
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * g * 32767))), 46 + i * 4);
}
const HERE = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] || join(HERE, '../../02_音频/BGM_正文_84.wav'));
writeFileSync(out, buf);
console.log(`${out}   ${(N / SR).toFixed(2)}s   ${BPM} BPM   ${totalBeats} 拍`);
