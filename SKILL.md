---
name: code-video
description: 用代码做视频（零图片/视频模型）——文案→句级时间轴→动画编排表→Canvas 代码作画→无头浏览器渲染→自动混音剪辑→动态自检。适用于口播讲解类竖屏短视频（60–300 秒）、需要"改需求=改数字"的批量视频生产。A-roll/B-roll 双模板自动区分（暖纸讲人 / 墨黑讲理）。
---

# code-video · 用代码做视频

> **核心主张**：画面不是"生成"出来的，是**代码一帧帧画**出来的。
> 不依赖任何图片模型 / 视频模型；修改需求 = 改一个数字，重新渲染即可。

## 什么时候用

- 口播 / 讲解类短视频，有完整台词稿（或能生成）
- 想要统一、高级的视觉语言（例：暖纸 + 墨黑 + 金线的印刷质感）
- 需要反复改：每个字/卡片的出现时刻都要跟台词严丝合缝
- 批量生产同风格视频（系列课、专栏）

## 工作流（严格按序）

```
① 文案 → 51 句级台本
② TTS 配音 → 02_音频/voice/*.wav（每句一个文件）
③ 时间轴 → 02_音频/timeline.json（{segments:[{id,t0,t1,text}], total}）
④ 编排表 → engine/beatrender.core.js 的 BEATS 数组（每句一条：谁出现、怎么出现、在哪个 box）
⑤ 渲染 → node engine/build.mjs（无头 Chrome 逐帧画 → 片段 mp4）
⑥ 合成 → 自动混音（配音+BGM+音效）
⑦ 自检 → python engine/check_static.py 全片.mp4（无死长静止才算过）
```

## A-roll / B-roll 自动区分（默认主题）

BEATS 每条 beats 用 `bg: 'paper' | 'ink'` 声明画面归属，引擎自动套默认主题：

| | A-roll（bg:'paper'） | B-roll（bg:'ink'） |
|---|---|---|
| 底色 | 暖纸 `#E6D8BC` + 颗粒点阵 | 墨黑 `#141310` + 暗角 |
| 文字 | 深墨 `#3A3226` | 暖白 `#F3EBD6` |
| 强调 | 金 `#D9A94A` | 金 `#D9A94A` |
| 语义 | 讲人：人物在场、暖、慢 | 讲理：图表/卡片/对比、冷、快 |

## 目录布局（工程脚手架）

```
<项目>/
├── video.config.mjs        # 段表 PLAN / 路径 / BGM 配置
├── 02_音频/
│   ├── timeline.json       # 句级时间轴
│   ├── voice/              # vo_<id>.wav（每句一个）
│   └── sfx/                # 音效 wav（click/pop/ding/whoosh…）
├── 03_画面/预览/           # 渲染中间产物（片段_*.mp4）
├── 04_成片/                # 交付成片
└── engine/                 # 本 skill 的引擎（勿手改结构，改内容）
    ├── beatrender.core.js  # 动效引擎 + BEATS 编排表（主要编辑对象）
    ├── film.js             # 全片段表 SEGS + 底纹/导航/版式
    ├── film.html           # 无头渲染页面
    └── *.mjs / *.py        # 构建、渲染、混音、自检
```

## 常用命令

```bash
node engine/build.mjs                    # 增量构建全片
node engine/build.mjs --only S2 --force  # 只重做某段
node engine/build.mjs --recompose        # 音频改动后只重混（不重渲画布）
python engine/check_static.py 04_成片/全片_*.mp4   # 动态自检
```

## 动效库

`motion/` 下是 FredTalk 精选的可组合基础动效（砸卡 / 擦入 / 劈开 / 弹入 / 翻卡 / 生长）。
每个配方给出：触发时机、代码片段（基于 `beatrender.core.js` 的 `mo` 0–7 与工具函数）、横→竖适配要点。
**默认使用这几个模板自由组合**；后续替换为自有动效库时，保持“配方→代码片段”的接口不变。

## 关键纪律

1. **box 是裁剪窗口**：`morph / split / wipe` 三种出场把 `box` 当 clip，内容必须落在 box 内。
2. **box 必须等于内容外接矩形**，改坐标必须同步改 box。
3. **残影按时间序取上一条**（timeline 邻接），不要用数组上一项。
4. **改完 beatrender.core.js 必须 `node --check`**；语法错会让引擎静默退回旧画面。
5. **交付前必须跑 check_static**：静止 > 0.5s 的窗口 = 不合格。

## 无数字人时的 A-roll 注意

本 skill 不含数字人合成。A-roll（讲人）句子如果画面只有"人物位 + 静态文字"，
**必须自带空闲动效**（呼吸线 / 微光带 / 缓动点），否则 check_static 会报静窗。
`examples/code-video-demo` 里 A-roll 的动感部分由数字人视频提供，**单独渲染画布时会有静窗——这是预期行为**；
你的 A-roll 若要独立成片，请在 vis 里加持续的微动效（见 motion/ 配方 06）。
