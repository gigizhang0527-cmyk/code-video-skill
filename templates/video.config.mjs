/**
 * video.config.mjs — 工程配置（每部视频一份，放在工程根目录）
 *
 * PLAN = 段表：段名 / 起始秒 / 结束秒。
 *   - 片段按时间切画布：一段一个 片段_<t0>-<t1>.mp4
 *   - 段名同时决定 02_音频/vo_<段名>.wav 与 04_成片/<段名>.mp4
 *   - 段起点应落在句边界上（timeline.json 的 segment t0）
 */
export const TOTAL = 159.646;          // 全片时长（秒）
export const FPS = 24;

export const OUT = '04_成片';           // 交付目录
export const PREVIEW = '03_画面/预览';   // 渲染中间产物
export const VOICE = '02_音频';          // vo_<段名>.wav
export const SFX_DIR = '02_音频/sfx';    // 音效库
export const TIMELINE = '02_音频/timeline.json';

// BGM（跟随循环；不需要就注释掉整块）
export const BGM = { path: '02_音频/bgm.wav', vol: 0.16 };

// 声点表（可选）：{ 段名: [[音效名, 相对段起点秒, 音量], ...] }
export const SFX_MAP = 'sfx_map.json';

// 段表（示例：本实例 13 段）
export const PLAN = [
  ['S1', 0.350, 17.030],
  ['S2', 17.030, 28.580],
  ['S3', 28.580, 36.160],
  ['S4', 36.160, 44.860],
  ['S5', 44.860, 53.640],
  ['S6', 53.640, 72.070],
  ['S7', 72.070, 89.520],
  ['S8', 89.520, 96.360],
  ['S9S10', 96.360, 119.610],
  ['S11', 119.610, 128.920],
  ['S12', 128.920, 136.740],
  ['S13', 136.740, 144.060],
  ['S14b', 144.060, 159.646],
];
