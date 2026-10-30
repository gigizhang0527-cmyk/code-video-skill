# 实例：本仓库作者的完整案例（A/B-roll 参考）

> 案例：《手把手教你用代码做视频》——159.6 秒、51 句口播、110 帧/句级动效、A/B-roll 双模板。
> 视频本体讲述的就是这条流水线本身（"用代码做视频"）。

## 文件

| 文件 | 说明 |
|---|---|
| `timeline.demo.json` | 51 句时间轴（t0/t1/text 全带） |
| `beatrender.demo.js` | ★ 完整实例：引擎 + 46 条 BEATS + 46 个 vis 函数（A/B-roll 全部写法都在这里） |
| `open_anim.demo.js` | 开场 12 幕「炫技」动画（纯代码作画，踩 BGM 拍点） |
| `sfx_map.demo.json` | 146 个声点（全对齐元素运动时刻） |
| `bgm.demo.wav` | 讲解版 BGM（84BPM，代码合成） |

## 怎么用它学

1. 按 `timeline.demo.json` 里的句子顺序读 `beatrender.demo.js` 的 `BEATS` 数组
2. 每条 BEATS 的 `vis:` 指向它自己的 vis 函数——对照着看"这句话画了什么、怎么入场"
3. A-roll 句子（`bg: 'paper'`）与 B-roll 句子（`bg: 'ink'`）交替出现，是 A/B-roll 区分的活教材
4. 重点看这几个通用写法：
   - `drawSlamCard` —— 砸卡（砸+压扁回弹）
   - `visS5Fork` —— 两张卡"直接以最终形态落位"（避免跳位的老手法）
   - `visS4Collect` —— 大卡片收缩成小卡（连续演化）
   - `visS2Rail` / `visChapter` —— 章节标题处理
   - `visS3Words` —— 词组逐个砸落三色卡

## 想直接用这个案例跑一遍

```bash
python scripts/scaffold.py ../demo-case --from-example
cd ../demo-case
# 需要把实例的 51 句配音放进来（本项目未附带音频；任何 TTS 或人声录制生成 vo_<id>.wav 均可）
node engine/make_timeline.js
node engine/build.js --only S1
```

> 注意：`beatrender.demo.js` 是「引擎」文件（自带 BEATS），把它复制为工程
> `engine/beatrender.core.js` 即可整体运行；只想要机制就删掉里面 Section 段的 vis 与 BEATS 重新写。
