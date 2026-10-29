# BEATS 编排表 · 写法范式

`engine/beatrender.core.js` 里的 `BEATS` 数组 = **每句台词一条**的画面编排。
一条 beat 决定：这句台词期间，画面由谁画、从哪入场、内容多大、A/B-roll 归属。

## 一条 beat 的完整字段

```js
{
  vs: ['v007'],                 // 覆盖的句子 id（一句一条；也可多句复用）
  bg: 'paper',                  // ★ A/B-roll 自动区分：paper=A-roll 暖纸 / ink=B-roll 墨黑
  cap: '先讲思路',               // 左上角小标题（章节内的一句话总纲）
  sub: '正式开始',               // 标题下的次级信息
  box: [80, 620, 920, 520],      // ★ 内容外接矩形 [x, y, w, h]（同时是 morph/split/wipe 的裁剪窗口！）
  mo: 4,                         // 入场手法 0–7：见 motion/README.md
  pdur: 0.42,                    // 上一条残影淡出时长（可选）
  noprev: false,                 // 不画上一条残影（可选）
  person: 'A02',                 // A-roll 数字人素材位（可选；skill 版只留占位标记）
  vis: visS2Rail(),             // 画面主体函数：自己写的 vis（优先）
  note: '备注',                   // 维护备注（不参与渲染）
}
```

## 三条铁律

1. **box 是裁剪窗口，不是摆放框**
   `mo` 为 `1(wipe) / 3(split) / 5(morph)` 时，引擎拿 box 做 clip。
   → **内容必须完整落在 box 内**；内容坐标动了，box 必须跟着改。
   → box 取“内容外接矩形”最稳（多留 8–12px 余量）。

2. **一句一条，时间序就是台词序**
   `vs` 的句子 id 来自 timeline.json；引擎按 timeline 的 t0/t1 找当前句，
   所以数组顺序无所谓，但**每句必须且只能有一条**（漏了会画空屏）。

3. **残影自动处理**
   上一句的元素会在新句开头缩小淡出 `pdur` 秒。
   若新句要“接着上一句继续演化”（例：两张卡从上一句原位继续），
   把两张卡画在同坐标并用 `noprev: true`，保证不跳位。

## 写法示例（最小可运行）

```js
// A-roll：一句口播的大字标题
{
  vs: ['v002'], bg: 'paper', cap: '正式开始', sub: '先讲思路',
  box: [150, 560, 780, 560], mo: 4,
  vis: visBigTitle(),      // 自己实现的 vis 函数
}

// B-roll：三张对比卡
{
  vs: ['v005'], bg: 'ink', cap: '三种做法', sub: '对比',
  box: [120, 480, 840, 900], mo: 1,
  vis: visThreeCards(),
}
```

## vis 函数契约

```js
function visXXX() {
  return (g, t, pt_, c) => {
    // g: CanvasRenderingContext2D
    // t: 当前全片时间（秒）
    // pt_: 本句进度 0→1（入场用）
    // c: { t0, t1, dur } 本句起止（做句内动画用 c.t0 + X）
    const q = clamp((t - c.t0) / 0.45, 0, 1);    // 句内 0.45s 入场
    if (q <= 0) return;
    g.save(); g.globalAlpha = q;
    text(g, '你好', 540, 900, { size: 72, font: 'serif', color: CREAM, align: 'center' });
    g.restore();
  };
}
```

工具函数（`beatrender.core.js` 内置）：`clamp / lerp / pt / wq / springAt / quintic /
eOutQuart / eOutBack / eElastic / rr / text / drawSlamCard` —— 见 motion/ 里的配方。
