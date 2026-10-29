/*
 * open_anim.js — 开场 A01 背景 v2（16.89s，12 幕，纯代码）
 *
 * 每幕 = bg(底) + ink(元素)；ink 用"时间回抽叠画"做运动模糊（3 帧、间隔 16ms）。
 *
 *   01 0.0–1.3   INK    点→十字→X→方框→准星，中心发散 + 环绕点
 *   02 1.3–2.7   BLUE   等轴测线框立方体（三层套叠，取代八芒星）
 *   03 2.7–4.1   RED    巨字 JACK 四字母依次砸入 + 背景字带
 *   04 4.1–5.3   INK    维度演化：点→线→面→立方体（1D/2D/3D 标签）
 *   05 5.3–6.5   INK    十字方阵铺满全屏：自转 + 尺寸脉冲 + 由中心扩散
 *   06 6.5–7.9   PURPLE 三层视差数据条 + 斜纹扫过 + 读数（与 05 拉开配色）
 *   07 7.9–9.1   BLUE   三角群：大三角 + 两圈卫星 + 连线网络 + 底部翻转阵列
 *   08 9.1–10.5  INK    同心圆点阵 2D→3D：压扁成隧道 + 线框球浮现
 *   09 10.5–12.0 LIME   8 条贝塞尔带流动交汇 + 刻度尺
 *   10 12.0–13.4 RED    英文单词墙：CODE/MOTION/PIXEL… 翻滚缩放
 *   11 13.4–15.0 INK    三条叠加正弦 ribbon（面带）+ 竖刻度 + 跟随节点
 *   12 15.0–16.89 RED   落版 JACK（无星标）：字母升起 + 横线扫过
 */
(function () {
  const L = window.LIB;
  const { rr, text, clamp, lerp, eOut, eOutQuart, eOutBack, eInOut } = L;
  const VW = 1080, VH = 1920, DUR = 16.89;
  const INK = '#12110C', GOLD = '#D9A94A', GOLD_LT = '#E8C77A', CREAM = '#F3EBD6',
    RED = '#C8412B', BLUE = '#1B23F0', LIME = '#D8E32B', PURPLE = '#5B2BE8';
  const MONO = 'B612', SANS = 'SansSC';
  const bt = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const SHRINK_AT = 2.60, SHRINK_DUR = 0.75;
  const TAU = Math.PI * 2;
  const bgFill = (g, c) => { g.fillStyle = c; g.fillRect(0, 0, VW, VH); };

  /* ---------- 公共小件 ---------- */
  function tickRing(g, cx, cy, r, n, color, rot, lw) {
    g.save(); g.strokeStyle = color; g.lineWidth = lw || 2;
    for (let i = 0; i < n; i++) {
      const a = (TAU / n) * i + rot, r1 = r + (i % 5 === 0 ? 26 : 12);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      g.stroke();
    }
    g.restore();
  }
  function brackets(g, inset, color, lw) {
    g.save(); g.strokeStyle = color; g.lineWidth = lw || 2; g.lineCap = 'square';
    const sl = 46;
    [[inset, inset, 1, 1], [VW - inset, inset, -1, 1], [inset, VH - inset, 1, -1], [VW - inset, VH - inset, -1, -1]]
      .forEach(([x, y, dx, dy]) => {
        g.beginPath(); g.moveTo(x + dx * sl, y); g.lineTo(x, y); g.lineTo(x, y + dy * sl); g.stroke();
      });
    g.restore();
  }
  function floatNums(g, t, color, n) {
    g.save();
    for (let i = 0; i < n; i++) {
      const x = 60 + ((i * 397 + t * 40) % (VW - 120));
      const y = 140 + ((i * 211 + t * 26) % (VH - 320));
      text(g, (Math.floor(t * 90 + i * 37) % 999).toString().padStart(3, '0'), x, y, { size: 13, font: MONO, color: color });
    }
    g.restore();
  }
  function scanLine(g, tt, color) {
    const y = ((Math.abs(tt) * 620) % (VH + 300)) - 150;
    g.save();
    const grd = g.createLinearGradient(0, y - 90, 0, y);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, color);
    g.fillStyle = grd; g.fillRect(0, y - 90, VW, 90);
    g.restore();
  }

  function cube(g, cx, cy, R, ang, color, lw, phase) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const P2 = [];
    for (const [x, y, z] of [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]) {
      const xr = x * c - z * s, zr = x * s + z * c;
      P2.push([cx + (xr - zr * 0.5) * 0.78 * R, cy + (y - zr * 0.42) * 0.78 * R]);
    }
    const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    g.strokeStyle = color; g.lineWidth = lw; g.lineCap = 'round';
    E.forEach(([a, b], i) => {
      const k = clamp((phase - i * 0.045) / 0.22, 0, 1);
      if (k <= 0) return;
      g.beginPath(); g.moveTo(P2[a][0], P2[a][1]);
      g.lineTo(lerp(P2[a][0], P2[b][0], k), lerp(P2[a][1], P2[b][1], k)); g.stroke();
    });
    g.fillStyle = color;
    P2.forEach(([x, y], i) => {
      const k = clamp((phase - 0.15 - i * 0.02) / 0.2, 0, 1);
      if (k > 0) { g.beginPath(); g.arc(x, y, 4.5 * k, 0, TAU); g.fill(); }
    });
  }

  const S = [];

  /* ========== 01 ========== */
  S.push({ t0: 0.0, t1: 1.3, light: false, bg(g) { bgFill(g, INK); }, ink(g, t) {
    const cx = VW / 2, cy = VH / 2;
    const p1 = eOutQuart(bt(t, 0.00, 0.30));
    const p2 = eInOut(bt(t, 0.28, 0.62));
    const p3 = eInOut(bt(t, 0.55, 0.95));
    const p4 = eOut(bt(t, 0.85, 1.20));
    g.save(); g.translate(cx, cy); g.rotate(p2 * Math.PI / 4);
    const R = lerp(0, 220, p1) + p4 * 90;
    g.strokeStyle = 'rgba(217,169,74,0.95)'; g.lineWidth = lerp(3, 16, p1); g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2, r = R * (1 - p3 * 0.30);
      if (p3 > 0.02) {
        const nx = Math.cos(a + Math.PI / 2), ny = Math.sin(a + Math.PI / 2);
        g.beginPath();
        g.moveTo(Math.cos(a) * r + nx * r * p3, Math.sin(a) * r + ny * r * p3);
        g.lineTo(Math.cos(a) * r - nx * r * p3, Math.sin(a) * r - ny * r * p3);
        g.stroke();
      } else {
        g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); g.stroke();
      }
    }
    g.restore();
    g.fillStyle = GOLD_LT;
    g.beginPath(); g.arc(cx, cy, lerp(0, 14, p1) * (1 - p3 * 0.5), 0, TAU); g.fill();
    if (p4 > 0) {
      for (let i = 0; i < 24; i++) {
        const a = (TAU / 24) * i + t * 0.6, r = 300 + 26 * Math.sin(t * 6 + i);
        g.fillStyle = 'rgba(217,169,74,' + (0.25 + 0.5 * p4) + ')';
        g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 3.2, 0, TAU); g.fill();
      }
    }
    g.strokeStyle = 'rgba(245,238,220,' + (0.10 + 0.35 * p4) + ')'; g.lineWidth = 2;
    [[80, 200], [VW - 80, 200], [80, VH - 200], [VW - 80, VH - 200]].forEach(([x, y]) => {
      g.beginPath(); g.moveTo(x - 18, y); g.lineTo(x + 18, y); g.moveTo(x, y - 18); g.lineTo(x, y + 18); g.stroke();
    });
  } });

  /* ========== 02 ========== */
  S.push({ t0: 1.3, t1: 2.7, light: false, bg(g) {
    bgFill(g, BLUE);
    const grd = g.createLinearGradient(0, 0, VW, VH);
    grd.addColorStop(0, 'rgba(255,255,255,0.10)');
    grd.addColorStop(0.5, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = grd; g.fillRect(0, 0, VW, VH);
    g.save(); g.globalAlpha = 0.16; g.strokeStyle = '#FFF'; g.lineWidth = 1;
    for (let x = -VH; x < VW; x += 34) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + VH, VH); g.stroke(); }
    g.restore();
  }, ink(g, t) {
    const q = eOutQuart(bt(t, this.t0, this.t0 + 0.55));
    const ang = (t - this.t0) * 0.9;
    const cx = VW / 2, cy = VH / 2 - 40;
    [[1.0, CREAM, 3.4, 0], [0.62, 'rgba(216,227,43,0.9)', 2.4, 0.18], [0.34, 'rgba(243,235,214,0.55)', 1.8, 0.34]].forEach(([k, col, lw, ph]) => {
      cube(g, cx, cy, 300 * k * q, ang + ph * 2, col, lw, clamp((t - this.t0 - ph) / 0.9, 0, 1));
    });
    for (let i = 0; i < 8; i++) {
      const a = (TAU / 8) * i + t * 0.5;
      const r = 360 + 120 * clamp((t - this.t0) / 1.2, 0, 1);
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.6;
      g.save(); g.translate(x, y); g.rotate(a + t);
      g.fillStyle = 'rgba(216,227,43,0.85)'; g.fillRect(-7, -7, 14, 14); g.restore();
    }
    tickRing(g, 880, 380, 90, 24, 'rgba(216,227,43,0.5)', -t * 0.8, 1.6);
    brackets(g, 56, 'rgba(243,235,214,0.20)');
    text(g, 'WIREFRAME / 12 EDGES', 60, VH - 200, { size: 22, font: MONO, color: 'rgba(243,235,214,0.55)', spacing: 3 });
  } });

  /* ========== 03 ========== */
  S.push({ t0: 2.7, t1: 4.1, light: false, bg(g) { bgFill(g, RED); }, ink(g, t) {
    g.save(); g.globalAlpha = 0.13;
    for (let i = 0; i < 7; i++) {
      const y = 200 + i * 260;
      const off = ((t * 160 * (i % 2 ? 1 : -1)) % 520);
      for (let c = -1; c < 4; c++) text(g, 'JACK', c * 520 + off, y, { size: 190, weight: 900, font: SANS, color: CREAM });
    }
    g.restore();
    const baseY = VH / 2 + 90;
    'JACK'.split('').forEach((ch, i) => {
      const q = eOutBack(clamp((t - (this.t0 + 0.05 + i * 0.075)) / 0.34, 0, 1));
      if (q <= 0) return;
      g.save();
      g.globalAlpha = clamp((t - (this.t0 + 0.05 + i * 0.075)) / 0.18, 0, 1);
      text(g, ch, 70 + i * 236, baseY + (1 - q) * 240, { size: 320, weight: 900, font: SANS, color: CREAM });
      g.restore();
    });
    const lq = eOutQuart(bt(t, this.t0 + 0.45, this.t0 + 0.85));
    g.fillStyle = CREAM; g.fillRect(80, baseY + 74, 900 * lq, 6);
    g.save(); g.globalAlpha = bt(t, this.t0 + 0.55, this.t0 + 0.95);
    text(g, 'MOTION DESIGNER', 84, baseY + 140, { size: 34, weight: 700, font: MONO, color: 'rgba(243,235,214,0.9)', spacing: 10 });
    text(g, '用代码做视频 / MADE OF CODE', 84, baseY + 190, { size: 26, color: 'rgba(243,235,214,0.62)', spacing: 4 });
    g.restore();
  } });

  /* ========== 04 维度演化 ========== */
  S.push({ t0: 4.1, t1: 5.3, light: false, bg(g) { bgFill(g, INK); }, ink(g, t) {
    const cx = VW / 2, cy = VH / 2;
    const a = bt(t, this.t0, this.t0 + 0.22);
    const b = bt(t, this.t0 + 0.22, this.t0 + 0.46);
    const c = bt(t, this.t0 + 0.46, this.t0 + 0.72);
    const d = bt(t, this.t0 + 0.72, this.t0 + 1.20);
    const half = 200;
    if (a > 0) {
      g.fillStyle = GOLD_LT;
      g.beginPath(); g.arc(cx, cy, lerp(2, 16, a) * (1 - b * 0.6), 0, TAU); g.fill();
    }
    if (b > 0) {
      const h = half * eOutQuart(b) * (1 - c * 0.2);
      g.strokeStyle = GOLD; g.lineWidth = 8; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx, cy - h); g.lineTo(cx, cy + h); g.stroke();
    }
    if (c > 0) {
      const w = half * eOutQuart(c), h = half * eOutQuart(clamp(c * 1.3, 0, 1));
      g.strokeStyle = GOLD; g.lineWidth = 6;
      g.strokeRect(cx - w, cy - h, w * 2, h * 2);
      g.save(); g.globalAlpha = 0.35 * c; g.strokeStyle = GOLD; g.lineWidth = 1.2;
      for (let i = 1; i < 8; i++) {
        const x = cx - w + (w * 2 / 8) * i, y = cy - h + (h * 2 / 8) * i;
        g.beginPath(); g.moveTo(x, cy - h); g.lineTo(x, cy + h); g.stroke();
        g.beginPath(); g.moveTo(cx - w, y); g.lineTo(cx + w, y); g.stroke();
      }
      g.restore();
      if (d > 0) {
        const off = 160 * eOut(d), ang = (t - this.t0) * 1.2;
        const P2 = [];
        for (const [x, y, z] of [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]) {
          const xr = x * Math.cos(ang) - z * Math.sin(ang), zr = x * Math.sin(ang) + z * Math.cos(ang);
          P2.push([cx + (xr - zr * 0.5) * off, cy + (y * 0.86 - zr * 0.42) * off]);
        }
        g.save(); g.globalAlpha = d; g.strokeStyle = GOLD_LT; g.lineWidth = 3;
        [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([i, j]) => {
          g.beginPath(); g.moveTo(P2[i][0], P2[i][1]); g.lineTo(P2[j][0], P2[j][1]); g.stroke();
        });
        g.fillStyle = 'rgba(217,169,74,0.16)';
        [[0, 1, 2, 3], [4, 5, 6, 7]].forEach(face => {
          g.beginPath(); face.forEach((k, idx) => idx ? g.lineTo(P2[k][0], P2[k][1]) : g.moveTo(P2[k][0], P2[k][1])); g.closePath(); g.fill();
        });
        g.restore();
      }
    }
    [['1D', a], ['2D', b], ['3D', c]].forEach(([s, q], i) => {
      if (q <= 0) return;
      g.save(); g.globalAlpha = 0.35 + 0.65 * q;
      text(g, s, 90, 320 + i * 70, { size: 44, weight: 700, font: MONO, color: i === 2 ? GOLD_LT : 'rgba(245,238,220,0.45)' });
      g.restore();
    });
    text(g, 'POINT → LINE → PLANE → SPACE', 90, VH - 240, { size: 24, font: MONO, color: 'rgba(245,238,220,0.5)', spacing: 3 });
  } });

  /* ========== 05 十字方阵 ========== */
  S.push({ t0: 5.3, t1: 6.5, light: false, bg(g) { bgFill(g, INK); }, ink(g, t) {
    const cx = VW / 2, cy = VH / 2;
    const C2 = 26, R2 = 44;
    for (let r2 = 0; r2 < R2; r2++) for (let c2 = 0; c2 < C2; c2++) {
      const x2 = (c2 + 0.5) * (VW / C2), y2 = (r2 + 0.5) * (VH / R2);
      const ap2 = clamp((t - this.t0 - Math.hypot(x2 - cx, y2 - cy) / 1100 * 0.5) / 0.3, 0, 1);
      if (ap2 <= 0) continue;
      g.fillStyle = 'rgba(245,238,220,' + (0.06 + 0.10 * (0.5 + 0.5 * Math.sin(t * 4 - c2 * 0.4))) + ')';
      g.fillRect(x2 - 1.5, y2 - 1.5, 3, 3);
    }
    const COLS = 13, ROWS = 22, gx = VW / COLS, gy = VH / ROWS;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = (c + 0.5) * gx, y = (r + 0.5) * gy;
        const dist = Math.hypot(x - cx, y - cy) / 900;
        const ap = clamp((t - this.t0 - dist * 0.42) / 0.28, 0, 1);
        if (ap <= 0) continue;
        const wave = 0.5 + 0.5 * Math.sin(t * 5.2 - c * 0.55 - r * 0.28);
        const size = (10 + 16 * wave) * eOutBack(ap);
        g.save();
        g.globalAlpha = (0.22 + 0.78 * wave) * ap;
        g.translate(x, y); g.rotate(t * 2.2 + (c + r) * 0.35);
        g.strokeStyle = wave > 0.72 ? GOLD_LT : GOLD;
        g.lineWidth = 3.2; g.lineCap = 'round';
        g.beginPath(); g.moveTo(-size, 0); g.lineTo(size, 0); g.moveTo(0, -size); g.lineTo(0, size); g.stroke();
        g.restore();
      }
    }
  } });

  /* ========== 06 视差数据条 ========== */
  S.push({ t0: 6.5, t1: 7.9, light: false, bg(g) {
    bgFill(g, PURPLE);
    const grd = g.createLinearGradient(0, 0, 0, VH);
    grd.addColorStop(0, 'rgba(216,227,43,0.10)');
    grd.addColorStop(1, 'rgba(0,0,0,0.30)');
    g.fillStyle = grd; g.fillRect(0, 0, VW, VH);
  }, ink(g, t) {
    for (let l = 0; l < 3; l++) {
      const speed = 160 + l * 120, y0 = 340 + l * 430, h = 230 - l * 40;
      g.save(); g.globalAlpha = 0.45 + l * 0.25;
      for (let i = 0; i < 14; i++) {
        const x = ((i * 92 - t * speed) % (VW + 240)) - 120;
        const bh = h * (0.35 + 0.65 * Math.abs(Math.sin(i * 1.7 + l)));
        g.fillStyle = l === 1 ? 'rgba(216,227,43,0.9)' : 'rgba(243,235,214,0.85)';
        rr(g, x, y0 - bh, 64, bh, 7); g.fill();
      }
      g.restore();
    }
    const sp = (t - this.t0) * 900;
    g.save(); g.globalAlpha = 0.10; g.strokeStyle = '#FFF'; g.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const x = ((i * 140 + sp) % (VW + 400)) - 200;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x - 220, VH); g.stroke();
    }
    g.restore();
    for (let i = 0; i < 56; i++) {
      const x = 40 + i * 18;
      const bh = 10 + 70 * Math.abs(Math.sin(t * 5 + i * 0.7));
      g.fillStyle = 'rgba(216,227,43,' + (0.25 + 0.5 * Math.abs(Math.sin(t * 3 + i))) + ')';
      g.fillRect(x, VH - 300 - bh, 10, bh);
    }
    brackets(g, 56, 'rgba(243,235,214,0.20)');
    text(g, 'DATA / ' + Math.floor(t * 240 % 9999).toString().padStart(4, '0'), 60, VH - 220, { size: 26, font: MONO, color: 'rgba(243,235,214,0.7)', spacing: 2 });
    text(g, 'PARALLAX ×3', VW - 60, 180, { size: 26, font: MONO, color: 'rgba(216,227,43,0.9)', align: 'right', spacing: 3 });
  } });

  /* ========== 07 三角群 ========== */
  S.push({ t0: 7.9, t1: 9.1, light: false, bg(g) { bgFill(g, BLUE); }, ink(g, t) {
    const cx = VW / 2, cy = VH / 2 - 60;
    const q = eOutBack(bt(t, this.t0, this.t0 + 0.5));
    for (let i = 0; i < 3; i++) {
      g.save(); g.globalAlpha = 0.16 + i * 0.06; g.setLineDash([8, 14]);
      g.strokeStyle = CREAM; g.lineWidth = 1.4;
      g.beginPath(); g.arc(cx, cy, 260 + i * 90, t * (0.3 + i * 0.2), TAU); g.stroke();
      g.restore();
    }
    brackets(g, 56, 'rgba(243,235,214,0.20)');
    g.save(); g.translate(cx, cy); g.rotate((t - this.t0) * 0.9);
    g.fillStyle = CREAM; g.beginPath();
    const R = 230 * q;
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + i * TAU / 3;
      const x = Math.cos(a) * R, y = Math.sin(a) * R;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath(); g.fill(); g.restore();
    [[300, 10, 1], [430, 16, -0.7]].forEach(([rad, n, dir]) => {
      for (let i = 0; i < n; i++) {
        const a = (TAU / n) * i + t * dir;
        const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad * 0.92;
        const sz = 12 + 8 * Math.sin(t * 4 + i);
        g.save(); g.translate(x, y); g.rotate(a * 2 + t);
        g.fillStyle = i % 3 === 0 ? GOLD_LT : (i % 3 === 1 ? 'rgba(243,235,214,0.85)' : 'rgba(200,65,43,0.9)');
        g.beginPath(); g.moveTo(0, -sz); g.lineTo(sz, sz * 0.7); g.lineTo(-sz, sz * 0.7); g.closePath(); g.fill();
        g.restore();
      }
    });
    g.save(); g.globalAlpha = 0.25; g.strokeStyle = CREAM; g.lineWidth = 1.4;
    for (let i = 0; i < 16; i++) {
      const a1 = (TAU / 16) * i - t * 0.7, a2 = (TAU / 16) * ((i + 5) % 16) - t * 0.7;
      g.beginPath();
      g.moveTo(cx + Math.cos(a1) * 430, cy + Math.sin(a1) * 395);
      g.lineTo(cx + Math.cos(a2) * 430, cy + Math.sin(a2) * 395);
      g.stroke();
    }
    g.restore();
    for (let i = 0; i < 12; i++) {
      const x = 60 + i * 86, y = 1560;
      const k = clamp((t - this.t0 - 0.3 - i * 0.03) / 0.25, 0, 1);
      if (k <= 0) continue;
      g.save(); g.translate(x, y); g.rotate(k * Math.PI);
      g.fillStyle = 'rgba(243,235,214,' + (0.25 + 0.6 * k) + ')';
      g.beginPath(); g.moveTo(0, -14); g.lineTo(13, 9); g.lineTo(-13, 9); g.closePath(); g.fill();
      g.restore();
    }
  } });

  /* ========== 08 同心圆 2D→3D ========== */
  S.push({ t0: 9.1, t1: 10.5, light: false, bg(g) { bgFill(g, INK); }, ink(g, t) {
    const cx = VW / 2, cy = VH / 2;
    const q = eInOut(bt(t, this.t0 + 0.15, this.t0 + 1.1));
    const F = 900;
    tickRing(g, VW / 2, VH / 2, 620, 72, 'rgba(245,238,220,0.12)', t * 0.15, 1.4);
    brackets(g, 56, 'rgba(245,238,220,0.18)');
    for (let ring = 1; ring <= 12; ring++) {
      const n = 10 + ring * 3, R0 = ring * 74, z0 = (ring - 1) * 120 * q;
      const sc = F / (F + z0);
      for (let i = 0; i < n; i++) {
        const a = (TAU / n) * i + ring * 0.2 + t * 0.35;
        const x = cx + Math.cos(a) * R0 * sc;
        const y = cy + Math.sin(a) * R0 * sc * (1 - 0.42 * q);
        const w = 0.5 + 0.5 * Math.sin(t * 4 - ring * 0.7 + i * 0.3);
        g.fillStyle = 'rgba(217,169,74,' + (0.20 + 0.65 * w) * (0.35 + 0.65 * sc) + ')';
        g.beginPath(); g.arc(x, y, (2.2 + 3.4 * w) * sc, 0, TAU); g.fill();
      }
    }
    g.save(); g.globalAlpha = q * 0.5; g.strokeStyle = 'rgba(232,199,122,0.8)'; g.lineWidth = 1.2;
    for (let k = 1; k <= 5; k++) {
      const ry = 300 * Math.sin(k * Math.PI / 6) * q;
      g.beginPath(); g.ellipse(cx, cy, 300 * q, Math.abs(ry) + 2, 0, 0, TAU); g.stroke();
    }
    for (let k = 0; k < 6; k++) {
      g.beginPath(); g.ellipse(cx, cy, Math.abs(300 * Math.cos(k * Math.PI / 6) * q) + 2, 300 * q, 0, 0, TAU); g.stroke();
    }
    g.restore();
    text(g, q > 0.5 ? 'Z-DEPTH ' + Math.round(q * 12) : 'FLAT 2D', 60, VH - 220, { size: 24, font: MONO, color: 'rgba(245,238,220,0.6)', spacing: 2 });
  } });

  /* ========== 09 贝塞尔带 ========== */
  S.push({ t0: 10.5, t1: 12.0, light: true, bg(g) { bgFill(g, LIME); }, ink(g, t) {
    brackets(g, 56, 'rgba(18,17,12,0.25)');
    for (let b = 0; b < 10; b++) {
      const ph = b * 0.7, amp = 220 + 90 * Math.sin(t * 3 + b), yBase = 180 + b * 160;
      g.save();
      g.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(t * 2 + b * 0.4));
      g.strokeStyle = b === 3 ? RED : (b % 2 ? 'rgba(18,17,12,0.9)' : 'rgba(18,17,12,0.62)');
      g.lineWidth = b === 3 ? 8 : 4;
      g.beginPath(); g.moveTo(-60, yBase);
      g.bezierCurveTo(VW * 0.3, yBase - amp * Math.sin(t * 2 + ph), VW * 0.7, yBase + amp * Math.cos(t * 1.7 + ph), VW + 60, yBase - 120 * Math.sin(t * 2.4 + ph));
      g.stroke(); g.restore();
      for (let k = 1; k < 5; k++) {
        const u = ((t * 0.6 + k / 5 + b * 0.13) % 1);
        g.fillStyle = 'rgba(18,17,12,' + (0.5 * (1 - u)) + ')';
        g.beginPath(); g.arc(u * VW, yBase + Math.sin(u * 6 + t * 3 + ph) * amp * 0.55, 5, 0, TAU); g.fill();
      }
    }
    g.save(); g.globalAlpha = 0.5; g.strokeStyle = INK; g.lineWidth = 2;
    for (let i = 0; i < 24; i++) {
      const x = 30 + i * 45;
      g.beginPath(); g.moveTo(x, VH - 260); g.lineTo(x, VH - 260 - (i % 4 === 0 ? 24 : 10)); g.stroke();
    }
    g.restore();
    g.save(); g.fillStyle = 'rgba(18,17,12,0.55)';
    for (let i = 0; i < 9; i++) { const x = 90 + i * 100, y = 300 + Math.sin(t * 2 + i) * 120; g.fillRect(x - 5, y - 5, 10, 10); }
    g.restore();
    text(g, 'CURVES / 8 · ' + Math.round(t * 40 % 99), 60, 160, { size: 26, font: MONO, color: 'rgba(18,17,12,0.65)', spacing: 3 });
  } });

  /* ========== 10 英文单词墙 ========== */
  const WORDS = ['CODE', 'MOTION', 'PIXEL', 'FRAME', 'RENDER', 'LOOP', 'VECTOR', 'TIMELINE'];
  S.push({ t0: 12.0, t1: 13.4, light: false, bg(g) { bgFill(g, RED); }, ink(g, t) {
    g.save(); g.beginPath(); g.rect(0, 0, VW, VH); g.clip();
    g.save(); g.globalAlpha = 0.10; g.translate(VW / 2, VH / 2); g.rotate(-0.18);
    text(g, 'SHOWREEL', 0, 0, { size: 300, weight: 900, font: MONO, color: CREAM, align: 'center' });
    g.restore();
    brackets(g, 56, 'rgba(243,235,214,0.22)');
    for (let row = 0; row < 9; row++) {
      const dir = row % 2 ? 1 : -1;
      const size = 120 + (row % 3) * 40;
      const y = 170 + row * 200;
      const speed = 300 + row * 60;
      const off = ((t - this.t0) * speed * dir) % 700;
      for (let c = -1; c < 6; c++) {
        const w = WORDS[(row * 3 + c + 8) % WORDS.length];
        const x = c * 700 + off;
        const pulse = 1 + 0.10 * Math.sin(t * 7 + row + c);
        const rot = 0.05 * Math.sin(t * 3 + c);
        g.save(); g.translate(x + 200, y - 40); g.rotate(rot); g.scale(pulse, pulse);
        text(g, w, -200, 40, { size, weight: 900, font: MONO, color: (row + c) % 3 === 0 ? 'rgba(18,17,12,0.85)' : CREAM, spacing: 2 });
        g.restore();
      }
    }
    g.restore();
  } });

  /* ========== 11 三带 ribbon ========== */
  S.push({ t0: 13.4, t1: 15.0, light: false, bg(g) { bgFill(g, INK); }, ink(g, t) {
    // Mimo V2：缎带默认铺满全宽（11:22 左侧有内容），人物 13.07 到场前 0.12s 开始让位
    const mv = clamp((t - 12.95) / 0.18, 0, 1);
    const RX0 = 40 + (560 - 40) * mv, RW = VW - 40 - RX0;
    brackets(g, 56, 'rgba(245,238,220,0.18)');
    for (let b = 0; b < 4; b++) {
      const base = VH / 2 + (b - 1.5) * 220, amp = 130 - b * 16;
      const pts = [];
      for (let i = 0; i <= 60; i++) {
        const u = i / 60, x = RX0 + u * RW;
        const y = base + Math.sin(u * 7 + t * 3.2 + b * 1.1) * amp + Math.sin(u * 17 - t * 4.4 + b) * amp * 0.28;
        pts.push([x, y]);
      }
      g.save(); g.beginPath();
      pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
      for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i][0], pts[i][1] + 46);
      g.closePath();
      g.fillStyle = b === 1 ? 'rgba(217,169,74,0.22)' : 'rgba(245,238,220,0.10)';
      g.fill(); g.restore();
      g.save(); g.strokeStyle = b === 1 ? GOLD_LT : 'rgba(245,238,220,0.75)'; g.lineWidth = b === 1 ? 5 : 2.6;
      g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); g.restore();
      const u = (t * 0.35 + b * 0.3) % 1, ni = Math.floor(u * 60);
      if (pts[ni]) {
        g.fillStyle = b === 1 ? GOLD_LT : 'rgba(245,238,220,0.9)';
        g.beginPath(); g.arc(pts[ni][0], pts[ni][1], 8, 0, TAU); g.fill();
      }
    }
    g.save(); g.globalAlpha = 0.35; g.strokeStyle = 'rgba(245,238,220,0.9)'; g.lineWidth = 1.4;
    for (let i = 0; i < 16; i++) {
      const x = RX0 + i * 30;
      g.beginPath(); g.moveTo(x, 260); g.lineTo(x, 260 + (i % 5 === 0 ? 26 : 11)); g.stroke();
    }
    g.restore();
    text(g, 'SIGNAL / 3 LAYERS', VW - 60, VH - 210, { size: 24, font: MONO, color: 'rgba(245,238,220,0.6)', spacing: 3, align: 'right' });
  } });

  /* ========== 12 落版 ========== */
  S.push({ t0: 15.0, t1: DUR + 0.2, light: false, bg(g) {
    bgFill(g, RED);
    g.save(); g.globalAlpha = 0.10; g.strokeStyle = '#000'; g.lineWidth = 1;
    for (let x = 0; x < VW; x += 30) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, VH); g.stroke(); }
    for (let y = 0; y < VH; y += 30) { g.beginPath(); g.moveTo(0, y); g.lineTo(VW, y); g.stroke(); }
    g.restore();
  }, ink(g, t) {
    // B（Mimo）：此幕全程在数字人回归后，JACK 落版块整体右移缩小，x 0–560 留空给人物
    const baseY = VH / 2 + 30, BX = 575;
    'JACK'.split('').forEach((ch, i) => {
      const q = eOutBack(clamp((t - (this.t0 + 0.05 + i * 0.07)) / 0.35, 0, 1));
      if (q <= 0) return;
      g.save();
      g.globalAlpha = clamp((t - (this.t0 + 0.05 + i * 0.07)) / 0.2, 0, 1);
      text(g, ch, BX + i * 126, baseY + (1 - q) * 120, { size: 150, weight: 900, font: SANS, color: CREAM });
      g.restore();
    });
    const lq = eOutQuart(bt(t, this.t0 + 0.35, this.t0 + 0.85));
    g.fillStyle = CREAM; g.fillRect(BX - 4, baseY + 46, 470 * lq, 5);
    g.save(); g.globalAlpha = bt(t, this.t0 + 0.5, this.t0 + 0.9);
    text(g, 'MOTION MADE OF CODE', BX, baseY + 106, { size: 24, weight: 700, font: MONO, color: 'rgba(243,235,214,0.9)', spacing: 6 });
    text(g, '用代码做视频', BX, baseY + 150, { size: 24, color: 'rgba(243,235,214,0.62)', spacing: 6 });
    g.restore();
  } });

  /* ---------------- HUD + 运动模糊 ---------------- */
  function hud(g, t, idx) {
    const light = S[idx].light;
    const col = light ? 'rgba(18,17,12,0.55)' : 'rgba(245,238,220,0.55)';
    text(g, 'JACK · MOTION MADE OF CODE', 44, 68, { size: 17, font: MONO, color: col, spacing: 2 });
    text(g, '00:' + String(Math.floor(t)).padStart(2, '0') + '.' + String(Math.floor((t % 1) * 10)), VW - 44, 68, { size: 17, font: MONO, color: col, align: 'right' });
    text(g, 'CODE ONLY · NO TEMPLATE', 44, VH - 44, { size: 17, font: MONO, color: col, spacing: 2 });
    text(g, 'SCENE ' + String(idx + 1).padStart(2, '0') + '/' + String(S.length).padStart(2, '0'), VW - 44, VH - 44, { size: 17, font: MONO, color: col, align: 'right' });
    g.save();
    g.fillStyle = light ? 'rgba(18,17,12,0.18)' : 'rgba(245,238,220,0.18)';
    g.fillRect(44, VH - 92, VW - 88, 2);
    g.fillStyle = light ? 'rgba(18,17,12,0.6)' : GOLD;
    g.fillRect(44, VH - 92, (VW - 88) * (t / DUR), 2);
    g.restore();
  }

  function drawOpen(g, t) {
    t = clamp(t, 0, DUR);
    let idx = S.findIndex(s => t >= s.t0 && t < s.t1);
    if (idx < 0) idx = S.length - 1;
    const sc = S[idx];
    sc.bg(g, t);
    for (let i = 2; i >= 1; i--) {
      g.save(); g.globalAlpha = i === 1 ? 0.30 : 0.15;
      sc.ink(g, t - i * 0.016, idx);
      g.restore();
    }
    g.save(); g.globalAlpha = 1;
    sc.ink(g, t, idx);
    g.restore();
    hud(g, t, idx);
  }

  const BADGE = { cx: 930, cy: 1620, r: 96 };
  const MOVE_DUR = 1.05;
  function personOverlay(g, t) {
    const img = window.__PERSON;
    if (!img) return;
    const IW = img.naturalWidth, IH = img.naturalHeight;
    const fullH = 1080, sFull = fullH / IH;
    const headX = 221, headY = 206;
    const bodyX = 256, bodyTop = 1540 - fullH;
    const hx0 = bodyX - IW * sFull / 2 + headX * sFull;
    const hy0 = bodyTop + headY * sFull;

    const k = clamp((t - SHRINK_AT) / MOVE_DUR, 0, 1);
    if (k <= 0) {
      g.drawImage(img, bodyX - IW * sFull / 2, bodyTop, IW * sFull, fullH);
      return;
    }
    const e = eInOut(k);

    // ① 身体：前 35% 淡出
    const bodyAlpha = 1 - clamp(k / 0.35, 0, 1);
    if (bodyAlpha > 0) {
      g.save(); g.globalAlpha = bodyAlpha;
      g.drawImage(img, bodyX - IW * sFull / 2, bodyTop, IW * sFull, fullH);
      g.restore();
    }

    // ② 目的地先亮一个接环
    const ringK = eOutBack(clamp(k / 0.45, 0, 1));
    g.save();
    g.strokeStyle = 'rgba(217,169,74,' + (0.25 + 0.75 * ringK) + ')';
    g.lineWidth = 3 + 2 * ringK;
    g.beginPath(); g.arc(BADGE.cx, BADGE.cy, BADGE.r * (0.4 + 0.6 * ringK), 0, TAU); g.stroke();
    g.restore();

    // ③ 头像沿弧线飞过去（带两帧拖影）
    const arc = Math.sin(e * Math.PI) * 180;
    const px = lerp(hx0, BADGE.cx, e);
    const py = lerp(hy0, BADGE.cy, e) - arc;
    const sHead = 0.80 * (1 + 0.06 * Math.sin(e * Math.PI));
    const rHead = BADGE.r * (0.55 + 0.45 * eInOut(clamp(k / 0.6, 0, 1)));
    for (let i = 2; i >= 1; i--) {
      const ee = eInOut(clamp(k - i * 0.06, 0, 1));
      const ax = lerp(hx0, BADGE.cx, ee);
      const ay = lerp(hy0, BADGE.cy, ee) - Math.sin(ee * Math.PI) * 180;
      g.save(); g.globalAlpha = i === 1 ? 0.22 : 0.10;
      g.beginPath(); g.arc(ax, ay, rHead, 0, TAU); g.clip();
      g.drawImage(img, ax - headX * sHead, ay - headY * sHead, IW * sHead, IH * sHead);
      g.restore();
    }
    g.save();
    g.beginPath(); g.arc(px, py, rHead, 0, TAU);
    g.fillStyle = '#0A0A08'; g.fill(); g.clip();
    g.drawImage(img, px - headX * sHead, py - headY * sHead, IW * sHead, IH * sHead);
    g.restore();
    g.save();
    g.strokeStyle = GOLD; g.lineWidth = 4;
    g.beginPath(); g.arc(px, py, rHead, 0, TAU); g.stroke();
    g.restore();
    if (k > 0.86) {
      g.save(); g.globalAlpha = (k - 0.86) / 0.14;
      text(g, 'JACK', BADGE.cx, BADGE.cy + BADGE.r + 34, { size: 22, weight: 700, font: MONO, color: 'rgba(245,238,220,0.8)', align: 'center', spacing: 4 });
      g.restore();
    }
  }

  /* ---------- 把 12 幕切点吸附到音乐的真实拍网格 ---------- */
  // V2 修正（审片「没踩到重拍」）：旧网格用 总长/32 当拍长、且没算 BGM 起播偏移——
  // 与真实音乐的拍错开 0.1~0.36s。真实情况：BGM 126.5BPM（拍 60/126.5），从影片 0.35s 起播。
  const BEAT_GRID = [2, 5, 8, 10, 12, 15, 17, 20, 23, 25, 28, 32];
  const BEAT = 60 / 126.5;
  const BGM_T0 = 0.35;
  S.forEach((sc, i) => {
    sc.t0 = i === 0 ? 0 : BGM_T0 + BEAT * BEAT_GRID[i - 1];
    sc.t1 = i === S.length - 1 ? DUR + 0.2 : BGM_T0 + BEAT * BEAT_GRID[i];
  });

  /* 每一拍打一下：整屏极淡的白闪 + 四角短刻度，让画面跟拍 */
  function beatPulse(g, t) {
    const n = (t - BGM_T0) / BEAT;
    const ph = n - Math.floor(n);
    const k = Math.exp(-ph * 9);                 // 拍点处最强，快速衰减
    if (k < 0.02) return;
    g.save();
    g.globalAlpha = 0.085 * k;
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, VW, VH);
    g.globalAlpha = 0.5 * k;
    g.strokeStyle = GOLD_LT; g.lineWidth = 2;
    const sl = 26 + 26 * (1 - k);
    [[30, 30, 1, 1], [VW - 30, 30, -1, 1], [30, VH - 30, 1, -1], [VW - 30, VH - 30, -1, -1]].forEach(([x, y, dx, dy]) => {
      g.beginPath(); g.moveTo(x + dx * sl, y); g.lineTo(x, y); g.lineTo(x, y + dy * sl); g.stroke();
    });
    g.restore();
  }

  window.drawOpen = drawOpen;
  window.drawOpenFull = (g, t) => { drawOpen(g, t); personOverlay(g, t); };
  window.OPEN_DUR = DUR;
})();
