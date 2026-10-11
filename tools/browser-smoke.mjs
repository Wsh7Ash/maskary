// Browser smoke test: boots index.html from file:// in headless Chrome AND
// headless Firefox, drives the real UI in both, and asserts redaction happens
// in-browser. Zero dependencies — Node built-ins only (fetch, WebSocket).
//
//   node tools/browser-smoke.mjs
//
// Chrome speaks CDP; Firefox speaks WebDriver BiDi (session.new handshake).
// The app under test makes zero network requests; this harness is just the
// driver. Exits 0 on pass, 1 on failure. Firefox is skipped (not failed) when
// no Firefox binary is found.

import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const rootUrl = `file:///${new URL('../index.html', import.meta.url).pathname.replace(/\\/g, '/').replace(/^\//, '')}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];

function assert(cond, label, detail = '') {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures.push(label);
    console.log(`  FAIL ${label} ${detail}`);
  }
}

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const FIREFOX_CANDIDATES = [
  'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
  'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
  '/usr/bin/firefox',
  '/Applications/Firefox.app/Contents/MacOS/firefox',
];

// ---------------------------------------------------------------- chrome ----
async function chromeSmoke() {
  const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!chromePath) {
    failures.push('chrome: binary not found');
    console.log('  FAIL chrome: binary not found');
    return;
  }
  const PORT = 9422;
  const profile = join(tmpdir(), `maskary-smoke-chrome-${process.pid}`);
  const chrome = spawn(
    chromePath,
    ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, 'about:blank'],
    { stdio: 'ignore' },
  );
  let ws;
  try {
    let target;
    for (let i = 0; i < 50 && !target; i++) {
      try {
        target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page');
      } catch {
        await sleep(200);
      }
    }
    if (!target) throw new Error('Chrome DevTools endpoint never came up');
    ws = await new Promise((resolve, reject) => {
      const sock = new WebSocket(target.webSocketDebuggerUrl);
      const timer = setTimeout(() => reject(new Error('CDP websocket timeout')), 10000);
      sock.addEventListener('open', () => { clearTimeout(timer); resolve(sock); }, { once: true });
      sock.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP websocket error')); }, { once: true });
    });
    let seq = 0;
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++seq;
        const onMessage = (ev) => {
          let msg;
          try { msg = JSON.parse(ev.data); } catch { return; }
          if (msg.id !== id) return;
          ws.removeEventListener('message', onMessage);
          msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
        };
        ws.addEventListener('message', onMessage);
        ws.send(JSON.stringify({ id, method, params }));
      });
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };

    console.log(`chrome: ${chromePath}`);
    await send('Page.enable');
    await send('Page.navigate', { url: rootUrl });
    let booted = false;
    for (let i = 0; i < 40 && !booted; i++) {
      booted = await evaluate('document.documentElement.dataset.ready === "1"').catch(() => false);
      if (!booted) await sleep(150);
    }
    assert(booted, 'chrome: boots from file:// (data-ready=1)');

    const textRun = await evaluate(`(() => {
      const ta = document.getElementById('input');
      ta.value = 'Mail jane@example.com, cc jane@example.com, card 4111 1111 1111 1111, year 2026 zip 90210';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return new Promise((r) => setTimeout(() => r({
        mode: document.getElementById('mode-note').textContent,
        counts: document.getElementById('counts').textContent,
        preview: document.getElementById('preview').textContent,
        copyEnabled: !document.getElementById('btn-copy').disabled,
      }), 450));
    })()`);
    console.log(`  chrome preview: ${textRun.preview}`);
    assert(textRun.mode.includes('Mode: text'), 'chrome: auto-detects text mode');
    assert(textRun.preview.includes('EMAIL_1') && !textRun.preview.includes('jane@example.com'), 'chrome: email replaced by alias');
    assert((textRun.preview.match(/EMAIL_1/g) || []).length === 2, 'chrome: both emails share one alias');
    assert(textRun.preview.includes('•••• 1111'), 'chrome: card keep_last4');
    assert(textRun.preview.includes('2026') && textRun.preview.includes('90210'), 'chrome: non-sensitive numbers untouched');
    assert(textRun.counts.includes('email ×2') && textRun.counts.includes('credit card ×1'), 'chrome: count chips');
    assert(textRun.copyEnabled, 'chrome: copy enabled after redaction');

    const diffRun = await evaluate(`(() => {
      const radio = document.querySelector('input[name="view"][value="diff"]');
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      const preview = document.getElementById('preview').textContent;
      return { preview, hasOld: preview.includes('jane@example.com'), hasNew: preview.includes('EMAIL_1') };
    })()`);
    assert(diffRun.hasOld && diffRun.hasNew, 'chrome: diff view lists original and replacement');

    const jsonRun = await evaluate(`(() => {
      const radio = document.querySelector('input[name="view"][value="highlight"]');
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      const ta = document.getElementById('input');
      ta.value = '{"contact":"jane@example.com","year":2026,"nested":{"ip":"192.168.10.42"}}';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return new Promise((r) => setTimeout(() => r({
        mode: document.getElementById('mode-note').textContent,
        preview: document.getElementById('preview').textContent,
        jsonBtnEnabled: !document.getElementById('btn-json').disabled,
      }), 450));
    })()`);
    console.log(`  chrome json output: ${jsonRun.preview}`);
    assert(jsonRun.mode.includes('Mode: JSON'), 'chrome: auto-detects JSON mode');
    assert(jsonRun.preview.includes('EMAIL_1') && !jsonRun.preview.includes('jane@example.com'), 'chrome: JSON values redacted');
    assert(jsonRun.preview.includes('"year": 2026'), 'chrome: JSON keys and numbers preserved');
    assert(jsonRun.preview.includes('IPV4_1'), 'chrome: nested JSON values redacted');
    assert(jsonRun.jsonBtnEnabled, 'chrome: download .json enabled in JSON mode');

    const perf = await evaluate('performance.getEntriesByType("resource").map(e => e.name).filter(n => !n.startsWith("file://"))');
    assert(Array.isArray(perf) && perf.length === 0, 'chrome: no external resource requests', JSON.stringify(perf));
  } catch (err) {
    failures.push('chrome: harness error');
    console.error('chrome: harness error:', err && err.message ? err.message : err);
  } finally {
    if (ws) try { ws.close(); } catch { /* ignore */ }
    chrome.kill();
    await sleep(400);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* lock */ }
  }
}

// -------------------------------------------------------------- firefox ----
async function firefoxSmoke() {
  const ffPath = FIREFOX_CANDIDATES.find((p) => existsSync(p));
  if (!ffPath) {
    console.log('  skip firefox: binary not found');
    return;
  }
  const PORT = 9423;
  const profile = join(tmpdir(), `maskary-smoke-ff-${process.pid}`);
  const ff = spawn(ffPath, ['-headless', `-remote-debugging-port=${PORT}`, '-no-remote', '-profile', profile, 'about:blank'], { stdio: 'ignore' });
  let ws;
  try {
    console.log(`firefox: ${ffPath}`);
    await sleep(2500);
    ws = new WebSocket(`ws://127.0.0.1:${PORT}/session`);
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('BiDi ws open timeout')), 5000);
      ws.addEventListener('open', () => { clearTimeout(t); resolve(); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(t); reject(new Error('BiDi ws error')); }, { once: true });
    });
    let seq = 0;
    let sessionId;
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++seq;
        const msg = { id, method, params };
        if (sessionId) msg.sessionId = sessionId;
        const onMsg = (ev) => {
          let m;
          try { m = JSON.parse(ev.data); } catch { return; }
          if (m.id !== id) return;
          ws.removeEventListener('message', onMsg);
          m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
        };
        ws.addEventListener('message', onMsg);
        ws.send(JSON.stringify(msg));
      });
    const evaluate = async (context, expression) => {
      const r = await send('script.evaluate', { expression, target: { context }, awaitPromise: true, resultOwnership: 'none' });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
      return JSON.parse(r.result.value);
    };

    const session = await send('session.new', { capabilities: { alwaysMatch: {} } });
    sessionId = session.sessionId;
    const tree = await send('browsingContext.getTree', {});
    const ctx = tree.contexts[0].context;

    await send('browsingContext.navigate', { url: rootUrl, context: ctx, wait: 'complete' });
    let booted = false;
    for (let i = 0; i < 20 && !booted; i++) {
      const s = await evaluate(ctx, 'JSON.stringify({r: document.documentElement.dataset.ready})').catch(() => null);
      booted = s?.r === '1';
      if (!booted) await sleep(200);
    }
    assert(booted, 'firefox: boots from file:// (data-ready=1)');

    const textRun = await evaluate(
      ctx,
      `(() => {
        const ta = document.getElementById('input');
        ta.value = 'Mail jane@example.com, cc jane@example.com, card 4111 1111 1111 1111';
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        return new Promise((r) => setTimeout(() => r(JSON.stringify({
          preview: document.getElementById('preview').textContent,
          counts: document.getElementById('counts').textContent,
        })), 450));
      })()`,
    );
    console.log(`  firefox preview: ${textRun.preview}`);
    assert(textRun.preview.includes('EMAIL_1') && !textRun.preview.includes('jane@example.com'), 'firefox: email replaced by alias');
    assert((textRun.preview.match(/EMAIL_1/g) || []).length === 2, 'firefox: both emails share one alias');
    assert(textRun.preview.includes('•••• 1111'), 'firefox: card keep_last4');
    assert(textRun.counts.includes('email ×2'), 'firefox: count chips');

    const jsonRun = await evaluate(
      ctx,
      `(() => {
        const ta = document.getElementById('input');
        ta.value = '{"contact":"jane@example.com","year":2026}';
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        return new Promise((r) => setTimeout(() => r(JSON.stringify({
          mode: document.getElementById('mode-note').textContent,
          preview: document.getElementById('preview').textContent,
        })), 450));
      })()`,
    );
    console.log(`  firefox json output: ${jsonRun.preview}`);
    assert(jsonRun.mode.includes('Mode: JSON'), 'firefox: auto-detects JSON mode');
    assert(jsonRun.preview.includes('EMAIL_1') && !jsonRun.preview.includes('jane@example.com'), 'firefox: JSON values redacted');
    assert(jsonRun.preview.includes('"year": 2026'), 'firefox: JSON keys and numbers preserved');
  } catch (err) {
    failures.push('firefox: harness error');
    console.error('firefox: harness error:', err && err.message ? err.message : err);
  } finally {
    if (ws) try { ws.close(); } catch { /* ignore */ }
    ff.kill();
    await sleep(600);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* lock */ }
  }
}

await chromeSmoke();
await firefoxSmoke();

if (failures.length) {
  console.error(`browser-smoke: FAILED (${failures.length}): ${failures.join('; ')}`);
  process.exit(1);
}
console.log('browser-smoke: all assertions passed');
