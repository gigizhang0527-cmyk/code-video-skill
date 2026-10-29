#!/usr/bin/env node
/**
 * mix.mjs — 画布片段 + 配音 + BGM + 音效 → 可交付 mp4（**不含数字人合成**）
 *
 * 用法：
 *   node mix.mjs --canvas 片段.mp4 --t0 0 --vo vo.wav --out out.mp4 \
 *        [--bgm bgm.wav --bgm-vol 0.16] [--sfx sfx/pop.wav@12.336@0.4 ...]
 *
 * 说明：
 * - 画面直接过（-c:v libx264 crf18，无损画质二次编码）
 * - 配音 1.0 / BGM 可调（默认跟随循环）/ 每个音效按「绝对秒 - t0」定位并限幅
 * - ffmpeg 优先取 $env:FFMPEG_PATH，否则用 PATH 里的 ffmpeg
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const FF = process.env.FFMPEG_PATH || 'ffmpeg';

const canvas = resolve(opt('canvas') || '');
const out = resolve(opt('out') || '');
const t0 = Number(opt('t0', '0'));
const vo = opt('vo') ? resolve(opt('vo')) : null;
const bgm = opt('bgm') ? resolve(opt('bgm')) : null;
const bgmVol = Number(opt('bgm-vol', '0.16'));

const sfx = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--sfx') {
    const [p, at, vol] = args[i + 1].split('@');
    sfx.push({ path: resolve(p), at: Number(at), vol: Number(vol || 0.4) });
  }
}
for (const f of [canvas, ...(vo ? [vo] : []), ...(bgm ? [bgm] : []), ...sfx.map(s => s.path)]) {
  if (!existsSync(f)) throw new Error(`输入不存在：${f}`);
}

const inputs = ['-i', canvas];
const audios = [];
let idx = 1;
if (vo) { inputs.push('-i', vo); audios.push({ i: idx++, vol: 1, delay: 0 }); }
if (bgm) { inputs.push('-stream_loop', '-1', '-i', bgm); audios.push({ i: idx++, vol: bgmVol, delay: 0 }); }
for (const s of sfx) { inputs.push('-i', s.path); audios.push({ i: idx++, vol: s.vol, delay: Math.max(0, s.at - t0) }); }

const filters = ['[0:v]null[vout]'];
audios.forEach((a, k) => {
  const delay = a.delay > 0 ? `,adelay=${Math.round(a.delay * 1000)}:all=1` : '';
  filters.push(`[${a.i}:a]aresample=48000,volume=${a.vol}${delay}[au${k}]`);
});
const mixes = audios.map((_, k) => `[au${k}]`).join('');
if (audios.length) filters.push(`${mixes}amix=inputs=${audios.length}:duration=first:normalize=0,alimiter=limit=0.97[aout]`);

const cmd = ['-y', '-v', 'error', ...inputs, '-filter_complex', filters.join(';'), '-map', '[vout]'];
if (audios.length) cmd.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '192k');
cmd.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', '-shortest', out);

console.log(`mix → ${out}  (配音${vo ? '✓' : '-'} BGM${bgm ? '✓' : '-'} 音效${sfx.length})`);
execFileSync(FF, cmd, { stdio: 'inherit' });
