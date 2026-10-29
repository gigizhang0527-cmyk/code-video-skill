/*
 * render_film_v4.mjs — 按段落截关键帧
 *   node render_film_v4.mjs --keys
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOTDIR = resolve(HERE, '..');
const PROJ = resolve(HERE, '..');
const CFG = await import(pathToFileURL(join(PROJ,'video.config.mjs')).href).catch(()=>({}));
const OUTIMG = resolve(PROJ, CFG.PREVIEW || '03_画面/预览/全片');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json' };
const KEYS = [[31.5, "s3video"], [150.0, "s14video"]];
const DO_ALL = process.argv.includes('--all');
const ci = process.argv.indexOf('--clip');
const CLIP = ci > 0 ? { t0: Number(process.argv[ci + 1]), t1: Number(process.argv[ci + 2]), fps: Number(process.argv[ci + 3] || 24) } : null;

const srv = createServer(async (req, res) => {
  try {
    const u = decodeURIComponent((req.url || '/').split('?')[0]);
    const abs = join(ROOTDIR, u);
    if (!abs.startsWith(ROOTDIR)) { res.writeHead(403).end(); return; }
    const buf = await readFile(abs);
    res.writeHead(200, { 'content-type': MIME[extname(abs).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  } catch { res.writeHead(404).end('nf'); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

const userDir = join(tmpdir(), 'dsh-film-' + Date.now());
await mkdir(userDir, { recursive: true });
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDir}`, '--window-size=1080,1920',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--no-first-run', '--disable-extensions', 'about:blank'],
  { stdio: 'ignore', windowsHide: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFile(p) { const t0 = Date.now(); while (Date.now() - t0 < 20000) { if (existsSync(p)) return readFileSync(p, 'utf8'); await sleep(100); } throw new Error('timeout'); }

let ws;
try {
  const raw = await waitFile(join(userDir, 'DevToolsActivePort'));
  const devPort = raw.split('\n')[0].trim();
  const tg = await (await fetch(`http://127.0.0.1:${devPort}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(tg.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  let id = 0; const pend = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1080, height: 1920, deviceScaleFactor: 1, mobile: false });
  const NO_PERSON = process.argv.includes('--noperson');
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/engine/film.html?clean=1` + (NO_PERSON ? '&noperson=1' : '') });
  for (let i = 0; i < 300; i++) {
    const r = await send('Runtime.evaluate', { expression: 'window.ready === true', returnByValue: true });
    if (r.result.value) break;
    await sleep(120);
  }
  await sleep(500);
  // 数字人视频必须就绪再截帧，否则 drawImage 拿到的是兜底静帧（这也是"S3/S14 判静止"的根因之一）
  for (let i = 0; i < 400; i++) {
    const r = await send('Runtime.evaluate', { expression: '(!window.personReady) ? true : window.personReady()', returnByValue: true });
    if (r.result.value === true) break;
    await sleep(120);
  }
  await sleep(200);
  await mkdir(OUTIMG, { recursive: true });
  if (CLIP) {
    const FRDIR = join(process.env.TEMP, 'filmclip-' + Date.now());
    await mkdir(FRDIR, { recursive: true });
    const N = Math.round((CLIP.t1 - CLIP.t0) * CLIP.fps);
    for (let i = 0; i < N; i++) {
      await send('Runtime.evaluate', { expression: `window.seek(${(CLIP.t0 + i / CLIP.fps).toFixed(3)})` });
      await sleep(45);
      await send('Runtime.evaluate', { expression: `window.seek(${(CLIP.t0 + i / CLIP.fps).toFixed(3)})` });
      await sleep(25);
      const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1080, height: 1920, scale: 1 } });
      await writeFile(join(FRDIR, 'f' + String(i).padStart(4, '0') + '.png'), Buffer.from(data, 'base64'));
      if (i % 60 === 0) console.log('  frames', i, '/', N);
    }
    const { execFileSync } = await import('node:child_process');
    const out = resolve(PROJ, (CFG.PREVIEW || '03_画面/预览') + '/片段_' + CLIP.t0 + '-' + CLIP.t1 + '.mp4');
    execFileSync(process.env.FFMPEG_PATH || 'ffmpeg',
      ['-y', '-v', 'error', '-framerate', String(CLIP.fps), '-i', join(FRDIR, 'f%04d.png'),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', out], { stdio: 'inherit' });
    console.log('[clip]', out);
    await rm(FRDIR, { recursive: true, force: true }).catch(() => { });
  } else {
  for (const [tt, name] of KEYS) {
    await send('Runtime.evaluate', { expression: `window.seek(${tt})` });
    await sleep(90);
    const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1080, height: 1920, scale: 1 } });
    const f = join(OUTIMG, `${name}_${String(tt).replace('.', 'p')}s.png`);
    await writeFile(f, Buffer.from(data, 'base64'));
    console.log('[key]', name);
  }
  }
} finally {
  try { ws && ws.close(); } catch { }
  try { chrome.kill(); } catch { }
  srv.close();
  await sleep(200);
  await rm(userDir, { recursive: true, force: true }).catch(() => { });
}
