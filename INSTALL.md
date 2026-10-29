# 安装说明 · code-video-skill

## 依赖（缺一不可）

| 依赖 | 版本 | 用途 | 检查 |
|---|---|---|---|
| Node.js | ≥ 18 | 引擎与构建脚本 | `node -v` |
| Google Chrome | 任意新版 | 无头渲染（逐帧截图） | `CHROME_PATH` 或默认路径 |
| FFmpeg | ≥ 5 | 片段编码 / 混音 / 拼接 | `ffmpeg -version` |
| Python | ≥ 3.8 | 自检脚本 / 混音辅助 | `python --version` |

> Chrome 与 FFmpeg 路径可用环境变量覆盖：`CHROME_PATH`、`FFMPEG_PATH`。

## 安装方式一：让 AI Agent 自动装（推荐给分享对象）

```
帮我安装这个项目，安装完成后按 SKILL.md 的工作流带我创建第一个视频工程：
https://github.com/gigizhang0527-cmyk/code-video-skill
```

## 安装方式二：手工

```bash
git clone https://github.com/gigizhang0527-cmyk/code-video-skill.git
cd code-video-skill
python scripts/install.py            # 复制 skill 到 ~/.agents/skills/code-video
python scripts/scaffold.py ~/我的视频 # 建一个新视频工程（含 engine/ 与空目录）
```

## 安装方式三：只建工程

如果只想用引擎、不装 skill：

```bash
python scripts/scaffold.py D:\projects\my-video
```

会把 `engine/`、`templates/video.config.mjs` 复制进目标目录并建好
`02_音频/ 03_画面/预览/ 04_成片/` 等空目录。

## 首次运行检查

```bash
cd <工程>
node engine/make_timeline.mjs      # 需要 02_音频/timeline.json
node --check engine/beatrender.core.js
node engine/build.mjs --only S1    # 先渲一段
```

产物：`03_画面/预览/片段_*.mp4`（画布）→ `04_成片/S1.mp4`（含音频）。
