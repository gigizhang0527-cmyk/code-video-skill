# 🎬 用代码做视频 · code-video-skill

**零图片模型、零视频模型**——所有画面都是代码画出来的。改需求 = 改一个数字。

> 📖 **[Agent 画面制作指南（图文版）](docs/intro.md)** —— 按作品视频的叙事顺序，配截图与 GIF 动图讲解画面是怎么做出来的。

> 这不是"AI 生成视频"那套。这条流水线不调用任何生图/生视频 API：
> 文案 ⇒ 句级时间轴 ⇒ 动画编排表 ⇒ Canvas 逐帧作画 ⇒ 无头浏览器渲染 ⇒ 自动混音剪辑。

## 🚀 一键安装

把这些发给你的 AI Agent：

```
帮我安装这个项目，安装完成后按 SKILL.md 的工作流带我创建第一个视频工程：
https://github.com/gigizhang0527-cmyk/code-video-skill
```

## ✨ 它和"AI 生成视频"的区别

| | 生成式路线 | 本 skill（代码路线） |
|---|---|---|
| 画面来源 | 图片/视频模型生成 | **代码逐帧绘制**（Canvas） |
| 一致性 | 每帧都可能漂 | 完全确定，可复现 |
| 改一个卡片的位置 | 重新生成、重抽卡 | **改一个数字，重渲** |
| 风格控制 | 提示词玄学 | 主题色/字体/版式全是参数 |
| 成本 | 按张/按秒计费 | 本地 CPU 渲染 |

## 🛠️ 核心工作流

1. **文案**：51 句级台本（每句一条画面预算）
2. **配音**：每句一个 mono/16bit wav——**任意来源都行**（任何 TTS、声音克隆、真人录制；本 skill 不绑定、不内置任何音频模型或 API），天然得到时间轴
3. **编排表**：`BEATS` 数组——每句话对应"谁出现 / 怎么出现 / 在哪个 box"，A-roll(纸) 与 B-roll(墨) 由 `bg` 自动区分
4. **作画**：`beatrender.core.js` 用 Canvas 把每帧画出来
5. **渲染**：无头 Chrome 逐帧截图 → ffmpeg 编码
6. **合成**：配音 + BGM + 音效按声点表混音
7. **自检**：`check_static.py` 揪「死长静止 / 一闪而过」

## 📦 目录

```
engine/       引擎：动效核心 / 渲染 / 混音 / 自检
templates/    默认主题、编排表范式、声点表范式、配置模板
motion/       FredTalk 精选动效配方（可自由组合）
examples/     本仓库附带的实例（A/B-roll 完整案例）
scripts/      安装与脚手架
```

## 快速开始（手工）

```bash
# 1. 安装依赖：Node 18+ / Chrome / FFmpeg / Python3
# 2. 建工程
python scripts/scaffold.py ~/我的视频
cd ~/我的视频
# 3. 放入 timeline.json + voice/*.wav（或先用任何方式生成）
# 4. 编辑 engine/beatrender.core.js 的 BEATS（或先用实例）
node engine/build.js
python engine/check_static.py 04_成片/全片_*.mp4
```

## License

MIT
