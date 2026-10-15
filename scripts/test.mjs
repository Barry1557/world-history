// 无头浏览器自测：无报错、从头跑到尾、手机不横向滚动、语音逻辑不串台、AI 旁白播放，并截图
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const url = 'file://' + fileURLToPath(new URL('../docs/index.html', import.meta.url));
const shots = fileURLToPath(new URL('../test-shots/', import.meta.url));
mkdirSync(shots, { recursive: true });

const exe = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
let failed = 0;
const ok = (cond, msg) => { console.log((cond ? '  通过 ' : '  失败 ') + msg); if (!cond) failed++; };

// 假的语音引擎：每句 30ms 读完，用来验证逐句朗读、暂停重播、不串台
const fakeSpeech = () => {
  const log = [];
  window.__speechLog = log;
  const voice = { name: 'Fake 婷婷', lang: 'zh-CN', localService: true, default: true, voiceURI: 'fake' };
  let cur = null, timer = 0;
  const synth = {
    speaking: false, pending: false, onvoiceschanged: null,
    getVoices: () => [voice],
    speak(u) {
      if (cur) { /* 队列：简单起见直接排在后面 */ }
      cur = u; this.speaking = true; log.push({ t: 'speak', text: u.text });
      setTimeout(() => u.onstart && u.onstart({}), 5);
      timer = setTimeout(() => { this.speaking = false; const x = cur; cur = null; x && x.onend && x.onend({}); }, 30);
    },
    cancel() {
      clearTimeout(timer);
      const x = cur; cur = null; this.speaking = false; log.push({ t: 'cancel' });
      // 真实浏览器里被取消的句子也会异步触发 end / error，这里模拟出来，检验不会串台
      if (x) setTimeout(() => { x.onerror && x.onerror({ error: 'interrupted' }); x.onend && x.onend({}); }, 1);
    },
    pause() {}, resume() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; };
};


// 在封面上真实点击「目录」「设置」（会检查按钮是否被别的层挡住），再关闭
async function coverButtons(page, mobile) {
  const press = (sel) => (mobile ? page.tap(sel, { timeout: 3000 }) : page.click(sel, { timeout: 3000 }));
  const out = [];
  for (const [btn, panel] of [['#btnToc', '#toc'], ['#btnSet', '#settings']]) {
    try {
      await press(btn);
      await page.waitForTimeout(200);
      const open = await page.isVisible(panel);
      await press(panel + ' [data-close]');
      await page.waitForTimeout(150);
      out.push(open && !(await page.isVisible(panel)));
    } catch (e) { out.push(false); }
  }
  return out.every(Boolean);
}

async function open(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: opts.dpr || 1, isMobile: !!opts.mobile, hasTouch: !!opts.mobile });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) errors.push('外部请求: ' + r.url()); });
  if (opts.fakeSpeech) await page.addInitScript(fakeSpeech);
  // 测本机语音逻辑时先关掉 AI 旁白（只在第一次打开时设置，刷新后保留页面自己存的进度）
  if (opts.systemVoice) await page.addInitScript(() => { try { if (!localStorage.getItem('wh-theater-v1')) localStorage.setItem('wh-theater-v1', '{"ai":false}'); } catch (e) { /* ignore */ } });
  await page.goto(url);
  await page.waitForTimeout(600);
  return { ctx, page, errors };
}

console.log('1. 电脑（1440×900）：封面、开播、截图');
{
  const { ctx, page, errors } = await open({ width: 1440, height: 900 });
  ok(await page.isVisible('text=开始放映'), '封面上有「开始放映」按钮');
  ok((await page.textContent('#subText')).length > 10, '封面上已显示第一句字幕');
  ok(await page.$$eval('#proj-a .land', (e) => e.length === 1 && e[0].getAttribute('d').length > 100000), '陆地路径已内联');
  await page.screenshot({ path: shots + '01-desktop-cover.png' });
  ok(await coverButtons(page, false), '封面上能点开并关闭「目录」和「设置」');
  ok(!(await page.evaluate(() => window.__wh.playing)), '只打开面板不会自动开始播放');
  await page.click('text=开始放映');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => window.__wh.playing), '点击后开始播放');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: shots + '02-desktop-playing.png' });

  // 依次跳到几个有代表性的镜头截图
  const pick = async (pred, name) => {
    const i = await page.evaluate((src) => { const f = new Function('s', 'return ' + src); return window.WH.scenes.findIndex(f); }, pred);
    await page.evaluate((i) => window.__wh.go(i), i);
    await page.waitForTimeout(4200);
    await page.screenshot({ path: shots + name });
    return i;
  };
  await page.evaluate(() => window.__wh.playing && document.getElementById('btnPlay').click());
  await pick("s.t.indexOf('亚历山大率军') >= 0", '03-desktop-alexander.png');
  await pick("s.t.indexOf('麦克坦岛') >= 0", '04-desktop-magellan-pacific.png');
  await pick("s.t.indexOf('郑和率船队') >= 0", '05-desktop-zhenghe.png');
  await pick("s.t.indexOf('白令陆桥') >= 0", '06-desktop-bering.png');

  console.log('2. 从头到尾跑一遍全部镜头');
  const total = await page.evaluate(() => window.__wh.count);
  const bad = await page.evaluate(async () => {
    const issues = [];
    for (let i = 0; i < window.__wh.count; i++) {
      window.__wh.go(i);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const c = window.__wh.cam();
      if (![c.x, c.y, c.k].every(Number.isFinite) || c.k <= 0) issues.push(i + ': 镜头参数异常');
      const s = window.WH.scenes[i];
      const want = (s.pts || []).length + (s.ar || []).length + (s.rt || []).length;
      const g = document.querySelector('#fx g.scene:not(.leaving)');
      const have = g ? g.querySelectorAll('.pt,.area,.route').length : 0;
      if (have !== want) issues.push(i + `: 图层元素 ${have}/${want}`);
      const y = document.getElementById('year').textContent;
      if (!y || /NaN|undefined/.test(y)) issues.push(i + ': 年份显示异常 ' + y);
      // 标记必须落在年份下方、字幕上方；标签不能出屏
      const top = document.getElementById('hudYear').getBoundingClientRect().bottom - 4;
      const bottom = document.getElementById('bottom').getBoundingClientRect().top + 4;
      for (const t of g ? g.querySelectorAll('.pt-dot') : []) {
        const cx = +t.getAttribute('cx'), cy = +t.getAttribute('cy');
        if (!(cx >= 0 && cx <= innerWidth && cy >= top && cy <= bottom)) issues.push(i + ': 标记被遮挡或在屏幕外 ' + t.parentNode.textContent + ' ' + Math.round(cx) + ',' + Math.round(cy));
      }
      for (const t of g ? g.querySelectorAll('.pt-label, .area-label') : []) {
        const b = t.getBoundingClientRect();
        if (b.left < -1 || b.right > innerWidth + 1) issues.push(i + ': 标签出屏 ' + t.textContent);
      }
    }
    return issues;
  });
  ok(bad.length === 0, `全部 ${total} 个镜头都能正常显示` + (bad.length ? '\n    ' + bad.join('\n    ') : ''));

  console.log('3. 自动推进：逐句推进直到全片结束');
  const run = await page.evaluate(async () => {
    window.__wh.go(0);
    document.getElementById('btnPlay').click();
    let steps = 0;
    const seen = new Set();
    while (!window.__wh.finished && steps < 5000) { seen.add(window.__wh.cur); window.__wh.next(); steps++; }
    return { steps, scenes: seen.size, finished: window.__wh.finished, cover: !document.getElementById('cover').classList.contains('gone') };
  });
  ok(run.finished && run.scenes === total, `走完 ${run.scenes} 个镜头、${run.steps} 句后正常结束`);
  ok(run.cover, '结束后显示「放映结束」');
  await page.waitForTimeout(800);
  await page.screenshot({ path: shots + '07-desktop-end.png' });
  ok(errors.length === 0, '没有报错和外部请求' + (errors.length ? '\n    ' + errors.join('\n    ') : ''));
  await ctx.close();
}

console.log('4. 手机竖屏（390×844）：布局与横向滚动');
{
  const { ctx, page, errors } = await open({ width: 390, height: 844 }, { mobile: true, dpr: 2 });
  await page.screenshot({ path: shots + '08-mobile-cover.png' });
  ok(await coverButtons(page, true), '手机封面上能点开并关闭「目录」和「设置」');
  const noScroll = async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth);
  ok(await noScroll(), '封面不横向滚动');
  await page.tap('text=开始放映');
  await page.waitForTimeout(3200);
  await page.screenshot({ path: shots + '09-mobile-playing.png' });
  for (const [needle, name] of [['张骞出使西域', '10-mobile-zhangqian.png'], ['麦克坦岛', '11-mobile-magellan.png'], ['巴士底狱', '12-mobile-bastille.png']]) {
    const i = await page.evaluate((n) => window.WH.scenes.findIndex((s) => s.t.includes(n)), needle);
    await page.evaluate((i) => window.__wh.go(i), i);
    await page.waitForTimeout(4200);
    await page.screenshot({ path: shots + name });
    ok(await noScroll(), `「${needle}」镜头不横向滚动`);
  }
  const mbad = await page.evaluate(async () => {
    const issues = [];
    for (let i = 0; i < window.__wh.count; i++) {
      window.__wh.go(i);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const g = document.querySelector('#fx g.scene:not(.leaving)');
      const top = document.getElementById('hudYear').getBoundingClientRect().bottom - 4;
      const bottom = document.getElementById('bottom').getBoundingClientRect().top + 4;
      for (const t of g ? g.querySelectorAll('.pt-dot') : []) {
        const cx = +t.getAttribute('cx'), cy = +t.getAttribute('cy');
        if (!(cx >= 0 && cx <= innerWidth && cy >= top && cy <= bottom)) issues.push(i + ': ' + t.parentNode.textContent + ' ' + Math.round(cx) + ',' + Math.round(cy));
      }
      for (const t of g ? g.querySelectorAll('.pt-label, .area-label') : []) {
        const b = t.getBoundingClientRect();
        if (b.left < -1 || b.right > innerWidth + 1) issues.push(i + ': 标签出屏 ' + t.textContent);
      }
    }
    return issues;
  });
  ok(mbad.length === 0, '手机上所有镜头的标记和标签都在可见区域' + (mbad.length ? '\n    ' + mbad.join('\n    ') : ''));
  const wide = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < window.__wh.count; i++) {
      window.__wh.go(i);
      const y = document.getElementById('year');
      if (y.scrollWidth > innerWidth - 16) out.push(i + ' ' + y.textContent);
    }
    return out;
  });
  ok(wide.length === 0, '所有年份在手机上都放得下' + (wide.length ? ': ' + wide.join(', ') : ''));
  await page.tap('#btnToc');
  await page.waitForTimeout(300);
  await page.screenshot({ path: shots + '13-mobile-toc.png' });
  ok(await noScroll(), '目录面板不横向滚动');
  await page.tap('#toc [data-close]');
  await page.tap('#btnSet');
  await page.waitForTimeout(300);
  await page.screenshot({ path: shots + '14-mobile-settings.png' });
  ok(errors.length === 0, '手机上没有报错' + (errors.length ? '\n    ' + errors.join('\n    ') : ''));
  await ctx.close();
}

console.log('5. 语音逻辑（模拟语音引擎）：逐句朗读、暂停重播、不串台、记住进度');
{
  const { ctx, page, errors } = await open({ width: 1280, height: 800 }, { fakeSpeech: true, systemVoice: true });
  await page.click('text=开始放映');
  await page.waitForTimeout(1500);
  const r1 = await page.evaluate(() => ({ cur: window.__wh.cur, sent: window.__wh.sent, spoken: window.__speechLog.filter((x) => x.t === 'speak').length }));
  ok(r1.spoken >= 3, `已逐句朗读 ${r1.spoken} 句，当前在第 ${r1.cur + 1} 段第 ${r1.sent + 1} 句`);
  // 连续快速暂停、播放、切段，检查不会出现同时推进两句（串台）
  await page.keyboard.press('Space');
  const pausedAt = await page.evaluate(() => [window.__wh.cur, window.__wh.sent]);
  await page.waitForTimeout(400);
  const still = await page.evaluate(() => [window.__wh.cur, window.__wh.sent]);
  ok(pausedAt.join() === still.join(), '暂停后不再前进');
  await page.keyboard.press('Space');
  await page.waitForTimeout(10);
  const replay = await page.evaluate(() => { const l = window.__speechLog; return l[l.length - 1]; });
  const curText = await page.evaluate(() => window.WH.scenes[window.__wh.cur].t);
  ok(replay.t === 'speak' && curText.includes(replay.text.slice(0, 6)), '继续播放时从当前句重新朗读');
  for (let k = 0; k < 7; k++) { await page.keyboard.press(k % 2 ? 'ArrowRight' : 'Space'); await page.waitForTimeout(15); }
  await page.keyboard.press('ArrowRight');
  const mark = await page.evaluate(() => window.__speechLog.length);
  await page.waitForTimeout(3500);
  const after = await page.evaluate(() => [window.__wh.cur, window.__wh.sent, window.__wh.playing]);
  ok(after[2], '快速连续操作后仍在播放');
  // 不串台：最后一次操作之后，朗读的句子必须按顺序一句接一句，不重复、不跳句
  const order = await page.evaluate((mark) => {
    const flat = [];
    window.WH.scenes.forEach((s) => s.sents.forEach((t) => flat.push(t.replace(/[「」『』《》“”]/g, ''))));
    const spoken = window.__speechLog.slice(mark).filter((x) => x.t === 'speak').map((x) => flat.indexOf(x.text));
    return spoken;
  }, mark);
  const seqOk = order.length >= 4 && order.every((v, i) => v >= 0 && (i === 0 || v === order[i - 1] + 1));
  ok(seqOk, `快速操作后逐句顺序朗读、不重复不跳句（${order.length} 句：${order.slice(0, 8).join(',')}…）`);
  const before = after;
  // 记住进度：重新打开页面，应提示从上次的地方继续
  await page.keyboard.press('Space');
  await page.reload();
  await page.waitForTimeout(600);
  ok(await page.isVisible('text=从上次的地方继续'), '再次打开时提示「从上次的地方继续」');
  const resumeAt = await page.evaluate(() => window.__wh.cur);
  ok(resumeAt === after[0] || resumeAt === before[0] || resumeAt > 0, `恢复到第 ${resumeAt + 1} 段`);
  await page.screenshot({ path: shots + '15-desktop-resume.png' });
  ok(errors.length === 0, '没有报错' + (errors.length ? '\n    ' + errors.join('\n    ') : ''));
  await ctx.close();
}

console.log('6. 关闭 localStorage 也能正常运行');
{
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
  await page.goto(url);
  await page.click('text=开始放映');
  await page.waitForTimeout(500);
  await page.keyboard.press('ArrowRight');
  ok(errors.length === 0 && (await page.evaluate(() => window.__wh.cur)) === 1, '存储被禁用时仍可播放和切段');
  await ctx.close();
}

console.log('7. AI 旁白（有配音文件时）：逐句字幕、暂停接着播、变速、缺音频时回退');
{
  const { ctx, page, errors } = await open({ width: 1280, height: 800 }, { fakeSpeech: true });
  const hasAudio = await page.evaluate(() => !!window.WH.audio);
  if (!hasAudio) console.log('  跳过：还没有配音文件');
  else {
    ok(await page.$eval('#optVoiceSel', (s) => s.value === 'ai'), '设置里默认选中 AI 旁白');
    await page.click('text=开始放映');
    await page.waitForTimeout(600);
    ok(await page.evaluate(() => window.__wh.ai && window.__speechLog.length === 0), '开始放映后播放 AI 旁白，不调用本机语音');
    const subs = new Set();
    for (let k = 0; k < 40 && subs.size < 3; k++) { subs.add(await page.evaluate(() => window.__wh.cur + ':' + window.__wh.sent)); await page.waitForTimeout(250); }
    ok(subs.size >= 2, '字幕随声音逐句切换：' + [...subs].join(' '));
    await page.keyboard.press('Space');
    const t1 = await page.evaluate(() => window.__wh.audio.currentTime);
    await page.waitForTimeout(400);
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
    const t2 = await page.evaluate(() => [window.__wh.audio.currentTime, window.__wh.ai]);
    ok(t2[1] && t2[0] >= t1 - 0.05, `暂停后从 ${t1.toFixed(1)} 秒接着播`);
    await page.click('#btnRate');
    ok(await page.evaluate(() => Math.abs(window.__wh.audio.playbackRate - 1.2) < 0.01 && window.__wh.ai), '语速按钮直接改变 AI 旁白的播放速度');
    await page.evaluate(() => { window.WH.scenes[5].au[0] = 'does-not-exist'; window.__wh.go(5); });
    await page.evaluate(() => window.__wh.playing || document.getElementById('btnPlay').click());
    await page.waitForTimeout(1500);
    const fb = await page.evaluate(() => { const t = window.WH.scenes[5].t; return window.__speechLog.some((x) => x.t === 'speak' && t.includes(x.text.slice(0, 6))) && window.__wh.playing; });
    ok(fb, '音频加载失败的段落自动改用本机语音继续播放');
    const missing = await page.evaluate(() => window.WH.scenes.filter((s) => !s.au).length);
    ok(missing === 0, missing ? `还有 ${missing} 个镜头没有配音（会用本机语音）` : '全部镜头都已配音');
    const real = errors.filter((e) => !/does-not-exist|ERR_FILE_NOT_FOUND/.test(e));
    ok(real.length === 0, '没有报错' + (real.length ? '\n    ' + real.join('\n    ') : ''));
  }
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n有 ${failed} 项失败` : '\n全部通过；截图在 test-shots/ 目录');
process.exitCode = failed ? 1 : 0;
