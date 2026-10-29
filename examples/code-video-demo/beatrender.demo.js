const RED_LOCAL = "#C8412B";
/*
 * beatrender.js — 按"台词"驱动的画面引擎
 *
 * 规则（用户口径）：
 *   1. 每句台词 = 一个 beat，必须有一个"主元素"出场抢焦点
 *   2. 主元素用 8 种手法之一出场，相邻 beat 不复用同一种
 *   3. 已出场的元素退为背景（压暗 30%），不再抢焦点
 *   4. 画面永远有东西在动，但只有主元素在"抢"
 */
(function () {
  const L = window.LIB;
  const { text, rr, clamp, lerp, eOut, eOutQuart, eInOut } = L;
  const VW = 1080, VH = 1920;
  const INK = '#12110C', GOLD = '#D9A94A', GOLD_LT = '#E8C77A', CREAM = '#F3EBD6', RED = '#C8412B';
  const BROWN = '#3A3226';   // 暖纸底上的正文色（与 film_v4.js 的 BROWN 同值）
  const MONO = 'B612', SERIF = 'SerifSC';
  const TAU = Math.PI * 2;
  const bt = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

  /* ---------- 8 种出场手法（相邻 beat 不复用） ---------- */
  /* 把一句切成 n 个事件：返回 {i, p}（i=第几个事件，p=事件内 0..1） */
  function evOf(pt, n) {
    const x = clamp(pt, 0, 0.9999) * n;
    const i = Math.floor(x);
    return { i: Math.min(n - 1, i), p: x - i };
  }
  function eElastic(p) { return p <= 0 ? 0 : p >= 1 ? 1 : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * (TAU / 3)) + 1; }

  const MOTION = {
    // 0 上滑（从下方顶上来，过冲）
    up(g, x, y, w, h, p, draw) {
      g.save(); g.translate(0, (1 - eElastic(p)) * (h + 120)); draw(g); g.restore();
    },
    // 1 擦除（从左拉开）
    wipe(g, x, y, w, h, p, draw) {
      g.save(); g.beginPath(); g.rect(x - 4, y - 4, (w + 8) * eOutQuart(p), h + 8); g.clip(); draw(g); g.restore();
    },
    // 2 变形（从一个小圆长成卡片形状）
    morph(g, x, y, w, h, p, draw) {
      const k = eOutQuart(p), cw = lerp(w * 0.16, w, k), ch = lerp(h * 0.16, h, k);
      const cx = x + w / 2, cy = y + h / 2, rad = lerp(Math.min(w, h) * 0.08, 18, k);
      g.save(); g.beginPath(); rr(g, cx - cw / 2, cy - ch / 2, cw, ch, rad); g.clip(); draw(g); g.restore();
    },
    // 3 分揭（上下分开露出）
    split(g, x, y, w, h, p, draw) {
      const k = eOutQuart(p) * h / 2 + 2;
      g.save(); g.beginPath(); g.rect(x - 4, y + h / 2 - k, w + 8, k * 2); g.clip(); draw(g); g.restore();
    },
    // 4 路径生长（描边先走一圈，再填内容）
    drawPath(g, x, y, w, h, p, draw) {
      const k = eOutQuart(p);
      if (k < 1) {
        g.save(); g.strokeStyle = GOLD; g.lineWidth = 3; g.setLineDash([w * 2 + h * 2]);
        g.lineDashOffset = (w * 2 + h * 2) * (1 - k);
        rr(g, x, y, w, h, 18); g.stroke(); g.restore();
        if (k < 0.75) return;
      }
      g.save(); g.globalAlpha = clamp((k - 0.7) / 0.3, 0, 1); draw(g); g.restore();
    },
    // 5 掉落（从上方砸下，压扁回弹）
    drop(g, x, y, w, h, p, draw) {
      const e = eElastic(clamp(p * 1.15, 0, 1));
      g.save();
      g.translate(0, -(1 - e) * 420);
      const sq = 1 + 0.06 * Math.sin(clamp((p - 0.75) / 0.25, 0, 1) * Math.PI);
      g.translate(x + w / 2, y + h); g.scale(1 / sq, sq); g.translate(-(x + w / 2), -(y + h));
      draw(g); g.restore();
    },
    // 6 侧滑（从右往左推进）
    slideIn(g, x, y, w, h, p, draw) {
      g.save(); g.translate((1 - eOutQuart(p)) * (w + 260), 0); draw(g); g.restore();
    },
    // 7 逐字打出（文字专用：内容自己画，这里只给透明度阶梯）
    typeIn(g, x, y, w, h, p, draw) {
      g.save(); draw(g, p); g.restore();
    }
  };

  /* 颜色/状态：主元素高亮，退场元素压暗 */
  function dim(g, k) { g.save(); g.globalAlpha = 0.42 + 0.58 * k; }

  /* ---------------- 视觉原件 ---------------- */
  /* 大标题字 */
  function visTitle(s) {
    return (g, t, p) => {
      const chars = Array.from(s);
      const show = Math.ceil(chars.length * clamp(p * 1.4, 0, 1));
      const hi = Math.floor(t / 0.45) % Math.max(1, chars.length);   // 每 0.45s 换一个字被点亮
      let x = 120;
      chars.forEach((c, i) => {
        if (i >= show) return;
        const w = g.measureText ? 0 : 0;
        const bob = Math.sin(t * 5.5 + i * 0.9) * 7;
        const sc = i === hi ? 1.10 : 1.0;
        const cy = 760 + bob;
        g.save();
        g.translate(x + 48, cy - 34); g.scale(sc, sc); g.translate(-(x + 48), -(cy - 34));
        text(g, c, x, cy, { size: 96, weight: 700, font: SERIF, color: i === hi ? GOLD_LT : CREAM });
        g.restore();
        x += 96 * 1.02;
      });
      // 下划线一直扫
      g.fillStyle = GOLD;
      g.fillRect(120, 812, 520 * eOutQuart(p) * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 3))), 6);
    };
  }
  /* 三列对比 */
  function visThreeCols() {
    return (g, t, p) => {
      const cols = [['对比', ['A', 'B']], ['因果', ['因', '果']], ['流程', ['1', '2', '3']]];
      cols.forEach(([name, items], i) => {
        const x = 130 + i * 300;
        const q = clamp((p - i * 0.18) / 0.5, 0, 1);
        if (q <= 0) return;
        text(g, name, x, 520 + (1 - eOutQuart(q)) * 40, { size: 34, weight: 600, font: SERIF, color: GOLD });
        items.forEach((it, k) => {
          const qq = clamp((q - 0.2 - k * 0.12) / 0.4, 0, 1);
          if (qq <= 0) return;
          g.save(); g.globalAlpha = qq;
          g.strokeStyle = 'rgba(245,238,220,0.75)'; g.lineWidth = 2;
          const dy = Math.sin(t * 3.4 + i * 1.1 + k * 0.7) * 6;
          rr(g, x, 570 + k * 96 + dy, 240, 72, 10); g.stroke();
          text(g, it, x + 120, 620 + k * 96 + dy, { size: 30, weight: 600, font: SERIF, color: CREAM, align: 'center' });
          g.restore();
        });
      });
    };
  }
  /* 因果链 */
  function visChain(labels) {
    return (g, t, p) => {
      const n = labels.length;
      for (let i = 0; i < n; i++) {
        const q = clamp((p - i * 0.16) / 0.42, 0, 1);
        if (q <= 0) continue;
        const x = 200 + i * (680 / Math.max(1, n - 1)), y = 760;
        const k = eElastic(q);
        g.save();
        g.fillStyle = i === n - 1 ? GOLD : 'rgba(217,169,74,0.18)';
        g.strokeStyle = GOLD; g.lineWidth = 2.4;
        g.beginPath(); g.arc(x, y + Math.sin(t * 3 + i) * 5, 64 * k * (1 + 0.035 * Math.sin(t * 4 + i * 1.3)), 0, TAU); g.fill(); g.stroke();
        text(g, labels[i], x, y + 9, { size: 26, weight: 600, font: SERIF, color: i === n - 1 ? INK : CREAM, align: 'center' });
        g.restore();
        if (i < n - 1) {
          const lq = clamp((p - i * 0.16 - 0.3) / 0.4, 0, 1);
          if (lq > 0) {
            g.strokeStyle = GOLD; g.lineWidth = 3;
            g.beginPath(); g.moveTo(x + 68, y); g.lineTo(x + 68 + (680 / (n - 1) - 136) * lq, y); g.stroke();
          }
        }
      }
    };
  }
  /* 二选一分叉 */
  function visChoice() {
    return (g, t, p) => {
      const cx = 540, cy0 = 620;
      const q = eOutQuart(clamp(p / 0.45, 0, 1));
      // 分叉线：一直在"生长-回收"地呼吸
      const br = 0.82 + 0.18 * Math.sin(t * 2.6);
      g.save(); g.strokeStyle = GOLD; g.lineWidth = 3; g.lineCap = 'round';
      [-1, 1].forEach(dir => {
        g.beginPath(); g.moveTo(cx, cy0);
        g.lineTo(cx + dir * 230 * q * br, cy0 + 200 * q * br); g.stroke();
      });
      g.restore();
      // 顶上那个"选择"的点
      g.save();
      g.fillStyle = GOLD_LT;
      g.beginPath(); g.arc(cx, cy0, 10 + 4 * Math.sin(t * 5), 0, TAU); g.fill();
      g.restore();
      // 两个选项：交替被强调（每 0.9s 换一个）
      const hot = Math.floor(t / 0.9) % 2;
      [['选 A', -1], ['选 B', 1]].forEach(([s2, dir], i) => {
        const qq = clamp((p - 0.4 - i * 0.1) / 0.4, 0, 1);
        if (qq <= 0) return;
        const x = cx + dir * 230 * br, y = cy0 + 200 * br + Math.sin(t * 2.2 + i * 1.6) * 6;
        const on = i === hot;
        g.save(); g.globalAlpha = clamp(qq * 1.6, 0, 1);
        g.fillStyle = on ? 'rgba(217,169,74,0.30)' : 'rgba(217,169,74,0.08)';
        rr(g, x - 110, y, 220, 110, 14); g.fill();
        g.strokeStyle = on ? GOLD_LT : 'rgba(217,169,74,0.55)'; g.lineWidth = on ? 3 : 2;
        rr(g, x - 110, y, 220, 110, 14); g.stroke();
        text(g, s2, x, y + 66, { size: 40, weight: 700, font: SERIF, color: on ? CREAM : 'rgba(245,238,220,0.6)', align: 'center' });
        g.restore();
      });
    };
  }
  /* 四宫格 */
  function visQuad(cells) {
    return (g, t, p) => {
      cells.forEach(([a, b], i) => {
        const q = clamp((p - i * 0.14) / 0.42, 0, 1);
        if (q <= 0) return;
        const x = 110 + (i % 2) * 450, y = 480 + Math.floor(i / 2) * 440;
        const k = eElastic(q);
        g.save(); g.globalAlpha = clamp(q * 1.5, 0, 1);
        g.translate(x + 200, y + 200); g.scale(k, k); g.translate(-(x + 200), -(y + 200));
        const fy = Math.sin(t * 2.2 + i * 1.4) * 8;
        g.fillStyle = 'rgba(217,169,74,0.07)'; rr(g, x, y + fy, 400, 400, 20); g.fill();
        g.strokeStyle = 'rgba(217,169,74,' + (0.30 + 0.25 * (0.5 + 0.5 * Math.sin(t * 3 + i))) + ')'; g.lineWidth = 1.8; rr(g, x, y + fy, 400, 400, 20); g.stroke();
        text(g, a, x + 200, y + 170, { size: 56, weight: 600, font: SERIF, color: CREAM, align: 'center', spacing: 3 });
        text(g, b, x + 200, y + 240, { size: 28, color: 'rgba(245,238,220,0.55)', align: 'center' });
        g.restore();
      });
    };
  }
  /* 时间轴 + 字幕块 */
  function visTimeline() {
    return (g, t, p) => {
      const x0 = 110, w = 860, y = 760;
      const q = eOutQuart(p);
      g.save(); g.strokeStyle = 'rgba(245,238,220,0.5)'; g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w * q, y); g.stroke();
      for (let i = 0; i <= 12; i++) {
        g.beginPath(); g.moveTo(x0 + (w / 12) * i, y - 12); g.lineTo(x0 + (w / 12) * i, y + 12); g.stroke();
      }
      // 字幕块
      for (let i = 0; i < 14; i++) {
        const qq = clamp((p - 0.25 - i * 0.03) / 0.3, 0, 1);
        if (qq <= 0) continue;
        const bw = 40 + (i % 3) * 22;
        g.fillStyle = i % 4 === 0 ? GOLD : 'rgba(245,238,220,0.35)';
        const flow = Math.sin(t * 2 + i * 0.6) * 8;
        rr(g, x0 + (w / 14) * i + 6 + flow, y - 46, bw * qq, 26, 6); g.fill();
      }
      g.restore();
    };
  }


  /* ===== v011：四个事件，依次占满 5.5 秒 =====
     e0 两列长出来 → e1 链从左连到右 → e2 流程三块立起 → e3 虚线框圈住三者 */
  function visTriDiagrams() {
    return (g, t, pt) => {
      const y = 900;
      const { i, p } = evOf(pt, 4);
      const e = 0.06 + 0.94 * p;   // 线性生长，整段都在变
      g.lineCap = 'round';
      // e0 两列
      const sx = 130;
      if (i >= 0) {
        const k = i === 0 ? e : 1;
        g.strokeStyle = GOLD; g.lineWidth = 3;
        const h1 = 230 * k, h2 = 150 * k;
        if (h1 > 1) { rr(g, sx, y - h1, 92, h1, 8); g.stroke(); }
        if (h2 > 1) { rr(g, sx + 116, y - h2, 92, h2, 8); g.stroke(); }
        // 底座
        if (k > 0.6) { g.beginPath(); g.moveTo(sx - 10, y); g.lineTo(sx + 220, y); g.stroke(); }
      }
      // e1 一条链
      if (i >= 1) {
        const k = i === 1 ? e : 1;
        const xs = [430, 530, 630];
        g.strokeStyle = GOLD; g.lineWidth = 3;
        g.beginPath(); g.moveTo(xs[0], y - 110); g.lineTo(lerp(xs[0], xs[2], k), y - 110); g.stroke();
        for (let j = 0; j < 3; j++) {
          if (k * 3 <= j + 0.15) continue;
          g.beginPath(); g.arc(xs[j], y - 110, 22, 0, TAU); g.stroke();
        }
      }
      // e2 流程三块
      if (i >= 2) {
        const k = i === 2 ? e : 1;
        for (let j = 0; j < 3; j++) {
          const q = clamp(k * 3 - j * 0.6, 0, 1);
          if (q <= 0) continue;
          g.strokeStyle = GOLD; g.lineWidth = 3;
          rr(g, 740 + j * 90, y - 150 + (1 - q) * 40, 64, 64, 8); g.stroke();
          if (j < 2 && q > 0.6) {
            g.beginPath(); g.moveTo(740 + j * 90 + 70, y - 118); g.lineTo(740 + j * 90 + 86, y - 118); g.stroke();
          }
        }
      }
      // e3 虚线框把它们圈住（并在框内扫一道光）
      if (i >= 3) {
        const k = e;
        g.save();
        g.strokeStyle = 'rgba(232,199,122,' + (0.9 * k) + ')';
        g.lineWidth = 3; g.setLineDash([16, 12]); g.lineDashOffset = -60 * k;
        rr(g, 100, y - 300, 940, 380, 28); g.stroke();
        g.restore();
        g.save();
        const sx2 = 100 + 940 * ((p * 2) % 1);
        const grd = g.createLinearGradient(sx2 - 120, 0, sx2, 0);
        grd.addColorStop(0, 'rgba(232,199,122,0)');
        grd.addColorStop(1, 'rgba(232,199,122,0.35)');
        g.fillStyle = grd; g.fillRect(sx2 - 120, y - 300, 120, 380);
        g.restore();
      }
    };
  }

  /* ===== v012：三个图形飞进容器，容器最后合上（1.2s 内连续） ===== */
  function visCollect() {
    return (g, t, pt) => {
      const cx = 540, cy = 950, box = 230;
      g.save(); g.strokeStyle = GOLD; g.lineWidth = 3;
      rr(g, cx - box / 2, cy - box / 2, box, box, 24); g.stroke(); g.restore();
      for (let j = 0; j < 3; j++) {
        const q = clamp((pt - j * 0.14) / 0.55, 0, 1);
        if (q <= 0) continue;
        const from = [[160, 760], [540, 700], [920, 760]][j];
        const x = lerp(from[0], cx - 50 + j * 50, eInOut(q));
        const yy = lerp(from[1], cy + 10, eInOut(q));
        const sz = lerp(70, 22, eInOut(q));
        g.save(); g.globalAlpha = 1 - q * 0.5;
        g.strokeStyle = 'rgba(245,238,220,0.9)'; g.lineWidth = 2.6;
        rr(g, x - sz / 2, yy - sz / 2, sz, sz, 8); g.stroke(); g.restore();
      }
      const k = clamp((pt - 0.72) / 0.28, 0, 1);
      if (k > 0) {
        g.save();
        g.strokeStyle = 'rgba(232,199,122,' + (0.95 * (1 - k)) + ')';
        g.lineWidth = 10 * (1 - k) + 1;
        rr(g, cx - box / 2 - 10 * k, cy - box / 2 - 10 * k, box + 20 * k, box + 20 * k, 26); g.stroke();
        g.restore();
      }
    };
  }

  /* ===== v013：画面被劈开 + 两边各长出符号（1.4s） ===== */
  function visSplit() {
    return (g, t, pt) => {
      const k = eOutQuart(clamp(pt / 0.45, 0, 1));
      const k2 = clamp((pt - 0.45) / 0.55, 0, 1);
      const half = VW / 2 * k;
      g.save();
      g.fillStyle = 'rgba(243,235,214,0.94)'; g.fillRect(VW / 2 - half, 260, half, 1000);
      g.fillStyle = 'rgba(18,17,12,0.97)'; g.fillRect(VW / 2, 260, half, 1000);
      g.strokeStyle = GOLD; g.lineWidth = 4;
      g.beginPath(); g.moveTo(VW / 2, 260); g.lineTo(VW / 2, 1260); g.stroke();
      g.restore();
      if (k2 > 0) {
        const a = eOutQuart(k2);
        g.save(); g.globalAlpha = a;
        // 左：人形（圆 + 肩线）
        g.strokeStyle = '#3A3226'; g.lineWidth = 4;
        g.beginPath(); g.arc(VW / 2 - 170, 640, 46 * a, 0, TAU); g.stroke();
        g.beginPath(); g.moveTo(VW / 2 - 250, 800); g.lineTo(VW / 2 - 90, 800); g.stroke();
        // 右：3×3 方格阵
        g.strokeStyle = GOLD;
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
          const q = clamp((k2 - (r + c) * 0.05) / 0.4, 0, 1);
          if (q <= 0) continue;
          g.strokeRect(VW / 2 + 60 + c * 58, 560 + r * 58, 44 * q, 44 * q);
        }
        g.restore();
      }
    };
  }

  /* ===== v014：曲线画出 → 三个"换刺激"点依次顶起（4s） ===== */
  function visAttention() {
    return (g, t, pt) => {
      const x0 = 110, w = 860, base = 1060, amp = 300;
      const draw = eOutQuart(clamp(pt / 0.3, 0, 1));
      g.save(); g.strokeStyle = 'rgba(245,238,220,0.22)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x0, base); g.lineTo(x0 + w, base); g.stroke(); g.restore();
      g.save(); g.strokeStyle = GOLD; g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath();
      const N = 180;
      for (let i2 = 0; i2 <= N; i2++) {
        const u = i2 / N;
        if (u > draw) break;
        const v = Math.exp(-((u * 3.4) % 1) * 3.4);
        const x = x0 + u * w, yy = base - v * amp;
        i2 ? g.lineTo(x, yy) : g.moveTo(x, yy);
      }
      g.stroke(); g.restore();
      // 沿曲线跑的亮点（注意力在衰减/被重置，整句一直在走）
      {
        const head = ((t * 0.30) % 1);
        const v = Math.exp(-((head * 3.4) % 1) * 3.4);
        const hx = x0 + head * w, hy = base - v * amp;
        g.save();
        g.fillStyle = RED_LOCAL; g.shadowColor = RED_LOCAL; g.shadowBlur = 22;
        g.beginPath(); g.arc(hx, hy, 9, 0, TAU); g.fill();
        g.restore();
      }
      // 三个重置点：随句子推进依次"顶一下"
      for (let j = 0; j < 3; j++) {
        const t0 = 0.3 + j * 0.22;
        if (pt < t0) continue;
        const pulse = Math.max(0, 1 - (pt - t0) / 0.18);
        const x = x0 + (j / 3.4) * w;
        g.save();
        g.strokeStyle = 'rgba(232,199,122,' + (0.4 + 0.6 * pulse) + ')';
        g.lineWidth = 3 + 4 * pulse;
        g.beginPath(); g.moveTo(x, base - amp - 40 * pulse); g.lineTo(x, base + 10); g.stroke();
        g.restore();
      }
    };
  }

  /* ===== v015：一路分两叉 → 两个方框长出 → 交替亮（4.4s） ===== */
  function visFork() {
    return (g, t, pt) => {
      const { i, p } = evOf(pt, 2);
      const cx = 540, y0 = 760, y1 = 1120;
      const q = eOutQuart(i >= 1 ? 1 : p);
      const hot = i >= 1 ? (Math.floor(p * 4) % 2) : -1;
      [-1, 1].forEach((dir, idx) => {
        const on = idx === hot;
        g.save();
        g.strokeStyle = on ? GOLD_LT : 'rgba(217,169,74,0.4)';
        g.lineWidth = on ? 7 : 3;
        g.beginPath(); g.moveTo(cx, y0); g.lineTo(cx + dir * 230 * q, y1); g.stroke();
        g.restore();
        const bq = clamp((q - 0.55) / 0.45, 0, 1);
        if (bq > 0) {
          const bx = cx + dir * 230;
          g.save();
          g.strokeStyle = on ? GOLD_LT : 'rgba(217,169,74,0.45)';
          g.lineWidth = on ? 4 : 2.5;
          rr(g, bx - 95, y1 + 20, 190, 160 * bq, 16); g.stroke();
          if (bq > 0.6) {
            g.globalAlpha = on ? 1 : 0.5;
            if (idx === 0) { g.beginPath(); g.moveTo(bx, y1 + 70); g.lineTo(bx + 44, y1 + 140); g.lineTo(bx - 44, y1 + 140); g.closePath(); g.stroke(); }
            else { g.beginPath(); g.arc(bx, y1 + 105, 40, 0, TAU); g.stroke(); }
          }
          g.restore();
        }
      });
      // 决定沿当前选中的分支跑过去：0.9s 一轮，跑完在方框处闪一下
      if (q > 0.5) {
        const dir = hot === 0 ? -1 : 1;
        const run = ((t * 1.1) % 1);
        const px = cx + dir * 230 * run * q;
        const py = y0 + (y1 - y0) * run * q;
        g.save();
        g.fillStyle = GOLD_LT; g.shadowColor = GOLD; g.shadowBlur = 18;
        g.beginPath(); g.arc(px, py, 8, 0, TAU); g.fill();
        g.restore();
      }
      g.save(); g.fillStyle = GOLD_LT;
      g.beginPath(); g.arc(cx, y0, 15, 0, TAU); g.fill(); g.restore();
    };
  }

  /* ===== v006：四件东西依次"长"出来（画面/动效/配乐/字幕） ===== */
  function visFourIcons() {
    return (g, t, pt) => {
      const { i, p } = evOf(pt, 4);
      const base = [[180, 780], [430, 780], [680, 780], [930, 780]];
      const e = 0.08 + 0.92 * p;
      for (let j = 0; j < 4; j++) {
        if (j > i) continue;
        const k = j < i ? 1 : e;
        const [x, y] = base[j];
        g.save(); g.strokeStyle = j === i ? GOLD_LT : 'rgba(217,169,74,0.65)'; g.lineWidth = 3;
        if (j === 0) { rr(g, x - 50, y - 50 * k, 100, 100 * k, 10); g.stroke(); if (k > 0.7) { g.beginPath(); g.moveTo(x - 34, y + 20); g.lineTo(x + 34, y + 20); g.stroke(); } }
        if (j === 1) { g.beginPath(); g.moveTo(x - 40, y + 30); g.lineTo(x - 40 + 80 * k, y + 30); g.stroke(); if (k > 0.6) { g.beginPath(); g.moveTo(x + 22, y + 18); g.lineTo(x + 40, y + 30); g.lineTo(x + 22, y + 42); g.stroke(); } }
        if (j === 2) { for (let m = 0; m < 4; m++) { const h = 14 + 26 * Math.abs(Math.sin(m * 1.4)); rr(g, x - 40 + m * 26, y - h * k, 12, h * 2 * k, 6); g.stroke(); } }
        if (j === 3) { rr(g, x - 50, y - 18 * k, 100, 36 * k, 8); g.stroke(); if (k > 0.7) { g.beginPath(); g.moveTo(x - 34, y - 2); g.lineTo(x + 34, y - 2); g.stroke(); } }
        g.restore();
      }
      // 四个都被框住
      const k4 = clamp((pt - 0.8) / 0.2, 0, 1);
      if (k4 > 0) {
        g.save(); g.strokeStyle = 'rgba(232,199,122,' + 0.85 * k4 + ')'; g.lineWidth = 2.5;
        g.setLineDash([14, 10]); rr(g, 110, 690, 860, 190, 22); g.stroke(); g.restore();
      }
    };
  }

  /* ===== v007：五段导轨，第一格亮起来（"先讲思路"= 起点） ===== */
  function visRailStart() {
    return (g, t, pt) => {
      const x0 = 130, w = 820, y = 860;
      g.save();
      g.strokeStyle = 'rgba(245,238,220,0.35)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w * eOutQuart(pt), y); g.stroke();
      g.restore();
      // 沿导轨跑的一个光点（循环），保证整句都不静止
      const gt = ((t * 0.42) % 1);
      const gx = x0 + w * gt;
      g.save();
      const grd = g.createLinearGradient(gx - 90, 0, gx + 30, 0);
      grd.addColorStop(0, 'rgba(232,199,122,0)');
      grd.addColorStop(1, 'rgba(232,199,122,0.55)');
      g.fillStyle = grd; g.fillRect(gx - 90, y - 3, 120, 6);
      g.restore();
      for (let j = 0; j < 5; j++) {
        const x = x0 + (w / 4) * j;
        const on = j === 0;
        // 未点亮的节点按顺序轻轻呼吸（错峰），点亮那颗跟着光点脉冲
        const breath = 0.5 + 0.5 * Math.sin(t * 2.6 - j * 0.7);
        const pulse = on ? 1 + 0.15 * Math.sin(t * 6) : 0.92 + 0.16 * breath;
        g.save();
        g.fillStyle = on ? GOLD_LT : 'rgba(245,238,220,' + (0.14 + 0.20 * breath) + ')';
        g.strokeStyle = on ? GOLD_LT : 'rgba(245,238,220,' + (0.22 + 0.26 * breath) + ')';
        g.lineWidth = 2;
        g.beginPath(); g.arc(x, y, 16 * pulse * clamp((pt - j * 0.08) / 0.3, 0, 1), 0, TAU); g.fill(); g.stroke();
        g.restore();
        if (on) {
          const drop = clamp(pt / 0.4, 0, 1);
          g.save(); g.strokeStyle = 'rgba(232,199,122,0.5)'; g.lineWidth = 3;
          g.beginPath(); g.moveTo(x, y + 26); g.lineTo(x, y + 26 + 60 * drop); g.stroke();
          // 下垂线末端一个往下走的微光点
          g.fillStyle = 'rgba(232,199,122,' + (0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 4.2))) + ')';
          g.beginPath(); g.arc(x, y + 26 + 60 * drop, 4.5, 0, TAU); g.fill();
          g.restore();
        }
      }
    };
  }

  /* ===== v008：两张卡（暖纸 / 墨黑）从两侧合上 ===== */
  function visTwoCards() {
    return (g, t, pt) => {
      const k = eOutQuart(clamp(pt / 0.55, 0, 1));
      const w = 380, h = 620, cy = 620;
      g.save();
      g.fillStyle = 'rgba(243,235,214,0.95)';
      rr(g, lerp(-w, 120, k), cy, w, h, 18); g.fill();
      g.fillStyle = 'rgba(18,17,12,0.98)';
      g.strokeStyle = 'rgba(217,169,74,0.6)'; g.lineWidth = 2;
      rr(g, lerp(VW, 580, k), cy, w, h, 18); g.fill(); g.stroke();
      g.restore();
      // 两卡之间一条竖线
      const k2 = clamp((pt - 0.5) / 0.5, 0, 1);
      if (k2 > 0) {
        g.save(); g.strokeStyle = GOLD; g.lineWidth = 3;
        g.beginPath(); g.moveTo(VW / 2, cy + 40); g.lineTo(VW / 2, cy + 40 + (h - 80) * k2); g.stroke();
        // 线上一个往下走的亮点，一直在动
        const dy = cy + 40 + (h - 80) * k2;
        g.fillStyle = 'rgba(245,214,140,' + (0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * 5.2))) + ')';
        g.beginPath(); g.arc(VW / 2, dy, 6, 0, TAU); g.fill();
        g.restore();
      }
      // 暖纸卡上一道斜光反复扫过（卡落定后也不停）
      const sweep = ((t * 0.5) % 1);
      g.save();
      g.beginPath(); rr(g, 120, cy, w, h, 18); g.clip();
      g.fillStyle = 'rgba(217,169,74,0.13)';
      g.fillRect(120 + w * sweep - 46, cy, 46, h);
      g.restore();
      // 墨黑卡：金边呼吸
      g.save();
      g.strokeStyle = 'rgba(217,169,74,' + (0.35 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2.8))) + ')';
      g.lineWidth = 2; rr(g, 580, cy, w, h, 18); g.stroke();
      g.restore();
    };
  }

  /* ===== v027：两个检查项依次打勾（用方框+勾，不写字） ===== */
  function visCheckTwo() {
    return (g, t, pt) => {
      const { i, p } = evOf(pt, 2);
      const y = [780, 940];
      for (let j = 0; j < 2; j++) {
        if (j > i) continue;
        const k = j < i ? 1 : p;                       // 铺满整个事件，不留停住
        const x = 300;
        g.save();
        g.strokeStyle = j === i ? GOLD_LT : 'rgba(217,169,74,0.6)'; g.lineWidth = 3;
        rr(g, x - 26, y[j] - 26, 52 * k, 52 * k, 10); g.stroke();
        if (k > 0.55) {
          const c = clamp((k - 0.55) / 0.45, 0, 1);
          g.strokeStyle = GOLD; g.lineWidth = 6; g.lineCap = 'round';
          g.beginPath(); g.moveTo(x - 12, y[j]);
          g.lineTo(x - 12 + 10 * c, y[j] + 10 * c);
          g.lineTo(x - 12 + 34 * c, y[j] - 18 * c); g.stroke();
        }
        // 右侧一条"检查条"（长度表示检查范围）+ 一个光点在条上走
        g.strokeStyle = 'rgba(245,238,220,0.35)'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(x + 70, y[j]); g.lineTo(x + 70 + 480 * k, y[j]); g.stroke();
        if (k > 0.05) {
          g.fillStyle = GOLD_LT;
          g.beginPath(); g.arc(x + 70 + 480 * k, y[j], 8, 0, TAU); g.fill();
        }
        g.restore();
      }
    };
  }

  /* ===== v028：一排条带，连着三段同一种 → 两段标红后"换走" ===== */
  function visRerhythm() {
    return (g, t, pt) => {
      const n = 8, w = 96, gap = 12, x0 = 120, y = 860;
      const shift = clamp((pt - 0.15) / 0.45, 0, 1);          // 把重复的挪走
      for (let j = 0; j < n; j++) {
        const same = (j >= 2 && j <= 4);                      // 连着三段同一种
        const move = same ? -1 * shift * (w + gap) * (j - 2 + 1) : 0;
        const scan = Math.floor((pt * 8) % n) === j;              // 逐个"扫过"检查
        const color = same && shift < 0.5 ? 'rgba(200,65,43,0.75)'
          : (scan ? 'rgba(232,199,122,0.95)' : (j % 2 ? 'rgba(217,169,74,0.55)' : 'rgba(245,238,220,0.35)'));
        g.save();
        const grow = clamp((pt - j * 0.05) / 0.3, 0, 1);
        g.fillStyle = color;
        rr(g, x0 + j * (w + gap) + move, y - 90 * grow, w, 180 * grow, 10); g.fill();
        g.restore();
      }
      // 修正后打一个勾
      const k2 = clamp((pt - 0.85) / 0.15, 0, 1);
      if (k2 > 0) {
        g.save(); g.strokeStyle = GOLD; g.lineWidth = 5; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x0 + n * (w + gap) + 30, y + 80);
        g.lineTo(x0 + n * (w + gap) + 46, y + 96);
        g.lineTo(x0 + n * (w + gap) + 86, y + 40);
        g.globalAlpha = k2; g.stroke(); g.restore();
      }
    };
  }

  /* ===== v029：三个同形方块 → 其中一个"变形状"（换模板） ===== */
  function visTemplateSwap() {
    return (g, t, pt) => {
      const y = 880, x0 = 300, gap = 220;
      for (let j = 0; j < 3; j++) {
        const x = x0 + j * gap;
        const k = clamp((pt - j * 0.12) / 0.3, 0, 1);
        g.save();
        g.strokeStyle = 'rgba(217,169,74,0.65)'; g.lineWidth = 3;
        rr(g, x - 60, y - 60, 120 * k, 120 * k, 12); g.stroke();
        g.restore();
      }
      // 中间那个变形成圆 + 菱形（表示换了模板）
      const k2 = clamp((pt - 0.55) / 0.45, 0, 1);
      if (k2 > 0) {
        const x = x0 + gap;
        g.save();
        g.strokeStyle = GOLD_LT; g.lineWidth = 4;
        g.globalAlpha = k2;
        g.beginPath(); g.arc(x, y, 62 * eOutQuart(k2), 0, TAU); g.stroke();
        g.beginPath();
        const r = 34 * k2;
        g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.stroke();
        g.restore();
      }
    };
  }

  /* ===== H 节（Mimo）：S8 整段换装置「编排表体检」 =====
     审片 H89.52：S8 全段表达/动画/排布都不好 → 换成：竖向轨道（横屏轨道→竖排，横→竖适配）
     上 9 个镜头块，两处违规被红圈圈住 → 拖走重排 / 换模板 → 变绿。
     配方：T15b-TableRowFocus（聚焦阶梯 push/lift/keyOn）+ T09f-BatchQueue（队列块重排）。
     stage 0 = v027 铺轨道+扫描标记；1 = v028 违规①连排拖走重排；2 = v029 违规②同模换模板 */
  function visS8Audit(stage) {
    const BX = 200, BW = 750, BH = 95, GAP = 12, BY0 = 700;
    const PITCH = BH + GAP;
    const TYPES = ['A', 'B', 'B', 'B', 'A', 'B', 'A', 'A', 'B'];       // 2-3-4 连排 B（违规①）；6-7 同模（违规②）
    const TPLS = ['sq', 'ci', 'tri', 'sq', 'ci', 'tri', 'sq', 'sq', 'ci'];
    const GREEN = '#4FA96A';
    const slotY = (i) => BY0 + i * PITCH;
    return (g, t, pt_, c) => {
      const lt = t - c.t0;
      // 重排进度（stage 1）：违规 ① = idx1/2/3 三连 B（块 02/03/04），把中间的 idx2 抽出来插到 idx4 之后
      const drag = stage >= 1 ? quintic(t, c.t0 + 0.55, c.t0 + 1.10) : 0;
      const orderY = (i) => {
        if (stage < 1) return slotY(i);
        if (i === 2) return lerp(slotY(2), slotY(4), drag);
        if (i === 3) return lerp(slotY(3), slotY(2), drag);
        if (i === 4) return lerp(slotY(4), slotY(3), drag);
        return slotY(i);
      };
      // 违规圈进度
      const ring1 = stage === 1 ? pt(t, c.t0 + 0.05, c.t0 + 0.35) : (stage >= 2 ? 1 : 0);
      const ring2 = stage === 2 ? pt(t, c.t0 + 0.05, c.t0 + 0.35) : 0;
      const green1 = stage >= 1 ? pt(t, c.t0 + (stage === 1 ? 1.15 : 0), c.t0 + (stage === 1 ? 1.50 : 0.02)) : 0;
      const green2 = stage === 2 ? pt(t, c.t0 + 1.15, c.t0 + 1.55) : 0;
      // 竖向轨道（左轨线 + 刻度）
      g.save();
      g.strokeStyle = 'rgba(245,238,220,0.18)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(BX - 26, BY0 - 10); g.lineTo(BX - 26, BY0 + 8 * PITCH + BH + 10); g.stroke();
      g.restore();
      // 扫描光束（stage 0 一遍快扫；之后慢速常驻巡逻）
      const scanP = stage === 0
        ? clamp(lt / 1.8, 0, 1)
        : ((t - c.t0) * 0.16 + 0.37) % 1;
      const scanY = BY0 - 20 + scanP * (8 * PITCH + BH + 40);
      {
        g.save();
        const grd = g.createLinearGradient(0, scanY - 42, 0, scanY + 42);
        grd.addColorStop(0, 'rgba(232,199,122,0)');
        grd.addColorStop(0.5, 'rgba(232,199,122,0.16)');
        grd.addColorStop(1, 'rgba(232,199,122,0)');
        g.fillStyle = grd; g.fillRect(BX - 40, scanY - 42, BW + 80, 84);
        g.restore();
      }
      // 九个镜头块
      for (let i = 0; i < 9; i++) {
        const y = orderY(i);
        // stage 0 入场：自上而下错峰擦出；stage 1/2 直接在场
        const grow = stage === 0 ? clamp((lt - 0.02 - i * 0.075) / 0.3, 0, 1) : 1;
        if (grow <= 0) continue;
        const vio1 = (i >= 1 && i <= 3);
        const vio2 = (i >= 6 && i <= 7);
        const hot1 = vio1 && ring1 > 0 && green1 < 1;
        const hot2 = vio2 && ring2 > 0 && green2 < 1;
        const ok1 = vio1 && green1 >= 1;
        const ok2 = vio2 && green2 >= 1;
        const stroke = ok1 || ok2 ? GREEN : (hot1 || hot2 ? RED : 'rgba(217,169,74,0.55)');
        const pulse = hot1 || hot2 ? 1 + 0.02 * Math.sin(t * 8) : 1;
        g.save();
        g.translate(BX + BW / 2, y + BH / 2); g.scale(pulse, pulse); g.translate(-(BX + BW / 2), -(y + BH / 2));
        // 块底 + 描边（grow 擦出）
        g.fillStyle = ok1 || ok2 ? 'rgba(79,169,106,0.14)' : (hot1 || hot2 ? 'rgba(200,65,43,0.16)' : 'rgba(217,169,74,0.08)');
        rr(g, BX, y, BW * grow, BH, 14); g.fill();
        g.strokeStyle = stroke; g.lineWidth = hot1 || hot2 ? 2.6 : 2;
        rr(g, BX, y, BW * grow, BH, 14); g.stroke();
        if (grow > 0.6) {
          const ga = clamp((grow - 0.6) / 0.4, 0, 1);
          g.save(); g.globalAlpha = ga;
          // 序号
          text(g, String(i + 1).padStart(2, '0'), BX + 22, y + 62, { size: 30, font: 'mono', weight: 700, color: 'rgba(245,238,220,0.8)' });
          // 类型章 A/B
          const isB = TYPES[i] === 'B';
          g.fillStyle = isB ? 'rgba(217,169,74,0.28)' : 'rgba(243,235,214,0.20)';
          rr(g, BX + 92, y + 22, 52, 50, 10); g.fill();
          text(g, TYPES[i], BX + 118, y + 58, { size: 30, weight: 700, font: 'mono', align: 'center', color: isB ? GOLD_LT : CREAM });
          // 模板图形（■/●/▲）
          const tpl = (stage === 2 && i === 7) ? (springAt(t, c.t0 + 0.60, 0.45) > 0.5 ? 'ci' : 'sq') : TPLS[i];
          const txc = ok1 || ok2 ? GREEN : (hot1 || hot2 ? RED : GOLD);
          g.fillStyle = txc; g.strokeStyle = txc; g.lineWidth = 2.4;
          const tx = BX + 190, ty = y + BH / 2;
          if (tpl === 'sq') { g.fillRect(tx - 15, ty - 15, 30, 30); }
          else if (tpl === 'ci') { g.beginPath(); g.arc(tx, ty, 17, 0, TAU); g.fill(); }
          else { g.beginPath(); g.moveTo(tx, ty - 18); g.lineTo(tx + 17, ty + 13); g.lineTo(tx - 17, ty + 13); g.closePath(); g.fill(); }
          // 右侧：时长条（技术标注）
          g.fillStyle = 'rgba(245,238,220,0.14)';
          rr(g, BX + 250, y + 34, (BW - 300) * (0.4 + 0.5 * ((i * 37) % 10) / 10), 26, 8); g.fill();
          // 扫描到的块：亮度脉冲
          if (Math.abs((y + BH / 2) - scanY) < BH) {
            g.fillStyle = 'rgba(232,199,122,0.12)';
            rr(g, BX, y, BW, BH, 14); g.fill();
          }
          g.restore();
        }
        g.restore();
      }
      // 违规①：红括号圈住原「连排区」slot 1–3（块 02/03/04，stage 1）
      if (ring1 > 0) {
        const yA = slotY(1), yB = slotY(3) + BH;
        g.save(); g.globalAlpha = ring1 * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 5)));
        g.strokeStyle = RED; g.lineWidth = 3; g.setLineDash([12, 9]);
        rr(g, BX - 16, yA - 12, BW + 32, (yB - yA) + 24, 24); g.stroke();
        g.setLineDash([]);
        // 红色旗标：×3（放圈内右端，防放大后出画）
        g.fillStyle = 'rgba(200,65,43,0.85)';
        rr(g, BX + BW - 150, (yA + yB) / 2 - 22, 130, 44, 10); g.fill();
        text(g, '×3 连排', BX + BW - 85, (yA + yB) / 2 + 9, { size: 26, weight: 700, font: 'mono', align: 'center', color: '#F3EBD6', spacing: 1 });
        g.restore();
        if (green1 >= 1) {
          g.save(); g.globalAlpha = 0.9;
          g.strokeStyle = GREEN; g.lineWidth = 5; g.lineCap = 'round';
          const cx0 = BX + BW - 85, cy0 = (yA + yB) / 2 + 62;
          g.beginPath(); g.moveTo(cx0 - 12, cy0); g.lineTo(cx0 - 2, cy0 + 12); g.lineTo(cx0 + 20, cy0 - 16); g.stroke();
          g.restore();
        }
      }
      // 违规②：红括号圈住 6-7 号（stage 2）
      if (ring2 > 0) {
        const yA = orderY(6), yB = orderY(7) + BH;
        g.save(); g.globalAlpha = ring2 * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 5)));
        g.strokeStyle = RED; g.lineWidth = 3; g.setLineDash([12, 9]);
        rr(g, BX - 16, yA - 12, BW + 32, (yB - yA) + 24, 24); g.stroke();
        g.setLineDash([]);
        g.fillStyle = 'rgba(200,65,43,0.85)';
        rr(g, BX + BW - 150, (yA + yB) / 2 - 22, 130, 44, 10); g.fill();
        text(g, '×2 同模', BX + BW - 85, (yA + yB) / 2 + 9, { size: 26, weight: 700, font: 'mono', align: 'center', color: '#F3EBD6', spacing: 1 });
        g.restore();
        if (green2 >= 1) {
          g.save(); g.globalAlpha = 0.9;
          g.strokeStyle = GREEN; g.lineWidth = 5; g.lineCap = 'round';
          const cx0 = BX + BW - 85, cy0 = (yA + yB) / 2 + 62;
          g.beginPath(); g.moveTo(cx0 - 12, cy0); g.lineTo(cx0 - 2, cy0 + 12); g.lineTo(cx0 + 20, cy0 - 16); g.stroke();
          g.restore();
        }
      }
    };
  }

  /* ===== v044：四条音轨依次叠起来，波形一直在流 ===== */
  function visTracks() {
    return (g, t, pt) => {
      const x0 = 110, w = 860, h = 92, gap = 30, y0 = 620;
      const cols = ['rgba(232,199,122,0.95)', 'rgba(127,179,217,0.95)', 'rgba(217,143,179,0.95)', 'rgba(245,238,220,0.9)'];
      for (let j = 0; j < 4; j++) {
        const k = clamp((pt - j * 0.18) / 0.3, 0, 1);
        if (k <= 0) continue;
        const y = y0 + j * (h + gap);
        g.save();
        g.fillStyle = 'rgba(245,238,220,0.07)';
        rr(g, x0, y, w * k, h, 12); g.fill();
        // 波形：横向滚动
        const off = (t * 120 + j * 30) % 24;
        for (let i = 0; i < 60; i++) {
          const xx = x0 + i * 14 - off;
          if (xx < x0 || xx > x0 + w * k) continue;
          const bh = 6 + 34 * Math.abs(Math.sin(i * 0.5 + j * 1.7 + t * 2));
          g.fillStyle = cols[j];
          rr(g, xx, y + h / 2 - bh / 2, 5, bh, 2); g.fill();
        }
        g.restore();
      }
    };
  }

  /* ===== v045：音轨被切成章节块，依次被"点亮" ===== */
  function visTracksSections() {
    return (g, t, pt) => {
      const x0 = 110, w = 860, h = 92, gap = 30, y0 = 620;
      const hot = Math.floor(pt * 6) % 6;
      for (let j = 0; j < 4; j++) {
        const y = y0 + j * (h + gap);
        g.save();
        for (let s = 0; s < 6; s++) {
          const bx = x0 + (w / 6) * s, bw = w / 6 - 8;
          const on = s === hot;
          g.fillStyle = on ? 'rgba(232,199,122,0.30)' : 'rgba(245,238,220,0.06)';
          rr(g, bx, y, bw, h, 10); g.fill();
          g.strokeStyle = on ? GOLD_LT : 'rgba(217,169,74,0.22)'; g.lineWidth = on ? 2.5 : 1.2;
          rr(g, bx, y, bw, h, 10); g.stroke();
        }
        // 波形仍然在流
        const off = (t * 150 + j * 40) % 24;
        for (let i = 0; i < 60; i++) {
          const xx = x0 + i * 14 - off;
          if (xx < x0 || xx > x0 + w) continue;
          const bh = 5 + 26 * Math.abs(Math.sin(i * 0.6 + j * 1.3 + t * 2.4));
          g.fillStyle = 'rgba(245,238,220,0.55)';
          rr(g, xx, y + h / 2 - bh / 2, 4, bh, 2); g.fill();
        }
        g.restore();
      }
    };
  }

  /* ===== v041：四个步骤块，第四块亮起并长高 ===== */
  function visFourSteps() {
    return (g, t, pt) => {
      const y = 880, x0 = 150, w = 170, gap = 30;
      for (let j = 0; j < 4; j++) {
        const k = clamp((pt - j * 0.16) / 0.34, 0, 1);
        const h = 120 + (j === 3 ? 90 * eElastic(clamp((pt - 0.5) / 0.5, 0, 1)) : 0);
        g.save();
        g.fillStyle = j === 3 ? 'rgba(232,199,122,' + (0.25 + 0.5 * k) + ')' : 'rgba(217,169,74,' + (0.10 + 0.10 * k) + ')';
        g.strokeStyle = j === 3 ? GOLD_LT : 'rgba(217,169,74,0.45)'; g.lineWidth = j === 3 ? 3 : 1.6;
        rr(g, x0 + j * (w + gap), y - h * k, w, h * k, 14); g.fill(); g.stroke();
        g.restore();
      }
    };
  }

  /* ===== v042：一分钟样片进度条，A/B 块交替填进去 ===== */
  /* v042（L133.22 Mimo 重做）：一分钟样片时间线 —— A/B 交替块 + 0–60s 刻度，进度条只扫一次 */
  function visSampleBar() {
    return (g, t, pt) => {
      const W = 700, X = VW / 2 - W / 2, Y = 800, H = 84, N = 12;
      const q = clamp(pt / 0.55, 0, 1);                      // 块依次填满（一轮 A/B 节奏）
      g.save();
      g.strokeStyle = 'rgba(217,169,74,0.6)'; g.lineWidth = 2;
      rr(g, X, Y, W, H, 14); g.stroke();
      for (let j = 0; j < N; j++) {
        const k = clamp(q * N - j, 0, 1);
        if (k <= 0) continue;
        const bw = W / N - 6, bx = X + (W / N) * j + 3;
        g.fillStyle = j % 2 ? 'rgba(18,17,12,0.85)' : 'rgba(243,235,214,0.85)';
        rr(g, bx, Y + 12, bw * k, H - 24, 8); g.fill();
      }
      g.restore();
      // 播放头只扫一次（L133.22：黄线走一次就好，不循环）
      const sweep = clamp((pt - 0.35) / 0.6, 0, 1);
      if (sweep > 0) {
        const hx = X + W * sweep;
        g.save(); g.fillStyle = GOLD_LT;
        rr(g, hx - 2, Y - 18, 5, H + 36, 2); g.fill();
        g.restore();
      }
      // 下方 0–60s 时间线 + 刻度
      const ax = clamp((pt - 0.5) / 0.4, 0, 1);
      if (ax > 0) {
        g.save(); g.globalAlpha = ax;
        g.strokeStyle = 'rgba(245,238,220,0.4)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(X, Y + H + 56); g.lineTo(X + W * ax, Y + H + 56); g.stroke();
        for (let i = 0; i <= 4; i++) {
          const tx = X + (W / 4) * i;
          if ((W / 4) * i > W * ax) break;
          g.fillStyle = GOLD; g.fillRect(tx - 1.5, Y + H + 48, 3, 18);
          text(g, (i * 15) + 's', tx, Y + H + 104, { size: 24, font: 'mono', color: 'rgba(245,238,220,0.55)', align: 'center' });
        }
        text(g, '一轮 A/B = 60s', X + W, Y - 30, { size: 24, font: 'serif', color: 'rgba(245,238,220,0.5)', align: 'right', spacing: 2 });
        g.restore();
      }
      // 尾部呼吸（块框）
      g.save();
      g.globalAlpha = 0.16 + 0.10 * Math.sin(t * 2.2);
      g.strokeStyle = GOLD; g.lineWidth = 2;
      rr(g, X - 6, Y - 6, W + 12, H + 12, 18); g.stroke();
      g.restore();
    };
  }

  /* v043（L135.16 Mimo 重做）：从 v042 的时间线继续 —— 三块高亮标红 → 被删掉丢下 →
     其余合拢、时间线变短（不再是旧成本曲线装置） */
  function visFixEarly() {
    return (g, t, pt) => {
      const W0 = 700, X = VW / 2 - W0 / 2, Y = 800, H = 84, N = 12;
      const KILL = [3, 4, 8];
      const live = N - KILL.length;                 // 9 块
      const W1 = W0 * live / N;                     // 时间线变短
      const red = clamp((pt - 0.08) / 0.25, 0, 1);   // 标红
      const del = clamp((pt - 0.38) / 0.38, 0, 1);   // 删除（掉下去）
      const close = clamp((pt - 0.55) / 0.4, 0, 1);  // 合拢
      let li = 0;
      for (let j = 0; j < N; j++) {
        const killed = KILL.includes(j);
        const slotW = W0 / N;
        const ox = X + slotW * j + 3, bw = slotW - 6;
        if (killed) {
          // 标红 → 向下掉出 + 淡出
          if (del >= 1) continue;
          g.save();
          g.globalAlpha = 1 - del;
          g.translate(0, del * 260);
          g.rotate(del * 0.12 * (j % 2 ? 1 : -1));
          g.fillStyle = 'rgba(200,65,43,' + (0.35 + 0.5 * red) + ')';
          rr(g, ox, Y + 12, bw, H - 24, 8); g.fill();
          g.strokeStyle = RED; g.lineWidth = 2.4; rr(g, ox, Y + 12, bw, H - 24, 8); g.stroke();
          g.restore();
        } else {
          // 存活块：合拢到新槽位
          const tx = X + (W1 / live) * li + 3, tw = W1 / live - 6;
          li++;
          const bx = lerp(ox, tx, close), bwid = lerp(bw, tw, close);
          g.save();
          g.fillStyle = j % 2 ? 'rgba(18,17,12,0.85)' : 'rgba(243,235,214,0.85)';
          rr(g, bx, Y + 12, bwid, H - 24, 8); g.fill();
          g.restore();
        }
      }
      // 条框收缩（原框虚线残留提示"原来这么长"）
      g.save();
      g.strokeStyle = 'rgba(217,169,74,0.6)'; g.lineWidth = 2;
      rr(g, X, Y, lerp(W0, W1, close), H, 14); g.stroke();
      if (close < 1) {
        g.globalAlpha = (1 - close) * 0.5;
        g.setLineDash([10, 10]); g.strokeStyle = 'rgba(245,238,220,0.4)';
        rr(g, X, Y, W0, H, 14); g.stroke(); g.setLineDash([]);
      }
      g.restore();
      // 尾部：重扫一次检查线（只扫一次）+ 呼吸
      const sweep = clamp((pt - 0.8) / 0.2, 0, 1);
      if (sweep > 0 && sweep < 1) {
        const hx = X + W1 * sweep;
        g.save(); g.fillStyle = 'rgba(155,201,143,0.9)';
        rr(g, hx - 2, Y - 14, 5, H + 28, 2); g.fill(); g.restore();
      }
      g.save();
      g.globalAlpha = 0.14 + 0.10 * Math.sin(t * 2.4);
      g.strokeStyle = 'rgba(155,201,143,0.9)'; g.lineWidth = 2;
      rr(g, X - 6, Y - 6, lerp(W0, W1, close) + 12, H + 12, 18); g.stroke();
      g.restore();
      // 已删标记（技术标注）
      if (del > 0.5) {
        text(g, '−3', X + W1 + 40, Y + H / 2 + 12, { size: 34, weight: 700, font: 'mono', color: 'rgba(200,65,43,0.9)' });
      }
    };
  }

  /* ==================================================================
   * 【S7 · v021–v026】FredTalk 动效库配方移植（2026-10-28）
   *
   * 只借「运动结构与时间分配」，画面内容、配色、字体仍是本片自己的：
   *   v021 ← T16g 时间轴往回擦      + T09q 播放头逐处跳读
   *   v022 ← T14a2 双轨赛跑（轨道错位）
   *   v023 ← T12a 点→圆→胶囊过冲→章节名落定（几何与缓动按源码逐项换算）
   *   v024 ← T18c/T08p 局部聚焦（取景框收紧）
   *   v025 ← T02m 卡片逐张加入（一裂成六）
   *   v026 ← T08k 同批位置同步标出（卡阵标注）
   *
   * 缓动三件套直接来自 FredTalk kit/theme.ts：
   *   p()=cubic-bezier(.22,1,.36,1) / wipe()=cubic-bezier(.65,0,.2,1)
   *   springAt()=1-exp(-8v)·cos(9v) / quintic()=v³(6v²-15v+10)
   * ================================================================== */
  /* 三次贝塞尔求值器：给定 x 解 t 再取 y（与 CSS cubic-bezier 同解） */
  function bezierEase(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = u => ((ax * u + bx) * u + cx) * u;
    const sy = u => ((ay * u + by) * u + cy) * u;
    const dx = u => (3 * ax * u + 2 * bx) * u + cx;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let u = x;
      for (let i = 0; i < 6; i++) { const d = dx(u); if (Math.abs(d) < 1e-5) break; u -= (sx(u) - x) / d; }
      return sy(clamp(u, 0, 1));
    };
  }
  const EASE_P = bezierEase(0.22, 1, 0.36, 1);
  const EASE_W = bezierEase(0.65, 0, 0.2, 1);
  const pt = (t, a, b) => EASE_P(clamp((t - a) / (b - a), 0, 1));           // FredTalk p()
  const wq = (t, a, b) => EASE_W(clamp((t - a) / (b - a), 0, 1));           // FredTalk wipe()
  const springAt = (t, delay, dur) => {                                      // FredTalk springAt()
    const v = clamp((t - delay) / (dur === undefined ? 0.8 : dur), 0, 1);
    return v >= 1 ? 1 : 1 - Math.exp(-8 * v) * Math.cos(9 * v);
  };
  const quintic = (t, a, b) => { const v = clamp((t - a) / (b - a), 0, 1); return v * v * v * (v * (6 * v - 15) + 10); };

  /* ---------- v021：时间基准（字表被从上往下读一遍，轴上播放头同步走，最后落一枚「基准」章） ----------
     T09q「播放头逐处跳读」+ T16g「往回擦」的运动结构；画面内容是我们自己的字表。 */
  function visTimeBase() {
    return (g, t, pt_, c) => {
      const CX = 132, CW = 812, ROWS = 5, COLS = 2, chh = 84, gap = 10, top = 560;
      const rowH = chh + gap, cardH = ROWS * chh + (ROWS - 1) * gap;
      const COLW = CW / COLS;
      // ① 卡底：淡入 + 边框描出
      const card = pt(t, c.t0 + 0.02, c.t0 + 0.26);
      if (card > 0) {
        g.save(); g.globalAlpha = card;
        g.fillStyle = 'rgba(217,169,74,0.055)';
        rr(g, CX - 22, top - 30, CW + 44, cardH + 60, 22); g.fill();
        g.strokeStyle = 'rgba(217,169,74,0.42)'; g.lineWidth = 1.6;
        rr(g, CX - 22, top - 30, CW + 44, cardH + 60, 22); g.stroke();
        g.restore();
        text(g, '字 · 秒', CX - 22, top - 48, { size: 20, color: 'rgba(245,238,220,0.40)', spacing: 2 });
      }
      // ② 读表进度：同一个进度同时驱动「行点亮」和「轴上播放头」
      const prog = quintic(t, c.t0 + 0.16, c.t0 + 1.62);
      const WORDS = ['Hello', '最近', '用代码', '做视频', '火出圈', '不用', '剪辑', '软件', '这一期', '手把手'];
      for (let i = 0; i < ROWS * COLS; i++) {
        const col = i % COLS, row = Math.floor(i / COLS);
        const q = pt(t, c.t0 + 0.06 + i * 0.026, c.t0 + 0.24 + i * 0.026);
        if (q <= 0) continue;
        const x = CX + col * COLW, y = top + row * rowH;
        const lit = clamp(prog * ROWS - row + 0.35, 0, 1);
        g.save(); g.globalAlpha = q;
        g.fillStyle = 'rgba(245,238,220,' + (0.035 + 0.10 * lit) + ')';
        rr(g, x, y + (1 - q) * 24, COLW - 16, chh, 10); g.fill();
        if (lit > 0.6) { g.strokeStyle = 'rgba(232,199,122,' + (0.55 * lit) + ')'; g.lineWidth = 1.4; rr(g, x, y + (1 - q) * 24, COLW - 16, chh, 10); g.stroke(); }
        g.restore();
        text(g, WORDS[i], x + 16, y + (1 - q) * 24 + 54, {
          size: 30, weight: 600, font: 'serif', spacing: 2,
          color: 'rgba(245,238,220,' + (0.42 + 0.52 * lit) + ')',
        });
        text(g, (i * 0.37).toFixed(2), x + COLW - 32, y + (1 - q) * 24 + 52, {
          size: 22, font: 'mono', align: 'right',
          color: 'rgba(217,169,74,' + (0.28 + 0.5 * lit) + ')',
        });
      }
      // ③ 时间轴：12 刻度依次落下
      const ay = 1102;
      for (let i = 0; i <= 12; i++) {
        const q = pt(t, c.t0 + 0.12 + i * 0.012, c.t0 + 0.26 + i * 0.012);
        if (q <= 0) continue;
        const x = CX + (CW / 12) * i;
        g.save(); g.globalAlpha = q;
        g.strokeStyle = i % 3 === 0 ? GOLD : 'rgba(245,238,220,0.34)'; g.lineWidth = i % 3 === 0 ? 2.4 : 1.4;
        g.beginPath(); g.moveTo(x, ay - 22 * q); g.lineTo(x, ay + 22 * q); g.stroke(); g.restore();
        if (i % 3 === 0) text(g, (i * 2) + 's', x, ay + 52, { size: 18, font: 'mono', color: 'rgba(245,238,220,0.30)', align: 'center' });
      }
      // ④ 播放头：一条竖线贯穿表与轴，随 prog 右移
      const shown = pt(t, c.t0 + 0.30, c.t0 + 0.42);
      if (shown > 0) {
        const hx = lerp(CX - 6, CX + CW + 6, prog);
        g.save(); g.globalAlpha = shown;
        g.strokeStyle = 'rgba(226,59,46,0.9)'; g.lineWidth = 3; g.lineCap = 'round';
        g.beginPath(); g.moveTo(hx, top - 26); g.lineTo(hx, ay + 26); g.stroke();
        g.fillStyle = RED;
        g.beginPath(); g.moveTo(hx, top - 26); g.lineTo(hx - 10, top - 44); g.lineTo(hx + 10, top - 44); g.closePath(); g.fill();
        g.restore();
        const secTxt = (prog * 24 + Math.sin(t * 7) * 0.03).toFixed(2) + 's';
        text(g, secTxt, Math.min(hx, 900), ay + 92, { size: 24, font: 'mono', weight: 700, color: GOLD_LT, align: 'center' });
      }
      // ⑤ 「基准」章：盖章式落下 + 呼吸
      const stamp = pt(t, c.t0 + 1.74, c.t0 + 2.06);
      if (stamp > 0) {
        const s = 0.72 + 0.28 * springAt(t, c.t0 + 1.74, 0.34);
        g.save();
        g.translate(CX + CW - 88, top - 60); g.scale(s, s); g.translate(-(CX + CW - 88), -(top - 60));
        g.globalAlpha = stamp;
        g.strokeStyle = 'rgba(217,169,74,' + (0.55 + 0.35 * (0.5 + 0.5 * Math.sin(t * 3.4))) + ')';
        g.lineWidth = 2.6; rr(g, CX + CW - 152, top - 84, 128, 48, 10); g.stroke();
        g.restore();
        text(g, '基准', CX + CW - 88, top - 51, { size: 26, weight: 700, font: 'serif', color: GOLD_LT, align: 'center', spacing: 4 });
      }
    };
  }

  /* ---------- v022：错位（两条轨道错开 0.4s，标红，最后也没能拉齐） ---------- */
  function visOffbeat() {
    return (g, t, pt_, c) => {
      const x0 = 110, w = 860, NB = 7, BX = x0 + 90, BW = (w - 96) / 8, BLK = 86;
      const OFF = 0.42 * BW * 2;                                              // 错位量（约等于一句的 0.4s 宽）
      // 第二次尝试拉齐：拉过去又弹回来，永远差一截（阻尼弹簧，settle 在 0.25）
      // G75.16：删掉 Math.sin(t*26) 微抖（观感是"抖动"），只留一次「拉不齐」的回弹 + 稳定虚线
      const v = clamp((t - (c.t0 + 0.72)) / 1.0, 0, 1);
      const pull = 0.25 * (1 - Math.exp(-7 * v) * Math.cos(9 * v));
      const rows = [['原表', 700, GOLD, 0], ['实际', 930, 'rgba(226,59,46,0.92)', 1]];
      rows.forEach(([name, y, col, isOff], i) => {
        const k = pt(t, c.t0 + 0.02 + i * 0.12, c.t0 + 0.34 + i * 0.12);
        if (k <= 0) return;
        g.save();
        if (isOff) g.translate(OFF * (1 - pull), 0);
        g.globalAlpha = k;
        text(g, name, x0, y - 34, { size: 22, color: 'rgba(245,238,220,0.5)' });
        for (let j = 0; j < NB; j++) {
          const q = pt(t, c.t0 + 0.10 + j * 0.03 + i * 0.12, c.t0 + 0.28 + j * 0.03 + i * 0.12);
          if (q <= 0) continue;
          const bx = BX + j * BW;
          const glow = 0.16 + 0.20 * (0.5 + 0.5 * Math.sin(t * 5 + j * 0.7 + i));
          g.fillStyle = i ? 'rgba(226,59,46,' + glow + ')' : 'rgba(217,169,74,' + glow + ')';
          rr(g, bx, y - 24, BLK * q, 48, 8); g.fill();
          g.save(); g.globalAlpha = k * 0.5; g.strokeStyle = col; g.lineWidth = 1.4;
          rr(g, bx, y - 22, BLK * q, 44, 8); g.stroke(); g.restore();
        }
        g.restore();
      });
      // 错位量：两条虚线夹出一个红括号（标注只在技术上标明 0.4s，不重复旁白）
      const mk = pt(t, c.t0 + 0.46, c.t0 + 0.72);
      if (mk > 0) {
        const x1 = BX + OFF * (1 - pull), x2 = BX;
        g.save(); g.globalAlpha = mk;
        g.strokeStyle = 'rgba(226,59,46,0.75)'; g.lineWidth = 2; g.setLineDash([9, 9]);
        g.beginPath(); g.moveTo(x1, 662); g.lineTo(x1, 966); g.moveTo(x2, 662); g.lineTo(x2, 966); g.stroke();
        g.setLineDash([]);
        // 括号
        const by = 1046;
        g.strokeStyle = 'rgba(226,59,46,0.9)'; g.lineWidth = 2.6; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x1, by - 14); g.lineTo(x1, by); g.lineTo(x2, by); g.lineTo(x2, by - 14); g.stroke();
        g.restore();
        text(g, '0.4s', (x1 + x2) / 2, by + 34, {
          size: 28, weight: 700, font: 'mono', color: 'rgba(232,120,100,0.95)', align: 'center',
        });
        // 末端差：右侧补一根「多出来的尾巴」标记，让"差一截"看得见
        const tail = x2 + NB * BW;
        g.save(); g.globalAlpha = mk * 0.9;
        g.strokeStyle = 'rgba(226,59,46,0.6)'; g.lineWidth = 2; g.setLineDash([6, 8]);
        g.beginPath(); g.moveTo(tail, 662); g.lineTo(tail, 966); g.stroke();
        g.restore();
      }
    };
  }

  /* ---------- v023：②章卡（T12a 几何原样换算：点→圆→横向撑开过冲→章节名顶入） ---------- */
  function visChapter(index, label, title) {
    const PAD_X = 76, PAD_Y = 40, LAB = 44, GAP = 16;
    return (g, t, pt_, c) => {
      const lt = t - c.t0;
      // 自适应字号（Mimo 修）：长标题（如「文案、配音、对齐」8 字）按 104px 会溢出卡外被裁，
      // 字号缩到 860 内能排下为止；短标题（视觉编排表 5 字）不受影响仍是 104。
      const nCh = Array.from(title).length;
      const size = Math.min(104, Math.floor((860 - PAD_X * 2) / nCh));
      const lineW = nCh * size;
      const W = Math.min(880, Math.max(560, lineW + PAD_X * 2));
      const H = PAD_Y * 2 + LAB * 1.16 + GAP + size * 1.08;
      const d = H * pt(t, c.t0, c.t0 + 0.36);                                  // 点 → 圆
      const spread = springAt(lt, 0.30, 0.68);                                 // 横向撑开（带过冲）
      const w = d + (W - H) * Math.max(0, spread);
      const h = d;
      const r = Math.max(h * 0.3, (Math.min(w, h) / 2) * clamp(2 - w / Math.max(h, 1), 0, 1));
      if (h > 1) {
        const cx = VW / 2 - w / 2, cy = 900 - h / 2;
        g.save();
        g.shadowColor = 'rgba(0,0,0,0.36)'; g.shadowBlur = 30; g.shadowOffsetX = 12; g.shadowOffsetY = 16;
        g.fillStyle = CREAM; rr(g, cx, cy, w, h, r); g.fill();
        g.restore();
        // 小标签（第二步）从下浮入
        const lab = pt(t, c.t0 + 0.62, c.t0 + 0.95);
        if (lab > 0) {
          g.save(); g.globalAlpha = lab;
          text(g, label, VW / 2, cy + PAD_Y + LAB + (1 - lab) * 18, {
            size: LAB, weight: 700, font: 'mono', color: 'rgba(184,134,47,0.95)', align: 'center', spacing: 6,
          });
          g.restore();
        }
        // 章节名：逐行从下往上顶进（每行错峰 0.1s）
        const tl = Array.from(title);
        const q = pt(t, c.t0 + 0.72, c.t0 + 1.18);
        if (q > 0) {
          g.save();
          g.beginPath(); rr(g, cx + 6, cy + PAD_Y + LAB * 1.16 + GAP - 4, w - 12, size * 1.12 + 8, 8); g.clip();
          text(g, title, VW / 2, cy + PAD_Y + LAB * 1.16 + GAP + size * 0.86 + (1 - q) * size * 1.08, {
            size, weight: 700, font: 'serif', color: INK, align: 'center', spacing: 4,
          });
          g.restore();
        }
        // 序号圆点在左上角一直呼吸（T12a 的角标位）
        const dot = pt(t, c.t0 + 0.90, c.t0 + 1.10);
        if (dot > 0) {
          g.save(); g.globalAlpha = dot * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 3.6)));
          g.fillStyle = GOLD; g.beginPath(); g.arc(cx + 46, cy + 40, 9, 0, TAU); g.fill();
          g.restore();
        }
      }
      // 底部金线一直在走（保证章卡停住时画面仍在变）
      const base = pt(t, c.t0 + 0.55, c.t0 + 1.0);
      if (base > 0) {
        const bl = 300 * base;
        g.save(); g.strokeStyle = 'rgba(217,169,74,' + (0.30 + 0.30 * (0.5 + 0.5 * Math.sin(t * 2.6))) + ')';
        g.lineWidth = 2.4; g.beginPath(); g.moveTo(VW / 2 - bl, 1078); g.lineTo(VW / 2 + bl, 1078); g.stroke(); g.restore();
      }
    };
  }

  /* ---------- v024：导演取景框（G80.19 Mimo：两卡放大 1.3× + 时间表加「字·秒」两列；
     终态框 760×380，给 v025「原地裂开」当几何起点） ---------- */
  function visDirectorFrame() {
    const CY = 1090;
    // 两张卡的本地画法（以中心为原点，s=整体缩放；基准 1.3×：442×333）
    function drawCopy(g, s, k) {
      g.save(); g.scale(s, s);
      g.fillStyle = 'rgba(243,235,214,0.96)'; rr(g, -221, -166, 442, 333, 14); g.fill();
      for (let i = 0; i < 6; i++) {
        const q = clamp((k - i * 0.07) / 0.3, 0, 1);
        if (q <= 0) continue;
        g.fillStyle = 'rgba(58,50,38,0.42)';
        g.fillRect(-185, -120 + i * 47, (273 + (i % 3) * 52) * q, 13);
      }
      g.restore();
    }
    function drawTable(g, s, k) {
      g.save(); g.scale(s, s);
      for (let i = 0; i < 6; i++) {
        const q = clamp((k - i * 0.06) / 0.3, 0, 1);
        if (q <= 0) continue;
        g.fillStyle = 'rgba(245,238,220,0.12)'; rr(g, -208, -130 + i * 47, 416 * q, 31, 7); g.fill();
        g.strokeStyle = 'rgba(217,169,74,0.50)'; g.lineWidth = 1.4; rr(g, -208, -130 + i * 47, 416 * q, 31, 7); g.stroke();
        // G80.19：「字 · 秒」两列 —— 左列文字梗概（字），右列秒数
        if (q > 0.6) {
          g.save(); g.globalAlpha = (q - 0.6) / 0.4;
          g.fillStyle = 'rgba(245,238,220,0.42)';
          g.fillRect(-192, -118 + i * 47, 216, 9);
          g.fillStyle = 'rgba(232,199,122,0.75)';
          g.fillRect(74, -118 + i * 47, 82, 9);
          g.restore();
        }
      }
      // 列头：字 · 秒
      if (k > 0.85) {
        text(g, '字', -192, -148, { size: 24, weight: 700, font: 'serif', color: 'rgba(245,238,220,0.6)' });
        text(g, '秒', 74, -148, { size: 24, weight: 700, font: 'serif', color: 'rgba(232,199,122,0.8)' });
      }
      g.restore();
    }
    // 起点 / 终点（中心坐标）
    const COPY_A = [275, 640], COPY_B = [354, CY];
    const TAB_A = [785, 636], TAB_B = [726, CY];
    return (g, t, pt_, c) => {
      const a1 = pt(t, c.t0 + 0.02, c.t0 + 0.34);
      const a2 = pt(t, c.t0 + 0.10, c.t0 + 0.42);
      const mv = quintic(t, c.t0 + 0.58, c.t0 + 1.42);          // 移动进度
      const sc = lerp(1, 0.62, mv);
      // ① 两张卡：先在原位出现，然后整体「搬」进取景框位置
      if (a1 > 0) {
        const cx = lerp(COPY_A[0], COPY_B[0], mv), cy = lerp(COPY_A[1], COPY_B[1], mv);
        g.save(); g.globalAlpha = a1; g.translate(cx, cy); drawCopy(g, sc, a1); g.restore();
        if (mv < 0.05) text(g, '文案', COPY_A[0] - 221, COPY_A[1] - 186, { size: 26, color: 'rgba(245,238,220,0.6)' });
      }
      if (a2 > 0) {
        const cx = lerp(TAB_A[0], TAB_B[0], mv), cy = lerp(TAB_A[1], TAB_B[1], mv);
        g.save(); g.globalAlpha = a2; g.translate(cx, cy); drawTable(g, sc, a2); g.restore();
        if (mv < 0.05) text(g, '时间表', TAB_A[0] - 208, TAB_A[1] - 192, { size: 26, color: 'rgba(245,238,220,0.6)' });
      }
      // ② 取景框：卡搬到位后张开，再把两只卡「框」住并收紧（终态 760×380）
      const fr = pt(t, c.t0 + 0.92, c.t0 + 1.30);
      const tight = quintic(t, c.t0 + 1.48, c.t0 + 2.36);
      if (fr > 0) {
        const bw = lerp(140, lerp(860, 760, tight), fr);
        const bh = lerp(110, lerp(440, 380, tight), fr);
        const bx = VW / 2 - bw / 2, by = CY - bh / 2;
        g.save(); g.globalAlpha = fr * 0.55;
        g.fillStyle = 'rgba(217,169,74,0.10)'; g.fillRect(bx, by, bw, bh);
        g.strokeStyle = 'rgba(245,238,220,0.20)'; g.lineWidth = 1.4; g.strokeRect(bx, by, bw, bh);
        g.restore();
        g.save(); g.globalAlpha = fr;
        g.strokeStyle = GOLD; g.lineWidth = 5; g.lineCap = 'round';
        const L2 = Math.min(64, Math.min(bw, bh) * 0.3);
        [[bx, by, 1, 1], [bx + bw, by, -1, 1], [bx, by + bh, 1, -1], [bx + bw, by + bh, -1, -1]].forEach(([x, y, dx, dy]) => {
          g.beginPath(); g.moveTo(x + dx * L2, y); g.lineTo(x, y); g.lineTo(x, y + dy * L2); g.stroke();
        });
        // 三分线（取景语汇）
        g.strokeStyle = 'rgba(245,238,220,0.16)'; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(bx + bw / 3, by); g.lineTo(bx + bw / 3, by + bh);
        g.moveTo(bx + bw * 2 / 3, by); g.lineTo(bx + bw * 2 / 3, by + bh); g.stroke();
        g.restore();
        // 取景扫光（一直在动）
        const sweep = ((t - c.t0) * 0.75) % 1;
        g.save(); g.beginPath(); g.rect(bx, by, bw, bh); g.clip();
        g.fillStyle = 'rgba(232,199,122,0.12)'; g.fillRect(bx, by + bh * sweep - 46, bw, 46); g.restore();
        if (tight > 0.2) {
          text(g, '站在导演视角', bx + 2, by + bh + 54, {
            size: 30, weight: 600, font: 'serif', spacing: 3,
            color: 'rgba(245,238,220,' + (0.92 * clamp((tight - 0.2) / 0.3, 0, 1)) + ')',
          });
        }
      }
    };
  }

  /* ---------- v025：文案裂成镜头卡（G82.22/G84.08 Mimo：从 v024 终态取景框原地裂开，
     不重新入场；6 卡 → 9 卡 3×3，卡高 200，铺满屏幕 620–1560） ----------
     几何连续账：v024 终态框在屏幕 (540, 1168) 尺寸 790×395；
     本句 box [94,820,892,940] 的 dy=-200 → content y = 屏幕 y + 200，
     所以裂开起点 = content (540, 1368) 尺寸 790×395，与上一帧完全重合。 */
  const SHOT_POS = (() => {
    const w = 268, h = 200, gx = 44, gy = 170, x0 = (VW - (w * 3 + gx * 2)) / 2, y0 = 820;
    return Array.from({ length: 9 }, (_, i) => ({ x: x0 + (i % 3) * (w + gx), y: y0 + Math.floor(i / 3) * (h + gy), w, h }));
  })();
  const SHOT_SPLIT_C = { x: 540, y: 1368, w: 790, h: 395 };   // v024 终态取景框（本句 content 坐标）
  function visShotSplit() {
    return (g, t, pt_, c) => {
      const F = SHOT_SPLIT_C;
      const split = wq(t, c.t0 + 0.22, c.t0 + 0.75);
      // ① 上一帧的取景框原地停留（0.22s），随后裂开
      if (split < 0.02) {
        g.save();
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(217,169,74,0.10)'; g.fillRect(F.x - F.w / 2, F.y - F.h / 2, F.w, F.h);
        g.strokeStyle = GOLD; g.lineWidth = 5; g.lineCap = 'round';
        const L2 = 64;
        const bx = F.x - F.w / 2, by = F.y - F.h / 2;
        [[bx, by, 1, 1], [bx + F.w, by, -1, 1], [bx, by + F.h, 1, -1], [bx + F.w, by + F.h, -1, -1]].forEach(([x, y, dx, dy]) => {
          g.beginPath(); g.moveTo(x + dx * L2, y); g.lineTo(x, y); g.lineTo(x, y + dy * L2); g.stroke();
        });
        g.restore();
        return;
      }
      // ② 裂开：分割线扫过（高亮竖线×2 + 横线×2），九张卡从框中心弹出到 3×3 位置
      g.save();
      g.globalAlpha = (1 - split) * 0.9;
      g.strokeStyle = GOLD_LT; g.lineWidth = 3;
      g.beginPath();
      for (let i = 1; i < 3; i++) {
        g.moveTo(F.x - F.w / 2 + (F.w / 3) * i * split, F.y - F.h / 2);
        g.lineTo(F.x - F.w / 2 + (F.w / 3) * i * split, F.y + F.h / 2);
        g.moveTo(F.x - F.w / 2, F.y - F.h / 2 + (F.h / 3) * i * split);
        g.lineTo(F.x + F.w / 2, F.y - F.h / 2 + (F.h / 3) * i * split);
      }
      g.stroke();
      g.restore();
      // 尾部不许停：高光横扫卡阵 + 卡框呼吸
      const sw = ((t - c.t0) * 0.59) % 1;
      const sx = lerp(-200, VW + 200, sw);
      g.save();
      const grd = g.createLinearGradient(sx - 200, 0, sx + 200, 0);
      grd.addColorStop(0, 'rgba(232,199,122,0)');
      grd.addColorStop(0.5, 'rgba(232,199,122,0.13)');
      grd.addColorStop(1, 'rgba(232,199,122,0)');
      g.fillStyle = grd; g.fillRect(0, 580, VW, 1020);
      g.restore();
      SHOT_POS.forEach((P2, i) => {
        const q = springAt(t, c.t0 + 0.26 + i * 0.075, 0.55);
        const k = clamp(q, 0, 1.12);
        const cx = F.x + (P2.x + P2.w / 2 - F.x) * k;
        const cy = F.y + (P2.y + P2.h / 2 - F.y) * k;
        const w = P2.w * clamp(k, 0, 1), h = P2.h * clamp(k, 0, 1);
        g.save();
        g.strokeStyle = 'rgba(217,169,74,' + (0.62 + 0.18 * (0.5 + 0.5 * Math.sin(t * 3.1 + i * 0.9))) + ')';
        g.lineWidth = 2;
        g.fillStyle = 'rgba(217,169,74,0.06)';
        rr(g, cx - w / 2, cy - h / 2, w, h, 16); g.fill(); g.stroke();
        if (k >= 0.9) {
          text(g, String(i + 1).padStart(2, '0'), cx - w / 2 + 18, cy - h / 2 + 36, { size: 24, font: 'mono', weight: 700, color: 'rgba(217,169,74,0.85)' });
          for (let j = 0; j < 3; j++) {
            const bq = pt(t, c.t0 + 0.62 + i * 0.05 + j * 0.05, c.t0 + 0.80 + i * 0.05 + j * 0.05);
            if (bq <= 0) continue;
            g.fillStyle = 'rgba(245,238,220,0.18)';
            g.fillRect(cx - w / 2 + 18, cy - h / 2 + 58 + j * 26, (w - 36 - (j % 2) * 36) * bq, 8);
          }
        }
        g.restore();
      });
    };
  }

  /* ---------- v026：翻卡（G85.20 Mimo：T20p-TileFlip 配方 —— 每卡 scaleX 1→0→1 换背面，
     正面「01 · 2.4s」，背面 A/B；对角错峰 0.225s，单卡翻 0.42s；随后标变化点/接法） ---------- */
  function visShotLabels() {
    const DURS = [2.4, 3.1, 1.8, 4.2, 2.6, 3.4, 2.1, 3.6, 2.9];
    return (g, t, pt_, c) => {
      SHOT_POS.forEach((P2, i) => {
        const col = i % 3, row = Math.floor(i / 3);
        const st = c.t0 + 0.30 + (row + col) * 0.225;
        const f = wq(t, st, st + 0.42);
        const ang = 180 * f;                       // 0→180°
        const sX = Math.abs(Math.cos(ang * Math.PI / 180));
        const showBack = ang >= 90;
        const cx = P2.x + P2.w / 2, cy = P2.y + P2.h / 2;
        const isB = (i % 2) === 1;
        g.save();
        // 浮起阴影（翻转中的立体感）
        g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 18 * Math.sin(Math.min(1, f) * Math.PI); g.shadowOffsetY = 8;
        g.translate(cx, cy); g.scale(Math.max(0.02, sX), 1); g.translate(-cx, -cy);
        if (!showBack) {
          // 正面：序号 + 时长 + 线条
          g.fillStyle = 'rgba(217,169,74,0.10)'; rr(g, P2.x, P2.y, P2.w, P2.h, 16); g.fill();
          g.strokeStyle = 'rgba(217,169,74,0.62)'; g.lineWidth = 2; rr(g, P2.x, P2.y, P2.w, P2.h, 16); g.stroke();
          text(g, String(i + 1).padStart(2, '0'), P2.x + 18, P2.y + 40, { size: 26, font: 'mono', weight: 700, color: 'rgba(217,169,74,0.9)' });
          text(g, DURS[i].toFixed(1) + 's', P2.x + P2.w - 18, P2.y + 40, { size: 26, font: 'mono', weight: 700, color: 'rgba(245,238,220,0.8)', align: 'right' });
          for (let j = 0; j < 3; j++) {
            g.fillStyle = 'rgba(245,238,220,0.16)';
            g.fillRect(P2.x + 18, P2.y + 72 + j * 26, (P2.w - 36 - (j % 2) * 40) * 0.9, 8);
          }
        } else {
          // 背面：A / B 大字
          g.fillStyle = isB ? 'rgba(217,169,74,0.18)' : 'rgba(243,235,214,0.14)'; rr(g, P2.x, P2.y, P2.w, P2.h, 16); g.fill();
          g.strokeStyle = isB ? 'rgba(232,199,122,0.85)' : 'rgba(243,235,214,0.55)'; g.lineWidth = 2.4; rr(g, P2.x, P2.y, P2.w, P2.h, 16); g.stroke();
          text(g, isB ? 'B' : 'A', cx, cy + 26, {
            size: 88, weight: 700, font: 'mono', align: 'center', color: isB ? GOLD_LT : CREAM,
          });
        }
        g.restore();
        // 翻完后：变化点三角 + 接法箭头（错峰）
        if (f >= 1) {
          const q3 = pt(t, st + 0.42, st + 0.72);
          if (q3 > 0) {
            const bx = P2.x + 20 + (P2.w - 40) * (0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2.2 + i)));
            g.save(); g.globalAlpha = q3; g.fillStyle = RED;
            g.beginPath(); g.moveTo(bx, P2.y + P2.h - 14); g.lineTo(bx - 8, P2.y + P2.h - 30); g.lineTo(bx + 8, P2.y + P2.h - 30); g.closePath(); g.fill();
            g.restore();
          }
          if (i < 8) {
            const q4 = pt(t, st + 0.55, st + 0.85);
            if (q4 > 0) {
              const sameRow = col !== 2;
              g.save(); g.globalAlpha = q4; g.strokeStyle = 'rgba(232,199,122,0.8)'; g.lineWidth = 2.2; g.lineCap = 'round';
              if (sameRow) {
                const x1 = P2.x + P2.w + 2, x2 = x1 + 34 * q4, y = P2.y + P2.h / 2;
                g.beginPath(); g.moveTo(x1, y); g.lineTo(x2, y); g.stroke();
                g.fillStyle = 'rgba(232,199,122,0.8)';
                g.beginPath(); g.moveTo(x2 + 8, y); g.lineTo(x2 - 4, y - 6); g.lineTo(x2 - 4, y + 6); g.closePath(); g.fill();
              } else {
                const x = P2.x + P2.w / 2, y1 = P2.y + P2.h + 2, y2 = y1 + 120 * q4;
                g.beginPath(); g.moveTo(x, y1); g.lineTo(x, y2); g.stroke();
                g.fillStyle = 'rgba(232,199,122,0.8)';
                g.beginPath(); g.moveTo(x, y2 + 8); g.lineTo(x - 6, y2 - 4); g.lineTo(x + 6, y2 - 4); g.closePath(); g.fill();
              }
              g.restore();
            }
          }
        }
      });
    };
  }

  /* ==================================================================
   * 【S9 · v030–v033】③章 → 形象一致
   * A-roll 段：左边留给数字人（x 0–560 / y 460–1540），图形全部排在右栏 570–1030。
   * 配方：T12a 章卡（v030）、T08k 同批位置同步标出（v031）、T11p 多卡并排→收进大窗（v032/v033）
   * ================================================================== */
  /* 右栏定妆图小卡：同一张 __PERSON 反复用，这就是本片的"形象一致" */
  function faceCard(g, x, y, s, o) {
    o = o || {};
    const img = window.__PERSON;
    g.save();
    g.fillStyle = 'rgba(251,246,234,0.96)';
    rr(g, x, y, s, s, 14); g.fill();
    g.strokeStyle = o.on ? 'rgba(217,169,74,0.95)' : 'rgba(58,50,38,0.28)';
    g.lineWidth = o.on ? 2.6 : 1.4; rr(g, x, y, s, s, 14); g.stroke();
    g.beginPath(); rr(g, x + 3, y + 3, s - 6, s - 6, 12); g.clip();
    if (img) {
      const ih = s * 0.94, iw = ih * img.naturalWidth / img.naturalHeight;
      g.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
      g.drawImage(img, x + s / 2 - iw / 2, y + s - ih - 2, iw, ih);
    } else {
      g.fillStyle = 'rgba(58,50,38,0.14)'; g.fillRect(x + 3, y + 3, s - 6, s - 6);
    }
    g.restore();
  }

  /* ---------- v031：同一张定妆图复印一张，两卡对齐（Δ0px） ---------- */
  function visSameFace() {
    return (g, t, pt_, c) => {
      const X = 586, W = 190;
      const a = pt(t, c.t0 + 0.02, c.t0 + 0.30);
      if (a > 0) {
        g.save(); g.globalAlpha = a;
        g.translate(0, (1 - eOutQuart(a)) * -40);
        faceCard(g, X, 600, W, {});
        g.restore();
        text(g, '定妆图', X, 582, { size: 22, color: 'rgba(58,50,38,0.55)' });
      }
      const b = pt(t, c.t0 + 0.34, c.t0 + 0.78);
      if (b > 0) {
        const y = lerp(600, 830, eOutQuart(b));
        g.save(); g.globalAlpha = clamp((t - (c.t0 + 0.34)) / 0.2, 0, 1);
        faceCard(g, X, y, W, { on: b >= 0.999 });
        g.restore();
        // 复印扫描光带：一直在扫
        const sw = ((t - c.t0) * 0.9) % 1;
        g.save();
        g.beginPath(); rr(g, X + 3, y + 3, W - 6, W - 6, 12); g.clip();
        g.fillStyle = 'rgba(217,169,74,0.16)';
        g.fillRect(X, y + (W - 6) * sw, W, 26);
        g.restore();
        const q = pt(t, c.t0 + 0.80, c.t0 + 1.20);
        if (q > 0) {
          g.save(); g.globalAlpha = q;
          g.strokeStyle = 'rgba(217,169,74,0.85)'; g.lineWidth = 1.6; g.setLineDash([7, 7]);
          g.beginPath(); g.moveTo(X + W + 22, 600); g.lineTo(X + W + 22, 830 + W); g.stroke();
          g.setLineDash([]);
          [600, 830].forEach((yy) => {
            g.beginPath(); g.moveTo(X - 10, yy); g.lineTo(X + W + 44, yy); g.stroke();
          });
          g.restore();
          text(g, 'Δ 0px', X + W + 56, 740, { size: 30, weight: 700, font: 'mono', color: BROWN, spacing: 1 });
        }
      }
    };
  }

  /* ---------- v032：一张参考图 → 视频模型 → 同一个人的三份输出 ---------- */
  function visRefDrive() {
    return (g, t, pt_, c) => {
      const CX = 800, S = 132;
      const a = pt(t, c.t0 + 0.04, c.t0 + 0.44);
      if (a > 0) {
        g.save(); g.globalAlpha = a; faceCard(g, CX - S / 2, 520, S, { on: true }); g.restore();
        text(g, '同一张参考图', CX, 502, { size: 22, color: 'rgba(58,50,38,0.6)', align: 'center' });
      }
      const b = pt(t, c.t0 + 0.50, c.t0 + 0.92);
      if (b > 0) {
        g.save(); g.globalAlpha = b;
        g.strokeStyle = 'rgba(58,50,38,0.45)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(CX, 664); g.lineTo(CX, 664 + 66 * eOutQuart(b)); g.stroke();
        const w = 250 * eOutQuart(b), h = 62;
        g.fillStyle = 'rgba(58,50,38,0.92)'; rr(g, CX - w / 2, 740, w, h, 31); g.fill();
        g.restore();
        if (b > 0.6) text(g, '视频模型', CX, 781, { size: 26, weight: 600, font: 'serif', color: CREAM, align: 'center', spacing: 4 });
      }
      const OUTY = 1010, OS = 104;
      for (let i = 0; i < 3; i++) {
        const q = pt(t, c.t0 + 1.00 + i * 0.42, c.t0 + 1.40 + i * 0.42);
        if (q <= 0) continue;
        const ox = 606 + i * 138;
        g.save(); g.globalAlpha = q;
        g.strokeStyle = 'rgba(217,169,74,0.8)'; g.lineWidth = 2.2; g.lineCap = 'round';
        g.beginPath(); g.moveTo(CX, 806);
        g.lineTo(lerp(CX, ox + OS / 2, q), lerp(806, OUTY - 26, q));
        g.stroke();
        g.restore();
        faceCard(g, ox, OUTY - 26, OS, { on: q >= 0.999 });
      }
      const ring = pt(t, c.t0 + 2.40, c.t0 + 2.85);
      if (ring > 0) {
        g.save(); g.globalAlpha = ring;
        g.strokeStyle = 'rgba(58,50,38,0.75)'; g.lineWidth = 2.4; g.setLineDash([12, 9]);
        g.lineDashOffset = -(t - c.t0) * 30;
        rr(g, 586, OUTY - 40, 416, OS + 34, 16); g.stroke(); g.setLineDash([]);
        g.restore();
        text(g, '永远是同一个人', 794, OUTY + OS + 56, {
          size: 26, weight: 600, font: 'serif', color: BROWN, align: 'center', spacing: 2,
        });
      }
    };
  }

  /* ---------- v033：三份收成一个点，交给下一段 ---------- */
  function visCollapse() {
    return (g, t, pt_, c) => {
      const k = quintic(t, c.t0 + 0.02, c.t0 + 0.82);
      const OS = 104, OUTY = 984, CX = 794;
      for (let i = 0; i < 3; i++) {
        const ox = 606 + i * 138;
        const cx = lerp(ox + OS / 2, CX, k), cy = lerp(OUTY + OS / 2, 900, k);
        const s = Math.max(8, lerp(OS, 10, k));
        g.save(); g.globalAlpha = clamp(1 - k * 1.15, 0, 1);
        faceCard(g, cx - s / 2, cy - s / 2, s, {});
        g.restore();
      }
      const dot = clamp((t - (c.t0 + 0.80)) / 0.22, 0, 1);
      if (dot > 0) {
        g.save(); g.globalAlpha = dot;
        g.fillStyle = 'rgba(217,169,74,' + (0.65 + 0.35 * (0.5 + 0.5 * Math.sin(t * 7))) + ')';
        g.beginPath(); g.arc(CX, 900 - (1 - dot) * 30, 9, 0, TAU); g.fill();
        g.restore();
      }
    };
  }

  /* ==================================================================
   * 【S10 · v034–v037】不用模板 → 矢量 → 逐帧 → 暗号
   * 配方：T06b 划掉落定（v034）、T17c 图层展开（v035）、T09n 逐帧进度（v036）、T20j 砸字（v037）
   * ================================================================== */
  /* ---------- v034：三张模板卡被一条斜线划掉 ---------- */
  function visStrikeTemplate() {
    return (g, t, pt_, c) => {
      const W = 268, H = 210, Y = 760, X0 = (VW - (W * 3 + 44 * 2)) / 2;
      const strike = wq(t, c.t0 + 0.86, c.t0 + 1.24);
      for (let i = 0; i < 3; i++) {
        const q = pt(t, c.t0 + 0.02 + i * 0.10, c.t0 + 0.30 + i * 0.10);
        if (q <= 0) continue;
        const X = X0 + i * (W + 44);
        const dim = 1 - strike * 0.55;
        g.save();
        g.globalAlpha = q * (0.35 + 0.65 * dim);
        g.fillStyle = 'rgba(217,169,74,0.06)'; rr(g, X, Y + (1 - q) * 26, W, H, 16); g.fill();
        g.strokeStyle = 'rgba(217,169,74,' + (0.28 + 0.42 * dim) + ')'; g.lineWidth = 1.8;
        rr(g, X, Y + (1 - q) * 26, W, H, 16); g.stroke();
        g.fillStyle = 'rgba(245,238,220,' + (0.10 + 0.10 * dim) + ')';
        g.fillRect(X + 24, Y + 34 + (1 - q) * 26, W - 48, 22);
        for (let r = 0; r < 2; r++) for (let cc = 0; cc < 2; cc++) {
          g.fillStyle = 'rgba(245,238,220,' + (0.05 + 0.06 * dim) + ')';
          g.fillRect(X + 24 + cc * 108, Y + 78 + r * 56 + (1 - q) * 26, 96, 44);
        }
        g.restore();
        // J109.04：模板标签 20→30 加粗（要看得见）
        text(g, '模板 ' + (i + 1), X + 24, Y + H + 44, { size: 30, weight: 700, font: 'serif', color: 'rgba(245,238,220,' + (0.45 + 0.35 * dim) + ')', spacing: 2 });
      }
      if (strike > 0) {
        // J109.04：斜线改成「马克笔粗划」一道 —— 粗头宽扫（26px 圆头 + 略弯 + 扫痕）
        const x1 = X0 - 40, y1 = Y + H + 70, x2 = X0 + W * 3 + 88 + 40, y2 = Y - 40;
        const mx = lerp(x1, x2, strike), my = lerp(y1, y2, strike);
        g.save();
        g.strokeStyle = 'rgba(226,59,46,0.95)'; g.lineWidth = 26; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x1, y1);
        g.quadraticCurveTo(lerp(x1, mx, 0.5) + 26, lerp(y1, my, 0.5) - 18, mx, my);
        g.stroke();
        // 马克笔扫痕（细一线，稍偏）
        g.strokeStyle = 'rgba(226,59,46,0.55)'; g.lineWidth = 8;
        g.beginPath(); g.moveTo(x1 + 10, y1 + 14);
        g.quadraticCurveTo(lerp(x1, mx, 0.5) + 30, lerp(y1, my, 0.5) - 6, mx + 6, my + 10);
        g.stroke();
        g.restore();
      }
    };
  }

  /* ---------- v035：四层矢量 2×2 逐层展开（J109.23 Mimo：2×2 带标签+边框，
     入场错峰 0.12s，四层不叠在同一中心） ---------- */
  function visVectorLayers() {
    return (g, t, pt_, c) => {
      const LAY = [
        ['矩形', (gg, x, y, s) => { gg.strokeRect(x, y, s * 0.8, s * 0.56); }],
        ['圆', (gg, x, y, s) => { gg.beginPath(); gg.arc(x + s * 0.4, y + s * 0.28, s * 0.24, 0, TAU); gg.stroke(); }],
        ['线', (gg, x, y, s) => { gg.beginPath(); gg.moveTo(x, y + s * 0.46); gg.lineTo(x + s * 0.8, y + s * 0.10); gg.stroke(); }],
        ['文字', (gg, x, y, s) => { text(gg, 'Ab', x + s * 0.4, y + s * 0.44, { size: 64, weight: 700, font: 'serif', color: CREAM, align: 'center' }); }]
      ];
      // 2×2：两列两行，每层一张卡（边框 + 卡内图形 + 卡下标签）
      const CW = 420, CH = 300, GX = 40, GY = 110, X0 = (VW - (CW * 2 + GX)) / 2, Y0 = 560;
      LAY.forEach(([name, draw], i) => {
        const q = pt(t, c.t0 + 0.05 + i * 0.12, c.t0 + 0.42 + i * 0.12);   // 错峰 0.12s
        if (q <= 0) return;
        const X = X0 + (i % 2) * (CW + GX), Y = Y0 + Math.floor(i / 2) * (CH + GY);
        const grow = eOutQuart(q);
        g.save();
        g.globalAlpha = clamp(q * 1.4, 0, 1);
        // 边框（从下长出）
        g.strokeStyle = 'rgba(217,169,74,0.85)'; g.lineWidth = 2.6;
        rr(g, X, Y + CH * (1 - grow), CW, CH * grow, 16); g.stroke();
        g.fillStyle = 'rgba(217,169,74,0.05)';
        rr(g, X, Y + CH * (1 - grow), CW, CH * grow, 16); g.fill();
        if (grow > 0.7) {
          g.save(); g.beginPath(); rr(g, X, Y, CW, CH, 16); g.clip();
          g.strokeStyle = 'rgba(232,199,122,0.9)'; g.lineWidth = 3.2;
          draw(g, X + CW * 0.1, Y + CH * 0.18, CW * 0.8);
          g.restore();
        }
        g.restore();
        // 标签（卡内左上角，带小色点）
        const la = clamp((q - 0.5) / 0.5, 0, 1);
        if (la > 0) {
          g.save(); g.globalAlpha = la;
          g.fillStyle = GOLD; g.beginPath(); g.arc(X + 30, Y + 36, 7, 0, TAU); g.fill();
          text(g, name, X + 52, Y + 48, {
            size: 30, weight: 700, font: 'serif', color: 'rgba(245,238,220,0.85)', spacing: 3,
          });
          g.restore();
        }
      });
      // 合成括号 + 帧计数（尾部持续动）
      const merge = pt(t, c.t0 + 1.20, c.t0 + 1.80);
      if (merge > 0) {
        const cx = VW / 2, cy = Y0 + CH + GY / 2;
        g.save(); g.globalAlpha = merge * 0.9;
        g.strokeStyle = 'rgba(232,199,122,0.8)'; g.lineWidth = 2; g.setLineDash([10, 10]);
        g.lineDashOffset = -(t - c.t0) * 40;
        rr(g, X0 - 24, Y0 - 24, CW * 2 + GX + 48, CH * 2 + GY + 48, 22); g.stroke();
        g.restore();
        text(g, '4 层 · ' + (Math.floor((t - c.t0) * 24) % 999).toString().padStart(3, '0') + ' 帧', cx, Y0 + CH * 2 + GY + 96, {
          size: 26, font: 'mono', color: 'rgba(217,169,74,0.85)', align: 'center',
        });
      }
    };
  }

  /* ---------- v036：浏览器一帧一帧渲染 ---------- */
  function visFrameRender() {
    return (g, t, pt_, c) => {
      const X = 120, W = 840, Y = 900;
      const prog = quintic(t, c.t0 + 0.06, c.t0 + 1.60);
      const total = 3832;
      const cur = Math.round(total * prog);
      text(g, String(cur).padStart(4, '0'), VW / 2, 800, { size: 96, weight: 700, font: 'mono', color: CREAM, align: 'center' });
      text(g, 'FRAME', VW / 2, 742, { size: 24, font: 'mono', color: 'rgba(217,169,74,0.8)', align: 'center', spacing: 8 });
      text(g, '/ ' + total, VW / 2 + 150, 800, { size: 26, font: 'mono', color: 'rgba(245,238,220,0.45)' });
      g.save();
      g.fillStyle = 'rgba(245,238,220,0.10)'; rr(g, X, Y, W, 16, 8); g.fill();
      g.fillStyle = GOLD; rr(g, X, Y, Math.max(2, W * prog), 16, 8); g.fill();
      const hx = X + W * prog;
      g.fillStyle = 'rgba(245,214,140,' + (0.6 + 0.4 * Math.sin(t * 9)) + ')';
      g.beginPath(); g.arc(hx, Y + 8, 12, 0, TAU); g.fill();
      g.restore();
      const NW = 120, NG = 16, NX = (VW - (NW * 6 + NG * 5)) / 2, NY = 1000;
      for (let i = 0; i < 6; i++) {
        const filled = clamp(prog * 6 - i, 0, 1);
        const x = NX + i * (NW + NG);
        g.save();
        g.strokeStyle = 'rgba(217,169,74,' + (0.22 + 0.5 * filled) + ')'; g.lineWidth = 1.6;
        rr(g, x, NY, NW, NW * 0.72, 8); g.stroke();
        if (filled > 0.6) {
          g.fillStyle = 'rgba(217,169,74,0.10)';
          rr(g, x + 4, NY + 4, (NW - 8) * clamp((filled - 0.6) / 0.4, 0, 1), NW * 0.72 - 8, 6); g.fill();
        }
        g.restore();
      }
      const done = pt(t, c.t0 + 1.60, c.t0 + 1.86);
      if (done > 0) {
        g.save(); g.globalAlpha = (1 - done) * 0.9;
        g.strokeStyle = GOLD_LT; g.lineWidth = 3;
        rr(g, X - 10 - 40 * done, Y - 10 - 20 * done, W + 20 + 80 * done, 36 + 40 * done, 20); g.stroke();
        g.restore();
      }
    };
  }

  /* ---------- v037：暗号「从零开始」四个字依次砸出（竖排，右栏） ---------- */
  function visCodeWord(word) {
    return (g, t, pt_, c) => {
      const chars = Array.from(word);
      const SIZE = 124, LH = 148, X = 800, Y0 = 560;
      chars.forEach((ch, i) => {
        // J116.01：四字各自锚到「从零开始」的实际台词时刻（t0+0.98 起，逐字 0.25s），不提前
        const at = c.t0 + 0.98 + i * 0.25;
        const q = clamp((t - at) / 0.34, 0, 1);
        if (q <= 0) return;
        const s = eElastic(clamp(q * 1.06, 0, 1));
        const cy = Y0 + i * LH;
        g.save();
        g.translate(X, cy); g.scale(s, s); g.translate(-X, -cy);
        g.globalAlpha = clamp(q * 2.2, 0, 1);
        text(g, ch, X, cy + SIZE * 0.34, { size: SIZE, weight: 700, font: 'serif', color: BROWN, align: 'center' });
        g.restore();
      });
      const scan = quintic(t, c.t0 + 2.40, c.t0 + 3.30);
      if (scan > 0) {
        g.save(); g.strokeStyle = 'rgba(217,169,74,0.95)'; g.lineWidth = 4; g.lineCap = 'round';
        const top = Y0 - 60, bot = Y0 + (chars.length - 1) * LH + 90;
        g.beginPath(); g.moveTo(X + 96, top); g.lineTo(X + 96, lerp(top, bot, scan)); g.stroke();
        g.restore();
      }
      // 尾段也不许停：一道柔光沿四个字往下走（循环），保证没有静止窗口
      const sw = 0.5 + 0.5 * Math.sin(t * 2.1);
      const gy = lerp(Y0 - 90, Y0 + (chars.length - 1) * LH + 140, sw);
      g.save();
      const grd = g.createLinearGradient(0, gy - 130, 0, gy + 130);
      grd.addColorStop(0, 'rgba(217,169,74,0)');
      grd.addColorStop(0.5, 'rgba(217,169,74,0.16)');
      grd.addColorStop(1, 'rgba(217,169,74,0)');
      g.fillStyle = grd; g.fillRect(700, gy - 130, 230, 260);
      g.restore();      const lastY = Y0 + (chars.length - 1) * LH;
      g.save();
      g.globalAlpha = 0.20 + 0.20 * (0.5 + 0.5 * Math.sin(t * 3.4));
      g.fillStyle = GOLD;
      g.beginPath(); g.arc(X, lastY + SIZE * 0.34 + 44, 9, 0, TAU); g.fill();
      g.restore();
    };
  }

  /* ==================================================================
   * 【S2 重做 · 2026-10-29 审片意见 6/7/8】
   *   v006 画面/动效/配乐 按时间依次出现，图标 + 大字 + 小注（不再只有图标）
   *   v007 五段导轨：节点放大 + 每格带标签
   *   v008 两张卡：卡面写 A-roll / B-roll 与各自的用途
   * ================================================================== */
  /* 一个「图标 + 大字 + 小注」的行 */
  function s2Row(g, x, y, w, icon, title, note, k, hot) {
    if (k <= 0) return;
    const e = eOutQuart(k);
    g.save();
    g.globalAlpha = clamp(k * 1.6, 0, 1);
    const dx = (1 - e) * -70;
    g.translate(dx, 0);
    // 图标底框
    g.fillStyle = hot ? 'rgba(217,169,74,0.16)' : 'rgba(245,238,220,0.06)';
    rr(g, x, y - 62, 124, 124, 22); g.fill();
    g.strokeStyle = hot ? 'rgba(232,199,122,0.9)' : 'rgba(245,238,220,0.28)';
    g.lineWidth = hot ? 2.6 : 1.6; rr(g, x, y - 62, 124, 124, 22); g.stroke();
    g.save(); g.translate(x + 62, y); g.strokeStyle = hot ? GOLD_LT : CREAM;
    g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round';
    icon(g); g.restore();
    // 大字
    text(g, title, x + 164, y + 6, { size: 76, weight: 700, font: 'serif', color: hot ? CREAM : 'rgba(245,238,220,0.86)', spacing: 6 });
    // 小注
    text(g, note, x + 168, y + 52, { size: 26, color: hot ? 'rgba(232,199,122,0.95)' : 'rgba(245,238,220,0.45)', spacing: 2 });
    // 行尾细线（向右长出，撑满画面）+ 一直在走的光点（防静止窗口）
    const lw = (w - 300) * e;
    g.strokeStyle = hot ? 'rgba(217,169,74,0.75)' : 'rgba(245,238,220,0.16)';
    g.lineWidth = 2; g.beginPath();
    g.moveTo(x + 300, y + 74); g.lineTo(x + 300 + lw, y + 74); g.stroke();
    const px = x + 300 + lw * ((t * 0.55) % 1);
    g.fillStyle = hot ? 'rgba(245,214,140,0.95)' : 'rgba(245,238,220,0.38)';
    g.beginPath(); g.arc(px, y + 74, 4.5, 0, TAU); g.fill();
    // 图标框呼吸
    g.strokeStyle = hot
      ? 'rgba(232,199,122,' + (0.55 + 0.35 * (0.5 + 0.5 * Math.sin(t * 3.4))) + ')'
      : 'rgba(245,238,220,' + (0.18 + 0.14 * (0.5 + 0.5 * Math.sin(t * 2.2 + 1))) + ')';
    g.lineWidth = hot ? 2.6 : 1.6; rr(g, x, y - 62, 124, 124, 22); g.stroke();
    g.restore();
  }

  function visS2Four() {
    const ICON = {
      frame: (g) => { g.strokeRect(-34, -26, 68, 52); g.beginPath(); g.moveTo(-34, 6); g.lineTo(34, 6); g.stroke(); },
      motion: (g) => { g.beginPath(); g.moveTo(-34, 18); g.bezierCurveTo(-10, -34, 10, 34, 34, -18); g.stroke(); g.beginPath(); g.arc(34, -18, 7, 0, TAU); g.fillStyle = GOLD_LT; g.fill(); },
      music: (g) => { for (let i = -1; i <= 1; i++) { const h = [26, 44, 18][i + 1]; g.beginPath(); g.moveTo(i * 20, -h); g.lineTo(i * 20, h); g.stroke(); } },
    };
    return (g, t, pt_, c) => {
      const dur = c.dur;
      const rows = [
        ['frame', '画面', '每一帧都是代码画出来的', 0.04],
        ['motion', '动效', '位移、缓动、节奏，全在时间函数里', 0.30],
        ['music', '配乐', '和弦与鼓点也是代码合成', 0.56],
      ];
      rows.forEach(([ico, title, note, at], i) => {
        const k = pt(t, c.t0 + at * dur, c.t0 + at * dur + 0.62);
        // 时间到就亮，后面的行接上时前一行降为常规
        const nextAt = rows[i + 1] ? c.t0 + rows[i + 1][3] * dur : 1e9;
        const hot = t < nextAt;
        s2Row(g, 120, 690 + i * 272, 840, ICON[ico], title, note, k, hot);
      });
      // 收尾：一条金线把三行括起来 + 右下角一枚「纯代码」章
      // C22.00（Mimo）：章从 (880,1320) 与第三行重叠 → 移到右下角空区 (x>760, y>1340)，
      // 且在三行全部出完后才盖章（0.90*dur > 末行完成时刻）
      const seal = pt(t, c.t0 + 0.90 * dur, c.t0 + 0.90 * dur + 0.55);
      if (seal > 0) {
        g.save(); g.globalAlpha = seal;
        g.strokeStyle = 'rgba(217,169,74,' + (0.55 + 0.30 * (0.5 + 0.5 * Math.sin(t * 3.2))) + ')';
        g.lineWidth = 2.4; rr(g, 96, 596, 888, 780, 26); g.stroke();
        g.restore();
        const s = 0.75 + 0.25 * springAt(t, c.t0 + 0.90 * dur, 0.36);
        g.save(); g.translate(880, 1408); g.scale(s, s); g.translate(-880, -1408); g.globalAlpha = seal;
        g.fillStyle = 'rgba(217,169,74,0.18)'; rr(g, 796, 1376, 168, 62, 31); g.fill();
        g.strokeStyle = GOLD_LT; g.lineWidth = 2; rr(g, 796, 1376, 168, 62, 31); g.stroke();
        g.restore();
        text(g, '纯代码', 880, 1416, { size: 30, weight: 700, font: 'serif', color: GOLD_LT, align: 'center', spacing: 3 });
      }
    };
  }

  /* v007（Mimo V1 · 24:20 重做）：【正式开始】不要流程图 → 大字标题处理：
     「正式开始」砸落（压扁回弹）→「先讲思路」渐显 → 金色光点缓缓落在「思路」上脉冲，
     无箭头/无导轨/无流程图元素 */
  function visS2Rail() {
    return (g, t, pt_, c) => {
      const lt = t - c.t0;
      // 「正式开始」四字整块砸落（squash 回弹）
      const k = clamp((lt - 0.15) / 0.5, 0, 1);
      if (k > 0) {
        const e = eElastic(clamp(k * 1.1, 0, 1));
        const sq = 1 + 0.09 * Math.sin(clamp((k - 0.72) / 0.28, 0, 1) * Math.PI);
        g.save();
        g.translate(540, 830); g.scale(1 / sq, sq); g.translate(-540, -830);
        g.translate(0, -(1 - e) * 360);
        g.globalAlpha = clamp(k * 2, 0, 1);
        text(g, '正式开始', 540, 850, {
          size: 168, weight: 700, font: 'serif', align: 'center', spacing: 14,
          color: CREAM,
        });
        g.restore();
      }
      // 「先讲思路」渐显
      const q2 = pt(t, c.t0 + 0.85, c.t0 + 1.30);
      if (q2 > 0) {
        g.save(); g.globalAlpha = q2;
        text(g, '先讲思路', 540, 1010, {
          size: 56, weight: 600, font: 'serif', align: 'center', spacing: 10,
          color: 'rgba(245,238,220,0.75)',
        });
        g.restore();
      }
      // 金色光点从左上缓缓飘落，落在「思路」（后两字）上脉冲
      const land = clamp((lt - 1.35) / 0.7, 0, 1);
      if (land > 0) {
        const e = eOutQuart(land);
        const tx = 540 + 118, ty = 1010;                 // 「思路」二字中心
        const px = lerp(300, tx, e), py = lerp(680, ty - 60, e);
        g.save(); g.fillStyle = GOLD_LT;
        g.beginPath(); g.arc(px, py, 10, 0, TAU); g.fill();
        // 拖尾
        g.globalAlpha = 0.35;
        g.beginPath(); g.moveTo(px, py); g.lineTo(lerp(300, tx, Math.max(0, e - 0.12)), lerp(680, ty - 60, Math.max(0, e - 0.12))); g.lineWidth = 3; g.strokeStyle = GOLD; g.stroke();
        g.restore();
        if (land >= 1) {
          // 落点：思路 两字提亮 + 下划线扫光 + 脉冲环
          g.save(); g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 4);
          text(g, '思路', tx, ty, { size: 56, weight: 700, font: 'serif', align: 'center', spacing: 10, color: GOLD_LT });
          g.restore();
          const sw = (0.5 + 0.5 * Math.sin(t * 1.9));
          g.save(); g.fillStyle = GOLD;
          g.fillRect(tx - 70 - 18 * sw, ty + 30, 140 + 36 * sw, 3);
          g.globalAlpha = 0.3 + 0.2 * Math.sin(t * 3.2);
          g.strokeStyle = GOLD_LT; g.lineWidth = 2;
          g.beginPath(); g.arc(tx, ty - 16, 86 + 10 * Math.sin(t * 2.4), 0, TAU); g.stroke();
          g.restore();
        }
      }
      // 防静止：标题金线呼吸
      g.save();
      g.globalAlpha = 0.3 + 0.18 * Math.sin(t * 2.2);
      g.strokeStyle = GOLD; g.lineWidth = 2;
      g.beginPath(); g.moveTo(340, 906); g.lineTo(740, 906); g.stroke();
      g.restore();
    };
  }

  function visS2Cards() {
    return (g, t, pt_, c) => {
      const w = 430, h = 660, cy = 640;
      // Mimo 修：形参是 pt_，函数体原来误用外层缓动函数 pt 做算术（NaN → 整屏不画）
      const k = eOutQuart(clamp(pt_ / 0.5, 0, 1));
      const ax = lerp(-w, 84, k), bx = lerp(VW, 566, k);
      // A：暖纸讲人
      g.save();
      g.fillStyle = 'rgba(243,235,214,0.97)'; rr(g, ax, cy, w, h, 22); g.fill();
      text(g, 'A-roll', ax + 40, cy + 118, { size: 84, weight: 700, font: 'mono', color: BROWN, spacing: 2 });
      text(g, '暖纸底', ax + 44, cy + 196, { size: 34, weight: 600, font: 'serif', color: 'rgba(58,50,38,0.92)', spacing: 4 });
      text(g, '讲人 · 开场 / 过渡 / 情绪', ax + 44, cy + 252, { size: 24, color: 'rgba(58,50,38,0.62)' });
      g.fillStyle = 'rgba(58,50,38,0.16)'; g.fillRect(ax + 44, cy + 300, w - 88, 2);
      for (let i = 0; i < 3; i++) {
        const q = clamp((pt_ - 0.45 - i * 0.10) / 0.3, 0, 1);
        if (q <= 0) continue;
        g.fillStyle = 'rgba(58,50,38,' + (0.22 * q) + ')';
        g.fillRect(ax + 44, cy + 340 + i * 46, (w - 88) * q * (0.85 - i * 0.12), 12);
      }
      g.restore();
      // B：墨黑讲理
      g.save();
      g.fillStyle = 'rgba(18,17,12,0.98)'; rr(g, bx, cy, w, h, 22); g.fill();
      g.strokeStyle = 'rgba(217,169,74,0.65)'; g.lineWidth = 2.4; rr(g, bx, cy, w, h, 22); g.stroke();
      text(g, 'B-roll', bx + 40, cy + 118, { size: 84, weight: 700, font: 'mono', color: GOLD_LT, spacing: 2 });
      text(g, '墨黑底', bx + 44, cy + 196, { size: 34, weight: 600, font: 'serif', color: CREAM, spacing: 4 });
      text(g, '讲理 · 对比 / 流程 / 因果', bx + 44, cy + 252, { size: 24, color: 'rgba(245,238,220,0.55)' });
      g.fillStyle = 'rgba(245,238,220,0.14)'; g.fillRect(bx + 44, cy + 300, w - 88, 2);
      for (let i = 0; i < 3; i++) {
        const q = clamp((pt_ - 0.55 - i * 0.10) / 0.3, 0, 1);
        if (q <= 0) continue;
        g.fillStyle = 'rgba(245,238,220,' + (0.20 * q) + ')';
        g.fillRect(bx + 44, cy + 340 + i * 46, (w - 88) * q * (0.85 - i * 0.12), 12);
      }
      g.restore();
      // 中间一条竖线 + 上方一枚「两分」标
      const k2 = clamp((pt_ - 0.42) / 0.5, 0, 1);
      if (k2 > 0) {
        g.save(); g.strokeStyle = GOLD; g.lineWidth = 3;
        g.beginPath(); g.moveTo(VW / 2, cy + 60); g.lineTo(VW / 2, cy + 60 + (h - 120) * k2); g.stroke();
        g.restore();
        text(g, '全片只有两种画面', VW / 2, cy - 44, {
          size: 34, weight: 600, font: 'serif', color: 'rgba(245,238,220,' + (0.9 * k2) + ')', align: 'center', spacing: 3,
        });
      }
    };
  }


  /* ==================================================================
   * 【S6 · v016–v020】2026-10-29 第三轮（审片意见 11/12/13）
   *   v016 两套模板各画各的（人物在场 · 暖纸）
   *   v017 响指：58.23 定格冲击波 → 压黑（人物在场 · 暖纸）
   *   v018 第一步：稿子 → 配音 → 时间表（B-roll）
   *   v019 和 AI 把稿子聊透：字数从 3200 压到 1000
   *   v020 配音 → 语音识别 → 每个字的时间表
   * ================================================================== */
  function visS6Templates() {
    return (g, t, pt_, c) => {
      const cards = [['A', '暖纸 · 讲人'], ['B', '墨黑 · 讲理']];
      cards.forEach(([tag, note], i) => {
        const x = 600 + i * 0, y = 700 + i * 300;
        // Mimo V1 · 53:15：两卡与 v015 就位态完全同形同位、全程不动；
        // 只有卡上的文字/线条（"其它元素"）渐显
        g.save();
        g.fillStyle = i ? 'rgba(20,18,12,0.96)' : 'rgba(243,235,214,0.97)';
        rr(g, x, y, 400, 220, 18); g.fill();
        g.strokeStyle = i ? 'rgba(217,169,74,0.6)' : 'rgba(58,50,38,0.25)'; g.lineWidth = 2;
        rr(g, x, y, 400, 220, 18); g.stroke();
        g.restore();
        const q = pt(t, c.t0 + 0.10 + i * 0.22, c.t0 + 0.52 + i * 0.22);
        if (q <= 0) return;
        g.save();
        g.globalAlpha = clamp(q * 1.5, 0, 1);
        text(g, tag, x + 26, y + 84, { size: 64, weight: 700, font: 'mono', color: i ? GOLD_LT : BROWN });
        text(g, note, x + 30, y + 140, { size: 26, weight: 600, font: 'serif', color: i ? 'rgba(245,238,220,0.85)' : 'rgba(58,50,38,0.85)' });
        for (let k = 0; k < 3; k++) {
          const qq = clamp((q - 0.35 - k * 0.10) / 0.3, 0, 1);
          if (qq <= 0) continue;
          g.fillStyle = i ? 'rgba(245,238,220,' + (0.16 * qq) + ')' : 'rgba(58,50,38,' + (0.16 * qq) + ')';
          g.fillRect(x + 30, y + 168 + k * 0, 340 * qq, 8);
        }
        g.restore();
      });
      // 顶部一句「各按自己的模板」
      const lq = pt(t, c.t0 + 0.35, c.t0 + 0.75);
      if (lq > 0) {
        g.save(); g.globalAlpha = lq;
        text(g, '各按自己的模板', 600, 640, { size: 34, weight: 600, font: 'serif', color: BROWN, spacing: 3 });
        g.restore();
      }
    };
  }

  function visS6Snap(snapAt) {
    return (g, t, pt_, c) => {
      const snapT = c.t0 + snapAt;
      // ① 响指前：一只手的位置预标一个极淡的准星（让观众先有落点）
      const pre = pt(t, c.t0 + 0.10, c.t0 + 0.45);
      if (pre > 0 && t < snapT) {
        const k = clamp((snapT - t) / 0.5, 0, 1);
        g.save(); g.globalAlpha = pre * 0.35 * k;
        g.strokeStyle = 'rgba(217,169,74,0.9)'; g.lineWidth = 2;
        g.beginPath(); g.arc(470, 980, 34 + 8 * (1 - k), 0, TAU); g.stroke();
        g.beginPath(); g.moveTo(470, 926); g.lineTo(470, 946); g.moveTo(470, 1014); g.lineTo(470, 1034); g.stroke();
        g.restore();
      }
      // ② 响指瞬间：白闪 + 冲击波扩散
      const d = t - snapT;
      if (d >= 0 && d < 0.55) {
        const k = d / 0.55;
        g.save();
        g.globalAlpha = (1 - k) * 0.75;
        g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, VW, VH);
        g.restore();
        g.save();
        g.globalAlpha = (1 - k) * 0.9;
        g.strokeStyle = GOLD_LT; g.lineWidth = 5 * (1 - k) + 1;
        g.beginPath(); g.arc(470, 980, 50 + 900 * eOutQuart(k), 0, TAU); g.stroke();
        g.restore();
      }
      // ③ 压黑：把整屏收走，交给 B-roll
      const dark = pt(t, snapT + 0.28, snapT + 0.75);
      if (dark > 0) {
        g.save(); g.globalAlpha = dark;
        g.fillStyle = '#12110C'; g.fillRect(0, 0, VW, VH);
        g.restore();
        if (dark > 0.75) {
          const k = clamp((dark - 0.75) / 0.25, 0, 1);
          // F58.19：文字移到右侧 x=760、字号 56（避开数字人 x≤560）
          // 静止窗口修复：压黑尾部 + 句间空隙不能定格 —— 响指余波回响圈 + 缓扫光带 + 文字呼吸
          for (let r = 0; r < 2; r++) {
            const rp = (((t - snapT) / 1.4 + r * 0.5) % 1);
            g.save();
            g.globalAlpha = (1 - rp) * 0.20 * k;
            g.strokeStyle = GOLD_LT; g.lineWidth = 2;
            g.beginPath(); g.arc(470, 980, 50 + rp * 760, 0, TAU); g.stroke();
            g.restore();
          }
          const sy = 240 + ((t * 130) % 1500);
          g.save(); g.globalAlpha = 0.09 * k;
          const grd = g.createLinearGradient(0, sy - 90, 0, sy + 90);
          grd.addColorStop(0, 'rgba(232,199,122,0)'); grd.addColorStop(0.5, 'rgba(232,199,122,1)'); grd.addColorStop(1, 'rgba(232,199,122,0)');
          g.fillStyle = grd; g.fillRect(0, sy - 90, VW, 180);
          g.restore();
          const breath = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(t * 2.2));
          text(g, '进 B-roll', 760, 880, {
            size: 56, weight: 700, font: 'serif', align: 'center', spacing: 5,
            color: 'rgba(245,238,220,' + (0.9 * k * breath) + ')',
          });
          g.save(); g.globalAlpha = 0.5 * k;
          const uw = 150 + 90 * (0.5 + 0.5 * Math.sin(t * 1.8));
          g.fillStyle = GOLD; g.fillRect(760 - uw / 2, 922, uw, 3);
          g.restore();
        }
      }
    };
  }

  /* 一条线上三个节点依次亮（v018 三步 / v020 三步都复用） */
  function s6Chain(labels, y, hotIdx) {
    return (g, t, pt_, c) => {
      const x0 = 150, w = 780, nodes = labels.length;
      const lineK = eOutQuart(pt(t, c.t0 + 0.05, c.t0 + 0.55));
      g.save();
      g.strokeStyle = 'rgba(245,238,220,0.35)'; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w * lineK, y); g.stroke();
      g.restore();
      labels.forEach((s, i) => {
        const x = x0 + (w / (nodes - 1)) * i;
        const q = pt(t, c.t0 + 0.10 + i * 0.34, c.t0 + 0.46 + i * 0.34);
        if (q <= 0) return;
        const hot = i === hotIdx;
        const pulse = hot ? 1 + 0.10 * Math.sin(t * 5.2) : 0.94 + 0.10 * (0.5 + 0.5 * Math.sin(t * 2.2 + i));
        g.save();
        g.fillStyle = hot ? GOLD_LT : 'rgba(20,18,12,0.95)';
        g.strokeStyle = hot ? GOLD_LT : 'rgba(245,238,220,0.45)'; g.lineWidth = 3;
        g.beginPath(); g.arc(x, y, 34 * pulse * q, 0, TAU); g.fill(); g.stroke();
        g.restore();
        text(g, s, x, y + 92, {
          size: 34, weight: hot ? 700 : 500, font: 'serif', align: 'center', spacing: 2,
          color: hot ? CREAM : 'rgba(245,238,220,0.55)',
        });
      });
      // 沿链跑的光点
      const gx = x0 + w * ((t * 0.4) % 1);
      g.save(); g.fillStyle = 'rgba(232,199,122,0.85)';
      g.beginPath(); g.arc(gx, y, 6, 0, TAU); g.fill(); g.restore();
    };
  }

  function visS6Step1() {
    return s6Chain(['稿子', '配音', '时间表'], 920, 2);
  }

  function visS6Words() {
    return (g, t, pt_, c) => {
      // F65.09（Mimo 重排）：外框放大到 900×600；稿子行在框内左侧，
      // 对话气泡移到稿子右侧（不再叠一起），字数滚动在右下。
      const from = 3200, to = 1000;
      const k = quintic(t, c.t0 + 0.10, c.t0 + 1.90);
      const FX = 90, FY = 560, FW = 900, FH = 600;
      // 外框（图纸感：纸色描边 + 四角折线）
      g.save();
      g.strokeStyle = 'rgba(217,169,74,0.55)'; g.lineWidth = 2.4;
      rr(g, FX, FY, FW, FH, 22); g.stroke();
      g.fillStyle = 'rgba(243,235,214,0.05)'; rr(g, FX, FY, FW, FH, 22); g.fill();
      g.strokeStyle = 'rgba(217,169,74,0.8)'; g.lineWidth = 3; g.lineCap = 'round';
      const CL = 34;
      [[FX, FY, 1, 1], [FX + FW, FY, -1, 1], [FX, FY + FH, 1, -1], [FX + FW, FY + FH, -1, -1]].forEach(([x, y, dx, dy]) => {
        g.beginPath(); g.moveTo(x + dx * CL, y + dy * 6); g.lineTo(x + dx * 6, y + dy * 6); g.lineTo(x + dx * 6, y + dy * CL); g.stroke();
      });
      g.restore();
      // 左：一页稿子（行数随字数变少）
      const X = FX + 40, Y = FY + 60, W = 420, H = 480;
      g.save();
      g.fillStyle = 'rgba(243,235,214,0.95)'; rr(g, X, Y, W, H, 14); g.fill();
      const rows = Math.round(lerp(16, 5, k));
      for (let i = 0; i < rows; i++) {
        g.fillStyle = 'rgba(58,50,38,0.34)';
        g.fillRect(X + 26, Y + 28 + i * (H - 56) / 17, (W - 60) * (0.72 + (i % 3) * 0.10), 9);
      }
      g.restore();
      text(g, '和 AI 把稿子聊透', X + 4, Y - 18, { size: 26, color: 'rgba(245,238,220,0.55)' });
      // 右：对话气泡三枚（垂直错落，在稿子右侧，不再压稿子）
      for (let i = 0; i < 3; i++) {
        const q = ((t * 0.42 + i * 0.33) % 1);
        g.save(); g.globalAlpha = Math.sin(q * Math.PI) * 0.6;
        g.strokeStyle = 'rgba(245,238,220,0.55)'; g.lineWidth = 2;
        rr(g, 580 + i * 46, FY + 70 + i * 84 - q * 30, 150 + i * 40, 56, 22); g.stroke();
        g.restore();
      }
      // 右下：字数滚动 + 目标线
      const num = Math.round(lerp(from, to, k));
      text(g, String(num), 760, 960, { size: 150, weight: 700, font: 'mono', color: CREAM, align: 'center' });
      text(g, '字', 905, 960, { size: 44, weight: 600, font: 'serif', color: 'rgba(245,238,220,0.6)' });
      const hit = clamp((k - 0.85) / 0.15, 0, 1);
      g.save();
      g.strokeStyle = 'rgba(217,169,74,' + (0.35 + 0.45 * hit) + ')'; g.lineWidth = 3; g.setLineDash([12, 10]);
      g.beginPath(); g.moveTo(580, 1040); g.lineTo(960, 1040); g.stroke(); g.setLineDash([]);
      g.restore();
      text(g, '目标 ≤ 1000', 770, 1090, { size: 28, weight: 600, font: 'serif', align: 'center', color: 'rgba(232,199,122,' + (0.5 + 0.5 * hit) + ')', spacing: 2 });
    };
  }

  function visS6ASR() {
    return (g, t, pt_, c) => {
      // F71.22（Mimo 重排）：字表 13 格 → 20 格两行，秒数字号加大，下方补「每个字 = 一格」图例
      const X = 110, W = 860, Y = 700;
      // 波形（配音）
      const k = pt(t, c.t0 + 0.04, c.t0 + 0.60);
      g.save(); g.strokeStyle = 'rgba(232,199,122,0.85)'; g.lineWidth = 2.4; g.lineCap = 'round';
      g.beginPath();
      for (let i = 0; i <= 120; i++) {
        const x = X + (W / 120) * i;
        const on = i / 120 <= k;
        const amp = on ? (10 + 34 * Math.abs(Math.sin(i * 0.7 + t * 4)) * (0.4 + 0.6 * Math.sin(i * 0.13 + 0.7))) : 0;
        g.moveTo(x, Y); g.lineTo(x, Y - amp);
      }
      g.stroke(); g.restore();
      text(g, '配音', X, Y - 78, { size: 28, weight: 600, font: 'serif', color: CREAM });
      // 箭头往下
      const ar = pt(t, c.t0 + 0.55, c.t0 + 0.85);
      if (ar > 0) {
        g.save(); g.strokeStyle = 'rgba(245,238,220,0.55)'; g.lineWidth = 2.4;
        g.beginPath(); g.moveTo(VW / 2, Y + 36); g.lineTo(VW / 2, Y + 36 + 56 * ar); g.stroke(); g.restore();
      }
      // 字表：20 格两行 + 秒数（22px）；F71.22「下部分空」→ 格子 72→82、行距 118→150、整体铺高
      const words = ['配', '音', '出', '来', '丢', '给', '语', '音', '识', '别', '拿', '到', '每', '个', '字', '在', '第', '几', '秒', '表'];
      const per = 10, cw = 82, gapx = 10, rowH = 150;
      const startX = (VW - (per * cw + (per - 1) * gapx)) / 2;
      const gridY = Y + 150;
      words.forEach((ch, i) => {
        const q = pt(t, c.t0 + 1.00 + i * 0.055, c.t0 + 1.22 + i * 0.055);
        if (q <= 0) return;
        const x = startX + (i % per) * (cw + gapx), y = gridY + Math.floor(i / per) * rowH;
        g.save(); g.globalAlpha = q;
        g.fillStyle = 'rgba(245,238,220,' + (0.08 + 0.10 * q) + ')'; rr(g, x, y, cw, cw, 8); g.fill();
        g.strokeStyle = 'rgba(217,169,74,' + (0.3 + 0.5 * q) + ')'; g.lineWidth = 1.6; rr(g, x, y, cw, cw, 8); g.stroke();
        g.restore();
        text(g, ch, x + cw / 2, y + 58, { size: 42, weight: 600, font: 'serif', color: CREAM, align: 'center' });
        text(g, (i * 0.21).toFixed(2), x + cw / 2, y + cw + 34, { size: 22, font: 'mono', color: 'rgba(217,169,74,0.9)', align: 'center' });
      });
      // 扫描光沿字表走（红竖线）
      const sw = ((t - c.t0) * 0.7) % 1;
      const sx = startX + (per * (cw + gapx)) * sw;
      g.save(); g.globalAlpha = 0.5;
      g.strokeStyle = 'rgba(226,59,46,0.9)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(sx, gridY - 30); g.lineTo(sx, gridY + rowH * 2 + 20); g.stroke();
      g.restore();
      // 图例：每个字 = 一格（F71.22）
      const lg = pt(t, c.t0 + 2.15, c.t0 + 2.5);
      if (lg > 0) {
        g.save(); g.globalAlpha = lg;
        g.strokeStyle = 'rgba(217,169,74,0.8)'; g.lineWidth = 1.6;
        rr(g, VW / 2 - 230, gridY + rowH * 2 + 66, 34, 34, 6); g.stroke();
        text(g, '每个字 = 一格', VW / 2 - 176, gridY + rowH * 2 + 92, {
          size: 30, weight: 600, font: 'serif', color: 'rgba(232,199,122,0.9)', spacing: 2,
        });
        g.restore();
      }
    };
  }

  /* ==================================================================
   * 【S4 / S5 换装置】动效库配方：双轨赛跑（T14a2）、分叉选择（T05h）、连锁节点
   * ===== D 节（Mimo）：v009/v010 fallback→beat；v011 竖排三行+砸卡；v012 收进 B 卡 =====
   * ================================================================== */
  /* 大标题卡「砸下来」装置（D32.00/D41.17）：eElastic 落地 + 压扁 + 尾部扫光呼吸。
     v009 用 MOTION.drop 做砸下；v011 尾部在 vis 内部复用同一画法。 */
  function drawSlamCard(g, t, o) {
    // o: {title, sub, x, y, w, h, k(0..1 入场), style:'a'|'b'}
    const { title, sub, x, y, w, h, k, style } = o;
    const e = eElastic(clamp(k * 1.15, 0, 1));
    const sq = 1 + 0.10 * Math.sin(clamp((k - 0.72) / 0.28, 0, 1) * Math.PI);   // 落地压扁
    g.save();
    g.translate(x + w / 2, y + h); g.scale(1 / sq, sq); g.translate(-(x + w / 2), -(y + h));
    g.translate(0, -(1 - e) * 520);
    g.globalAlpha = clamp(k * 1.8, 0, 1);
    // 卡体
    const light = style === 'a';
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 28; g.shadowOffsetY = 12;
    g.fillStyle = light ? 'rgba(243,235,214,0.97)' : 'rgba(20,18,12,0.96)';
    rr(g, x, y, w, h, 26); g.fill();
    g.restore();
    g.strokeStyle = light ? 'rgba(58,50,38,0.25)' : 'rgba(217,169,74,0.65)'; g.lineWidth = 2.4;
    rr(g, x, y, w, h, 26); g.stroke();
    text(g, title, x + w / 2, y + h * 0.52, {
      size: 88, weight: 700, font: 'mono', align: 'center', spacing: 3,
      color: light ? BROWN : GOLD_LT,
    });
    text(g, sub, x + w / 2, y + h - 42, {
      size: 30, weight: 600, font: 'serif', align: 'center', spacing: 5,
      color: light ? 'rgba(58,50,38,0.78)' : 'rgba(245,238,220,0.8)',
    });
    g.restore();
    // 尾部扫光（落地后一直在动）
    if (k >= 1) {
      const sw = (0.5 + 0.5 * Math.sin(t * 1.7));
      g.save();
      g.fillStyle = light ? 'rgba(217,169,74,0.5)' : 'rgba(217,169,74,0.7)';
      g.fillRect(x + w / 2 - 90 - 30 * sw, y + h - 26, 180 + 60 * sw, 3);
      g.restore();
      g.save();
      g.globalAlpha = 0.22 + 0.12 * Math.sin(t * 2.4);
      g.strokeStyle = GOLD; g.lineWidth = 2;
      rr(g, x - 6, y - 6, w + 12, h + 12, 30); g.stroke();
      g.restore();
    }
  }
  /* v009：A-roll 大标题卡砸下（右侧栏，人物占左） */
  function visSlamCard(title, sub, style, cx, cy, w, h) {
    return (g, t, pt_, c) => {
      drawSlamCard(g, t, { title, sub, x: cx - w / 2, y: cy - h / 2, w, h, k: 1, style });
    };
  }
  /* v010：三张情绪色卡 + 「开场/过渡/情绪」三词依次砸落上去（D35.00） */
  function visS3Words() {
    const CARDS = [
      ['开场', 'rgba(200,65,43,0.88)'],
      ['过渡', 'rgba(217,169,74,0.88)'],
      ['情绪', 'rgba(58,50,38,0.88)'],
    ];
    return (g, t, pt_, c) => {
      CARDS.forEach(([word, color], i) => {
        const cx = 795, cy = 640 + i * 230, w = 430, h = 170;
        // 卡先弹入
        const cq = springAt(t, c.t0 + 0.05 + i * 0.22, 0.5);
        if (cq <= 0) return;
        const cs = clamp(cq, 0, 1.1);
        g.save();
        g.translate(cx, cy); g.scale(cs, cs); g.translate(-cx, -cy);
        g.fillStyle = color;
        rr(g, cx - w / 2, cy - h / 2, w, h, 18); g.fill();
        g.strokeStyle = 'rgba(58,50,38,0.25)'; g.lineWidth = 2;
        rr(g, cx - w / 2, cy - h / 2, w, h, 18); g.stroke();
        g.restore();
        // 词从上砸落（eElastic + 压扁）
        const wq2 = clamp((t - (c.t0 + 0.62 + i * 0.48)) / 0.42, 0, 1);
        if (wq2 <= 0) return;
        const e = eElastic(wq2);
        const sq = 1 + 0.12 * Math.sin(clamp((wq2 - 0.7) / 0.3, 0, 1) * Math.PI);
        g.save();
        g.translate(cx, cy + 18); g.scale(1 / sq, sq); g.translate(-cx, -(cy + 18));
        g.globalAlpha = clamp(wq2 * 2, 0, 1);
        g.translate(0, -(1 - e) * 320);
        text(g, word, cx, cy + 22, {
          size: 62, weight: 700, font: 'serif', align: 'center', spacing: 8,
          color: i === 1 ? '#12110C' : CREAM,
        });
        g.restore();
      });
      // 尾部：已落位的词轻轻上下浮动（永不停）
      for (let i = 0; i < 3; i++) {
        const wq2 = clamp((t - (c.t0 + 0.62 + i * 0.48)) / 0.42, 0, 1);
        if (wq2 < 1) continue;
        const cy = 640 + i * 230;
        const bob = Math.sin(t * 2.1 + i * 1.2) * 4;
        text(g, CARDS[i][0], 795, cy + 22 + bob, {
          size: 62, weight: 700, font: 'serif', align: 'center', spacing: 8,
          color: i === 1 ? '#12110C' : CREAM,
        });
      }
    };
  }
  /* v011：三种语义图形 → 竖向三行铺满（Mimo V1 修订）：
     37:08 行不再提前——落位点对齐台词「画对比、流程、因果」（1.55/2.25/2.95s），
     提前只画极淡的虚线行框占位；40:16 尾部 B-roll 素材框放大 700×300 居中。 */
  function visS4Three() {
    const ROWS = [
      ['对比', '两列并排', 'two', 1.55],
      ['流程', '按顺序走', 'flow', 2.25],
      ['因果', '一条链', 'chain', 2.95],
    ];
    return (g, t, pt_, c) => {
      const lt = t - c.t0;
      // 落位前：极淡虚线行框占位（不抢戏、画面不空）
      ROWS.forEach(([, , , at], i) => {
        if (lt >= at) return;
        const y = 620 + i * 270;
        g.save();
        g.globalAlpha = 0.5;
        g.strokeStyle = 'rgba(245,238,220,0.13)'; g.lineWidth = 1.6; g.setLineDash([10, 12]);
        rr(g, 120, y - 100, 860, 200, 18); g.stroke();
        g.setLineDash([]);
        g.restore();
      });
      ROWS.forEach(([name, note, kind, at], i) => {
        const q = pt(t, c.t0 + at, c.t0 + at + 0.5);
        if (q <= 0) return;
        const y = 620 + i * 270, e = eOutQuart(q);
        const dimK = 1 - 0.5 * clamp((lt - 3.85) / 0.5, 0, 1);       // 砸卡后压暗
        g.save(); g.globalAlpha = clamp(q * 1.4, 0, 1) * dimK;
        // 行框（从左擦出）
        g.strokeStyle = 'rgba(217,169,74,0.5)'; g.lineWidth = 2;
        rr(g, 120, y - 100, 860 * e, 200, 18); g.stroke();
        // 左图标区（生长感）
        g.save(); g.strokeStyle = 'rgba(232,199,122,0.9)'; g.lineWidth = 3.4; g.lineCap = 'round';
        if (kind === 'two') {
          const h1 = 96 * e, h2 = 62 * e;
          g.strokeRect(178, y + 52 - h1, 44, h1); g.strokeRect(254, y + 52 - h2, 44, h2);
          g.beginPath(); g.moveTo(158, y + 52); g.lineTo(318, y + 52); g.stroke();
        } else if (kind === 'flow') {
          for (let k = 0; k < 3; k++) {
            const qq = clamp(e * 3 - k, 0, 1);
            if (qq <= 0) continue;
            g.strokeRect(152 + k * 62, y - 30, 46, 46);
            if (k < 2 && qq > 0.6) {
              g.beginPath(); g.moveTo(202 + k * 62, y - 7); g.lineTo(216 + k * 62, y - 7); g.stroke();
              g.beginPath(); g.moveTo(216 + k * 62, y - 7); g.lineTo(208 + k * 62, y - 13); g.moveTo(216 + k * 62, y - 7); g.lineTo(208 + k * 62, y - 1); g.stroke();
            }
          }
        } else {
          const xs = [180, 300];
          g.beginPath(); g.moveTo(xs[0], y - 8); g.lineTo(lerp(xs[0], xs[1], e), y - 8); g.stroke();
          xs.forEach((cx) => { g.beginPath(); g.arc(cx, y - 8, 22 * e, 0, TAU); g.stroke(); });
          g.beginPath();
          g.moveTo(322, y - 8); g.lineTo(322 + 18 * e, y - 8); g.stroke();
          g.beginPath(); g.moveTo(336, y - 8); g.lineTo(328, y - 13); g.moveTo(336, y - 8); g.lineTo(328, y - 3); g.stroke();
        }
        g.restore();
        // 右文字
        text(g, name, 420, y + 16, { size: 52, weight: 700, font: 'serif', color: CREAM, spacing: 5 });
        text(g, note, 580, y + 12, { size: 28, color: 'rgba(245,238,220,0.55)', spacing: 2 });
        g.restore();
      });
      // 句尾：B-roll 大标题卡砸下（Mimo V1 · 40:16：放大 700×300 居中）
      const k = clamp((lt - 3.9) / 0.55, 0, 1);
      if (k > 0) drawSlamCard(g, t, { title: 'B-roll', sub: '墨黑 · 讲理', x: 190, y: 470, w: 700, h: 300, k, style: 'b' });
    };
  }

  /* v012：一大页知识卡片被金线框住、缩小收进 B 卡（Mimo V1 · 43:02 修订：
     B 卡与 v011 砸卡同位同形 700×300；收缩放慢、去掉脉冲闪跳，过渡平滑） */
  function visS4Collect() {
    return (g, t, pt_, c) => {
      const CX = 540, CY = 950, W = 820, H = 840;
      const T = { x: 190, y: 470, w: 700, h: 300 };                    // B 卡（目标，= v011 砸卡终态）
      const k = quintic(t, c.t0 + 0.45, c.t0 + 1.12);
      const x = lerp(CX - W / 2, T.x, k), y = lerp(CY - H / 2, T.y, k);
      const w = lerp(W, T.w, k), h = lerp(H, T.h, k);
      // 目标 B 卡轮廓（一开始就在，作为"归处"）
      g.save();
      g.globalAlpha = 0.35 + 0.3 * k;
      g.strokeStyle = GOLD; g.lineWidth = 2; g.setLineDash([12, 9]);
      rr(g, T.x, T.y, T.w, T.h, 26); g.stroke(); g.setLineDash([]);
      g.restore();
      // 大页（知识条目）→ 收缩
      const app = pt(t, c.t0, c.t0 + 0.18);
      if (app <= 0) return;
      g.save(); g.globalAlpha = app * (1 - k * 0.25);
      g.fillStyle = 'rgba(243,235,214,0.10)'; rr(g, x, y, w, h, 22); g.fill();
      // 金线框（0.1–0.5s 画出来）
      const fw = pt(t, c.t0 + 0.10, c.t0 + 0.50);
      g.strokeStyle = 'rgba(217,169,74,0.85)'; g.lineWidth = 3;
      g.setLineDash([2 * (w + h)]); g.lineDashOffset = 2 * (w + h) * (1 - fw);
      rr(g, x, y, w, h, 22); g.stroke(); g.setLineDash([]);
      // 知识条目行（收缩时淡出）
      for (let i = 0; i < 5; i++) {
        const rq = pt(t, c.t0 + 0.16 + i * 0.05, c.t0 + 0.34 + i * 0.05);
        if (rq <= 0) continue;
        g.globalAlpha = app * rq * (1 - k);
        g.fillStyle = 'rgba(58,50,38,0.30)';
        rr(g, x + w * 0.08, y + h * (0.14 + i * 0.16), w * (0.5 + (i % 3) * 0.14) * rq, h * 0.055, 6); g.fill();
      }
      g.restore();
      // 收进卡后：B 徽标 + 柔和扫光（Mimo V1：去掉脉冲闪跳，只留常驻缓动）
      if (k >= 1) {
        g.save();
        g.fillStyle = 'rgba(20,18,12,0.96)'; rr(g, T.x, T.y, T.w, T.h, 26); g.fill();
        g.strokeStyle = GOLD; g.lineWidth = 2.4; rr(g, T.x, T.y, T.w, T.h, 26); g.stroke();
        // 压缩后的知识：三条金条 + B 徽标
        for (let i = 0; i < 3; i++) {
          const bq = clamp((t - (c.t0 + 1.16 + i * 0.08)) / 0.22, 0, 1);
          if (bq <= 0) continue;
          g.fillStyle = 'rgba(232,199,122,0.75)';
          rr(g, T.x + 220, T.y + 86 + i * 62, (T.w - 420) * bq, 34, 10); g.fill();
        }
        text(g, 'B', T.x + 110, T.y + 190, { size: 96, weight: 700, font: 'mono', align: 'center', color: GOLD_LT });
        g.restore();
        const sw = (0.5 + 0.5 * Math.sin(t * 1.9));
        g.save();
        g.fillStyle = 'rgba(217,169,74,0.55)';
        g.fillRect(T.x + T.w / 2 - 90 - 28 * sw, T.y + T.h - 18, 180 + 56 * sw, 3);
        g.restore();
        // 呼吸边线（防静止）
        g.save();
        g.globalAlpha = 0.16 + 0.10 * Math.sin(t * 2.3);
        g.strokeStyle = GOLD; g.lineWidth = 2;
        rr(g, T.x - 6, T.y - 6, T.w + 12, T.h + 12, 30); g.stroke();
        g.restore();
      }
    };
  }

  /* v013：画面被劈成两半（左右各写「A-roll / B-roll」） */
  function visS4Split() {
    return (g, t, pt_, c) => {
      const k = eOutQuart(clamp(pt_ / 0.45, 0, 1));
      const gap = 60 * k;
      g.save();
      g.fillStyle = 'rgba(243,235,214,0.10)'; g.fillRect(0, 360, VW / 2 - gap / 2, 900);
      g.fillStyle = 'rgba(217,169,74,0.10)'; g.fillRect(VW / 2 + gap / 2, 360, VW / 2 - gap / 2, 900);
      g.restore();
      text(g, 'A', VW / 4, 880, { size: 200, weight: 700, font: 'mono', color: 'rgba(245,238,220,0.9)', align: 'center' });
      text(g, 'B', VW * 3 / 4, 880, { size: 200, weight: 700, font: 'mono', color: GOLD_LT, align: 'center' });
      text(g, '讲人', VW / 4, 980, { size: 40, weight: 600, font: 'serif', color: 'rgba(245,238,220,0.7)', align: 'center', spacing: 4 });
      text(g, '讲理', VW * 3 / 4, 980, { size: 40, weight: 600, font: 'serif', color: 'rgba(245,238,220,0.7)', align: 'center', spacing: 4 });
      // 中间的裂缝一直在抖
      const jit = Math.sin(t * 18) * 3;
      g.save(); g.strokeStyle = 'rgba(226,59,46,0.9)'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(VW / 2 + jit, 340); g.lineTo(VW / 2 - jit, 1290); g.stroke(); g.restore();
    };
  }

  /* v014：注意力曲线（E47.10 Mimo：曲线整体上移，下方补「0s/十几秒/三十秒」时间轴 + 三条竖刻度） */
  function visS5Attention() {
    return (g, t, pt_, c) => {
      const X = 110, W = 860, Y = 880, AY = 1220;
      const k = eOutQuart(clamp(pt_ / 0.5, 0, 1));
      g.save(); g.strokeStyle = 'rgba(245,238,220,0.5)'; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath();
      for (let i = 0; i <= 80 * k; i++) {
        const u = i / 80, x = X + W * u;
        const bump = Math.exp(-Math.pow((u - 0.22) * 9, 2)) * 170
          + Math.exp(-Math.pow((u - 0.52) * 9, 2)) * 170
          + Math.exp(-Math.pow((u - 0.82) * 9, 2)) * 170;
        const y = Y - bump - 30 * Math.sin(u * 12 + t * 1.6);
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke(); g.restore();
      // 三个刺激点（依次亮）→ 竖刻度落到下方时间轴
      const ax = pt(t, c.t0 + 0.55, c.t0 + 0.95);
      ['0s', '十几秒', '三十秒'].forEach((s, i) => {
        const q = pt(t, c.t0 + 0.30 + i * 0.28, c.t0 + 0.62 + i * 0.28);
        if (q <= 0) return;
        const u = [0.22, 0.52, 0.82][i];
        const x = X + W * u, y = Y - 170;
        g.save(); g.globalAlpha = q;
        g.fillStyle = GOLD_LT; g.beginPath(); g.arc(x, y, 9, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(232,199,122,0.7)'; g.lineWidth = 2; g.setLineDash([6, 8]);
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, AY); g.stroke(); g.setLineDash([]);
        g.restore();
        // 轴上竖刻度 + 标签
        if (ax > 0) {
          g.save(); g.globalAlpha = ax * q;
          g.fillStyle = GOLD; g.fillRect(x - 2, AY - 18, 4, 36);
          text(g, s, x, AY + 66, { size: 28, weight: 600, color: 'rgba(245,238,220,' + (0.5 + 0.4 * q) + ')', align: 'center', spacing: 2 });
          g.restore();
        }
      });
      // 时间轴底线（从左往右画出）
      if (ax > 0) {
        g.save(); g.globalAlpha = ax;
        g.strokeStyle = 'rgba(245,238,220,0.45)'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(X, AY); g.lineTo(X + W * ax, AY); g.stroke();
        g.restore();
      }
      text(g, '注意力', X, Y - 270, { size: 34, weight: 600, font: 'serif', color: CREAM, spacing: 3 });
      text(g, '每十几秒要换一次刺激', X, Y - 216, { size: 26, color: 'rgba(245,238,220,0.5)' });
    };
  }

  /* v015：一句口播 → 分叉成 A / B 两条（Mimo V1 · 50:15/53:15 重做）：
     两个框**直接以最终形态和位置出现**（= v016 两张模板卡的同位同形，屏幕等价坐标），
     不再走"分叉端点→目标位"的演化旅程；v015→v016 过渡时两卡完全不动，只有其它元素变。 */
  function visS5Fork() {
    // 目标（本句 content 坐标）= v016 卡 (600,700/1000,400,220) 经 v016 变换后的屏幕矩形，
    // 再反算回本句变换（box [150,520,780,700] → sc 1.282 / dy 80）
    const TA = { x: 589, y: 691, w: 325, h: 179 };
    const TB = { x: 589, y: 935, w: 325, h: 179 };
    return (g, t, pt_, c) => {
      // V2 · 52:18：「一句口播」改成有内容的卡片并与 A/B 卡同列对齐，分叉线一竖一绕
      const pill = { x: 589, y: 468, w: 325, h: 104 };
      const jq = clamp((t - (c.t0 + 0.12)) / 0.4, 0, 1);
      if (jq > 0) {
        const e = eOutQuart(jq);
        g.save();
        g.globalAlpha = jq;
        g.translate(0, (1 - e) * -40);
        g.fillStyle = 'rgba(217,169,74,0.16)'; rr(g, pill.x, pill.y, pill.w, pill.h, 20); g.fill();
        g.strokeStyle = 'rgba(232,199,122,0.9)'; g.lineWidth = 2.6; rr(g, pill.x, pill.y, pill.w, pill.h, 20); g.stroke();
        g.save(); g.strokeStyle = GOLD_LT; g.lineWidth = 3.2; g.lineCap = 'round';
        for (let k2 = 0; k2 < 5; k2++) {
          const bx = pill.x + 42 + k2 * 13;
          const h2 = 16 + 18 * Math.abs(Math.sin(t * 3 + k2 * 0.9));
          g.beginPath(); g.moveTo(bx, pill.y + 52 - h2 / 2); g.lineTo(bx, pill.y + 52 + h2 / 2); g.stroke();
        }
        g.restore();
        text(g, '一句口播', pill.x + 108, pill.y + 66, {
          size: 38, weight: 700, font: 'serif', color: CREAM, spacing: 4,
        });
        g.restore();
      }
      // —— 分叉连接线：口播卡 → 结点 →（一竖一绕）→ A 卡 / B 卡 ——
      const lineK = clamp((t - (c.t0 + 0.5)) / 0.5, 0, 1);
      const land = clamp((t - (c.t0 + 0.9)) / 0.35, 0, 1);
      if (lineK > 0) {
        const cx = 751.5;
        g.save();
        g.strokeStyle = 'rgba(245,238,220,0.55)'; g.lineWidth = 3.4; g.lineCap = 'round';
        g.beginPath(); g.moveTo(cx, pill.y + pill.h); g.lineTo(cx, lerp(pill.y + pill.h, 640, lineK)); g.stroke();
        if (lineK >= 1) {
          g.save(); g.translate(cx, 640); g.rotate(Math.PI / 4);
          g.fillStyle = GOLD; g.fillRect(-9, -9, 18, 18); g.restore();
        }
        const b1 = clamp((lineK - 0.35) / 0.65, 0, 1);
        if (b1 > 0) {
          g.beginPath(); g.moveTo(cx, 640); g.lineTo(cx, lerp(640, TA.y, b1)); g.stroke();
        }
        const b2 = clamp((lineK - 0.55) / 0.45, 0, 1);
        if (b2 > 0) {
          const lx = 520;
          g.beginPath();
          g.moveTo(cx, 640); g.lineTo(lerp(cx, lx, Math.min(1, b2 * 2)), 640);
          if (b2 > 0.5) g.lineTo(lx, lerp(640, TB.y + TB.h / 2, (b2 - 0.5) * 2));
          if (b2 >= 1) g.lineTo(TB.x, TB.y + TB.h / 2);
          g.stroke();
        }
        g.restore();
        // 沿线走的光点（防静止）
        const u = (t * 0.5) % 1;
        g.save(); g.fillStyle = 'rgba(245,214,140,0.9)';
        g.beginPath(); g.arc(cx, lerp(pill.y + pill.h, TA.y, u), 5.5, 0, TAU); g.fill(); g.restore();
      }
      // —— 两卡：直接以最终形态落位（原地淡入 + 微弹，无位移），卡内加字标与装饰 ——
      [[TA, 0, 'A'], [TB, 1, 'B']].forEach(([T, idx, tag]) => {
        const q = clamp((t - (c.t0 + 0.92 + idx * 0.14)) / 0.32, 0, 1);
        if (q <= 0) return;
        const pop = 0.97 + 0.03 * eOutQuart(q);
        const isA = idx === 0;
        g.save(); g.globalAlpha = q;
        g.translate(T.x + T.w / 2, T.y + T.h / 2); g.scale(pop, pop); g.translate(-(T.x + T.w / 2), -(T.y + T.h / 2));
        g.fillStyle = isA ? 'rgba(243,235,214,0.97)' : 'rgba(20,18,12,0.96)';
        rr(g, T.x, T.y, T.w, T.h, 18); g.fill();
        g.strokeStyle = isA ? 'rgba(58,50,38,0.25)' : 'rgba(217,169,74,0.65)'; g.lineWidth = 2.4;
        rr(g, T.x, T.y, T.w, T.h, 18); g.stroke();
        // 卡内装饰：四角标 + 字标 + 两条装饰线 + FRAME 小字
        g.strokeStyle = isA ? 'rgba(58,50,38,0.35)' : 'rgba(217,169,74,0.5)'; g.lineWidth = 2;
        const CL = 18;
        [[T.x + 10, T.y + 10, 1, 1], [T.x + T.w - 10, T.y + 10, -1, 1], [T.x + 10, T.y + T.h - 10, 1, -1], [T.x + T.w - 10, T.y + T.h - 10, -1, -1]].forEach(([x, y, dx, dy]) => {
          g.beginPath(); g.moveTo(x + dx * CL, y); g.lineTo(x, y); g.lineTo(x, y + dy * CL); g.stroke();
        });
        text(g, tag, T.x + 34, T.y + 92, {
          size: 72, weight: 700, font: 'mono', color: isA ? 'rgba(58,50,38,0.75)' : 'rgba(232,199,122,0.8)',
        });
        for (let k2 = 0; k2 < 2; k2++) {
          g.fillStyle = isA ? 'rgba(58,50,38,0.18)' : 'rgba(245,238,220,0.16)';
          g.fillRect(T.x + 130, T.y + 56 + k2 * 46, (T.w - 170) * (k2 ? 0.6 : 0.85), 12);
        }
        text(g, 'FRAME', T.x + 34, T.y + T.h - 26, {
          size: 18, font: 'mono', color: isA ? 'rgba(58,50,38,0.45)' : 'rgba(245,238,220,0.4)', spacing: 3,
        });
        g.restore();
      });
      // 尾部：两卡呼吸 + 边线扫光（永不停；两卡位置此后到 v016 再不变）
      if (land >= 1) {
        [TA, TB].forEach((T, i) => {
          g.save();
          g.globalAlpha = 0.20 + 0.12 * Math.sin(t * 2.2 + i * 1.4);
          g.strokeStyle = GOLD; g.lineWidth = 2;
          rr(g, T.x - 5, T.y - 5, T.w + 10, T.h + 10, 22); g.stroke();
          g.restore();
        });
      }
      // 防静止：口播卡边框呼吸
      if (jq >= 1) {
        g.save();
        g.strokeStyle = 'rgba(232,199,122,' + (0.35 + 0.25 * (0.5 + 0.5 * Math.sin(t * 3.2))) + ')';
        g.lineWidth = 2; rr(g, pill.x - 5, pill.y - 5, pill.w + 10, pill.h + 10, 24); g.stroke();
        g.restore();
      }
    };
  }

  /* ==================================================================
   * 【S11 四宫格】换成「四格点亮放大」（库里 T11o 的四格点亮版式）
   * ================================================================== */
  /* ===== K 节（Mimo）：S11 四宫格重做——四格持续在场，按台词高亮递进，不重复入场 =====
     K120.22：v038 第一格与「按语义结构选」同步（此前只画虚线预览框，不提前出元素）；
     K123.04/125.13：v039/v040 不再入场，只高亮+放大递进，出现点对齐台词；
     K126.17：四格图形重画——两列=条形生长 / 因果=带箭头细线 / 步骤=流程框图 / 结论=金句大字 */
  function visS11Quad2(stage) {
    return (g, t, pt_, c) => {
      const W = 460, H = 380, GAP = 26, X0 = (VW - (W * 2 + GAP)) / 2, Y0 = 620;
      const lt = t - c.t0;
      const HL = [
        [[0, 1.70], [1, 1.88], [2, 2.06], [3, 2.24]],   // v038：随「按语义结构选」逐格落位
        [[0, 0.15], [1, 1.25]],                          // v039：「对比就两列」「因果就一条链」
        [[2, 0.15], [3, 1.35]],                          // v040：「步骤就流程箭头」「结论就金句大字」
      ][stage];
      let lit = -1;
      for (const [j, at] of HL) if (lt >= at) lit = j;
      // stage 0 落位前：只画虚线预览框 + 扫描光（不提前出元素，K120.22）
      if (stage === 0 && lt < 1.70) {
        g.save();
        g.strokeStyle = 'rgba(245,238,220,0.16)'; g.lineWidth = 1.6; g.setLineDash([12, 10]);
        for (let i = 0; i < 4; i++) {
          const x = X0 + (i % 2) * (W + GAP), y = Y0 + Math.floor(i / 2) * (H + GAP);
          rr(g, x, y, W, H, 22); g.stroke();
        }
        g.setLineDash([]);
        const sy = Y0 + ((lt * 260) % (H * 2 + GAP));
        const grd = g.createLinearGradient(0, sy - 70, 0, sy + 70);
        grd.addColorStop(0, 'rgba(232,199,122,0)'); grd.addColorStop(0.5, 'rgba(232,199,122,0.10)'); grd.addColorStop(1, 'rgba(232,199,122,0)');
        g.fillStyle = grd; g.fillRect(X0 - 20, sy - 70, W * 2 + GAP + 40, 140);
        g.restore();
      }
      for (let i = 0; i < 4; i++) {
        const x = X0 + (i % 2) * (W + GAP), y = Y0 + Math.floor(i / 2) * (H + GAP);
        const enter = stage === 0 ? clamp((lt - (1.70 + i * 0.18)) / 0.36, 0, 1) : 1;
        if (enter <= 0) continue;
        const hot = i === lit;
        const e = eOutQuart(enter);
        g.save(); g.globalAlpha = enter;
        // 卡体（hot 放大 1.04 递进）
        const sc = hot ? 1.04 : 1;
        g.save();
        g.translate(x + W / 2, y + H / 2); g.scale(sc, sc); g.translate(-(x + W / 2), -(y + H / 2));
        g.fillStyle = hot ? 'rgba(217,169,74,0.16)' : 'rgba(245,238,220,0.05)';
        rr(g, x, y, W, H, 22); g.fill();
        g.strokeStyle = hot ? GOLD_LT : 'rgba(245,238,220,0.28)';
        g.lineWidth = hot ? 3 : 1.8; rr(g, x, y, W, H, 22); g.stroke();
        g.restore();
        const titles = ['对比', '因果', '步骤', '结论'];
        text(g, titles[i], x + 34, y + 92, { size: 54, weight: 700, font: 'serif', color: hot ? CREAM : 'rgba(245,238,220,0.8)', spacing: 4 });
        // 语义图形（K126.17 重画）
        const gy = y + H - 104;
        g.save(); g.lineCap = 'round';
        if (i === 0) {
          // 两列 = 条形生长
          const pulse = hot ? 1 + 0.12 * Math.sin(t * 3.2) : 1;
          const h1 = 110 * e * pulse, h2 = 72 * e * pulse;
          g.strokeStyle = hot ? GOLD_LT : 'rgba(245,238,220,0.45)'; g.lineWidth = 3.4;
          g.strokeRect(x + 96, gy + 66 - h1, 64, h1);
          g.strokeRect(x + 216, gy + 66 - h2, 64, h2);
          g.beginPath(); g.moveTo(x + 70, gy + 66); g.lineTo(x + 320, gy + 66); g.stroke();
        } else if (i === 1) {
          // 因果 = 带箭头的细线
          g.strokeStyle = hot ? GOLD_LT : 'rgba(245,238,220,0.45)'; g.lineWidth = 2.4;
          const xs = x + 110, xe = x + 330;
          g.beginPath(); g.arc(xs, gy + 10, 18, 0, TAU); g.stroke();
          g.beginPath(); g.arc(xe, gy + 10, 18, 0, TAU); g.stroke();
          if (hot) { g.setLineDash([14, 10]); g.lineDashOffset = -(t * 46) % 24; }
          g.beginPath(); g.moveTo(xs + 22, gy + 10); g.lineTo(xe - 30, gy + 10); g.stroke();
          g.setLineDash([]); g.lineDashOffset = 0;
          g.beginPath(); g.moveTo(xe - 12, gy + 10); g.lineTo(xe - 30, gy + 2); g.moveTo(xe - 12, gy + 10); g.lineTo(xe - 30, gy + 18); g.stroke();
        } else if (i === 2) {
          // 步骤 = 流程框图
          for (let k = 0; k < 3; k++) {
            const on = !hot || (Math.floor(t * 1.6) % 3) === k;
            g.strokeStyle = (hot && on) ? GOLD_LT : (hot ? 'rgba(232,199,122,0.5)' : 'rgba(245,238,220,0.45)');
            g.lineWidth = hot && on ? 3.4 : 2.4;
            rr(g, x + 56 + k * 118, gy - 22, 88, 64, 12); g.stroke();
            if (k < 2) {
              g.lineWidth = 2.4;
              g.beginPath(); g.moveTo(x + 150 + k * 118, gy + 10); g.lineTo(x + 166 + k * 118, gy + 10); g.stroke();
              g.beginPath(); g.moveTo(x + 166 + k * 118, gy + 10); g.lineTo(x + 158 + k * 118, gy + 4); g.moveTo(x + 166 + k * 118, gy + 10); g.lineTo(x + 158 + k * 118, gy + 16); g.stroke();
            }
          }
        } else {
          // 结论 = 金句大字
          const bob = hot ? Math.sin(t * 2.8) * 4 : 0;
          const col = hot ? GOLD_LT : 'rgba(245,238,220,0.5)';
          text(g, '「', x + 70, gy + 52 + bob, { size: 96, weight: 700, font: 'serif', color: col });
          text(g, '金句', x + 236, gy + 30 + bob, { size: 76, weight: 700, font: 'serif', color: hot ? CREAM : 'rgba(245,238,220,0.6)', align: 'center', spacing: 6 });
          text(g, '」', x + 380, gy + 52 + bob, { size: 96, weight: 700, font: 'serif', color: col });
        }
        g.restore();
        g.restore();
      }
      // 底部提示（随高亮换字）
      const tips = ['对比：两列并排', '因果：一条链', '步骤：流程箭头', '结论：金句大字'];
      const tip = lit >= 0 ? tips[lit] : '按语义结构选图形';
      text(g, tip, VW / 2, Y0 + H * 2 + GAP + 66, { size: 30, weight: 600, font: 'serif', color: 'rgba(245,238,220,0.75)', align: 'center', spacing: 3 });
    };
  }

  /* ==================================================================
   * 【S13 音轨】（M 节 Mimo 重写）
   * v044：一分钟样片时间线拉长成全片（0–159s），再从线上抽出一条音轨（M137.12）
   * v045：四条音轨四种形态（人声=包络 / 配乐=和弦块 / 音效=离散尖峰 / 混音=合成波形），
   *       真实振幅包络、整块下移铺到底、右栏响度表占满（M138.05/140.08）
   * 配方：T16a-Timeline（节点 springAt 落位）+ T14f-Gauge（指针过冲 5% 回落）
   * ================================================================== */
  function visS13Grow() {
    return (g, t, pt_, c) => {
      const lt = t - c.t0;
      // ① 样片时间线（0–60s，A/B 交替块）→ ② 拉长到 0–159s（quintic）→ ③ 抽出音轨
      const stretch = quintic(t, c.t0 + 0.85, c.t0 + 1.65);
      const W = lerp(525, 920, stretch), X = VW / 2 - W / 2, Y = 800;   // 起点 = v043 删块后的短线（9 块）
      const kIn = pt(t, c.t0 + 0.02, c.t0 + 0.3);
      // 主时间线条
      g.save(); g.globalAlpha = kIn;
      g.fillStyle = 'rgba(217,169,74,0.16)'; rr(g, X, Y, W, 84, 14); g.fill();
      g.strokeStyle = 'rgba(217,169,74,0.6)'; g.lineWidth = 2; rr(g, X, Y, W, 84, 14); g.stroke();
      // A/B 交替块（9 块 = v043 存活块，随拉长重新分布）
      const N = 9;
      for (let i = 0; i < N; i++) {
        const bw = W / N - 6;
        const bx = X + (W / N) * i + 3;
        const isB = i % 2 === 1;
        g.fillStyle = isB ? 'rgba(217,169,74,0.35)' : 'rgba(245,238,220,0.16)';
        rr(g, bx, Y + 14, bw, 56, 8); g.fill();
      }
      g.restore();
      // 章节刻度（拉长后浮现）7 个
      if (stretch > 0.15) {
        const chaps = ['开场', '思路', '①', '②', '③', '④', '收尾'];
        for (let i = 0; i < 7; i++) {
          const q = clamp((stretch - 0.15 - i * 0.06) / 0.35, 0, 1);
          if (q <= 0) continue;
          const cx = X + (W / 7) * (i + 0.5);
          g.save(); g.globalAlpha = q;
          g.fillStyle = GOLD; g.fillRect(cx - 1.5, Y + 92, 3, 12);
          text(g, chaps[i], cx, Y + 132, { size: 18, color: 'rgba(245,238,220,0.55)', align: 'center', spacing: 1 });
          g.restore();
        }
      }
      // 刻度标签：0s / 60s → 159s
      text(g, '0s', X, Y - 18, { size: 22, font: 'mono', color: 'rgba(245,238,220,0.5)' });
      text(g, stretch < 0.5 ? '60s' : '159s', X + W, Y - 18, {
        size: 22, font: 'mono', align: 'right',
        color: stretch < 0.5 ? 'rgba(245,238,220,0.5)' : 'rgba(232,199,122,0.9)',
      });
      // 播放头沿条走（一直在动）
      const ph = X + W * (((lt * 0.22) % 1));
      g.save(); g.fillStyle = GOLD;
      g.beginPath(); g.moveTo(ph, Y - 8); g.lineTo(ph - 7, Y - 20); g.lineTo(ph + 7, Y - 20); g.closePath(); g.fill();
      g.fillRect(ph - 1.5, Y, 3, 84);
      g.restore();
      // ③ 从线上抽出音轨：垂线落下 + 波形带向右画出
      const peel = pt(t, c.t0 + 1.75, c.t0 + 2.15);
      if (peel > 0) {
        const TY = Y + 210;
        g.save(); g.globalAlpha = peel;
        g.strokeStyle = 'rgba(232,199,122,0.8)'; g.lineWidth = 2.4;
        g.beginPath(); g.moveTo(VW / 2, Y + 84); g.lineTo(VW / 2, Y + 84 + (TY - Y - 84) * peel); g.stroke();
        g.restore();
        const wave = pt(t, c.t0 + 2.05, c.t0 + 2.55);
        if (wave > 0) {
          g.save();
          g.fillStyle = 'rgba(232,199,122,0.10)'; rr(g, X, TY, W * wave, 120, 12); g.fill();
          g.strokeStyle = 'rgba(232,199,122,0.55)'; g.lineWidth = 1.6; rr(g, X, TY, W * wave, 120, 12); g.stroke();
          // 人声包络波形
          g.beginPath(); g.strokeStyle = 'rgba(232,199,122,0.85)'; g.lineWidth = 2; g.lineCap = 'round';
          const M = 140;
          for (let i = 0; i <= M; i++) {
            const u = i / M;
            if (u > wave) break;
            const env = 8 + 42 * Math.abs(Math.sin(u * 21 + 1.3)) * (0.35 + 0.65 * Math.abs(Math.sin(u * 6.1 + 0.4)));
            const px = X + W * u, py = TY + 60;
            g.moveTo(px, py - env * 0.9); g.lineTo(px, py + env * 0.5);
          }
          g.stroke();
          text(g, '音轨', X + W * wave - 8, TY + 156, { size: 24, weight: 600, font: 'serif', align: 'right', color: 'rgba(232,199,122,0.85)', spacing: 2 });
          g.restore();
        }
      }
    };
  }

  /* v045：四轨四形态 + 真实振幅包络 + 右栏响度表 */
  function visS13Mix() {
    // 人声包络：种子固定的伪语音包络（音节鼓包 + 停顿），全片各段渲染一致
    const ENV = (() => {
      let s = 99173;
      const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      const M = 220, a = new Array(M + 1).fill(0);
      let x = 0.02;
      while (x < 0.98) {
        const w = 0.012 + rnd() * 0.03, amp = 0.35 + rnd() * 0.65;
        for (let i = 0; i <= M; i++) {
          const u = i / M;
          if (u >= x && u <= x + w) a[i] = Math.max(a[i], amp * Math.sin(((u - x) / w) * Math.PI));
        }
        x += w + 0.005 + rnd() * 0.028;
      }
      return a;
    })();
    const TRACKS = [
      ['人声', '#E8C77A'], ['配乐', '#8FB8C9'], ['音效', '#C98FA8'], ['混音', '#9BC98F'],
    ];
    return (g, t, pt_, c) => {
      const X = 80, W = 720, Y0 = 770, RH = 170, PITCH = 200;
      TRACKS.forEach(([name, col], i) => {
        const q = pt(t, c.t0 + 0.05 + i * 0.28, c.t0 + 0.5 + i * 0.28);
        if (q <= 0) return;
        const y = Y0 + i * PITCH;
        g.save(); g.globalAlpha = clamp(q * 1.3, 0, 1);
        g.fillStyle = 'rgba(245,238,220,0.05)'; rr(g, X, y, W * eOutQuart(q), RH, 14); g.fill();
        g.strokeStyle = 'rgba(245,238,220,0.16)'; g.lineWidth = 1.4; rr(g, X, y, W * eOutQuart(q), RH, 14); g.stroke();
        g.save(); g.beginPath(); rr(g, X, y, W * eOutQuart(q), RH, 14); g.clip();
        const cy = y + RH / 2;
        if (i === 0) {
          // 人声 = 包络（真实振幅鼓包，随时间缓移）
          g.beginPath();
          const M = ENV.length - 1;
          for (let k = 0; k <= M; k++) {
            const u = k / M, off = (t * 0.05) % 1;
            const a = ENV[Math.floor((u + off) % 1 * M)];
            const px = X + W * u;
            if (k === 0) g.moveTo(px, cy - a * 62);
            else g.lineTo(px, cy - a * 62);
          }
          for (let k = M; k >= 0; k--) {
            const u = k / M, off = (t * 0.05) % 1;
            const a = ENV[Math.floor((u + off) % 1 * M)];
            g.lineTo(X + W * u, cy + a * 40);
          }
          g.closePath();
          g.fillStyle = 'rgba(232,199,122,0.30)'; g.fill();
          g.strokeStyle = col; g.lineWidth = 1.8; g.stroke();
        } else if (i === 1) {
          // 配乐 = 和弦块（三音一组的矩形叠柱）
          for (let b = 0; b < 10; b++) {
            const bx = X + 12 + b * (W / 10);
            for (let v = 0; v < 3; v++) {
              const hh = [58, 40, 26][v] * (0.8 + 0.2 * Math.sin(t * 1.6 + b));
              g.fillStyle = 'rgba(143,184,201,' + (0.34 - v * 0.07) + ')';
              g.fillRect(bx, cy - hh / 2 + (v - 1) * 12, W / 10 - 12, hh);
            }
          }
        } else if (i === 2) {
          // 音效 = 离散尖峰
          for (let b = 0; b < 9; b++) {
            const seed = ((b * 73) % 17) / 17;
            const bx = X + 24 + seed * (W - 60);
            const hh = 42 + 46 * ((b * 41) % 7) / 7;
            g.strokeStyle = 'rgba(201,143,168,0.9)'; g.lineWidth = 3.5; g.lineCap = 'round';
            g.beginPath(); g.moveTo(bx, cy - hh / 2); g.lineTo(bx, cy + hh / 2); g.stroke();
            const tw = 2 + 2 * Math.sin(t * 6 + b);
            g.fillStyle = 'rgba(201,143,168,0.5)';
            g.beginPath(); g.arc(bx, cy - hh / 2, tw, 0, TAU); g.fill();
          }
        } else {
          // 混音 = 合成波形（包络 + 尖峰 + 块的叠加）
          g.beginPath(); g.strokeStyle = 'rgba(155,201,143,0.9)'; g.lineWidth = 2; g.lineCap = 'round';
          const M = ENV.length - 1;
          for (let k = 0; k <= 240; k++) {
            const u = k / 240, off = (t * 0.05) % 1;
            const a = ENV[Math.floor((u + off) % 1 * M)];
            const spike = (k % 29 === 0) ? 0.5 : 0;
            const amp = Math.min(1, a * 0.8 + 0.18 + spike);
            const px = X + W * u;
            g.moveTo(px, cy - amp * 58); g.lineTo(px, cy + amp * 42);
          }
          g.stroke();
        }
        g.restore();
        g.restore();
        text(g, name, X + 16, y - 12, { size: 26, weight: 600, font: 'serif', color: 'rgba(245,238,220,' + (0.5 + 0.45 * q) + ')', spacing: 2 });
      });
      // 右栏：响度表占满（x 850–1010，y 700–1740），带过冲回落（T14f 指针配方）
      const LX = 850, LW = 120, LY = 700, LH = 1040;
      const sweepP = quintic(t, c.t0 + 1.2, c.t0 + 2.7);
      const over = 0.05 * wq(t, c.t0 + 2.7, c.t0 + 3.1) * (1 - wq(t, c.t0 + 2.7, c.t0 + 3.1)) * 4;
      const lv = clamp(sweepP + over, 0, 1.15);
      g.save();
      g.strokeStyle = 'rgba(245,238,220,0.25)'; g.lineWidth = 2; rr(g, LX, LY, LW, LH, 14); g.stroke();
      const hgt = LH * (0.10 + 0.72 * lv);
      const grd = g.createLinearGradient(0, LY + LH - hgt, 0, LY + LH);
      grd.addColorStop(0, 'rgba(155,201,143,0.9)'); grd.addColorStop(1, 'rgba(155,201,143,0.35)');
      g.fillStyle = grd; rr(g, LX + 10, LY + LH - hgt + 8, LW - 20, hgt - 16, 10); g.fill();
      // -16 LUFS 目标线
      const y16 = LY + LH * (1 - 0.77);
      g.strokeStyle = 'rgba(226,59,46,0.9)'; g.lineWidth = 2; g.setLineDash([8, 6]);
      g.beginPath(); g.moveTo(LX - 14, y16); g.lineTo(LX + LW + 14, y16); g.stroke(); g.setLineDash([]);
      // 刻度
      g.fillStyle = 'rgba(245,238,220,0.4)';
      for (let i = 1; i < 6; i++) g.fillRect(LX + LW + 16, LY + (LH / 6) * i - 1, 18, 2);
      g.restore();
      text(g, '-16', LX - 18, y16 + 8, { size: 24, font: 'mono', color: 'rgba(226,59,46,0.95)', align: 'right' });
      text(g, 'LUFS', LX + LW / 2, LY - 20, { size: 22, font: 'mono', color: 'rgba(245,238,220,0.55)', align: 'center', spacing: 2 });
      // 读数（一直跳动）
      const read = (-16 + Math.sin(t * 2.3) * 0.7).toFixed(1);
      text(g, read, LX + LW / 2, LY + LH + 52, { size: 34, weight: 700, font: 'mono', align: 'center', color: 'rgba(155,201,143,0.9)' });
    };
  }

  /* ==================================================================
   * 【S14 落版】四张流程卡逐张翻起 → 收成一行 → JACK 落字（不再静止）
   * ================================================================== */
  /* ===== N 节（Mimo）：S14 落版重做 =====
     N145.08：v046「不剪辑/不露脸」各配动作（剪刀划掉 / 人脸打叉）；
     N147.10：v046–v048 同一套四卡只做递进（不重复入场）；
     N151.03：v049 四卡收进盒子 → 盒子写 skill → 递出去；
     N154.04/157.02：v050/v051 文字整体右移 x 620–1040、JACK→「关注我」、「从零开始」描边字逐笔写出 */
  function visS14Cards2(stage) {
    const CARDS = [['文案', '讲什么'], ['编排', '怎么切'], ['画面', '怎么画'], ['声音', '怎么听']];
    return (g, t, pt_, c) => {
      const lt = t - c.t0;
      const W = 400, H = 112, GAP = 18, X0 = 560, Y = 680;
      // —— stage 0：两个词的动作 ——
      if (stage === 0) {
        const badges = [
          { x: 580, word: '不剪辑', appear: 0.30, strike: 0.78, kind: 'scissors' },
          { x: 810, word: '不露脸', appear: 1.08, strike: 1.52, kind: 'face' },
        ];
        badges.forEach((B) => {
          const bq = clamp((lt - B.appear) / 0.4, 0, 1);
          if (bq <= 0) return;
          const bx = B.x, by = 480, bw = 200, bh = 160;
          g.save(); g.globalAlpha = bq;
          g.fillStyle = 'rgba(251,246,234,0.92)'; rr(g, bx, by, bw, bh, 18); g.fill();
          g.strokeStyle = 'rgba(58,50,38,0.25)'; g.lineWidth = 2; rr(g, bx, by, bw, bh, 18); g.stroke();
          // 图标
          g.strokeStyle = BROWN; g.lineWidth = 3.4; g.lineCap = 'round';
          const ix = bx + bw / 2, iy = by + 58;
          if (B.kind === 'scissors') {
            g.beginPath(); g.arc(ix - 14, iy + 22, 10, 0, TAU); g.stroke();
            g.beginPath(); g.arc(ix + 14, iy + 22, 10, 0, TAU); g.stroke();
            g.beginPath(); g.moveTo(ix - 8, iy + 14); g.lineTo(ix + 10, iy - 22); g.moveTo(ix + 8, iy + 14); g.lineTo(ix - 10, iy - 22); g.stroke();
          } else {
            g.beginPath(); g.arc(ix, iy, 26, 0, TAU); g.stroke();
            g.beginPath(); g.arc(ix - 9, iy - 6, 3.4, 0, TAU); g.arc(ix + 9, iy - 6, 3.4, 0, TAU); g.stroke();
            g.beginPath(); g.moveTo(ix - 10, iy + 12); g.quadraticCurveTo(ix, iy + 18, ix + 10, iy + 12); g.stroke();
          }
          text(g, B.word, bx + bw / 2, by + 132, { size: 32, weight: 700, font: 'serif', align: 'center', color: BROWN, spacing: 3 });
          g.restore();
          // 划掉动作（马克笔一道 / 打叉两道）
          const s = clamp((lt - B.strike) / 0.32, 0, 1);
          if (s > 0) {
            g.save(); g.strokeStyle = RED; g.lineWidth = 12; g.lineCap = 'round';
            if (B.kind === 'scissors') {
              g.beginPath(); g.moveTo(bx + 12, by + bh - 24);
              g.lineTo(lerp(bx + 12, bx + bw - 12, s), lerp(by + bh - 24, by + 20, s)); g.stroke();
            } else {
              g.beginPath(); g.moveTo(bx + 30, by + 24); g.lineTo(bx + 30 + (bw - 60) * s, by + 24 + (bh - 48) * s); g.stroke();
              if (s > 0.5) {
                const s2 = (s - 0.5) / 0.5;
                g.beginPath(); g.moveTo(bx + bw - 30, by + 24); g.lineTo(bx + bw - 30 - (bw - 60) * s2, by + 24 + (bh - 48) * s2); g.stroke();
              }
            }
            g.restore();
          }
        });
      }
      // —— 四卡（stage 0 后段进入；1/2 在场；3 收进盒子）——
      const collect = stage === 3 ? quintic(t, c.t0 + 0.25, c.t0 + 1.05) : 0;
      CARDS.forEach(([title, note], i) => {
        const q = stage === 0 ? clamp((lt - (1.15 + i * 0.22)) / 0.42, 0, 1) : 1;
        if (q <= 0) return;
        if (stage === 3 && collect >= 1) return;
        const e = eOutQuart(q);
        const x = X0, y = Y + i * (H + GAP);
        const bx = lerp(x, 700 - 60, collect), by = lerp(y, 850 - 20 + i * 9, collect);
        const bw = lerp(W, 120, collect), bh = lerp(H, 15, collect);
        g.save();
        g.globalAlpha = clamp(q * 1.3, 0, 1);
        if (stage === 0) g.translate(0, (1 - e) * 70);
        g.fillStyle = 'rgba(251,246,234,0.95)'; rr(g, bx, by, bw, bh, 16); g.fill();
        g.strokeStyle = 'rgba(58,50,38,0.28)'; g.lineWidth = 1.6; rr(g, bx, by, bw, bh, 16); g.stroke();
        g.restore();
        if (collect < 0.35) {
          g.save(); g.globalAlpha = clamp(q * 1.3, 0, 1) * (1 - collect / 0.35);
          text(g, title, x + 34, y + 66, { size: 42, weight: 700, font: 'serif', color: BROWN, spacing: 4 });
          text(g, note, x + 168, y + 64, { size: 24, color: 'rgba(58,50,38,0.62)', spacing: 2 });
          g.restore();
        }
        // 卡面进度条（一直在长）
        if (stage <= 2) {
          const bar = ((t - c.t0) * 0.5 + i * 0.2) % 1;
          g.save(); g.fillStyle = 'rgba(217,169,74,0.55)';
          g.fillRect(x + 24, y + H - 22, (W - 48) * bar, 5); g.restore();
        }
      });
      // —— stage 2：四卡合成一条横线 ——
      if (stage === 2) {
        const merge = clamp((lt - 0.3) / 0.6, 0, 1);
        g.save(); g.globalAlpha = merge;
        g.strokeStyle = GOLD; g.lineWidth = 3;
        g.beginPath(); g.moveTo(X0, Y + 4 * (H + GAP) + 30); g.lineTo(X0 + 400 * eOutQuart(merge), Y + 4 * (H + GAP) + 30); g.stroke();
        g.restore();
        text(g, '这四件事，决定片子好不好看', X0 + 200, Y + 4 * (H + GAP) + 84, {
          size: 30, weight: 600, font: 'serif', align: 'center', spacing: 2,
          color: 'rgba(58,50,38,' + (0.75 * merge) + ')',
        });
      }
      // —— stage 3：盒子收好 → 写 skill → 递出去（N151.03）——
      if (stage === 3) {
        const lid = clamp((lt - 1.02) / 0.35, 0, 1);        // 合盖
        const stamp = clamp((lt - 1.38) / 0.38, 0, 1);      // skill 落字
        const out = quintic(t, c.t0 + 1.85, c.t0 + 2.55);   // 递出
        const bx = 700 - 60 + out * 90, by = 850 - 20, bw = 300, bh = 240;
        g.save();
        // 盒体
        g.fillStyle = 'rgba(251,246,234,0.96)'; rr(g, bx, by, bw, bh, 18); g.fill();
        g.strokeStyle = GOLD; g.lineWidth = 3; rr(g, bx, by, bw, bh, 18); g.stroke();
        // 盖缝（合上）
        if (lid > 0) {
          g.strokeStyle = 'rgba(58,50,38,0.55)'; g.lineWidth = 3;
          g.beginPath(); g.moveTo(bx, by + 46 * lid); g.lineTo(bx + bw, by + 46 * lid); g.stroke();
        }
        g.restore();
        // skill 落字
        if (stamp > 0) {
          const s = 0.7 + 0.3 * eElastic(clamp(stamp * 1.1, 0, 1));
          g.save(); g.globalAlpha = clamp(stamp * 1.6, 0, 1);
          g.translate(bx + bw / 2, by + bh / 2 + 20); g.scale(s, s); g.translate(-(bx + bw / 2), -(by + bh / 2 - 20));
          text(g, 'skill', bx + bw / 2, by + bh / 2 + 30, { size: 72, weight: 700, font: 'mono', align: 'center', color: BROWN, spacing: 3 });
          g.restore();
        }
        // 递出：右侧箭头 + 余晖（Mimo V1 · 2:32:16：滑出量 220→90，盒子不出画）
        if (out > 0) {
          g.save(); g.globalAlpha = 0.85;
          g.strokeStyle = GOLD; g.lineWidth = 4; g.lineCap = 'round';
          const ax = bx - 46;
          g.beginPath(); g.moveTo(ax - 60, by + bh / 2); g.lineTo(ax - 12, by + bh / 2); g.stroke();
          g.beginPath(); g.moveTo(ax, by + bh / 2); g.lineTo(ax - 16, by + bh / 2 - 10); g.moveTo(ax, by + bh / 2); g.lineTo(ax - 16, by + bh / 2 + 10); g.stroke();
          g.restore();
          g.save(); g.globalAlpha = 0.16 + 0.10 * Math.sin(t * 3);
          g.strokeStyle = GOLD; g.lineWidth = 2;
          rr(g, bx - 8, by - 8, bw + 16, bh + 16, 22); g.stroke();
          g.restore();
        }
      }
    };
  }

  function visS14End2(stage) {
    return (g, t, pt_, c) => {
      const lt = t - c.t0;
      // Mimo V1 · 2:38:04：文字块太靠右 → 中心 830→800，每行独立居中
      const CX = 800;
      if (stage === 0) {
        // v050（Mimo V1 · 2:35:05）：三块文字打乱排布、微旋转、分批错落出场（不一起出）
        const items = [
          { s: 'JACK', x: 778, y: 800, size: 170, font: 'mono', rot: -1.6, at: 0.05, weight: 700, sp: 10 },
          { s: '用代码做视频', x: 822, y: 928, size: 52, font: 'serif', rot: 1.2, at: 0.62, weight: 600, sp: 6 },
          { s: '↓ 评论区告诉我', x: 768, y: 1042, size: 36, font: 'serif', rot: -0.7, at: 1.35, weight: 600, sp: 3 },
        ];
        items.forEach((it) => {
          const q = clamp((lt - it.at) / 0.45, 0, 1);
          if (q <= 0) return;
          const e = eOutQuart(q);
          g.save();
          g.globalAlpha = clamp(q * 1.5, 0, 1);
          g.translate(it.x, it.y); g.rotate(it.rot * Math.PI / 180);
          g.scale(0.9 + 0.1 * e, 0.9 + 0.1 * e);
          text(g, it.s, 0, 0, {
            size: it.size, weight: it.weight, font: it.font,
            color: it.at > 1 ? 'rgba(58,50,38,0.8)' : BROWN, align: 'center', spacing: it.sp,
          });
          g.restore();
        });
        // 尾部微飘（防静止）
        g.save(); g.globalAlpha = 0.25 + 0.15 * Math.sin(t * 2.1);
        g.strokeStyle = GOLD; g.lineWidth = 2;
        g.beginPath(); g.moveTo(660, 1120); g.lineTo(940, 1120); g.stroke();
        g.restore();
      } else {
        // v051：主字「关注我」+「从零开始」描边字逐笔写出（N157.02）
        const k = pt(t, c.t0 + 0.05, c.t0 + 0.55);
        const s = 0.86 + 0.14 * springAt(t, c.t0 + 0.05, 0.5);
        g.save(); g.globalAlpha = clamp(k * 1.4, 0, 1);
        g.translate(CX, 700); g.scale(s, s); g.translate(-CX, -700);
        text(g, '关注我', CX, 780, { size: 150, weight: 700, font: 'serif', color: BROWN, align: 'center', spacing: 12 });
        g.restore();
        // 「从零开始」逐字逐笔：描边轮廓先在，笔锋扫过后填金
        const chars = ['从', '零', '开', '始'];
        const SZ = 96, LX = 104;
        const x0 = CX - (chars.length * LX) / 2;
        chars.forEach((ch, i) => {
          const wq2 = clamp((lt - (0.75 + i * 0.42)) / 0.38, 0, 1);
          if (wq2 <= 0) return;
          const x = x0 + i * LX + LX / 2, y = 960;
          // 描边轮廓（始终可见）
          text(g, ch, x, y, { size: SZ, weight: 700, font: 'serif', align: 'center', color: 'rgba(58,50,38,0.28)' });
          // 笔锋自上而下扫过 → 金色填充（逐笔写出感）
          if (wq2 < 1) {
            g.save();
            g.beginPath(); g.rect(x - SZ / 2, y - SZ * 0.82, SZ, SZ * 1.02 * wq2); g.clip();
            text(g, ch, x, y, { size: SZ, weight: 700, font: 'serif', align: 'center', color: GOLD });
            g.restore();
            // 笔尖
            g.save(); g.fillStyle = GOLD;
            g.beginPath(); g.arc(x, y - SZ * 0.82 + SZ * 1.02 * wq2, 7, 0, TAU); g.fill();
            g.restore();
          } else {
            text(g, ch, x, y, { size: SZ, weight: 700, font: 'serif', align: 'center', color: GOLD });
          }
        });
      }
      // 一直在走的金线
      const sw = ((t * 0.35) % 1);
      g.save(); g.globalAlpha = 0.35;
      g.strokeStyle = GOLD; g.lineWidth = 2;
      g.beginPath(); g.moveTo(620 + 360 * sw, 1150); g.lineTo(660 + 360 * sw, 1150); g.stroke();
      g.restore();
    };
  }

  /* ---------------- BEATS：每句台词一条 ---------------- */
  // s: 起始句 id；vis: 画什么；mo: 出场手法；box: 主元素区域
  const BEATS = [
    // ===== S12：样片和成片（v041–v043，L 节 Mimo 重做） =====
    { vs: ['v041'], box: [100, 700, 880, 420], mo: 2, noprev: true, vis: visChapter(4, '第四步', '样片和成片'), note: '④章卡同款（L130.19）' },
    { vs: ['v042'], cap: '一分钟样片', sub: '一轮 A/B 节奏刚好走完', box: [150, 760, 780, 520], mo: 6, vis: visSampleBar(), note: '0–60s 时间线 + 进度条只扫一次（L133.22）' },
    { vs: ['v043'], cap: '早改最省', sub: '有问题的块现在删', box: [150, 760, 780, 520], mo: 7, noprev: true, vis: visFixEarly(), note: '三块标红删掉→时间线变短，续 v042（L135.16）' },
    // ===== S13：补声音（v044–v045） =====
    // ===== S8：检查两件事（v027–v029，H 节 Mimo 换装置「编排表体检」） =====
    { vs: ['v027'], cap: '编排表体检', sub: '9 镜头 · 2 项检查', box: [200, 700, 750, 951], mo: 7, noprev: true, vis: visS8Audit(0), note: '竖向轨道 9 块 + 扫描光束（H89.52）' },
    { vs: ['v028'], cap: '违规 ① · 连排', sub: '三四段同类型 → 拆开重排', box: [200, 700, 750, 951], mo: 7, noprev: true, vis: visS8Audit(1), note: '红圈 ×3 → 拖走重排 → 绿（H92.27）' },
    { vs: ['v029'], cap: '违规 ② · 同模', sub: '同类型 → 换模板', box: [200, 700, 750, 951], mo: 7, noprev: true, vis: visS8Audit(2), note: '红圈 ×2 → 换模板 → 绿（H94.01）' },
    // ===== S2：拆解自身（v006–v008，C 节 P1/P2 确认方案落地） =====
    { vs: ['v006'], cap: '全是代码画的', sub: '画面 / 动效 / 配乐', box: [90, 590, 900, 860], mo: 1, noprev: true, vis: visS2Four(), note: '四件东西依次长出；P1 残留元素取消 noprev；纯代码章右下 (C22.00)' },
    { vs: ['v007'], cap: '先讲思路', sub: '正式开始', box: [80, 620, 920, 520], mo: 4, vis: visS2Rail(), note: '正式开始大字砸落+光点落思路，无流程图（Mimo V1 24:20）' },
    { vs: ['v008'], cap: '只有两种画面', sub: 'A-roll 讲人 · B-roll 讲理', box: [70, 590, 940, 740], mo: 2, vis: visS2Cards(), note: '两张卡从两侧合上' },
    // ===== S4：自指 B-roll（v011–v013） =====
    // ===== S7：时间基准 → 错位 → ②章 → 取景框 → 拆镜头（v021–v026，FredTalk 配方移植） =====
    { vs: ['v021'], cap: '时间基准', sub: '每个字落在第几秒', box: [110, 480, 860, 740], mo: 1, noprev: true, vis: visTimeBase(), note: '字表被读一遍·轴上播放头同步·盖基准章' },
    { vs: ['v022'], cap: '错位 0.4s', sub: '没有基准，后面全错', box: [90, 640, 900, 580], mo: 3, vis: visOffbeat(), note: '两轨永久错开 0.42 格·拉过去弹回来·0.4s 括号' },
    { vs: ['v023'], box: [100, 700, 880, 420], mo: 2, vis: visChapter(2, '第二步', '视觉编排表'), note: '点→圆→胶囊过冲→章节名顶入（T12a）' },
    { vs: ['v024'], cap: '导演视角', sub: '文案 + 时间表 → 镜头', box: [60, 440, 960, 880], mo: 6, vis: visDirectorFrame(), note: '两卡 1.3× 汇入取景框·收紧 760×380（G80.19）' },
    { vs: ['v025'], cap: '拆成镜头', sub: '一句台词一个画面', box: [94, 820, 892, 940], mo: 7, vis: visShotSplit(), note: '从 v024 取景框原地裂开成 9 卡 3×3（G82.22/G84.08）' },
    { vs: ['v026'], cap: '镜头属性', sub: 'A/B · 时长 · 变化 · 接法', box: [94, 820, 892, 940], mo: 7, noprev: true, vis: visShotLabels(), note: '9 卡翻卡：正面序号+时长 / 背面 A/B（G85.20/G84.17）' },
    // ===== S9：③章 → 形象一致（v030–v033，A-roll 段：暖纸底 + 数字人 A04） =====
    { vs: ['v030'], box: [100, 700, 880, 420], mo: 2, vis: visChapter(3, '第三步', '正式制作'), note: '③章卡（同装置换字）' },
    { vs: ['v031'], bg: 'paper', nav: 4, person: 'A04', pf: 98.27, cap: '形象一致', sub: '每期都用同一张参考图', box: [560, 545, 470, 530], mo: 3, vis: visSameFace(), note: '定妆图复印一张·Δ0px 叠印' },
    { vs: ['v032'], bg: 'paper', nav: 4, person: 'A04', pf: 98.27, cap: '一张参考图', sub: '交给视频模型去动', box: [558, 468, 486, 726], mo: 6, vis: visRefDrive(), note: '一张参考图 → 三条输出 → 同一个人的框' },
    { vs: ['v033'], bg: 'paper', nav: 4, person: 'A04', pf: 98.27, cap: '然后是画面', sub: '换到 B-roll', box: [558, 468, 486, 726], mo: 1, vis: visCollapse(), note: '三张收成一个点·交给下一段' },
    // ===== S10：不用模板 → 矢量 → 逐帧 → 暗号（v034–v037，后两句 A-roll） =====
    { vs: ['v034'], cap: '不用模板', sub: '一个都不套', box: [90, 620, 900, 520], mo: 0, vis: visStrikeTemplate(), note: '模板卡被一条斜线划掉（T06b）' },
    { vs: ['v035'], cap: '矢量图层', sub: '矩形 / 圆 / 线 / 文字', box: [70, 530, 940, 880], mo: 4, vis: visVectorLayers(), note: '四层 2×2 带标签边框错峰 0.12s（J109.23）' },
    { vs: ['v036'], cap: '逐帧渲染', sub: '浏览器画 3832 帧', box: [90, 640, 900, 480], mo: 7, vis: visFrameRender(), note: '帧号滚动 + 进度条走完' },
    { vs: ['v037'], bg: 'paper', nav: 4, person: 'A05', pf: 115.00, box: [556, 480, 490, 700], mo: 5, vis: visCodeWord('从零开始'), note: '四个字依次砸出·合成一行（T20j）' },
    // ===== S6：各按模板 → 响指 → ①文案（v016–v020，2026-10-29 重做；F 节 Mimo 二次整改） =====
    { vs: ['v016'], bg: 'paper', nav: 2, person: 'A03', pf: 53.27, cap: '各按模板', sub: 'A/B 各画各的', box: [560, 600, 460, 640], mo: 7, noprev: true, vis: visS6Templates(), note: '两卡原地长大承接 v015 演化框（E52.09）；F56.12 残影取消' },
    { vs: ['v017'], bg: 'paper', nav: 2, person: 'A03', pf: 53.27, cap: '打响指', sub: '定格 · 画面切黑', box: [0, 0, 1080, 1920], mo: 7, vis: visS6Snap(1.859), note: '响指冲击波 → 压黑进 B-roll；「进B-roll」右移加大（F58.19）' },
    { vs: ['v018'], nav: 2, box: [100, 700, 880, 420], mo: 2, noprev: true, vis: visChapter(1, '第一步', '文案、配音、对齐'), note: '①章卡，与 v023 ②章卡同款（F62.09）' },
    { vs: ['v019'], nav: 2, cap: '先聊透稿子', sub: '压到一千字以内', box: [90, 560, 900, 600], mo: 4, vis: visS6Words(), note: '外框 900×600，气泡移到稿子右侧（F65.09）' },
    { vs: ['v020'], nav: 2, cap: '每个字的时间表', sub: '配音 → 语音识别 → 秒数', box: [80, 620, 920, 640], mo: 3, vis: visS6ASR(), note: '字表 20 格两行铺高 + 秒数加大 + 图例（F71.22）' },
    // ===== S3：A-roll 自指（v009–v010，D 节 Mimo：fallback 升级为 beat） =====
    { vs: ['v009'], bg: 'paper', person: 'A02', pf: 28.58, box: [580, 510, 460, 500], mo: 5, noprev: true, vis: visSlamCard('A-roll', '暖纸 · 讲人', 'a', 810, 660, 460, 300), note: 'A-roll 大标题卡砸下+压扁回弹（D32.00）' },
    { vs: ['v010'], bg: 'paper', person: 'A02', pf: 28.58, box: [580, 545, 430, 735], mo: 7, pdur: 0.3, vis: visS3Words(), note: '开场/过渡/情绪 三词砸落三色卡（D35.00）；Mimo V1 34:22 红框裁切修复' },
    // ===== S4 / S5 换装置（动效库：双轨 / 分叉 / 连锁） =====
    { vs: ['v011'], cap: '两种画面', sub: '对比 · 流程 · 因果', box: [100, 460, 880, 960], mo: 7, vis: visS4Three(), note: '三行对齐台词落位+尾部 B-roll 砸卡 700×300 居中（Mimo V1 37:08/40:16）' },
    { vs: ['v012'], box: [100, 460, 880, 960], mo: 7, vis: visS4Collect(), note: '知识页收进 B 卡，收缩放慢无闪跳（Mimo V1 43:02）' },
    { vs: ['v013'], cap: '为什么非要拆', sub: '先问一个为什么', box: [0, 300, 1080, 1000], mo: 3, vis: visS4Split(), note: '画面劈成 A/B 两半' },
    { vs: ['v014'], cap: '每隔十几秒', sub: '换一次刺激', box: [80, 560, 920, 760], mo: 4, vis: visS5Attention(), note: '曲线整体上移 + 下方 0s/十几秒/三十秒时间轴（E47.10）' },
    { vs: ['v015'], cap: '选 A 还是 B', sub: '每次只做一个选择', box: [150, 458, 780, 824], mo: 0, vis: visS5Fork(), note: '口播卡对齐 A/B 列+分叉线，两卡最终形态不动（V2 52:18）' },
    // ===== S11 四宫格（K 节 Mimo 重做：四格持续在场，按台词高亮递进） =====
    { vs: ['v038'], cap: '四种语义', sub: '按结构选图形', box: [70, 600, 940, 900], mo: 7, vis: visS11Quad2(0), note: '第一格与「按语义结构选」同步落位（K120.22）' },
    { vs: ['v039'], cap: '对比 · 因果', sub: '两列 / 一条链', box: [70, 600, 940, 900], mo: 7, noprev: true, vis: visS11Quad2(1), note: '不重新入场，高亮+放大递进，对齐台词（K123.04）' },
    { vs: ['v040'], cap: '步骤 · 结论', sub: '流程箭头 / 金句大字', box: [70, 600, 940, 900], mo: 7, noprev: true, vis: visS11Quad2(2), note: '四格图形语义重画：条形/箭头线/流程框图/大字（K126.17）' },
    // ===== S13 音轨换版式（M 节 Mimo 重写） =====
    { vs: ['v044'], cap: '确认后做全片', sub: '样片时间线 → 全片 159s', box: [80, 700, 920, 640], mo: 1, noprev: true, vis: visS13Grow(), note: '时间线 60s→159s 拉长 + 抽出音轨（M137.12）' },
    { vs: ['v045'], cap: '按章节生成', sub: '人声 / 配乐 / 音效 / 混音', box: [80, 700, 940, 1040], mo: 4, noprev: true, vis: visS13Mix(), note: '四轨四形态 + 真实包络 + 右栏响度表（M138.05/140.08）' },
    // ===== S14 落版（N 节 Mimo 重做） =====
    { vs: ['v046'], bg: 'paper', nav: 6, person: 'A07', pf: 144.06, cap: '不剪辑 · 不露脸', sub: '各配一个动作', box: [556, 460, 486, 860], mo: 1, vis: visS14Cards2(0), note: '剪刀划掉/人脸打叉 + 四卡进入（N145.08）' },
    { vs: ['v047'], bg: 'paper', nav: 6, person: 'A07', pf: 144.06, cap: '这样一条片子', sub: '全在代码里完成', box: [556, 460, 486, 860], mo: 7, noprev: true, vis: visS14Cards2(1), note: '同一套四卡只递进，不重复入场（N147.10）' },
    { vs: ['v048'], bg: 'paper', nav: 6, person: 'A07', pf: 144.06, cap: '整理成一套流程', sub: '下一步做成 skill', box: [556, 460, 486, 860], mo: 7, noprev: true, vis: visS14Cards2(2), note: '四卡合成横线（递进续）' },
    { vs: ['v049'], bg: 'paper', nav: 6, person: 'A07', pf: 144.06, cap: '做成 skill', sub: '别的 agent 照着做', box: [556, 460, 486, 860], mo: 7, noprev: true, vis: visS14Cards2(3), note: '四卡收进盒子→写 skill→递出去（N151.03）' },
    { vs: ['v050'], bg: 'paper', nav: 6, person: 'A07', pf: 144.06, cap: '你想做什么', sub: '评论区告诉我', box: [590, 560, 480, 620], mo: 1, vis: visS14End2(0), note: '文字整体右移 x620–1040（N154.04）' },
    { vs: ['v051'], bg: 'paper', nav: 6, person: 'A07', pf: 144.06, box: [590, 560, 480, 720], mo: 7, noprev: true, vis: visS14End2(1), note: '关注我 + 从零开始描边逐笔写出（N157.02）' }

  ];

  /* ---------------- A4 竖屏版式（重做 · Mimo） ----------------
     审片_V2 · A4：元素挤中间、上下空。第 19 轮只做到 400–1180 中带 + 小进度尺，
     底下 500px 还是空的。重做（结合 FredTalk 横屏 1920×1080 → 竖屏 1080×1920 的适配）：
     · 主图形带扩成 380–1520（竖屏 80% 高度），放大上限 1.28→1.45，仍受左右 40px 边距约束；
       先平移把内容中心对到 950，再按带高算缩放 → 任何 box 都落在带内
     · 进度尺下沉到 yB=1580（真正的「下 1/3」），加 51 句刻度 + 当前句计数 vNNN · n/51
     · 有数字人 / 整屏装置 / 铺得过满的句子自动跳过进度尺 */
  const TOTAL_T = 159.646;
  /* window.TL 只带 id/t0/t1，没有章节；章节区间照 timeline.json 的 chapters 段锁死在这里 */
  const CHAPS_FIXED = [
    { id: 'open', name: '开场', t0: 0.350, t1: 24.722 },
    { id: 'idea', name: '思路', t0: 25.172, t1: 60.317 },
    { id: 's1', name: '①文案', t0: 61.217, t1: 76.792 },
    { id: 's2', name: '②编排', t0: 77.242, t1: 95.914 },
    { id: 's3', name: '③制作', t0: 96.364, t1: 128.465 },
    { id: 's4', name: '④成片', t0: 128.915, t1: 143.605 },
    { id: 'cta', name: '收尾', t0: 144.055, t1: 158.846 }
  ];
  let CHAPS = null;
  function chaptersFrom(tl) {
    if (CHAPS) return CHAPS;
    const hasCh = Array.isArray(tl) && tl.length && tl[0].ch;
    if (!hasCh) { CHAPS = CHAPS_FIXED; return CHAPS; }
    const NAMES = { open: '开场', idea: '思路', s1: '①文案', s2: '②编排', s3: '③制作', s4: '④成片', cta: '收尾' };
    const m = new Map();
    for (const s of tl) {
      const c = m.get(s.ch) || { id: s.ch, name: NAMES[s.ch] || s.ch, t0: s.t0, t1: s.t1 };
      c.t0 = Math.min(c.t0, s.t0); c.t1 = Math.max(c.t1, s.t1);
      m.set(s.ch, c);
    }
    CHAPS = [...m.values()].sort((a, b) => a.t0 - b.t0);
    return CHAPS;
  }
  const BAND_T = 380, BAND_B = 1520, BAND_C = 950, SHIFT_MAX = 200;
  function layoutScale(b) {
    const [x, y, w, h] = b.box;
    if (w >= 1060 || h >= 1500) return 1;              // 整屏装置不放大
    const cyB = y + h / 2;
    const cyF = cyB + clamp(BAND_C - cyB, -SHIFT_MAX, SHIFT_MAX);   // 平移后的中心
    const half = Math.max(1, h / 2);
    // 横向限幅按 box 离中线 540 的远边算：右栏/左栏 box 放大时不能推出画外（40px 边距）
    const halfW = Math.max(Math.abs(x - VW / 2), Math.abs(x + w - VW / 2), 1);
    return Math.max(1, Math.min(1.45, 500 / halfW,
      (cyF - BAND_T) / half, (BAND_B - cyF) / half));
  }
  function mmss(t) {
    const s = Math.max(0, Math.round(t));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  /* 顶部导航高亮统一按「时间轴章节」走（Mimo）：与底部进度尺的章节高亮保持一致。
     段落名映射会在跨章句上出错（如 v021/v022 台词属①文案，段名却是「编排表」→ 显示②编排）。 */
  const NAV_ORDER = { open: 0, idea: 1, s1: 2, s2: 3, s3: 4, s4: 5, cta: 6 };
  function navAt(t, tl) {
    const chaps = chaptersFrom(tl);
    let last = 0;
    for (const c of chaps) {
      const ni = NAV_ORDER[c.id];
      if (ni === undefined) continue;
      if (t >= c.t0 && t < c.t1 + 0.4) return ni;
      if (t >= c.t0) last = ni;
    }
    return last;
  }
  /* 进度尺（Mimo V1 全片级 1/2 条：原模块太高 → 压矮约 1/3 并整体下移 yB 1580→1770，
     原 1580 位置留给 PR 侧的可编辑字幕轨；A-roll/B-roll 都显示） */
  function auxRuler(g, t, b, paper, tl) {
    const chaps = chaptersFrom(tl);
    const dim = paper ? 'rgba(58,50,38,0.34)' : 'rgba(245,238,220,0.30)';
    const x0 = 90, x1 = 990, span = x1 - x0, yB = 1770;
    const X = (tt) => x0 + clamp(tt / TOTAL_T, 0, 1) * span;
    // 当前句序号（vNNN · n/51）
    const idx = Array.isArray(tl) ? tl.findIndex(s => b.vs.includes(s.id)) : -1;
    g.save();
    // 基线
    g.strokeStyle = paper ? 'rgba(58,50,38,0.18)' : 'rgba(245,238,220,0.14)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0, yB); g.lineTo(x1, yB); g.stroke();
    // 51 句刻度：每句一个细齿，当前句加粗点亮
    if (Array.isArray(tl)) {
      for (const s of tl) {
        const on = t >= s.t0 && t < s.t1 + 0.05;
        const xx = X(s.t0);
        g.fillStyle = on ? GOLD : (paper ? 'rgba(58,50,38,0.26)' : 'rgba(245,238,220,0.20)');
        g.fillRect(xx - 1, yB + 3, on ? 3 : 2, on ? 10 : 6);
      }
    }
    // 章节块
    for (const c of chaps) {
      const a = X(c.t0), bx = X(c.t1), on = t >= c.t0 && t < c.t1 + 0.4;
      g.fillStyle = on ? GOLD : dim;
      rr(g, a, yB - 7, Math.max(3, bx - a - 3), 5, 2.5); g.fill();
      if (bx - a > 66) {
        text(g, c.name, (a + bx) / 2, yB + 36, {
          size: 16, weight: on ? 700 : 400, font: 'serif',
          color: on ? (paper ? BROWN : GOLD) : dim, align: 'center', spacing: 1
        });
      }
    }
    // 播放头
    const px = X(t);
    g.strokeStyle = paper ? 'rgba(58,50,38,0.55)' : 'rgba(232,199,122,0.75)';
    g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(px, yB - 16); g.lineTo(px, yB + 14); g.stroke();
    g.fillStyle = GOLD;
    g.beginPath(); g.moveTo(px, yB - 17); g.lineTo(px - 6, yB - 27); g.lineTo(px + 6, yB - 27); g.closePath(); g.fill();
    // 时间码（左）+ 当前句计数（右）
    text(g, mmss(t) + ' / ' + mmss(TOTAL_T), x0, yB + 68, { size: 17, font: MONO, color: dim, spacing: 1 });
    const right = idx >= 0 ? b.vs[0] + ' · ' + (idx + 1) + '/' + (tl.length) : (b.aux || '');
    if (right) text(g, right, x1, yB + 68, { size: 17, font: MONO, align: 'right', color: dim, spacing: 1 });
    g.restore();
  }

  /* ---------------- 渲染：按当前台词找 beat ---------------- */
  function drawBeats(g, t, segs, tl) {
    // 找当前句；落在句间空隙（0.18s）时，沿用上一句
    let cur = -1;
    for (let i = 0; i < tl.length; i++) if (t >= tl[i].t0 && t < tl[i].t1) { cur = i; break; }
    if (cur < 0) {
      for (let i = tl.length - 1; i >= 0; i--) if (t >= tl[i].t1) { cur = i; break; }
      if (cur < 0) return false;
    }
    const id = tl[cur].id;
    const bi = BEATS.findIndex(b => b.vs.includes(id));
    if (bi < 0) return false;
    const b = BEATS[bi];
    const t0 = tl[cur].t0, t1 = tl[cur].t1;
    const inGap = (t >= t1);
    const dur = Math.max(0.3, t1 - t0);
    const p = inGap ? 1 : clamp((t - t0) / Math.min(0.85, dur * 0.5), 0, 1);   // 入场进度
    const pt = clamp((t - t0) / dur, 0, 1);                                    // 整句进度
    // ⓪ A-roll 段：先换成暖纸底 + 把数字人画进来（不进任何裁剪/缩放，免得人被裁）
    const paper = b.bg === 'paper';
    // 「上一句」必须按时间轴找（A 节重做 · Mimo）：BEATS 数组不是时间顺序，
    // 拿 BEATS[bi-1] 当上一句会把不相干句子的残影画上来 —— 审片_V2 里
    // 「多了无关元素 / 元素跳 / 退场搞错」的共同根因就是它。
    const prevSeg = cur > 0 ? tl[cur - 1] : null;
    const pbi = prevSeg ? BEATS.findIndex(q => q.vs.includes(prevSeg.id)) : -1;
    const prevBeat = (pbi >= 0 && pbi !== bi) ? BEATS[pbi] : null;
    // A1：黑↔白都不硬切。墨→纸 = 灯亮（0.28s 渐入）；纸→墨 = 灯灭（0.28s 纸底渐隐）
    const prevPaper = !!prevBeat && prevBeat.bg === 'paper';
    const bgK = (!paper || prevPaper) ? 1 : clamp((t - t0) / 0.28, 0, 1);
    if (paper && window.BG_PAPER) {
      g.save();
      if (bgK < 1) g.globalAlpha = bgK;
      window.BG_PAPER(g, t);
      g.restore();
      if (window.NAV_DRAW) { g.save(); if (bgK < 1) g.globalAlpha = bgK; window.NAV_DRAW(g, t, navAt(t, tl), true); g.restore(); }
    } else if (!paper && prevPaper && window.BG_PAPER && t < t0 + 0.28) {
      const k = clamp((t - t0) / 0.28, 0, 1);
      g.save();
      g.globalAlpha = 1 - k;
      window.BG_PAPER(g, t);
      if (window.NAV_DRAW) window.NAV_DRAW(g, t, navAt(t, tl), true);
      g.restore();
    }
    if (b.person && window.PERSON_DRAW) {
      // 入场：从右侧滑入 + 0.28s 淡入（凹窗穿越的简化版，进片前再统一）
      const kin = clamp((t - t0) / 0.55, 0, 1);
      g.save();
      g.globalAlpha = 0.25 + 0.75 * kin;
      g.translate((1 - eOutQuart(kin)) * 180, 0);
      window.PERSON_DRAW(g, b.person, Math.max(0, t - (b.pf || t0)));
      g.restore();
    }
    // ① 先把上一句的元素"缩小 + 轻微上飘 + 淡出"（必须在主元素之前画，否则压字）
    //    Mimo V1 · 56:12：旧变换起手就整体上跳 200px（"跳到新位置再退场"）——
    //    现在以内容中心为轴原地缩小，上飘量随 k 渐进，起始帧位置与上一句终态完全一致。
    if (prevBeat && !b.noprev) {
      const k = clamp((t - t0) / (b.pdur || 0.42), 0, 1);
      if (k < 1) {
        g.save();
        g.globalAlpha = 0.30 * (1 - k);
        g.translate(VW / 2, 760); g.scale(1 - 0.22 * k, 1 - 0.22 * k); g.translate(-VW / 2, -760);
        g.translate(0, -70 * k);
        const pd = prevSeg.t1 - prevSeg.t0;
        prevBeat.vis(g, t, 1, { t0: prevSeg.t0, t1: prevSeg.t1, dur: pd, lt: t - prevSeg.t0 });
        g.restore();
      }
    }
    // ② 主元素（A4 重做 · Mimo：先平移把内容中心对到 950，再按 380–1520 带算缩放；
    //    box 与内容一起变换，morph/split/wipe 的裁剪窗口始终对得上）
    const [x, y, w, h] = b.box;
    const mo = MOTION[Object.keys(MOTION)[b.mo % 8]];
    const sc = layoutScale(b);
    const cyB = y + h / 2, halfH = (h / 2) * sc;
    const fullScreen = w >= 1060 || h >= 1500;      // 整屏装置（响指冲击波等）不挪不缩
    const dy = fullScreen ? 0 : clamp(950 - cyB, -200, 200);
    g.save();
    if (dy) g.translate(0, dy);
    if (sc > 1.0001) {
      const cx = 540;
      g.translate(cx, cyB); g.scale(sc, sc); g.translate(-cx, -cyB);
    }
    mo(g, x, y, w, h, p, (gg) => b.vis(gg, t, pt, { t0, t1, dur, lt: t - t0 }));
    g.restore();
    // ③ 结构标签：每条 beat 都有文字点缀（审片意见 6/8/16：画面太空、只有图标没字）
    if (b.cap) {
      const kin2 = EASE_P(clamp((t - t0 - 0.02) / 0.32, 0, 1));   // 本作用域 pt 是数字，别用缓动同名函数
      if (kin2 > 0) {
        const ink = paper ? BROWN : CREAM;
        const dim = paper ? 'rgba(58,50,38,0.62)' : 'rgba(245,238,220,0.58)';
        g.save(); g.globalAlpha = kin2;
        text(g, b.cap, 104, 268 + (1 - kin2) * 14, { size: 58, weight: 700, font: 'serif', color: ink, spacing: 5 });
        g.fillStyle = GOLD;
        g.fillRect(106, 292, 88 * kin2, 4);
        if (b.sub) text(g, b.sub, 106, 330, { size: 25, color: dim, spacing: 2 });
        g.restore();
      }
    }
    // ④ 底部进度尺（Mimo V1：A-roll/B-roll 都画；铺过 1540 的整屏装置不画）
    const auxBottom = cyB + dy + halfH;
    if (!b.noaux && auxBottom < 1540) auxRuler(g, t, b, paper, tl);
    return true;
  }

  window.BEATS = BEATS;
  window.drawBeats = drawBeats;
  window.NAV_AT = navAt;
  window.MOTION_KEYS = Object.keys(MOTION);
})();
