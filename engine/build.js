#!/usr/bin/env node
/**
 * build.js — 全片构建管线（纯代码路线，**不含数字人**）
 *
 * 用法：
 *   node build.js                       # 增量：缺什么补什么
 *   node build.js --force               # 全量重渲
 *   node build.js --only S2             # 只做某段
 *   node build.js --recompose           # 只重混音（画布缓存已存在）
 *   node build.js --tag v1              # 输出加后缀（S1_v1.mp4 / 全片_v1_13段.mp4）
 *
 * 依赖工程根目录的 video.config.js（PLAN/路径/BGM 配置）。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJ = resolve(HERE, '..');

const CFG = await import(pathToFileURL(join(PROJ, 'video.config.js')).href).catch(() => {
  throw new Error('缺少 video.config.js（工程根目录），请从 templates/video.config.js 复制并修改');
});

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const force = args.includes('--force');
const recompose = args.includes('--recompose') && !force;
const TI = args.indexOf('--tag');
const TAG = TI >= 0 && args[TI + 1] ? '_' + args[TI + 1] : '';

const PY = process.env.PYTHON || 'python';
const FF = process.env.FFMPEG_PATH || 'ffmpeg';
const FPS = CFG.FPS || 24;
const PLAN = CFG.PLAN || [];

const OUT = join(PROJ, CFG.OUT || '04_成片');
const PREV = join(PROJ, CFG.PREVIEW || '03_画面/预览');
const VOICE = join(PROJ, CFG.VOICE || '02_音频');
const SFXDIR = join(PROJ, CFG.SFX_DIR || '02_音频/sfx');
const BGM = CFG.BGM ? { path: resolve(PROJ, CFG.BGM.path), vol: CFG.BGM.vol ?? 0.16 } : null;
const SFX_MAP = CFG.SFX_MAP ? resolve(PROJ, CFG.SFX_MAP) : null;

mkdirSync(OUT, { recursive: true });
mkdirSync(PREV, { recursive: true });

const run = (cmd, argv) => execFileSync(cmd, argv, { stdio: 'inherit', cwd: HERE });

// 时间轴 → 浏览器版（timeline.data.js），有 timeline.json 才做
const TL_JSON = resolve(PROJ, CFG.TIMELINE || '02_音频/timeline.json');
if (!recompose && existsSync(TL_JSON)) run(process.execPath, [join(HERE, 'make_timeline.js')]);

// 声点表：键可以是段名（偏移相对段起点）或句子 id（偏移相对该句 t0）
let smap = {};
if (SFX_MAP && existsSync(SFX_MAP)) {
  smap = JSON.parse(readFileSync(SFX_MAP, 'utf8').replace(/^\uFEFF/, ''));
  for (const k of Object.keys(smap)) if (k.startsWith('_')) delete smap[k];
}
// 句子表（用于把句 id 键换算成绝对时间）
const TL_JSON_2 = resolve(PROJ, CFG.TIMELINE || '02_音频/timeline.json');
let SENTS = [];
if (existsSync(TL_JSON_2)) {
  const tl = JSON.parse(readFileSync(TL_JSON_2, 'utf8').replace(/^\uFEFF/, ''));
  SENTS = (tl.segments || tl).map(s => ({ id: s.id, t0: Number(s.t0), t1: Number(s.t1) }));
}
const planSfx = (name, t0, t1) => {
  const out = [];
  for (const [sfx, off, vol] of (smap[name] || [])) {
    out.push({ file: join(SFXDIR, sfx + '.wav'), at: t0 + Number(off), vol: Number(vol) });
  }
  for (const s of SENTS) {
    if (s.t0 < t0 || s.t0 >= t1) continue;
    for (const [sfx, off, vol] of (smap[s.id] || [])) {
      out.push({ file: join(SFXDIR, sfx + '.wav'), at: s.t0 + Number(off), vol: Number(vol) });
    }
  }
  return out;
};

const made = [];
for (const [name, t0, t1] of PLAN) {
  if (only && name !== only) continue;
  const canvas = join(PREV, `片段_${t0}-${t1}.mp4`);
  const final = join(OUT, `${name}${TAG}.mp4`);
  const vo = join(VOICE, `vo_${name}.wav`);
  made.push({ name, t0, t1, final });

  if (recompose) {
    if (!existsSync(canvas)) throw new Error(`--recompose 需要画布缓存：${canvas}`);
    if (!existsSync(vo)) {
      run(PY, ['-X', 'utf8', join(HERE, 'build_vo.py'), '--from', String(t0), '--to', String(t1), '--out', vo]);
    }
    try { unlinkSync(final); } catch { }
  } else {
    if (force || !existsSync(canvas)) {
      console.log(`\n=== ${name} ${t0}–${t1} 渲画面 ===`);
      run(process.execPath, [join(HERE, 'render.js'), '--clip', String(t0), String(t1), String(FPS)]);
    } else console.log(`[跳过渲染] ${name} 已有画布`);
    if (force || !existsSync(vo)) {
      run(PY, ['-X', 'utf8', join(HERE, 'build_vo.py'), '--from', String(t0), '--to', String(t1), '--out', vo]);
    }
  }

  if (force || !existsSync(final)) {
    const sfx = planSfx(name, t0, t1);
    console.log(`=== ${name} 合成（音效 ${sfx.length} 个） ===`);
    run(process.execPath, [join(HERE, 'mix.js'), '--canvas', canvas, '--t0', String(t0), '--vo', vo,
      ...(BGM ? ['--bgm', BGM.path, '--bgm-vol', String(BGM.vol)] : []),
      ...sfx.flatMap(p => ['--sfx', `${p.file}@${p.at}@${p.vol}`]),
      '--out', final]);
  } else console.log(`[跳过合成] ${name} 已有成片`);
}

// ---- 整片拼接 ----
const existing = made.filter(x => existsSync(x.final));
if (existing.length) {
  const list = join(PREV, `_concat${TAG}.txt`);
  writeFileSync(list, existing.map(x => `file '${x.final.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
  const full = join(OUT, `全片${TAG}_${existing.length}段.mp4`);
  console.log(`\n=== 拼接 ${existing.length} 段 → ${full} ===`);
  run(FF, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', full]);
}
console.log(`\n完成。段数：${existing.length} / ${PLAN.length}`);
