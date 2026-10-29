/*
 * film_v4.js — 全片 14 段画面引擎（B 段优先，A 段留数字人位）
 *
 * drawFrame(g, t) 纯函数：t ∈ [0, 159.65]，按段渲染。
 * 数字人一律占位：虚线框 + 定妆图 18% 透明度 + 「数字人位」标签。
 *
 * 段落时间（来自锁定时间轴）：
 *  S1  0.35– 16.85  A   开场 12 幕（open_anim 已单独实现，这里只画占位）
 *  S2 17.03– 28.40  B   卡片翻面 → 拆解四行 → 思路章 → 两张空卡
 *  S3 28.58– 35.98  A   开灯 → A-roll 自指
 *  S4 36.16– 44.68  B   三图形 → 具体知识 → 大问句
 *  S5 44.86– 53.46  B   因果链 → 14s 刻度 → 分叉
 *  S6 53.64– 71.89  A→B 摊手 → 响指 → 黑 → ①章 → 波形字表
 *  S7 72.07– 89.34  B   时间轴 → 错位 → ②章 → 取景框 → 镜头卡
 *  S8 89.52– 95.91  B   条带标红 → 修正
 *  S9 96.36–107.52  B→A ③章 → 凹窗 → 人物
 *  S10 107.70–119.23 B→A 划掉模板 → 矢量层 → 三帧 → 翻白 → 人物
 *  S11 119.61–128.47 B   四宫格语法
 *  S12 128.92–136.56 B→A ④章 → 抽格变地面线 → 人物
 *  S13 136.74–143.61 B   四轨音轨 + 响度表
 *  S14 144.06–158.85 A   落版
 */
(function () {
  const L = window.LIB;
  const { text, rr, clamp, lerp, eOut, eOutQuart, eOutBack, eInOut } = L;
  const VW = 1080, VH = 1920, DUR = 159.65;
  const INK = '#12110C', GOLD = '#D9A94A', GOLD_LT = '#E8C77A', CREAM = '#F3EBD6';
  const PAPER = '#F3EBD6', BROWN = '#3A3226', RED = '#C8412B', GREEN = '#4FA96A';
  const MONO = 'B612', SANS = 'SansSC', SERIF = 'SerifSC';
  const bt = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

  /* ---------- 底（A1 重做 · Mimo 2026-10-29） ----------
     审片_V2 · A1：暖纸底太白、黑白切换刺眼、黑底也要底纹。
     重做要点（在第 19 轮版本上再收一档）：
     · 底色再压深：纸 #E6D8BC / 墨 #141310；纸面加真实逐像素颗粒（带固定种子，
       每段渲染逐字节一致 → 拼接不会出台阶缝）
     · 纹理四层：低频斑驳 → 细颗粒 → 纤维短线 → 细点阵；四边暗角（底边更重）
     · 每帧只 1 次 drawImage + 1 条极缓光带，性能不变 */
  const PAPER_BASE = '#E6D8BC';     // 原 #EDE4CE 再压深一档，纸感更足
  const INK_BASE = '#141310';       // 原 #17160F 微收，墨底不死黑
  const TEXCACHE = {};
  function bgTex(kind) {
    if (TEXCACHE[kind]) return TEXCACHE[kind];
    const c = document.createElement('canvas');
    c.width = VW; c.height = VH;
    const x = c.getContext('2d');
    const light = kind === 'paper';
    const INKR = light ? '58,50,38' : '245,238,220';
    x.fillStyle = light ? PAPER_BASE : INK_BASE;
    x.fillRect(0, 0, VW, VH);
    let s = light ? 20261029 : 771233;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    // ① 低频斑驳：打破"一整块死色"
    for (let i = 0; i < 34; i++) {
      const cx = rnd() * VW, cy = rnd() * VH, r = 180 + rnd() * 460;
      const gd = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      const a = light ? 0.026 : 0.038;
      gd.addColorStop(0, `rgba(${INKR},${a})`); gd.addColorStop(1, `rgba(${INKR},0)`);
      x.fillStyle = gd; x.beginPath(); x.arc(cx, cy, r, 0, 6.284); x.fill();
    }
    // ② 细颗粒噪点：真实"纸感"的来源（种子固定 → 全片/各段渲染一致）
    {
      const img = x.getImageData(0, 0, VW, VH), d = img.data;
      const amp = light ? 7 : 5;
      for (let i = 0; i < d.length; i += 4) {
        const n = (rnd() - 0.5) * amp;
        d[i] += n; d[i + 1] += n; d[i + 2] += n * (light ? 0.82 : 1.15);
      }
      x.putImageData(img, 0, 0);
    }
    // ③ 纤维短横线：稀疏短线（整屏等距横线会出扫描线条带，禁用）
    for (let i = 0; i < (light ? 1900 : 1000); i++) {
      const px = rnd() * VW, py = rnd() * VH, len = 6 + rnd() * 30;
      x.fillStyle = light ? `rgba(58,50,38,${0.020 + rnd() * 0.032})` : `rgba(245,238,220,${0.012 + rnd() * 0.022})`;
      x.fillRect(px, py, len, 1);
    }
    // ④ 细点阵 20px：纸上像笔记本网格，墨底只留极淡一层
    for (let y = 10; y < VH; y += 20) {
      for (let xx = 10; xx < VW; xx += 20) {
        const jx = (((xx * 37 + y * 91) % 7) - 3) * 0.5;
        const jy = (((xx * 53 + y * 17) % 7) - 3) * 0.5;
        x.fillStyle = light ? 'rgba(58,50,38,0.10)' : 'rgba(245,238,220,0.038)';
        x.beginPath(); x.arc(xx + jx, y + jy, light ? 1.2 : 1.3, 0, 6.284); x.fill();
      }
    }
    // ⑤ 四边暗角：上下 + 左右都压一点，底边更重（压住"发白/发死"）
    const gd = x.createLinearGradient(0, 0, 0, VH);
    if (light) {
      gd.addColorStop(0, 'rgba(58,50,38,0.16)'); gd.addColorStop(0.14, 'rgba(58,50,38,0.015)');
      gd.addColorStop(0.78, 'rgba(58,50,38,0.02)'); gd.addColorStop(1, 'rgba(58,50,38,0.20)');
    } else {
      gd.addColorStop(0, 'rgba(0,0,0,0.42)'); gd.addColorStop(0.16, 'rgba(0,0,0,0)');
      gd.addColorStop(0.80, 'rgba(0,0,0,0.02)'); gd.addColorStop(1, 'rgba(0,0,0,0.48)');
    }
    x.fillStyle = gd; x.fillRect(0, 0, VW, VH);
    const gd2 = x.createLinearGradient(0, 0, VW, 0);
    if (light) {
      gd2.addColorStop(0, 'rgba(58,50,38,0.10)'); gd2.addColorStop(0.1, 'rgba(58,50,38,0)');
      gd2.addColorStop(0.9, 'rgba(58,50,38,0)'); gd2.addColorStop(1, 'rgba(58,50,38,0.12)');
    } else {
      gd2.addColorStop(0, 'rgba(0,0,0,0.30)'); gd2.addColorStop(0.1, 'rgba(0,0,0,0)');
      gd2.addColorStop(0.9, 'rgba(0,0,0,0)'); gd2.addColorStop(1, 'rgba(0,0,0,0.34)');
    }
    x.fillStyle = gd2; x.fillRect(0, 0, VW, VH);
    TEXCACHE[kind] = c;
    return c;
  }
  /* 极缓的光带扫过：底也不是死的不动（~22s 一遍，幅度压到几乎看不出） */
  function bgSweep(g, t, light) {
    const p = (t * 0.045) % 1;
    const cx = -460 + p * (VW + 920);
    const gd = g.createLinearGradient(cx - 460, 0, cx + 460, 0);
    gd.addColorStop(0, light ? 'rgba(255,251,238,0)' : 'rgba(217,169,74,0)');
    gd.addColorStop(0.5, light ? 'rgba(255,251,238,0.10)' : 'rgba(217,169,74,0.055)');
    gd.addColorStop(1, light ? 'rgba(255,251,238,0)' : 'rgba(217,169,74,0)');
    g.fillStyle = gd; g.fillRect(0, 0, VW, VH);
  }
  function bgInk(g, t) {
    g.drawImage(bgTex('ink'), 0, 0);
    bgSweep(g, t, false);
  }
  function bgPaper(g, t) {
    g.drawImage(bgTex('paper'), 0, 0);
    bgSweep(g, t, true);
  }

  /* ---------- 章节导航胶囊 ---------- */
  const NAVS = ['开场', '思路', '①文案', '②编排', '③制作', '④成片', '收尾'];
  function nav(g, t, active, light) {
    const y = 84, x0 = 78, gap = 18;
    let x = x0;
    const col = light ? BROWN : CREAM;
    NAVS.forEach((s, i) => {
      const w = s.length * 19 + 46;
      const on = i === active;
      g.save();
      g.fillStyle = on ? (light ? BROWN : GOLD) : (light ? 'rgba(58,50,38,0.10)' : 'rgba(245,238,220,0.10)');
      rr(g, x, y, w, 52, 26); g.fill();
      g.restore();
      text(g, s, x + w / 2, y + 35, {
        size: 21, weight: on ? 700 : 400, align: 'center',
        color: on ? (light ? CREAM : INK) : (light ? 'rgba(58,50,38,0.55)' : 'rgba(245,238,220,0.55)')
      });
      x += w + gap;
    });
  }

  /* ---------- 运动工具 ---------- */
  const scrollT = (t, speed, mod) => (t * speed) % mod;                 // 连续滚动偏移
  const cyc = (t, period, n) => Math.floor(t / period) % n;             // 每 period 秒换一项
  /* 不等间隔的换手表（秒）：快慢交替，避免"机械等距" */
  const SCHED_A = [0, 0.26, 0.58, 0.83, 1.21, 1.46, 1.88, 2.10, 2.52, 2.78, 3.20, 3.44, 3.86, 4.12, 4.5];
  const SCHED_B = [0, 0.34, 0.62, 1.02, 1.24, 1.62, 1.90, 2.26, 2.48, 2.92, 3.18, 3.56, 3.80, 4.20, 4.5];
  function schedIdx(local, sched) {
    let i = 0;
    for (let k = 0; k < sched.length; k++) if (local >= sched[k]) i = k;
    return i;
  }
  function eElastic(p) {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    return Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * (6.283 / 3)) + 1;   // 过冲回弹
  }
  const blink = (t, period) => 0.5 + 0.5 * Math.sin(t * (6.283 / period));  // 呼吸 0..1

  /* ---------- 出场方式（5 种轮换，避免一律渐入） ----------
     0 擦除：像拉幕一样从左揭开
     1 上滑：从下方顶上来（带过冲）
     2 长出：从一个点放大成形
     3 上下分揭：上下两半分开露出
     4 复制归位：先错位出现，再弹回位
  */
  function withReveal(g, x, y, w, h, p, style, draw) {
    if (p <= 0) return;
    const e = eOutQuart(p);
    g.save();
    const st = ((style % 5) + 5) % 5;
    if (st === 0) {
      g.beginPath(); g.rect(x, y, w * e, h); g.clip(); draw(g);
    } else if (st === 1) {
      g.translate(0, (1 - eElastic(p)) * (h + 80)); draw(g);
    } else if (st === 2) {
      // 形状变形：从小圆 → 卡片（圆形先合并，再倒角变方）
      const k = eOutQuart(p);
      const r0 = Math.min(w, h) / 2;
      const cw = lerp(r0 * 2, w, k), ch = lerp(r0 * 2, h, k);
      const cx = x + w / 2, cy = y + h / 2;
      g.beginPath();
      const rad = lerp(r0, 20, k);
      rr(g, cx - cw / 2, cy - ch / 2, cw, ch, rad);
      g.clip();
      g.beginPath();
      rr(g, cx - cw / 2, cy - ch / 2, cw, ch, rad);
      g.strokeStyle = 'rgba(217,169,74,0.8)'; g.lineWidth = 2.4; g.stroke();
      draw(g);
    } else if (st === 3) {
      const k = e * h / 2 + 1;
      g.beginPath(); g.rect(x, y + h / 2 - k, w, k * 2); g.clip(); draw(g);
    } else {
      g.globalAlpha = clamp(p * 1.8, 0, 1);
      g.translate((1 - e) * 46, (1 - e) * -30);
      draw(g);
    }
    g.restore();
  }

  /* 段落入场：三种轮换（擦除 / 上滑 / 分揭），避免每段都硬切 */
  function segIn(g, t, seg) {
    const p = clamp((t - seg.t0) / 0.55, 0, 1);
    if (p >= 1) return true;
    const id = Math.round(seg.t0) % 3;
    g.save();
    if (id === 0) { g.beginPath(); g.rect(0, 0, VW * eOutQuart(p), VH); g.clip(); }
    else if (id === 1) { g.translate(0, (1 - eElastic(p)) * VH * 0.35); }
    else { const k = eOutQuart(p) * VH / 2; g.beginPath(); g.rect(0, VH / 2 - k, VW, k * 2); g.clip(); }
    return false;
  }

  /* B 段公共外壳：墨黑底 + 顶部导航 */
  /* 把某一条数字人视频画到 A-roll 位置（x=256 / 脚底 1540 / 高 1080） */
  function drawPersonVideo(g, id, lt) {
    if (window.NO_PERSON) return true;   // 出片时数字人由 FFmpeg 叠加
    const vids = window.PERSON_VIDEO || {};
    const v = vids[id];
    const x = 256, base = 1540, H = 1080;
    if (v && v.readyState >= 2) {
      const seek = Math.max(0, Math.min(v.duration - 0.02, lt));
      if (Math.abs(v.currentTime - seek) > 0.02) v.currentTime = seek;
      const W = H * (v.videoWidth || 540) / (v.videoHeight || 960);
      g.save();
      g.drawImage(v, x - W / 2, base - H, W, H);
      g.restore();
      return true;
    }
    // 视频还没就绪时用静帧兜底，绝不出现空白
    if (window.__PERSON) {
      const W = H * window.__PERSON.naturalWidth / window.__PERSON.naturalHeight;
      g.save(); g.drawImage(window.__PERSON, x - W / 2, base - H, W, H); g.restore();
    }
    return false;
  }

  function drawBChrome(g, t, navIdx) {
    bgInk(g, t);
    nav(g, t, navIdx, false);
  }

  /* ---------- 卡片 ---------- */
  function cardBox(g, x, y, w, h, o) {
    o = o || {};
    g.save();
    if (o.dark) {
      g.fillStyle = '#16140D'; rr(g, x, y, w, h, 20); g.fill();
      g.strokeStyle = 'rgba(217,169,74,0.32)'; g.lineWidth = 1.4; rr(g, x, y, w, h, 20); g.stroke();
    } else if (o.paper) {
      g.fillStyle = '#FBF6EA'; rr(g, x, y, w, h, 20); g.fill();
      g.strokeStyle = 'rgba(58,50,38,0.28)'; g.lineWidth = 1.4; rr(g, x, y, w, h, 20); g.stroke();
    } else {
      g.fillStyle = 'rgba(217,169,74,0.07)'; rr(g, x, y, w, h, 20); g.fill();
      g.strokeStyle = 'rgba(217,169,74,0.45)'; g.lineWidth = 1.6; rr(g, x, y, w, h, 20); g.stroke();
    }
    g.restore();
  }

  /* ---------- 箭头 / 连线 ---------- */
  function arrowH(g, x1, x2, y, p, color, lw) {
    if (p <= 0) return;
    const x = lerp(x1, x2, p);
    g.save(); g.strokeStyle = color; g.lineWidth = lw || 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x1, y); g.lineTo(x, y); g.stroke();
    if (p > 0.9) {
      g.fillStyle = color;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - 16, y - 9); g.lineTo(x - 16, y + 9); g.closePath(); g.fill();
    }
    g.restore();
  }

  /* ---------- 数字人占位 ---------- */
  function personSlot(g, x, y, w, h, label, light) {
    g.save();
    g.setLineDash([10, 12]); g.strokeStyle = light ? 'rgba(200,65,43,0.55)' : 'rgba(200,65,43,0.65)';
    g.lineWidth = 2; rr(g, x, y, w, h, 12); g.stroke();
    g.restore();
    const img = window.__PERSON;
    if (img) {
      g.save(); g.globalAlpha = 0.16;
      const H = h, W = H * img.naturalWidth / img.naturalHeight;
      g.drawImage(img, x + w / 2 - W / 2, y + h - H, W, H);
      g.restore();
    }
    text(g, label || '数字人位', x + w / 2, y + 26, {
      size: 17, font: MONO, align: 'center',
      color: light ? 'rgba(200,65,43,0.75)' : 'rgba(232,120,100,0.85)'
    });
  }

  /* ---------- 常驻活层：粒子 / 扫描线 / 呼吸网格（保证画面永不停） ---------- */
  const PARTS = (() => {
    const a = [];
    let seed = 20261028;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 70; i++) a.push({ x: rnd() * 1080, y: rnd() * 1920, r: 1 + rnd() * 2.2, v: 12 + rnd() * 46, ph: rnd() * 6.28, al: 0.05 + rnd() * 0.16 });
    return a;
  })();
  function aliveLayer(g, t, light) {
    const col = light ? '232,232,232' : '217,169,74';
    const dark = light ? '58,50,38' : '245,238,220';
    // 粒子向上飘 + 横向摆动
    for (const p of PARTS) {
      const y = ((p.y - t * p.v) % 1980 + 1980) % 1980 - 30;
      const x = p.x + Math.sin(t * 0.8 + p.ph) * 26;
      g.fillStyle = 'rgba(' + (light ? dark : col) + ',' + (p.al * (light ? 0.5 : 1)) + ')';
      g.beginPath(); g.arc(x, y, p.r, 0, 6.284); g.fill();
    }
    // 三条扫描线
    for (let i = 0; i < 3; i++) {
      const y = (((t * (150 + i * 70) + i * 640) % (VH + 400)) - 200);
      const grd = g.createLinearGradient(0, y - 120, 0, y);
      grd.addColorStop(0, 'rgba(' + col + ',0)');
      grd.addColorStop(1, 'rgba(' + col + ',' + (light ? 0.05 : 0.09) + ')');
      g.fillStyle = grd; g.fillRect(0, y - 120, VW, 120);
    }
    // 呼吸网格（明暗随节拍起伏）
    const b = 0.03 + 0.012 * Math.sin(t * 2.4);
    g.save(); g.strokeStyle = 'rgba(' + dark + ',' + (light ? b * 1.6 : b) + ')'; g.lineWidth = 1;
    for (let x = 0; x < VW; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, VH); g.stroke(); }
    g.restore();
  }

  /* ================= S2：卡片翻面 → 拆解 → 思路章 → 两张空卡 ================= */
  function S2(g, t) {
    const a = 17.03, b = 28.40;
    // 翻面：0–1.4s
    const flip = eInOut(bt(t, a + 0.1, a + 1.3));
    const bob = Math.sin(t * 2.1) * 10, sway = Math.cos(t * 1.7) * 8;
    const dark = flip > 0.5;
    if (!dark) bgPaper(g, t); else bgInk(g, t);
    nav(g, t, dark ? 1 : 0, !dark);
    // 卡片（A→B 穿越）
    const cx0 = 700 + sway, cy0 = 470 + bob, cw = 300, ch = 400;
    const cardFade = 1 - bt(t, a + 1.6, a + 2.3);   // 拆解开始时卡片退场
    if (flip < 0.5 && cardFade > 0.02) {
      g.save(); g.globalAlpha = cardFade;
      cardBox(g, cx0, cy0, cw, ch, { paper: true });
      if (window.__PERSON) {
        g.save(); g.globalAlpha = 0.5;
        const H = 300, W = H * window.__PERSON.naturalWidth / window.__PERSON.naturalHeight;
        g.drawImage(window.__PERSON, cx0 + cw / 2 - W / 2, cy0 + 40, W, H); g.restore();
      }
      text(g, '我这张脸', cx0 + 24, cy0 + 370, { size: 26, weight: 600, font: SERIF, color: BROWN });
      g.restore();
    } else if (cardFade > 0.02) {
      g.save(); g.globalAlpha = cardFade;
      cardBox(g, cx0, cy0, cw, ch, { dark: true });
      text(g, '其余 · 全代码', cx0 + 22, cy0 + 54, { size: 24, weight: 600, font: SERIF, color: GOLD });
      ['paper();', 'grid();', 'title();', 'anim();', 'render();'].forEach((s, i) => {
        text(g, s, cx0 + 24, cy0 + 110 + i * 46, { size: 21, font: MONO, color: 'rgba(245,238,220,0.7)' });
      });
      g.restore();
    }
    // 翻面竖边
    if (flip > 0.05 && flip < 0.95) {
      const sx = cx0 + cw / 2, w2 = cw * Math.abs(Math.cos(flip * Math.PI)) / 2;
      g.save(); g.strokeStyle = GOLD_LT; g.lineWidth = 4;
      g.shadowColor = GOLD; g.shadowBlur = 24;
      g.beginPath(); g.moveTo(sx - w2, cy0); g.lineTo(sx - w2, cy0 + ch); g.stroke();
      g.beginPath(); g.moveTo(sx + w2, cy0); g.lineTo(sx + w2, cy0 + ch); g.stroke();
      g.restore();
    }
    // 拆解四行（2.0–4.6s）
    const ALL = [['画面', '矢量图 + 动画'], ['动效', '线生长 / 字写出'], ['配乐', '按章节生成'], ['字幕', '逐字时间戳'],
                 ['分镜', 'A / B 交替'], ['色板', '墨金 米白'], ['节奏', '十几秒一换'], ['导出', '24fps 逐帧']];
    const shift = schedIdx(t - a, SCHED_A);
    const items = [0, 1, 2, 3].map(k => ALL[(k + shift) % ALL.length]);
    if (dark && t < a + 6.0) {
      items.forEach((it, i) => {
        const p = bt(t, a + 1.5 + i * 0.34, a + 1.15 + i * 0.34 + 0.5);
        if (p <= 0) return;
        const y = 420 + i * 108;
        withReveal(g, 140, y - 34, 780, 78, p, i, (gg) => {
          gg.fillStyle = GOLD; gg.beginPath(); gg.arc(150, y, 6, 0, 6.284); gg.fill();
          text(gg, it[0], 178, y + 12, { size: 40, weight: 600, font: SERIF, color: CREAM });
          text(gg, it[1], 320, y + 10, { size: 24, color: 'rgba(245,238,220,0.55)' });
        });
      });
    }
    // 思路章（6.0–7.2s）
    const chap = bt(t, a + 6.0, a + 6.6);
    if (chap > 0) {
      g.save(); g.globalAlpha = chap;
      g.fillStyle = 'rgba(18,17,12,0.72)'; g.fillRect(0, 0, VW, VH);
      text(g, '思路', VW / 2, VH / 2, { size: 120, weight: 600, font: SERIF, color: CREAM, align: 'center', spacing: 12 });
      g.fillStyle = GOLD; g.fillRect(VW / 2 - 260 * chap, VH / 2 + 60, 520 * chap, 4);
      g.restore();
    }
    // 两张空卡（7.6–11.4s）
    const two = bt(t, a + 7.6, a + 8.6);
    if (two > 0) {
      const w = 420, h = 520;
      [[150, 'A-roll', '暖米 · 讲人', PAPER, BROWN], [520, 'B-roll', '墨黑 · 讲理', '#1A1712', CREAM]].forEach(([x, t1, t2, fc, tc]) => {
        const p = eElastic(clamp(two * 2.2 - (x > 400 ? 0.3 : 0), 0, 1));
        g.save(); g.globalAlpha = p;
        g.fillStyle = fc; rr(g, x, 560, w, h, 18); g.fill();
        g.strokeStyle = 'rgba(217,169,74,0.6)'; g.lineWidth = 2; rr(g, x, 560, w, h, 18); g.stroke();
        text(g, t1, x + w / 2, 800, { size: 46, weight: 700, font: MONO, color: tc, align: 'center', spacing: 4 });
        text(g, t2, x + w / 2, 866, { size: 24, color: tc === BROWN ? 'rgba(58,50,38,0.6)' : 'rgba(245,238,220,0.55)', align: 'center' });
        g.restore();
      });
    }
  }

  /* ================= S4：三图形 → 具体知识 → 大问句 ================= */
  function S4(g, t) {
    drawBChrome(g, t, 1);
    if (window.drawBeats && window.TL && window.drawBeats(g, t, SEGS, window.TL)) return;
    const a = 36.16;
    bgInk(g, t);
    nav(g, t, 1, false);
    // 三个语义图形
    const p1 = eOutQuart(bt(t, a + 0.1, a + 0.7));
    if (p1 > 0) {
      // 两列（对比）
      [[120, '对比'], [420, '因果'], [720, '流程']].forEach(([x, lab], i) => {
        const p = clamp((t - (a + 0.1 + i * 0.16)) / 0.5, 0, 1);
        if (p <= 0) return;
        g.save(); g.globalAlpha = p;
        g.strokeStyle = GOLD; g.lineWidth = 3; g.lineCap = 'round';
        const y = 560;
        if (i === 0) {
          for (let k = 0; k < 3; k++) {
            rr(g, x + 20, y + k * 62, 180 * p, 40, 6); g.stroke();
          }
        } else if (i === 1) {
          for (let k = 0; k < 3; k++) {
            g.beginPath(); g.arc(x + 40 + k * 70, y + 60, 16, 0, 6.284); g.stroke();
            if (k < 2) { g.beginPath(); g.moveTo(x + 56 + k * 70, y + 60); g.lineTo(x + 84 + k * 70, y + 60); g.stroke(); }
          }
        } else {
          for (let k = 0; k < 3; k++) {
            rr(g, x + k * 62, y + 40, 46, 46, 8); g.stroke();
            if (k < 2) { g.beginPath(); g.moveTo(x + 46 + k * 62, y + 63); g.lineTo(x + 62 + k * 62, y + 63); g.stroke(); }
          }
        }
        text(g, lab, x + 110, y + 200, { size: 26, color: 'rgba(245,238,220,0.6)', align: 'center' });
        g.restore();
      });
    }
    // 具体知识全归它
    const p2 = bt(t, a + 1.0, a + 1.8);
    if (p2 > 0) {
      g.save(); g.globalAlpha = p2;
      text(g, '具体知识全归它', 120, 340, { size: 56, weight: 600, font: SERIF, color: CREAM, spacing: 4 });
      g.restore();
    }
    // 大问句
    const p3 = eOutBack(bt(t, a + 3.0, a + 3.9));
    if (p3 > 0) {
      g.save();
      g.globalAlpha = clamp((t - (a + 3.0)) / 0.3, 0, 1);
      g.fillStyle = 'rgba(18,17,12,0.82)'; g.fillRect(0, 0, VW, VH);
      text(g, '为什么要', VW / 2, VH / 2 - 90, { size: 84, weight: 600, font: SERIF, color: CREAM, align: 'center', spacing: 4 });
      text(g, '拆成两种？', VW / 2, VH / 2 + 30, { size: 96, weight: 700, font: SERIF, color: GOLD, align: 'center', spacing: 6 });
      g.fillStyle = GOLD; g.fillRect(VW / 2 - 220 * p3, VH / 2 + 90, 440 * p3, 5);
      g.restore();
    }
  }

  /* ================= S5：因果链 → 14s 刻度 → 分叉 ================= */
  function S5(g, t) {
    drawBChrome(g, t, 1);
    if (window.drawBeats && window.TL && window.drawBeats(g, t, SEGS, window.TL)) return;
    const a = 44.86;
    bgInk(g, t);
    nav(g, t, 1, false);
    const nodes = [['换刺激', 200], ['注意力', 540], ['留存', 880]];
    const p = bt(t, a + 0.1, a + 3.2);
    nodes.forEach(([s, x], i) => {
      const q = clamp((t - (a + 0.1 + i * 0.55)) / 0.45, 0, 1);
      if (q <= 0) return;
      const y = 620;
      g.save(); g.globalAlpha = q;
      g.fillStyle = i === 2 ? GOLD : 'rgba(217,169,74,0.14)';
      g.strokeStyle = GOLD; g.lineWidth = 2.5;
      g.beginPath(); g.arc(x, y + Math.sin(t * 2.3 + i) * 6, 66 * eOutBack(q) * (1 + 0.03 * Math.sin(t * 3 + i)), 0, 6.284); g.fill(); g.stroke();
      text(g, s, x, y + 9, { size: 26, weight: 600, font: SERIF, color: i === 2 ? INK : CREAM, align: 'center' });
      g.restore();
      if (i < 2) {
        const loop = ((t - a) / 0.85 + i * 0.15) % 1;            // 箭头循环生长
        arrowH(g, x + 80, nodes[i + 1][1] - 80, y + Math.sin(t * 2 + i) * 4, loop < 0.75 ? loop / 0.75 : 1, GOLD, 3);
      }
    });
    // 14 秒刻度
    const sc = eOut(bt(t, a + 0.8, a + 1.6));
    if (sc > 0) {
      const x0 = 130, w = 820, y = 980;
      g.save(); g.globalAlpha = sc;
      g.strokeStyle = 'rgba(245,238,220,0.35)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w * sc, y); g.stroke();
      for (let i = 0; i <= 14; i++) {
        const x = x0 + (w / 14) * i;
        g.beginPath(); g.moveTo(x, y - (i % 2 ? 10 : 20)); g.lineTo(x, y + 10); g.stroke();
      }
      // 「十几秒」区间高亮
      g.fillStyle = 'rgba(217,169,74,0.35)';
      g.fillRect(x0 + w * (10 / 14), y - 26, w * (4 / 14) * sc, 52);
      g.restore();
      text(g, '十几秒', x0 + w * (12 / 14), y + 62, { size: 24, color: GOLD, align: 'center', spacing: 2 });
    }
    // 分叉（第二句）
    const f = bt(t, a + 4.6, a + 5.4);
    if (f > 0) {
      g.save(); g.globalAlpha = f;
      g.strokeStyle = GOLD; g.lineWidth = 3;
      const bx = 540, by = 1230;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx - 220, by + 130); g.stroke();
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + 220, by + 130); g.stroke();
      g.restore();
      [['选 A', 320], ['选 B', 760]].forEach(([s, x], i) => {
        const q = clamp((t - (a + 5.0 - i * 0.15)) / 0.4, 0, 1);
        if (q <= 0) return;
        g.save(); g.globalAlpha = q;
        cardBox(g, x - 110, 1380, 220, 110, {});
        text(g, s, x, 1445, { size: 40, weight: 700, font: SERIF, color: CREAM, align: 'center' });
        g.restore();
      });
      text(g, 'AI 每次只做一个选择', 540, 1580, { size: 26, color: 'rgba(245,238,220,0.55)', align: 'center', spacing: 2 });
    }
  }

  /* ================= S6：摊手 → 响指 → ①章 → 波形 ================= */
  function S6(g, t) {
    const a = 53.64, snap = 57.30;
    if (t < snap) {
      bgPaper(g, t); nav(g, t, 1, true);
      personSlot(g, 96, 420, 320, 1120, '数字人 A03', true);
      text(g, '各按自己的模板', 470, 700, { size: 52, weight: 600, font: SERIF, color: BROWN, spacing: 3 });
      text(g, '选完，各画各的', 470, 776, { size: 26, color: 'rgba(58,50,38,0.55)' });
    } else if (t < snap + 0.9) {
      // 冲击波 + 压黑
      const k = bt(t, snap, snap + 0.9);
      bgPaper(g, t);
      g.save();
      g.fillStyle = 'rgba(18,17,12,' + (k * 1.05) + ')'; g.fillRect(0, 0, VW, VH);
      g.strokeStyle = 'rgba(232,199,122,' + (1 - k) + ')'; g.lineWidth = 6 * (1 - k) + 1;
      for (let i = 0; i < 3; i++) {
        const rr0 = 60 + k * 900 + i * 90;
        g.beginPath(); g.arc(560, 760, rr0, 0, 6.284); g.stroke();
      }
      g.restore();
    } else {
      bgInk(g, t); nav(g, t, 2, false);
      const k = bt(t, snap + 0.9, snap + 1.5);
      // ①章卡
      if (k < 1) {
        g.save();
        const s = lerp(1.6, 1, eOut(k)), al = k < 0.85 ? 1 : (1 - (k - 0.85) / 0.15);
        g.globalAlpha = al;
        g.translate(VW / 2, VH / 2); g.scale(s, s); g.translate(-VW / 2, -VH / 2);
        text(g, '①', VW / 2, VH / 2 - 40, { size: 220, weight: 700, font: MONO, color: GOLD, align: 'center' });
        text(g, '文案 · 配音 · 对齐', VW / 2, VH / 2 + 90, { size: 40, weight: 600, font: SERIF, color: CREAM, align: 'center', spacing: 6 });
        g.restore();
      } else {
        // 三条流水线 + 波形 + 字表
        const p = bt(t, snap + 1.5, snap + 2.4);
        [['稿子', 320], ['配音', 520], ['时间表', 720]].forEach(([s, y], i) => {
          const q = clamp((t - (snap + 1.5 + i * 0.25)) / 0.5, 0, 1);
          if (q <= 0) return;
          g.save(); g.globalAlpha = q;
          cardBox(g, 140, y - 56, 800, 96, {});
          text(g, s, 180, y + 6, { size: 34, weight: 600, font: SERIF, color: CREAM });
          g.restore();
        });
        // 波形
        const wq = bt(t, snap + 2.2, snap + 3.4);
        if (wq > 0) {
          for (let i = 0; i < 48; i++) {
            const bh = (20 + 70 * Math.abs(Math.sin(i * 0.8 + t * 3))) * wq;
            g.fillStyle = i % 6 === 0 ? GOLD_LT : 'rgba(217,169,74,0.55)';
            rr(g, 170 + i * 15, 980 - bh, 9, bh, 4); g.fill();
          }
        }
        // 字表
        const cq = bt(t, snap + 3.0, snap + 4.2);
        if (cq > 0) {
          const chars = '配音出来丢给语音识别拿到时间表'.split('');
          chars.forEach((c, i) => {
            const q = clamp((t - (snap + 3.0 + i * 0.06)) / 0.3, 0, 1);
            if (q <= 0) return;
            g.save(); g.globalAlpha = q;
            cardBox(g, 140 + i * 68, 1180, 60, 84, {});
            text(g, c, 170 + i * 68, 1236, { size: 30, weight: 600, font: SERIF, color: CREAM, align: 'center' });
            if (i % 3 === 0) text(g, (0.4 + i * 0.18).toFixed(1) + 's', 170 + i * 68, 1300, { size: 15, font: MONO, color: 'rgba(245,238,220,0.45)', align: 'center' });
            g.restore();
          });
        }
      }
    }
  }

  /* ================= S7：时间轴 → 错位 → ②章 → 取景框 → 镜头卡 ================= */
  function S7(g, t) {
    const a = 72.07;
    bgInk(g, t);
    nav(g, t, 2, false);
    // 时间轴
    const p = eOut(bt(t, a + 0.1, a + 1.2));
    if (p > 0) {
      const x0 = 120, w = 840, y = 500;
      g.save();
      g.strokeStyle = GOLD; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w * p, y); g.stroke();
      for (let i = 0; i <= 12; i++) {
        const x = x0 + (w / 12) * i;
        g.strokeStyle = 'rgba(245,238,220,0.35)'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(x, y - 22); g.lineTo(x, y + 22); g.stroke();
      }
      const hp = ((t - a) * 0.16) % 1;   // 播放头一直在扫
      g.strokeStyle = RED; g.lineWidth = 4;
      g.beginPath(); g.moveTo(x0 + w * hp, y - 70); g.lineTo(x0 + w * hp, y + 40); g.stroke();
      g.restore();
      text(g, '这张表是基准', 120, y - 110, { size: 40, weight: 600, font: SERIF, color: CREAM, spacing: 3 });
    }
    // 错位对比
    const off = bt(t, a + 3.0, a + 4.6);
    if (off > 0) {
      g.save(); g.globalAlpha = off;
      [['原表', 620, 0], ['实际', 700, 42]].forEach(([s, y, dx], i) => {
        text(g, s, 120, y + 8, { size: 22, color: 'rgba(245,238,220,0.5)' });
        g.fillStyle = i ? 'rgba(200,65,43,0.28)' : 'rgba(217,169,74,0.22)';
        rr(g, 220 + dx, y - 18, 720, 36, 8); g.fill();
      });
      text(g, '错位 0.4s', 300, 790, { size: 24, color: 'rgba(232,120,100,0.9)', spacing: 2 });
      g.restore();
    }
    // ②章
    const ch = bt(t, a + 5.2, a + 5.8);
    if (ch > 0 && ch < 1) {
      g.save(); g.globalAlpha = ch < 0.85 ? 1 : (1 - (ch - 0.85) / 0.15);
      g.fillStyle = 'rgba(18,17,12,0.85)'; g.fillRect(0, 0, VW, VH);
      text(g, '②', VW / 2, VH / 2 - 40, { size: 220, weight: 700, font: MONO, color: GOLD, align: 'center' });
      text(g, '视觉编排表', VW / 2, VH / 2 + 90, { size: 44, weight: 600, font: SERIF, color: CREAM, align: 'center', spacing: 6 });
      g.restore();
    }
    // 取景框 + 镜头卡
    const fq = bt(t, a + 6.2, a + 7.2);
    if (fq > 0) {
      const bx = 160, by = 210, bw = 760, bh = 230;
      g.save(); g.globalAlpha = fq;
      g.strokeStyle = GOLD; g.lineWidth = 2;
      [[bx, by, 1, 1], [bx + bw, by, -1, 1], [bx, by + bh, 1, -1], [bx + bw, by + bh, -1, -1]].forEach(([x, y, dx, dy]) => {
        g.beginPath(); g.moveTo(x + dx * 44, y); g.lineTo(x, y); g.lineTo(x, y + dy * 44); g.stroke();
      });
      g.strokeStyle = 'rgba(245,238,220,0.18)'; g.setLineDash([8, 12]);
      g.strokeRect(bx + bw / 3, by, bw / 3, bh);
      g.strokeRect(bx + bw * 2 / 3, by, bw / 3, bh);
      g.setLineDash([]);
      g.restore();
      text(g, '站在导演视角', 160, 500, { size: 34, weight: 600, font: SERIF, color: CREAM, spacing: 3 });
    }
    const cq = bt(t, a + 8.4, a + 10.0);
    if (cq > 0) {
      for (let i = 0; i < 6; i++) {
        const q = eElastic(clamp((t - (a + 8.4 + i * 0.11)) / 0.32, 0, 1));
        if (q <= 0) continue;
        const col = i % 3, row = Math.floor(i / 3);
        const x = 130 + col * 280 + Math.sin(t * 0.9 + i) * 14, y = 820 + row * 300 + Math.sin(t * 1.9 + i * 0.8) * 9;
        withReveal(g, x, y, 250, 260, q, i + 2, (gg) => {
        cardBox(gg, x, y, 250, 260, {});
        text(gg, '镜 ' + (i + 1), x + 20, y + 46, { size: 22, font: MONO, color: GOLD });
        const swap = schedIdx(t - a, i % 2 ? SCHED_B : SCHED_A) % 2;
        text(gg, ((i + swap) % 2) ? 'B' : 'A', x + 200, y + 52, { size: 30, weight: 700, font: MONO, color: (i + swap) % 2 ? CREAM : GOLD_LT, align: 'right' });
        text(gg, (3.2 + i * 0.4).toFixed(1) + 's', x + 20, y + 210, { size: 20, font: MONO, color: 'rgba(245,238,220,0.5)' });
        });
      }
    }
  }

  /* ================= S8：条带标红 → 修正 ================= */
  function S8(g, t) {
    const a = 89.52;
    bgInk(g, t);
    nav(g, t, 2, false);
    const p = eOut(bt(t, a + 0.1, a + 0.9));
    const fix = bt(t, a + 3.0, a + 4.2);
    // 条带
    for (let i = 0; i < 10; i++) {
      const q = clamp((t - (a + 0.1 + i * 0.06)) / 0.4, 0, 1);
      if (q <= 0) continue;
      const y = 420 + i * 96;
      const rot = (i + Math.floor((t - a) / 0.45)) % 10;
      const bad = fix < 0.6 && (rot === 3 || rot === 4 || rot === 5 || rot === 7);
      const col = bad && fix < 0.6 ? 'rgba(200,65,43,0.55)' : (i % 2 ? 'rgba(217,169,74,0.22)' : 'rgba(245,238,220,0.12)');
      g.save(); g.globalAlpha = q;
      g.fillStyle = col;
      const sx = 140 + Math.sin(t * 1.3 + i * 0.7) * 18;
      rr(g, sx, y, 800 * p, 66, 10); g.fill();
      g.strokeStyle = bad && fix < 0.6 ? 'rgba(232,120,100,0.9)' : 'rgba(217,169,74,0.3)';
      g.lineWidth = 1.6; rr(g, 140, y, 800 * p, 66, 10); g.stroke();
      g.restore();
      if (bad && fix < 0.6) text(g, '!', 980, y + 44, { size: 30, weight: 700, font: MONO, color: 'rgba(232,120,100,0.9)' });
    }
    if (fix > 0.6) {
      g.save(); g.globalAlpha = (fix - 0.6) / 0.4;
      [['别连着三四段同一种', 1260], ['同一种别总用同一模板', 1370]].forEach(([s, y], i) => {
        g.fillStyle = GREEN;
        g.beginPath(); g.arc(160, y - 10, 12, 0, 6.284); g.fill();
        g.strokeStyle = CREAM; g.lineWidth = 3;
        g.beginPath(); g.moveTo(154, y - 10); g.lineTo(159, y - 4); g.lineTo(168, y - 17); g.stroke();
        text(g, s, 190, y, { size: 30, weight: 500, font: SERIF, color: CREAM });
      });
      g.restore();
    }
  }

  /* ================= S9：③章 → 凹窗 → 人物 ================= */
  function S9(g, t) {
    const a = 96.36;
    const win = bt(t, a + 0.9, a + 2.2);
    bgInk(g, t);
    nav(g, t, 3, false);
    // ③章
    const ch = bt(t, a, a + 0.9);
    if (ch < 1) {
      g.save(); g.globalAlpha = ch < 0.8 ? 1 : (1 - (ch - 0.8) / 0.2);
      g.fillStyle = 'rgba(18,17,12,0.85)'; g.fillRect(0, 0, VW, VH);
      text(g, '③', VW / 2, VH / 2 - 40, { size: 220, weight: 700, font: MONO, color: GOLD, align: 'center' });
      text(g, '正式制作', VW / 2, VH / 2 + 90, { size: 44, weight: 600, font: SERIF, color: CREAM, align: 'center', spacing: 6 });
      g.restore();
      return;
    }
    // 凹窗：卡片变形拉长成窗口（形状变化，里面有暖纸）
    const w = lerp(300, 360, eElastic(win)), h = lerp(400, 1000, eElastic(win));
    const x = 560, y = lerp(470, 380, eOut(win));
    g.save();
    g.fillStyle = PAPER; rr(g, x, y, w, h, 18); g.fill();
    g.strokeStyle = GOLD; g.lineWidth = 3; rr(g, x, y, w, h, 18); g.stroke();
    g.restore();
    // 窗口里的人（占位）
    if (win > 0.4) {
      g.save(); g.globalAlpha = (win - 0.4) / 0.6;
      personSlot(g, x + 20, y + 120, w - 40, h - 160, '数字人 A04', true);
      g.restore();
    }
    // 三张定妆图缩略 + Δ0px
    const th = bt(t, a + 6.0, a + 7.0);
    if (th > 0) {
      g.save(); g.globalAlpha = th;
      for (let i = 0; i < 3; i++) {
        const bx = 120 + i * 120, by = 1020 + (i % 2) * 26;
        cardBox(g, bx, by, 100, 130, { dark: true });
        if (window.__PERSON) {
          g.save(); g.globalAlpha = th * 0.5;
          const H = 110, W = H * window.__PERSON.naturalWidth / window.__PERSON.naturalHeight;
          g.drawImage(window.__PERSON, bx + 50 - W / 2, by + 10, W, H); g.restore();
        }
      }
      text(g, 'Δ0px', 120, 1250, { size: 34, weight: 700, font: MONO, color: GOLD, spacing: 3 });
      g.restore();
    }
    // 拉开示意
    const pull = bt(t, a + 2.6, a + 4.4);
    if (pull > 0) {
      g.save(); g.globalAlpha = pull * 0.9;
      g.strokeStyle = 'rgba(245,238,220,0.5)'; g.lineWidth = 2; g.setLineDash([10, 14]);
      g.beginPath(); g.moveTo(140, 900); g.lineTo(240 + 260 * pull, 900); g.stroke();
      g.setLineDash([]);
      g.restore();
    }
  }

  /* ================= S10：划掉模板 → 矢量层 → 三帧 → 翻白 ================= */
  function S10(g, t) {
    const a = 107.70;
    const white = bt(t, a + 8.6, a + 9.6);
    if (white > 0.5) { bgPaper(g, t); nav(g, t, 3, true); }
    else { bgInk(g, t); nav(g, t, 3, false); }
    // 模板被划掉
    const cross = eOut(bt(t, a + 0.1, a + 0.9));
    if (cross > 0) {
      g.save();
      g.strokeStyle = 'rgba(245,238,220,0.35)'; g.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        rr(g, 140 + (i % 3) * 130, 420 + Math.floor(i / 3) * 150, 110, 120, 10); g.stroke();
      }
      g.strokeStyle = RED; g.lineWidth = 8; g.lineCap = 'round';
      g.beginPath(); g.moveTo(140, 420); g.lineTo(140 + 380 * cross, 420 + 270 * cross); g.stroke();
      g.restore();
      text(g, '不用任何模板', 140, 780, { size: 40, weight: 600, font: SERIF, color: CREAM, spacing: 3 });
    }
    // 矢量层
    const layer = bt(t, a + 2.4, a + 5.0);
    if (layer > 0) {
      const names = ['矩形', '圆', '线', '文字'];
      names.forEach((s, i) => {
        const q = clamp((t - (a + 2.4 + i * 0.5)) / 0.4, 0, 1);
        if (q <= 0) return;
        const y = 900 + i * 110;
        g.save(); g.globalAlpha = q;
        g.strokeStyle = GOLD; g.lineWidth = 2.5;
        if (i === 0) g.strokeRect(160, y - 40, 120, 80);
        else if (i === 1) { g.beginPath(); g.arc(220, y, 44, 0, 6.284); g.stroke(); }
        else if (i === 2) { g.beginPath(); g.moveTo(150, y); g.lineTo(290, y); g.stroke(); }
        else text(g, 'Aa', 196, y + 20, { size: 46, weight: 700, font: SERIF, color: GOLD, align: 'center' });
        text(g, s, 330, y + 10, { size: 28, color: 'rgba(245,238,220,0.65)' });
        text(g, 'layer ' + (i + 1), 470, y + 10, { size: 18, font: MONO, color: 'rgba(245,238,220,0.35)' });
        g.restore();
      });
    }
    // 三帧 → 翻白
    const fr = bt(t, a + 6.2, a + 8.6);
    if (fr > 0) {
      for (let i = 0; i < 3; i++) {
        const x = 140 + i * 240;
        const q = clamp((t - (a + 6.2 + i * 0.35)) / 0.4, 0, 1);
        if (q <= 0) continue;
        const flipK = i === 2 ? white : 0;
        g.save(); g.globalAlpha = q;
        cardBox(g, x, 640, 200, 260, { dark: true, paper: flipK > 0.5 });
        text(g, '帧 ' + (i + 1), x + 100, 900, { size: 20, font: MONO, color: flipK > 0.5 ? BROWN : 'rgba(245,238,220,0.5)', align: 'center' });
        g.restore();
      }
    }
    // 翻白后的人物
    if (white > 0.5) {
      personSlot(g, 96, 420, 320, 1120, '数字人 A05', true);
      text(g, '从零开始', 470, 700, { size: 64, weight: 700, font: SERIF, color: BROWN, spacing: 6 });
    }
  }

  /* ================= S11：四宫格语法 ================= */
  function S11(g, t) {
    drawBChrome(g, t, 3);
    if (window.drawBeats && window.TL && window.drawBeats(g, t, SEGS, window.TL)) return;
    const a = 119.61;
    bgInk(g, t);
    nav(g, t, 3, false);
    const POOL = [
      [['两列', '对比'], ['一条链', '因果'], ['流程箭头', '步骤'], ['金句大字', '结论']],
      [['时间轴', '顺序'], ['分叉', '选择'], ['环', '循环'], ['数字', '量级']],
      [['色卡', '情绪'], ['网格', '秩序'], ['波形', '节奏'], ['框', '聚焦']]
    ];
    const cells = POOL[schedIdx(t - a, SCHED_A) % POOL.length];
    cells.forEach(([s1, s2], i) => {
      // 每格自己的换手表（错相），进场时刻也不一样
      const mine = i % 2 ? SCHED_B : SCHED_A;
      const tick = schedIdx(t - a, mine);
      const enterAt = i * 0.22;
      const q = eElastic(clamp((t - (a + enterAt)) / 0.30, 0, 1));
      if (q <= 0) return;
      const x = 110 + (i % 2) * 450, y = 440 + Math.floor(i / 2) * 450 + Math.sin(t * 1.5 + i * 1.2) * 8;
      withReveal(g, x, y, 400, 400, q, i + 1, (gg) => {
      cardBox(gg, x, y, 400, 400, {});
      text(gg, s1, x + 200, y + 120, { size: 54, weight: 600, font: SERIF, color: CREAM, align: 'center', spacing: 3 });
      text(gg, s2, x + 200, y + 190, { size: 28, color: 'rgba(245,238,220,0.55)', align: 'center' });
      // 格内小动作
      gg.strokeStyle = GOLD; gg.lineWidth = 3;
      const ph2 = ((t - a) / 0.5 + i * 0.17) % 1;
      gg.globalAlpha = q * (0.55 + 0.45 * (1 - Math.abs(ph2 * 2 - 1)));
      if (i === 0) { gg.beginPath(); gg.moveTo(x + 120, y + 260); gg.lineTo(x + 280, y + 260); gg.stroke(); gg.beginPath(); gg.moveTo(x + 120, y + 320); gg.lineTo(x + 200 + 60 * Math.sin(t * 3), y + 320); gg.stroke(); }
      if (i === 1) { for (let k = 0; k < 3; k++) { gg.beginPath(); gg.arc(x + 130 + k * 70, y + 300, 12 + 4 * Math.sin(t * 4 + k), 0, 6.284); gg.stroke(); } }
      if (i === 2) { for (let k = 0; k < 3; k++) { rr(gg, x + 130 + k * 60, y + 280 + 12 * Math.sin(t * 3 + k), 40, 40, 6); gg.stroke(); } }
      if (i === 3) text(gg, '“', x + 120, y + 330, { size: 80, font: SERIF, color: GOLD });
      });
    });
    text(g, '按语义结构选，不是按喜好选', 540, 1520, { size: 30, color: 'rgba(245,238,220,0.55)', align: 'center', spacing: 2 });
  }

  /* ================= S12：④章 → 抽格 → 人物 ================= */
  function S12(g, t) {
    const a = 128.92;
    const cut = bt(t, a + 0.9, a + 2.6);
    bgInk(g, t);
    nav(g, t, 5, false);
    const ch = bt(t, a, a + 0.9);
    if (ch < 1) {
      g.save(); g.globalAlpha = ch < 0.8 ? 1 : (1 - (ch - 0.8) / 0.2);
      g.fillStyle = 'rgba(18,17,12,0.85)'; g.fillRect(0, 0, VW, VH);
      text(g, '④', VW / 2, VH / 2 - 40, { size: 220, weight: 700, font: MONO, color: GOLD, align: 'center' });
      text(g, '样片和成片', VW / 2, VH / 2 + 90, { size: 44, weight: 600, font: SERIF, color: CREAM, align: 'center', spacing: 6 });
      g.restore();
      return;
    }
    // 时间轴抽出一格
    const x0 = 120, w = 840, y = 700;
    g.save(); g.strokeStyle = 'rgba(217,169,74,0.5)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w, y); g.stroke();
    for (let i = 0; i <= 12; i++) {
      g.strokeStyle = 'rgba(245,238,220,0.3)'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(x0 + (w / 12) * i, y - 16); g.lineTo(x0 + (w / 12) * i, y + 16); g.stroke();
    }
    g.restore();
    // 抽出的那一格 → 飞到下面变地面线
    const gx = x0 + w * 0.42;
    if (cut > 0) {
      const e = eInOut(cut);
      const cy = lerp(y, 1450, e), sx = lerp(gx, 200, e), sw = lerp(70, 680, e);
      g.save();
      g.fillStyle = GOLD_LT;
      rr(g, sx, cy - 8, sw, lerp(56, 10, e), 6); g.fill();
      g.restore();
    }
    personSlot(g, 96, 700, 320, 800, '数字人 A06', false);
    // 一分钟样片进度
    if (cut > 0.8) {
      const pq = clamp((t - (a + 2.6)) / 3.4, 0, 1);
      g.save(); g.globalAlpha = 0.9;
      g.fillStyle = 'rgba(245,238,220,0.18)'; rr(g, 120, 1520, 840, 8, 4); g.fill();
      g.fillStyle = GOLD; rr(g, 120, 1520, 840 * pq, 8, 4); g.fill();
      text(g, '样片 60s', 120, 1490, { size: 22, font: MONO, color: 'rgba(245,238,220,0.6)' });
      g.restore();
    }
  }

  /* ================= S13：四轨音轨 + 响度表 ================= */
  function S13(g, t) {
    const a = 136.74;
    bgInk(g, t);
    nav(g, t, 5, false);
    const tracks = [['人声', GOLD], ['配乐', '#7FB3D9'], ['音效', '#D98FB3'], ['母线', CREAM]];
    tracks.forEach(([s, col], i) => {
      const q = clamp((t - (a + 0.1 + i * 0.5)) / 0.5, 0, 1);
      if (q <= 0) return;
      const y = 520 + i * 230 + Math.sin(t * 1.6 + i) * 5;
      g.save(); g.globalAlpha = q;
      text(g, s, 120, y - 60, { size: 24, color: 'rgba(245,238,220,0.6)', spacing: 2 });
      g.fillStyle = 'rgba(245,238,220,0.08)'; rr(g, 120, y - 30, 840, 90, 10); g.fill();
      // 波形
      for (let k = 0; k < 84; k++) {
        const bh = 8 + 46 * Math.abs(Math.sin(k * 0.4 + i * 1.7 + t * 5)) * q;
        g.fillStyle = col;
        const off = scrollT(t, 60, 9.8);
        rr(g, 130 + ((k * 9.8 - off) % 840 + 840) % 840, y + 15 - bh / 2, 5, bh, 2); g.fill();
      }
      g.restore();
    });
    // 响度表
    const lq = clamp((t - (a + 2.6)) / 2.2, 0, 1);
    if (lq > 0) {
      g.save();
      const bx = 940, by = 600, bh = 520;
      g.fillStyle = 'rgba(245,238,220,0.10)'; rr(g, bx, by, 40, bh, 8); g.fill();
      const v = lerp(0, 0.82, eOut(lq));
      g.fillStyle = lq > 0.85 ? GREEN : GOLD;
      rr(g, bx, by + bh * (1 - v), 40, bh * v, 8); g.fill();
      text(g, '-16', bx + 20, by + bh + 34, { size: 18, font: MONO, color: 'rgba(245,238,220,0.6)', align: 'center' });
      text(g, 'LUFS', bx + 20, by - 20, { size: 16, font: MONO, color: 'rgba(245,238,220,0.4)', align: 'center' });
      g.restore();
      text(g, '−1.5 dBTP', 300, 1500, { size: 22, font: MONO, color: lq > 0.85 ? GREEN : 'rgba(245,238,220,0.4)' });
    }
  }

  /* ================= S14：落版（人物 + 四卡） ================= */
  function S14(g, t) {
    const a = 144.06;
    bgPaper(g, t);
    nav(g, t, 6, true);
    drawPersonVideo(g, 'A07', t - 144.06);
    const items = ['文案', '编排', '画面', '声音'];
    const merge = bt(t, a + 8.0, a + 9.6);
    items.forEach((s, i) => {
      const q = clamp((t - (a + 0.4 + i * 0.7)) / 0.45, 0, 1);
      if (q <= 0) return;
      const x = 470, y = 460 + i * 150 - merge * (i * 150) / 2;
      g.save(); g.globalAlpha = q;
      const bw = merge > 0.5 ? 380 - merge * 90 : 380;
      cardBox(g, x, y, bw, 120, { paper: true });
      // 用图形代替文字：纸 / 三块 / 画框 / 波形
      const cx0 = x + 52, cy0 = y + 60;
      g.save();
      g.strokeStyle = BROWN; g.lineWidth = 3; g.lineCap = 'round';
      const k = 0.4 + 0.6 * eOutQuart(q);
      if (i === 0) {
        g.strokeRect(cx0 - 26, cy0 - 32 * k, 52, 64 * k);
        for (let m = 0; m < 3; m++) { g.beginPath(); g.moveTo(cx0 - 14, cy0 - 16 + m * 16); g.lineTo(cx0 + 14, cy0 - 16 + m * 16); g.stroke(); }
      } else if (i === 1) {
        for (let m = 0; m < 3; m++) { g.strokeRect(cx0 - 34 + m * 26, cy0 - 20 * k, 20, 40 * k); }
      } else if (i === 2) {
        g.strokeRect(cx0 - 30, cy0 - 24 * k, 60, 48 * k);
        g.beginPath(); g.moveTo(cx0 - 30, cy0 - 24); g.lineTo(cx0 + 30, cy0 + 24); g.stroke();
      } else {
        for (let m = 0; m < 4; m++) {
          const hh = 12 + 26 * Math.abs(Math.sin(m * 1.6 + t * 3));
          g.beginPath(); g.moveTo(cx0 - 24 + m * 16, cy0); g.lineTo(cx0 - 24 + m * 16, cy0 - hh * k); g.stroke();
          g.beginPath(); g.moveTo(cx0 - 24 + m * 16, cy0); g.lineTo(cx0 - 24 + m * 16, cy0 + hh * k); g.stroke();
        }
      }
      g.restore();
      g.restore();
    });
    if (merge > 0.5) {
      g.save(); g.globalAlpha = (merge - 0.5) / 0.5;
      text(g, '一条流水线', 470, 1120, { size: 34, weight: 600, font: SERIF, color: BROWN, spacing: 3 });
      g.restore();
    }
    // 落版字
    const end = bt(t, a + 9.6, a + 11.0);
    if (end > 0) {
      g.save(); g.globalAlpha = end;
      text(g, '从零开始', 470, 1420, { size: 76, weight: 700, font: SERIF, color: BROWN, spacing: 8 });
      text(g, 'JACK · 用代码做视频', 470, 1500, { size: 26, font: MONO, color: 'rgba(58,50,38,0.55)', spacing: 4 });
      g.restore();
    }
  }

  /* ================= 段表 ================= */
  const SEGS = [
    { t0: 0.00, t1: 17.03, fn: null, ab: 'A', name: '开场' },
    { t0: 17.03, t1: 28.58, fn: S2, ab: 'B', name: '拆解' },
    { t0: 28.58, t1: 36.16, fn: null, ab: 'A', name: 'A-roll 自指' },
    { t0: 36.16, t1: 44.86, fn: S4, ab: 'B', name: '自指 B-roll' },
    { t0: 44.86, t1: 53.64, fn: S5, ab: 'B', name: '两条理由' },
    { t0: 53.64, t1: 72.07, fn: S6, ab: 'A→B', name: '响指' },
    { t0: 72.07, t1: 89.52, fn: S7, ab: 'B', name: '编排表' },
    { t0: 89.52, t1: 96.36, fn: S8, ab: 'B', name: '检查' },
    { t0: 96.36, t1: 107.70, fn: S9, ab: 'B→A', name: '③形象一致' },
    { t0: 107.70, t1: 119.61, fn: S10, ab: 'B→A', name: '④从零开始' },
    { t0: 119.61, t1: 128.92, fn: S11, ab: 'B', name: '四宫格' },
    { t0: 128.92, t1: 136.74, fn: S12, ab: 'B→A', name: '④样片' },
    { t0: 136.74, t1: 144.06, fn: S13, ab: 'B', name: '补声音' },
    { t0: 144.06, t1: DUR, fn: S14, ab: 'A', name: '落版' }
  ];

  /* ---------- 镜头运动 ---------- */
  const BEAT = 60 / 126.5;
  function applyCam(g, t, seg) {
    // 不做任何镜头运动：镜头只在"需要的时候"才动，且每段手法不同（此处默认静止）
  }

  function drawFrame(g, t) {
    t = clamp(t, 0, DUR);
    const seg = SEGS.find(s => t >= s.t0 && t < s.t1) || SEGS[SEGS.length - 1];
    // 先拿底色铺满整屏（镜头放大/漂移时不会露边）
    // 只要 BEATS 表覆盖到这一句，就统一走 beats 引擎
    if (window.drawBeats && window.TL) {
      // 顶部导航高亮（Mimo）：优先按时间轴章节走（与底部进度尺一致），
      // beatrender 没加载时退回按段落名映射
      const ni = window.NAV_AT ? window.NAV_AT(t, window.TL) : (() => {
        const n = seg.name;
        if (n === '开场') return 0;             // 开场
        if (n === '响指') return 2;             // ①文案
        if (n === '编排表' || n === '检查') return 3;   // ②编排
        if (n === '③形象一致' || n === '④从零开始' || n === '四宫格') return 4;  // ③制作
        if (n === '④样片' || n === '补声音') return 5; // ④成片
        if (n === '落版') return 6;             // 收尾
        return 1;                               // 思路
      })();
      drawBChrome(g, t, ni);
      if (window.drawBeats(g, t, SEGS, window.TL)) return;
    }
    if (seg.fn) {
      const light = false;
      // 用该段自己的底先铺一层满屏（不确定时用墨黑）
      g.save(); g.fillStyle = '#12110C'; g.fillRect(0, 0, VW, VH); g.restore();
      g.save();
      applyCam(g, t, seg);
      seg.fn(g, t);
      g.restore();
      return;
    }
    // A 段：暖纸 + 占位（S1 用 open_anim，S3 单独画）
    if (seg.name === '开场') {
      if (window.drawOpen) window.drawOpen(g, t); else bgInk(g, t);
      return;
    }
    bgPaper(g, t); nav(g, t, 1, true);
    drawPersonVideo(g, 'A02', t - 28.58);
    // 三块情绪色卡：同尺寸、等间距，依次"弹入"（缩放不淡入）
    for (let j = 0; j < 3; j++) {
      const k = clamp(((t - 28.58) / 7.5 - j * 0.18) / 0.22, 0, 1);
      if (k <= 0) continue;
      const s = 0.55 + 0.45 * eElastic(k);
      const x = 470 + j * 176, y = 700, w = 150, h = 200;
      g.save();
      g.translate(x + w / 2, y + h / 2); g.scale(s, s); g.translate(-(x + w / 2), -(y + h / 2));
      g.fillStyle = ['rgba(200,65,43,0.85)', 'rgba(217,169,74,0.85)', 'rgba(58,50,38,0.85)'][j];
      rr(g, x, y, w, h, 12); g.fill();
      g.strokeStyle = 'rgba(58,50,38,0.25)'; g.lineWidth = 1.5;
      rr(g, x, y, w, h, 12); g.stroke();
      g.restore();
    }

  }

  window.drawFrame = drawFrame;
  window.PERSON_DRAW = drawPersonVideo;   // 给 beatrender 的 A-roll beat 用
  window.BG_PAPER = bgPaper;
  window.NAV_DRAW = nav;
  window.FILM_DUR = DUR;
  window.FILM_SEGS = SEGS;
})();
