/*
 * lib.js — 《手把手教你用代码做视频》画面引擎 · 基础件
 *
 * 设计来源：参考片《掘金之路》逐帧实测（1080×1920 / A-roll 暖米纸 + B-roll 墨黑金）
 * 三条纪律（写代码时只执行，不再讨论）：
 *   1. 所有元素被「画」出来：线生长、字写出、格点亮、箭头从根部生 —— 没有一个元素是滑入的
 *   2. 竖屏只缓推，不横移；同一时刻只有一个缩放
 *   3. 底部 15%（y > 1632）留空：字幕 + 平台 UI 安全区
 */
(function () {
  'use strict';

  const L = {
    W: 1080, H: 1920, M: 64,
    NAVY: 84, NAVH: 54,
    y0: 300, y1: 1400,        // 内容带
    safeBottom: 1632,          // 安全区上沿
    fps: 24
  };

  const P = {
    ink: '#12110C',
    ink2: '#191711',
    inkCard: '#1A1811',
    gold: '#D9A94A',
    goldLt: '#F5D68C',
    goldDp: '#B8862F',
    goldDim: '#7A5E26',
    cream: '#F5EEDC',
    paper: '#F3EBD6',
    paperLt: '#FBF6EA',
    brown: '#1E1B14',
    ok: '#6FCF7A',
    red: '#E23B2E',
    blue: '#7E99AE'
  };

  const T = { serif: '"SerifSC"', sans: '"SansSC"', mono: '"B612"' };

  const NAV = ['开场', '思路', '转场', '准备', '①文案', '②编排', '③制作', '④成片', '提示词'];

  /* --------------------------------------------------------------- 数学 */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a), 0, 1));
  const smooth = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const eOut = x => 1 - Math.pow(1 - x, 3);
  const eOutQuart = x => 1 - Math.pow(1 - x, 4);
  const eInOut = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const eOutBack = (x, c) => { c = c === undefined ? 1.35 : c; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  // p(lt, t0, t1) —— 局部时间轴上的进度
  const pr = (lt, a, b) => smooth(seg(lt, a, b));

  /* --------------------------------------------------------------- 文本 */
  function fontStr(o) {
    const fam = o.font === 'mono' ? T.mono : o.font === 'serif' ? T.serif : T.sans;
    return `${o.weight || 400} ${o.size || 40}px ${fam}, "Noto Sans SC", "Microsoft YaHei", sans-serif`;
  }

  function text(g, s, x, y, o) {
    o = o || {};
    g.save();
    g.font = fontStr(o);
    g.fillStyle = o.color || P.cream;
    g.textAlign = o.align || 'left';
    g.textBaseline = o.baseline || 'alphabetic';
    if (o.spacing !== undefined) g.letterSpacing = o.spacing + 'px';
    if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
    if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = o.glowBlur || 18; }
    g.fillText(s, x, y);
    g.restore();
  }

  function measure(g, s, o) {
    g.save();
    g.font = fontStr(o);
    if (o.spacing !== undefined) g.letterSpacing = o.spacing + 'px';
    const w = g.measureText(s).width;
    g.restore();
    return w;
  }

  // 逐字写出：返回已用宽度。p = 0..1，带笔尖光点
  function write(g, s, x, y, p, o) {
    o = o || {};
    if (p <= 0) return 0;
    const chars = Array.from(s);
    g.save();
    g.font = fontStr(o);
    g.textAlign = 'left';
    g.textBaseline = o.baseline || 'alphabetic';
    if (o.spacing !== undefined) g.letterSpacing = o.spacing + 'px';
    const n = clamp(p, 0, 1) * chars.length;
    const full = g.measureText(s).width;
    let cx = x;
    g.fillStyle = o.color || P.cream;
    for (let i = 0; i < chars.length; i++) {
      const w = g.measureText(chars[i]).width;
      const a = clamp(n - i, 0, 1);
      if (a > 0) {
        g.save();
        g.globalAlpha *= a === 1 ? 1 : a;
        g.fillText(chars[i], cx, y);
        g.restore();
      }
      cx += w;
    }
    // 笔尖
    if (n < chars.length - 0.02 && o.pen !== false) {
      const px = x + full * clamp(p, 0, 1);
      g.shadowColor = o.penColor || P.gold;
      g.shadowBlur = 16;
      g.fillStyle = o.penColor || P.goldLt;
      g.beginPath(); g.arc(px, y - (o.size || 40) * 0.32, 3.4, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    return full;
  }

  // 逐字弹簧（大字专用）
  function writeSpring(g, s, x, y, p, o) {
    o = o || {};
    if (p <= 0) return 0;
    const chars = Array.from(s);
    g.save();
    g.font = fontStr(o);
    g.textAlign = 'left';
    g.textBaseline = o.baseline || 'alphabetic';
    if (o.spacing !== undefined) g.letterSpacing = o.spacing + 'px';
    const full = g.measureText(s).width;
    let cx = x - (o.align === 'center' ? full / 2 : 0);
    const n = clamp(p, 0, 1) * chars.length;
    for (let i = 0; i < chars.length; i++) {
      const w = g.measureText(chars[i]).width;
      const k = clamp(n - i, 0, 1);
      if (k > 0) {
        const e = eOutBack(clamp(k, 0, 1), 1.9);
        g.save();
        g.globalAlpha *= clamp(k * 2.2, 0, 1);
        g.translate(cx, y + (1 - clamp(e, 0, 1.4)) * (o.size || 80) * 0.5);
        const sc = 0.72 + 0.28 * clamp(e, 0, 1.2);
        g.scale(sc, sc);
        g.fillStyle = o.color || P.gold;
        if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = o.glowBlur || 24; }
        g.fillText(chars[i], 0, 0);
        g.restore();
      }
      cx += w;
    }
    g.restore();
    return full;
  }

  // 按字数折行（中文按字折，英文按词）
  function wrap(g, s, maxW, o) {
    g.save(); g.font = fontStr(o);
    if (o.spacing !== undefined) g.letterSpacing = o.spacing + 'px';
    const out = []; let cur = '';
    for (const ch of Array.from(s)) {
      const test = cur + ch;
      if (g.measureText(test).width > maxW && cur) { out.push(cur); cur = ch; }
      else cur = test;
    }
    if (cur) out.push(cur);
    g.restore();
    return out;
  }

  /* --------------------------------------------------------------- 图形 */
  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // 卡片：实心 + 可选描边 + 可选投影
  function card(g, x, y, w, h, o) {
    o = o || {};
    g.save();
    if (o.shadow) {
      g.shadowColor = o.shadow; g.shadowBlur = o.shadowBlur || 48; g.shadowOffsetY = o.shadowY || 16;
    }
    g.fillStyle = o.fill || P.inkCard;
    rr(g, x, y, w, h, o.r === undefined ? 22 : o.r);
    g.fill();
    g.restore();
    if (o.stroke) {
      g.save();
      g.strokeStyle = o.stroke; g.lineWidth = o.lw || 1.5;
      rr(g, x + 0.75, y + 0.75, w - 1.5, h - 1.5, o.r === undefined ? 22 : o.r);
      g.stroke();
      g.restore();
    }
  }

  // 金线生长（带笔尖光点）：从 (x1,y1) 画到 (x2,y2)，p=0..1
  function line(g, x1, y1, x2, y2, p, o) {
    o = o || {};
    if (p <= 0) return;
    p = clamp(p, 0, 1);
    const x = lerp(x1, x2, p), y = lerp(y1, y2, p);
    g.save();
    g.strokeStyle = o.color || P.gold;
    g.lineWidth = o.lw || 2;
    g.lineCap = 'round';
    g.globalAlpha *= o.alpha === undefined ? 1 : o.alpha;
    if (o.glow !== false) { g.shadowColor = o.glowColor || P.gold; g.shadowBlur = o.glowBlur || 14; }
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x, y); g.stroke();
    if (p < 0.999 && o.pen !== false) {
      g.shadowBlur = 20; g.fillStyle = P.goldLt;
      g.beginPath(); g.arc(x, y, (o.lw || 2) + 1.8, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  // 下划线 / 马克笔强调线（参数抄 shotcraft 的 marker-underline-title 配方）
  //   · 8f@24fps 一笔呵成（0.33s），ease-out 微收尾
  //   · 笔形中段最宽、首尾 0.6x，边缘带细噪声，左低右高微上斜
  function underline(g, x, y, w, p, o) {
    o = o || {};
    if (p <= 0) return;
    p = clamp(p, 0, 1);
    const lw = o.lw || 3;
    const marker = o.marker !== false && lw >= 2.4;
    g.save();
    g.globalAlpha *= o.alpha === undefined ? 1 : o.alpha;
    g.fillStyle = o.color || P.gold;
    g.strokeStyle = o.color || P.gold;
    if (!marker) {
      g.lineWidth = lw; g.lineCap = 'round';
      g.shadowColor = P.gold; g.shadowBlur = o.glowBlur || 12;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + w * p, y); g.stroke();
      g.restore();
      return;
    }
    const thick = lw * 2.9;                 // 中段笔宽
    const rise = w * 0.012;                  // 微上斜
    const n = 44, drawTo = Math.max(2, Math.round(n * p));
    const top = [], bot = [];
    for (let i = 0; i <= drawTo; i++) {
      const t = i / n;
      const env = 0.6 + 0.4 * Math.sin(Math.PI * Math.min(t, 1));  // 首尾细、中段粗
      const noise = 1 + (Math.sin(t * 37.7) * 0.10 + Math.sin(t * 91.3) * 0.05);
      const half = thick * env * noise / 2;
      const yy = y - rise * t;
      top.push([x + w * t, yy - half]);
      bot.push([x + w * t, yy + half]);
    }
    g.beginPath();
    g.moveTo(top[0][0], top[0][1]);
    for (let i = 1; i < top.length; i++) g.lineTo(top[i][0], top[i][1]);
    for (let i = bot.length - 1; i >= 0; i--) g.lineTo(bot[i][0], bot[i][1]);
    g.closePath();
    g.fill();
    g.restore();
  }

  // 手绘感叉（两笔）
  function cross(g, cx, cy, s, p, o) {
    o = o || {};
    if (p <= 0) return;
    const a = clamp(p * 2, 0, 1), b = clamp(p * 2 - 1, 0, 1);
    line(g, cx - s, cy - s, cx - s + 2 * s * a, cy - s + 2 * s * a, 1, { color: o.color || P.gold, lw: o.lw || 5, glowBlur: 18 });
    if (b > 0) line(g, cx + s, cy - s, cx + s - 2 * s * b, cy - s + 2 * s * b, 1, { color: o.color || P.gold, lw: o.lw || 5, glowBlur: 18 });
  }

  function check(g, x, y, s, p, o) {
    o = o || {};
    if (p <= 0) return;
    const a = clamp(p * 2, 0, 1), b = clamp(p * 2 - 1, 0, 1);
    line(g, x - s * 0.7, y, x - s * 0.7 + s * 0.9 * a, y + s * 0.8 * a, 1, { color: o.color || P.ok, lw: o.lw || 4 });
    if (b > 0) line(g, x + s * 0.2, y + s * 0.8, x + s * 0.2 + s * 1.1 * b, y + s * 0.8 - s * 1.5 * b, 1, { color: o.color || P.ok, lw: o.lw || 4 });
  }

  // 箭头（带可生长的主体与头部）
  function arrow(g, x1, y1, x2, y2, p, o) {
    o = o || {};
    if (p <= 0) return;
    const k = eOut(clamp(p, 0, 1));
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const hx = lerp(x1, x2, k), hy = lerp(y1, y2, k);
    g.save();
    g.strokeStyle = o.color || P.gold; g.fillStyle = o.color || P.gold;
    g.lineWidth = o.lw || 2.2; g.lineCap = 'round';
    g.globalAlpha *= o.alpha === undefined ? 1 : o.alpha;
    g.shadowColor = P.gold; g.shadowBlur = o.glowBlur || 12;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(hx, hy); g.stroke();
    if (k > 0.12) {
      const a = o.head || 13;
      g.beginPath();
      g.moveTo(hx, hy);
      g.lineTo(hx - a * Math.cos(ang - 0.42), hy - a * Math.sin(ang - 0.42));
      g.lineTo(hx - a * Math.cos(ang + 0.42), hy - a * Math.sin(ang + 0.42));
      g.closePath(); g.fill();
    }
    g.restore();
  }

  /* ------------------------------------------------------- 背景 / 版式件 */
  function paperBG(g, ab) {
    const A = ab === 'A';
    g.fillStyle = A ? P.paper : P.ink;
    g.fillRect(0, 0, L.W, L.H);
    // 点阵
    g.save();
    g.fillStyle = A ? 'rgba(30,27,20,0.055)' : 'rgba(245,238,220,0.045)';
    const step = 30;
    for (let y = step; y < L.H; y += step) {
      for (let x = step; x < L.W; x += step) {
        g.beginPath(); g.arc(x, y, 1.35, 0, Math.PI * 2); g.fill();
      }
    }
    g.restore();
    // 暗角
    const rg = g.createRadialGradient(L.W / 2, L.H * 0.42, L.H * 0.22, L.W / 2, L.H * 0.45, L.H * 0.78);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, A ? 'rgba(30,27,20,0.13)' : 'rgba(0,0,0,0.55)');
    g.fillStyle = rg; g.fillRect(0, 0, L.W, L.H);
  }

  function navBar(g, ab, active, p) {
    const A = ab === 'A';
    const y = L.NAVY, h = L.NAVH, padX = 21, gap = 9;
    const items = NAV.map(s => ({ s, w: measure(g, s, { size: 23, weight: 500, spacing: 1 }) + padX * 2 }));
    const total = items.reduce((a, b) => a + b.w, 0) + gap * (items.length - 1);
    let x = (L.W - total) / 2;
    items.forEach((it, i) => {
      const on = i === active;
      const k = on ? pr(p, 0.02, 0.26) : 1;
      g.save();
      if (on) {
        g.globalAlpha *= 0.92;
        g.fillStyle = P.gold;
        g.shadowColor = 'rgba(217,169,74,0.55)'; g.shadowBlur = 22;
        rr(g, x, y, it.w, h, h / 2); g.fill();
        g.restore();
        g.save();
        g.fillStyle = P.ink;
        text(g, it.s, x + it.w / 2, y + h / 2 + 8, { size: 23, weight: 600, align: 'center', spacing: 1, color: P.ink });
      } else {
        g.strokeStyle = A ? 'rgba(30,27,20,0.20)' : 'rgba(245,238,220,0.16)';
        g.lineWidth = 1.2;
        rr(g, x, y, it.w, h, h / 2); g.stroke();
        g.restore();
        text(g, it.s, x + it.w / 2, y + h / 2 + 8, {
          size: 23, weight: 500, align: 'center', spacing: 1,
          color: A ? 'rgba(30,27,20,0.42)' : 'rgba(245,238,220,0.46)'
        });
      }
      x += it.w + gap;
    });
    return { y: y + h };
  }

  // 左侧帧刻度尺（B-roll 的「图纸」语言，A-roll 不用）
  function ruler(g, alpha) {
    g.save();
    g.globalAlpha *= alpha === undefined ? 0.22 : alpha;
    g.strokeStyle = P.cream; g.lineWidth = 1;
    const x0 = 30;
    for (let y = L.y0; y <= L.y1; y += 10) {
      const major = (y - L.y0) % 200 === 0;
      const mid = (y - L.y0) % 50 === 0;
      g.beginPath(); g.moveTo(x0, y + 0.5); g.lineTo(x0 + (major ? 13 : mid ? 8 : 4), y + 0.5); g.stroke();
      if (major) text(g, String((y - L.y0) / 200).padStart(2, '0'), x0 + 17, y + 5, { size: 12, font: 'mono', color: P.cream, alpha: 0.7 });
    }
    g.restore();
  }

  // 竖向细线（A-roll 的分栏器：把人跟字分开，同时撑满高度）
  function vRule(g, x, y1, y2, p, o) {
    o = o || {};
    if (p <= 0) return;
    g.save();
    g.globalAlpha *= o.alpha === undefined ? 0.22 : o.alpha;
    g.strokeStyle = o.color || P.brown;
    g.lineWidth = o.lw || 1.2;
    g.beginPath(); g.moveTo(x, y1); g.lineTo(x, lerp(y1, y2, clamp(p, 0, 1))); g.stroke();
    g.restore();
    if (p > 0.5) {
      line(g, x - 7, y1, x + 7, y1, (p - 0.5) * 2, { color: o.color || P.brown, lw: 1.2, alpha: 0.35, glow: false, pen: false });
      line(g, x - 7, y2, x + 7, y2, (p - 0.5) * 2, { color: o.color || P.brown, lw: 1.2, alpha: 0.35, glow: false, pen: false });
    }
  }

  // 右下角镜号（本片主题：一句一画 → 每一镜都编号）
  function counter(g, ab, idx, total, p) {
    const A = ab === 'A';
    const s = `第 ${String(idx).padStart(2, '0')} 镜 / ${total}`;
    const col = A ? 'rgba(30,27,20,0.40)' : 'rgba(245,238,220,0.42)';
    const w = measure(g, s, { size: 19, font: 'mono' });
    text(g, s, L.W - L.M, 1592, { size: 19, font: 'mono', color: col, align: 'right' });
    line(g, L.W - L.M - w - 18, 1578, L.W - L.M - w - 18 + 34 * pr(p, 0.3, 0.9), 1578, 1, { color: A ? P.brown : P.gold, lw: 1.4, alpha: 0.5, glow: false, pen: false });
  }

  // 章节底边进度线
  function progressLine(g, ab, p) {
    g.save();
    g.globalAlpha *= 0.55;
    const y = L.safeBottom - 6;
    g.strokeStyle = ab === 'A' ? 'rgba(30,27,20,0.14)' : 'rgba(245,238,220,0.12)';
    g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(L.M, y); g.lineTo(L.W - L.M, y); g.stroke();
    if (p > 0) {
      g.strokeStyle = P.gold;
      g.shadowColor = P.gold; g.shadowBlur = 12;
      g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(L.M, y); g.lineTo(L.M + (L.W - L.M * 2) * clamp(p, 0, 1), y); g.stroke();
    }
    g.restore();
  }

  /* ------------------------------------------------------------ 人物占位 */
  // 一块「柔光人形」：在离屏画布上画一次 + 高斯模糊，之后按高度缩放贴上去。
  // 读作「这里站一个人」，不抢内容；人物素材定下来后整层替换即可。
  const SPRITE = { W: 360, H: 780 };
  const spriteCache = new Map();
function personSprite(pose, color, blur) {
    blur = blur === undefined ? 0 : blur;
    const key = pose + '|' + color + '|' + blur;
    if (spriteCache.has(key)) return spriteCache.get(key);
    const c = document.createElement('canvas');
    c.width = SPRITE.W; c.height = SPRITE.H;
    const g = c.getContext('2d');
    if (blur > 0) g.filter = 'blur(' + blur + 'px)';
    g.fillStyle = color;
    const cx = SPRITE.W / 2;
    // 头
    g.beginPath(); g.ellipse(cx, 96, 53, 60, 0, 0, Math.PI * 2); g.fill();
    // 脖子
    g.fillRect(cx - 16, 150, 32, 46);
    // 躯干 + 手臂 + 腿：一条闭合轮廓，读起来就是一个人
    g.beginPath();
    g.moveTo(cx - 46, 190);
    g.quadraticCurveTo(cx - 88, 212, cx - 88, 330);
    g.quadraticCurveTo(cx - 88, 458, cx - 66, 492);
    g.lineTo(cx - 42, 498);
    g.lineTo(cx - 36, 726);
    g.lineTo(cx - 6, 726);
    g.lineTo(cx - 3, 498);
    g.lineTo(cx + 3, 498);
    g.lineTo(cx + 6, 726);
    g.lineTo(cx + 36, 726);
    g.lineTo(cx + 42, 498);
    g.lineTo(cx + 66, 492);
    g.quadraticCurveTo(cx + 88, 458, cx + 88, 330);
    g.quadraticCurveTo(cx + 88, 212, cx + 46, 190);
    g.quadraticCurveTo(cx, 170, cx - 46, 190);
    g.closePath(); g.fill();
    // 脚
    g.beginPath(); g.ellipse(cx - 21, 736, 24, 9, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(cx + 21, 736, 24, 9, 0, 0, Math.PI * 2); g.fill();
    // 抬起的右臂（拍击 / 指）
    if (pose === 'pointR' || pose === 'slapR' || pose === 'wave') {
      const rx = pose === 'slapR' ? cx + 150 : cx + 128;
      const ry = pose === 'slapR' ? 236 : 300;
      g.beginPath(); g.moveTo(cx + 52, 214);
      g.quadraticCurveTo(cx + 100, 218, rx, ry);
      g.lineWidth = 34; g.lineCap = 'round'; g.strokeStyle = color; g.stroke();
    }
    spriteCache.set(key, c);
    return c;
  }

  // 人物层：有定妆图（window.PERSON_IMG）就贴图，没有就画柔影占位。
  // 两者共用同一套坐标：h = 人形总高，baseY = 脚底。
  function person(g, x, baseY, h, pose, o) {
    o = o || {};
    const IMG = window.PERSON_IMG;
    if (IMG && IMG.ok) {
      const w = h * IMG.w / IMG.h;
      g.save();
      g.globalAlpha *= (o.fade === undefined ? 1 : o.fade);
      // 脚下软投影（贴图没有影子，补一个才站得住）
      g.save();
      g.globalAlpha *= 0.16;
      const sg2 = g.createRadialGradient(x, baseY, 0, x, baseY, w * 0.55);
      sg2.addColorStop(0, 'rgba(30,27,20,0.9)'); sg2.addColorStop(1, 'rgba(30,27,20,0)');
      g.fillStyle = sg2;
      g.save(); g.translate(x, baseY + 1); g.scale(1, 0.10); g.beginPath(); g.arc(0, 0, w * 0.55, 0, Math.PI * 2); g.fill(); g.restore();
      g.restore();
      g.drawImage(IMG.img, x - w / 2, baseY - h, w, h);
      g.restore();
      return;
    }
    const a = o.alpha === undefined ? 0.14 : o.alpha;
    const col = o.color || P.brown;
    const sp = personSprite(pose || 'idle', col, o.blur === undefined ? 0 : o.blur);
    const w = h * SPRITE.W / SPRITE.H;
    g.save();
    g.globalAlpha *= a;
    // 地面投影
    g.save();
    g.globalAlpha *= 0.55;
    const sg = g.createRadialGradient(x, baseY, 0, x, baseY, w * 0.34);
    sg.addColorStop(0, col); sg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sg;
    g.save(); g.translate(x, baseY + 2); g.scale(1, 0.11); g.beginPath(); g.arc(0, 0, w * 0.34, 0, Math.PI * 2); g.fill(); g.restore();
    g.restore();
    g.drawImage(sp, x - w / 2, baseY - h, w, h);
    g.restore();
  }

  // 人物位的说明标签（诚实标注：数字人风格待定）
  function personLabel(g, x, y, s) {
    text(g, s, x, y, { size: 17, color: 'rgba(30,27,20,0.42)', align: 'center', spacing: 1.5 });
  }

  /* ---------------------------------------------------------- 常用小件 */
  function chip(g, s, x, y, o) {
    o = o || {};
    const size = o.size || 22;
    const w = measure(g, s, { size, weight: o.weight || 500, spacing: 0.5 }) + (o.padX || 22) * 2;
    const h = o.h || size + 20;
    if (o.fill) { g.save(); g.fillStyle = o.fill; rr(g, x, y, w, h, h / 2); g.fill(); g.restore(); }
    if (o.stroke) { g.save(); g.strokeStyle = o.stroke; g.lineWidth = o.lw || 1.4; rr(g, x, y, w, h, h / 2); g.stroke(); g.restore(); }
    text(g, s, x + w / 2, y + h / 2 + size * 0.35, { size, weight: o.weight || 500, align: 'center', color: o.color || P.cream, spacing: 0.5 });
    return { x, y, w, h };
  }

  function label(g, s, x, y, o) {
    o = o || {};
    text(g, s, x, y, { size: o.size || 20, weight: 500, color: o.color || 'rgba(245,238,220,0.55)', spacing: 2, font: o.font || 'sans', align: o.align || 'left' });
  }

  // 伪 IDE 窗口
  function codeWindow(g, x, y, w, h, o) {
    o = o || {};
    card(g, x, y, w, h, { fill: '#141208', stroke: 'rgba(217,169,74,0.30)', r: 18, shadow: 'rgba(0,0,0,0.6)' });
    // 标题栏
    g.save();
    g.strokeStyle = 'rgba(217,169,74,0.22)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x, y + 54); g.lineTo(x + w, y + 54); g.stroke();
    g.restore();
    ['#E23B2E', '#D9A94A', '#6FCF7A'].forEach((c, i) => {
      g.save(); g.fillStyle = c; g.globalAlpha *= 0.75;
      g.beginPath(); g.arc(x + 24 + i * 20, y + 27, 5.5, 0, Math.PI * 2); g.fill(); g.restore();
    });
    text(g, o.file || 'film.js', x + 96, y + 34, { size: 19, font: 'mono', color: 'rgba(245,238,220,0.5)' });
    if (o.lang) text(g, o.lang, x + w - 22, y + 34, { size: 17, font: 'mono', color: 'rgba(217,169,74,0.55)', align: 'right' });
    return { x, y: y + 54, w, h: h - 54 };
  }

  // 代码行：关键词上色（极简语法高亮）
  function codeLine(g, s, x, y, o) {
    o = o || {};
    const size = o.size || 24;
    g.save();
    g.font = fontStr({ size, font: 'mono' });
    let cx = x;
    const color = o.color || 'rgba(245,238,220,0.80)';
    const parts = s.split(/(\b(?:const|let|window|function|return|if|for|new|await|async)\b|'[^']*'|"[^"]*"|\/\/[^\n]*|\b\d+(?:\.\d+)?\b)/g);
    for (const part of parts) {
      if (!part) continue;
      let c = color;
      if (/^(const|let|window|function|return|if|for|new|await|async)$/.test(part)) c = '#D9A94A';
      else if (/^['"]/.test(part)) c = '#8FD9C0';
      else if (/^\/\//.test(part)) c = 'rgba(245,238,220,0.32)';
      else if (/^\d/.test(part)) c = '#F5D68C';
      g.fillStyle = c;
      g.fillText(part, cx, y);
      cx += g.measureText(part).width;
    }
    g.restore();
    return cx - x;
  }

  /* ------------------------------------------------------------ 波形 */
  function wave(g, x, y, w, h, p, o) {
    o = o || {};
    const bars = o.bars || 64;
    const col = o.color || P.gold;
    g.save();
    g.globalAlpha *= o.alpha === undefined ? 0.95 : o.alpha;
    for (let i = 0; i < bars; i++) {
      const t = i / bars;
      if (t > p) break;
      const env = 0.35 + 0.65 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.41));
      const hh = Math.max(2, h * env * (0.55 + 0.45 * Math.sin(i * 2.3)));
      g.fillStyle = t > p - 0.06 ? P.goldLt : col;
      g.globalAlpha = 0.35 + 0.65 * (t / Math.max(p, 0.001));
      rr(g, x + (w / bars) * i, y - hh / 2, Math.max(2, w / bars * 0.45), hh, 2);
      g.fill();
    }
    g.restore();
  }

  window.LIB = { L, P, T, NAV, clamp, lerp, seg, smooth, eOut, eOutQuart, eInOut, eOutBack, pr, fontStr, text, measure, write, writeSpring, wrap, rr, card, line, underline, cross, check, arrow, paperBG, navBar, ruler, vRule, counter, progressLine, person, personLabel, chip, label, codeWindow, codeLine, wave };
})();
