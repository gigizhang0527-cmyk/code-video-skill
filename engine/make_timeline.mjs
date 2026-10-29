#!/usr/bin/env node
/**
 * make_timeline.mjs — 把 voice/timeline.json 转成浏览器可直接加载的 timeline.data.js
 *
 * timeline.json 结构（由 TTS/Whisper 步骤产出）：
 *   { "segments": [ { "id": "v001", "t0": 0.35, "t1": 2.10, "text": "…" }, … ], "total": 159.6 }
 * 生成： window.TL = [ { id, t0, t1 }, … ]   （只带时间轴，正文仍在 json 里，浏览器不需要）
 *
 * 用法：node make_timeline.mjs [timeline.json 路径]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJ = resolve(HERE, '..');
const CFG = await import(join(PROJ, 'video.config.mjs')).catch(() => ({}));
const TL_PATH = resolve(PROJ, process.argv[2] || CFG.TIMELINE || '02_音频/timeline.json');
const OUT = join(HERE, 'timeline.data.js');

if (!existsSync(TL_PATH)) {
  console.error(`✗ 找不到时间轴：${TL_PATH}`);
  process.exit(1);
}
const tl = JSON.parse(readFileSync(TL_PATH, 'utf8').replace(/^\uFEFF/, ''));
const segs = (tl.segments || tl).map(({ id, t0, t1 }) => ({ id, t0, t1 }));
if (!segs.length) {
  console.error('✗ 时间轴为空');
  process.exit(1);
}
writeFileSync(OUT, `window.TL = ${JSON.stringify(segs)};\n`, 'utf8');
console.log(`✓ timeline.data.js：${segs.length} 句  t=${segs[0].t0}~${segs[segs.length - 1].t1}`);
