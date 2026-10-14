(function () {
  'use strict';

  var D = window.WH;
  var CH = D.chapters, SC = D.scenes;
  var SCALE = D.scale, WW = D.W, WH = D.H, LON0 = D.lon0;
  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage'), svg = $('map'), worldEl = $('world'), fxEl = $('fx');
  var NS = 'http://www.w3.org/2000/svg';

  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var RM = !!(mq && mq.matches);
  if (mq) { var onMq = function (e) { RM = e.matches; }; if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq); }

  /* ================= 投影：与构建脚本相同的 Natural Earth I ================= */
  var D2R = Math.PI / 180;
  function raw(l, p) {
    var p2 = p * p, p4 = p2 * p2;
    return [
      l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4))),
      p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)))
    ];
  }
  function wrapLon(r) { return ((r + 180) % 360 + 360) % 360 - 180; }
  function project(lon, lat, pk) {
    var r = raw(wrapLon(lon - LON0[pk]) * D2R, Math.max(-89.9, Math.min(89.9, lat)) * D2R);
    return [r[0] * SCALE, -r[1] * SCALE];
  }

  /* ================= 文本拆句 ================= */
  function splitText(t) {
    var out = [], parts = t.match(/[^。！？；]+[。！？；]?[」』”]?/g) || [t];
    parts.forEach(function (p) {
      p = p.trim(); if (!p) return;
      if (p.length <= 44) { out.push(p); return; }
      var segs = p.match(/[^，：]+[，：]?/g) || [p], buf = '';
      segs.forEach(function (s) {
        if (buf && (buf + s).length > 40) { out.push(buf); buf = s; } else buf += s;
      });
      if (buf) {
        if (buf.length < 8 && out.length) out[out.length - 1] += buf; else out.push(buf);
      }
    });
    return out;
  }
  SC.forEach(function (s) { s.sents = splitText(s.t); s.len = s.t.length; });

  var TOTAL = 0, CUM = [];
  SC.forEach(function (s) { CUM.push(TOTAL); TOTAL += s.len; });
  var CHSTART = {};
  SC.forEach(function (s, i) { if (CHSTART[s.c] === undefined) CHSTART[s.c] = i; });

  /* ================= 本地存储（全部 try/catch） ================= */
  var KEY = 'wh-theater-v1';
  function loadState() { try { var v = JSON.parse(window.localStorage.getItem(KEY)); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } }
  var saved = loadState();
  function saveState() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ i: cur, ct: CH[SC[cur].c - 1].title, ci: cur - CHSTART[SC[cur].c], s: sent, v: voiceOn, r: rate, vn: voice ? voice.name : (saved.vn || ''), done: finished }));
    } catch (e) { /* 隐私模式等情况下忽略 */ }
  }

  /* ================= 状态 ================= */
  var cur = 0, sent = 0, playing = false, finished = false;
  var voiceOn = saved.v !== false;
  var rate = clampRate(+saved.r || 1);
  function clampRate(r) { return Math.round(Math.min(1.6, Math.max(0.8, r)) * 10) / 10; }

  /* ================= 语音 ================= */
  var synth = window.speechSynthesis;
  var hasTTS = !!(synth && window.SpeechSynthesisUtterance);
  var voices = [], voice = null, keepRef = null, errCount = 0;

  function vScore(v) {
    var l = (v.lang || '').replace('_', '-').toLowerCase(), s = 0;
    if (l === 'zh-cn' || l === 'cmn-hans-cn' || l === 'zh-hans-cn') s += 20;
    else if (l.indexOf('zh-hans') === 0 || l === 'zh' || l.indexOf('cmn') === 0) s += 15;
    else if (l === 'zh-tw' || l === 'zh-hk') s += 4;
    // 本地声音优先：Chrome 的网络声音在大陆可能无法连接
    if (v.localService) s += 8;
    if (/Tingting|婷婷|Xiaoxiao|晓晓|Yunxi|云希|Lili|Meijia|Huihui|慧慧|Yaoyao/i.test(v.name)) s += 3;
    if (v.default) s += 1;
    return s;
  }
  function refreshVoices() {
    if (!hasTTS) { renderVoiceSel(); return; }
    var all = synth.getVoices() || [];
    voices = all.filter(function (v) { return /^(zh|cmn|yue)/i.test((v.lang || '').replace('_', '-')); });
    voices.sort(function (a, b) { return vScore(b) - vScore(a); });
    var want = saved.vn && voices.filter(function (v) { return v.name === saved.vn; })[0];
    if (!voice || voices.indexOf(voice) < 0) voice = want || voices[0] || null;
    renderVoiceSel();
    updateVoiceBtn();
  }
  if (hasTTS) {
    refreshVoices();
    if ('onvoiceschanged' in synth) synth.onvoiceschanged = refreshVoices;
    var polls = 0, pollT = setInterval(function () { refreshVoices(); if (voices.length || ++polls > 12) clearInterval(pollT); }, 400);
  }
  function voiceUsable() { return voiceOn && hasTTS && !!voice; }
  function readTime(text) { return Math.max(1700, text.length / (4.6 * rate) * 1000 + 380); }

  var token = 0, timer = 0, watchdog = 0;
  function stopAll() {
    token++; clearTimeout(timer); clearTimeout(watchdog);
    if (hasTTS && (synth.speaking || synth.pending)) { try { synth.cancel(); } catch (e) { /* ignore */ } }
  }

  function speakCurrent(immediate) {
    var my = ++token;
    clearTimeout(timer); clearTimeout(watchdog);
    var s = SC[cur], text = s.sents[sent];
    showSub(text); updateProgress(); saveState();
    if (!voiceUsable()) {
      timer = setTimeout(function () { if (my === token) sentenceDone(); }, readTime(text));
      return;
    }
    var go = function () {
      if (my !== token) return;
      var u = new SpeechSynthesisUtterance(text.replace(/[「」『』《》“”]/g, ''));
      u.voice = voice; u.lang = voice.lang; u.rate = rate; u.pitch = 1;
      var started = false;
      u.onstart = function () { started = true; };
      u.onend = function () {
        if (my !== token) return;          // 旧句子的回调，直接忽略，避免串台
        clearTimeout(watchdog); errCount = 0;
        timer = setTimeout(function () { if (my === token) sentenceDone(); }, 140);
      };
      u.onerror = function (e) {
        if (my !== token) return;
        if (e && (e.error === 'interrupted' || e.error === 'canceled')) return;
        clearTimeout(watchdog);
        if (++errCount >= 2) voiceFailed();
        timer = setTimeout(function () { if (my === token) sentenceDone(); }, started ? 300 : readTime(text));
      };
      keepRef = u;   // 防止 Chrome 过早回收 utterance 导致 onend 不触发
      try { synth.speak(u); } catch (e) { voiceFailed(); }
      watchdog = setTimeout(function () {
        if (my !== token) return;
        if (!started && ++errCount >= 2) voiceFailed();
        token++; try { synth.cancel(); } catch (e) { /* ignore */ }
        if (playing) sentenceDone();
      }, readTime(text) * 2.2 + 4000);
    };
    if (synth.speaking || synth.pending) { try { synth.cancel(); } catch (e) { /* ignore */ } }
    if (immediate) go(); else setTimeout(go, 70);
  }
  function voiceFailed() {
    if (!voiceOn) return;
    voiceOn = false; updateVoiceBtn(); saveState();
    toast('这台设备的中文语音暂时无法播放，已改为字幕模式');
  }

  function sentenceDone() {
    if (!playing) return;
    if (sent < SC[cur].sents.length - 1) { sent++; speakCurrent(); return; }
    if (cur < SC.length - 1) { goScene(cur + 1, { auto: true }); return; }
    finish();
  }

  function play(immediate) {
    if (finished) { finished = false; goScene(0, {}); }
    playing = true; stage.classList.add('playing');
    hideCover();
    wake(true);
    speakCurrent(immediate);
    $('btnPlay').setAttribute('aria-label', '暂停');
  }
  function pause() {
    playing = false; stage.classList.remove('playing');
    stopAll(); wake(false); saveState();
    $('btnPlay').setAttribute('aria-label', '播放');
  }
  function toggle() { if (playing) pause(); else play(true); }

  function finish() {
    pause(); finished = true; saveState();
    showCover('end');
  }

  /* ================= 屏幕常亮（手机上播放时） ================= */
  var lock = null;
  function wake(on) {
    try {
      if (on && navigator.wakeLock && !lock) navigator.wakeLock.request('screen').then(function (l) { lock = l; l.addEventListener && l.addEventListener('release', function () { lock = null; }); }).catch(function () {});
      if (!on && lock) { lock.release().catch(function () {}); lock = null; }
    } catch (e) { /* ignore */ }
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && playing) wake(true); });

  /* ================= 镜头与地图 ================= */
  var view = { w: 0, h: 0, sx: 0, sy: 0, sw: 0, sh: 0 };
  var cam = { x: 0, y: 0, k: 1, pk: 'a' };
  var fly = null, groups = [], raf = 0;

  function measure() {
    var r = stage.getBoundingClientRect();
    view.w = r.width; view.h = r.height;
    var top = $('hudYear').getBoundingClientRect().bottom + 10;
    var bot = $('bottom').getBoundingClientRect().top - 6;
    if (bot - top < view.h * 0.35) { top = view.h * 0.12; bot = view.h * 0.7; }
    view.sx = view.w / 2; view.sy = (top + bot) / 2;
    view.sw = view.w; view.sh = bot - top;
  }

  function sceneProj(s) { return s.p || 'a'; }

  function labelW(text) { return text.length * (view.w < 640 ? 12.8 : 13.8) + 4; }
  function contentBox(s, pk, k) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    var add = function (p, rx, ry) {
      x0 = Math.min(x0, p[0] - rx); x1 = Math.max(x1, p[0] + rx);
      y0 = Math.min(y0, p[1] - ry); y1 = Math.max(y1, p[1] + ry);
    };
    (s.pts || []).forEach(function (m) {
      var c = project(m[1], m[2], pk);
      add(c, 0, 0);
      if (!k) return;
      // 把文字标签占的位置也算进去（屏幕像素换算成地图单位）
      var w = labelW(m[0]) / k, h = 12 / k, pos = m[3] || 'r';
      if (pos === 'r') add([c[0] + 9 / k + w, c[1]], 0, h);
      else if (pos === 'l') add([c[0] - 9 / k - w, c[1]], 0, h);
      else add([c[0], c[1] + (pos === 't' ? -20 : 24) / k], w / 2, 0);
    });
    (s.ar || []).forEach(function (a) {
      var c = project(a[1], a[2], pk), r = areaRadius(a, pk);
      add(c, r, r);
      if (k) add([c[0], c[1] - r - 22 / k], labelW(a[0]) / 2 / k, 0);
    });
    (s.rt || []).forEach(function (rt) { routePieces(rt, pk).forEach(function (pc) { pc.forEach(function (p) { add(p, 0, 0); }); }); });
    return x0 === Infinity ? null : { x0: x0, y0: y0, x1: x1, y1: y1 };
  }

  function targetCam(s) {
    measure();
    var pk = sceneProj(s), c = project(s.cam[0], s.cam[1], pk), z = s.cam[2];
    var iw = WW / z, ih = WH / z;
    var kI = Math.min(view.sw / iw, view.sh / ih), kC = Math.max(view.sw / iw, view.sh / ih);
    var portrait = view.sw < view.sh * 1.05;
    var k = portrait ? Math.sqrt(kI * kC) : kI;
    var cx = c[0], cy = c[1];
    var padX = 14, padY = 22;
    for (var pass = 0; pass < 3; pass++) {
      var bb = contentBox(s, pk, pass ? k : 0);
      if (!bb) break;
      var bw = Math.max(bb.x1 - bb.x0, 1e-6), bh = Math.max(bb.y1 - bb.y0, 1e-6);
      var kFit = Math.min((view.sw - 2 * padX) / bw, (view.sh - 2 * padY) / bh);
      if (k > kFit) k = kFit;
    }
    if (bb) {
      var hw = (view.sw / 2 - padX) / k, hh = (view.sh / 2 - padY) / k;
      if (bb.x1 - bb.x0 <= 2 * hw) { if (bb.x0 < cx - hw) cx = bb.x0 + hw; if (bb.x1 > cx + hw) cx = bb.x1 - hw; }
      else cx = (bb.x0 + bb.x1) / 2;
      if (bb.y1 - bb.y0 <= 2 * hh) { if (bb.y0 < cy - hh) cy = bb.y0 + hh; if (bb.y1 > cy + hh) cy = bb.y1 - hh; }
      else cy = (bb.y0 + bb.y1) / 2;
    }
    var kMin = Math.min(view.sw / WW, view.sh / WH) * 0.9;
    k = Math.max(kMin, Math.min(k, view.sw / (WW / 16)));
    // 高纬度镜头在手机竖屏上别露出地图上下边缘外的空白（前提是内容仍留在安全区内）
    var up = view.sy / k, down = (view.h - view.sy) / k;
    if (up + down < WH) {
      var hs = (view.sh / 2 - padY) / k, ny = cy;
      // 地图坐标以赤道为 0，上下边缘在 ±WH/2
      if (cy - up < -WH / 2) { ny = up - WH / 2; if (bb) ny = Math.max(cy, Math.min(ny, bb.y0 + hs)); }
      else if (cy + down > WH / 2) { ny = WH / 2 - down; if (bb) ny = Math.min(cy, Math.max(ny, bb.y1 - hs)); }
      cy = ny;
    }
    return { x: cx, y: cy, k: k, pk: pk };
  }

  // van Wijk & Nuij 平滑缩放：远距离时先拉远再推近，像镜头飞过去
  function interpZoom(p0, p1) {
    var rho = Math.SQRT2, rho2 = 2, rho4 = 4;
    var ux0 = p0[0], uy0 = p0[1], w0 = p0[2], ux1 = p1[0], uy1 = p1[1], w1 = p1[2];
    var dx = ux1 - ux0, dy = uy1 - uy0, d2 = dx * dx + dy * dy, S, f;
    if (d2 < 1e-12) {
      S = Math.log(w1 / w0) / rho;
      f = function (t) { return [ux0 + t * dx, uy0 + t * dy, w0 * Math.exp(rho * t * S)]; };
    } else {
      var d1 = Math.sqrt(d2);
      var b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1);
      var b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1);
      var r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0), r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
      S = (r1 - r0) / rho;
      var cosh = function (x) { return ((x = Math.exp(x)) + 1 / x) / 2; };
      var sinh = function (x) { return ((x = Math.exp(x)) - 1 / x) / 2; };
      var tanh = function (x) { return ((x = Math.exp(2 * x)) - 1) / (x + 1); };
      f = function (t) {
        var s = t * S, c0 = cosh(r0), u = w0 / (rho2 * d1) * (c0 * tanh(rho * s + r0) - sinh(r0));
        return [ux0 + u * dx, uy0 + u * dy, w0 * c0 / cosh(rho * s + r0)];
      };
    }
    f.duration = Math.abs(S) * 1000 * rho / Math.SQRT2;
    return f;
  }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function applyWorld() {
    worldEl.setAttribute('transform', 'translate(' + (view.sx - cam.x * cam.k).toFixed(2) + ',' + (view.sy - cam.y * cam.k).toFixed(2) + ') scale(' + cam.k.toFixed(5) + ')');
  }
  function showProj(pk) {
    Object.keys(LON0).forEach(function (k) { $('proj-' + k).style.display = k === pk ? '' : 'none'; });
  }
  function toScreen(p) { return [(p[0] - cam.x) * cam.k + view.sx, (p[1] - cam.y) * cam.k + view.sy]; }

  function moveCamera(s, instant) {
    var t = targetCam(s);
    fly = null;
    if (t.pk !== cam.pk) {
      if (instant || RM) { cam = t; showProj(t.pk); applyWorld(); return 0; }
      // 换投影：淡出、切换、淡入
      worldEl.style.opacity = '0';
      var my = ++projSwap;
      setTimeout(function () {
        if (my !== projSwap) return;
        cam = targetCam(SC[cur]); showProj(cam.pk); applyWorld(); kick();
        worldEl.style.opacity = '1';
      }, 400);
      return 600;
    }
    worldEl.style.opacity = '1';
    if (instant || RM) { cam = t; applyWorld(); return 0; }
    var i = interpZoom([cam.x, cam.y, view.sw / cam.k], [t.x, t.y, view.sw / t.k]);
    var dur = Math.max(900, Math.min(3200, i.duration * 0.9));
    fly = { i: i, t0: performance.now(), dur: dur, to: t };
    kick();
    return dur;
  }
  var projSwap = 0;

  function kick() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    var busy = false;
    if (fly) {
      var t = Math.min(1, (now - fly.t0) / fly.dur), p = fly.i(ease(t));
      cam.x = p[0]; cam.y = p[1]; cam.k = view.sw / p[2];
      if (t >= 1) { cam.x = fly.to.x; cam.y = fly.to.y; cam.k = fly.to.k; fly = null; } else busy = true;
    }
    applyWorld();
    groups.forEach(function (g) { if (updateGroup(g, now)) busy = true; });
    if (busy) kick();
  }

  /* ---------- 动态图层 ---------- */
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function areaRadius(a, pk) {
    var c = project(a[1], a[2], pk), e = project(a[1], a[2] + a[3], pk);
    return Math.abs(c[1] - e[1]);
  }

  // 航线：经纬度上做 Catmull-Rom 平滑并加密，再投影；跨越地图接缝时拆成几段
  function routePieces(rt, pk) {
    var pts = [], i, lon = rt[0][0];
    for (i = 0; i < rt.length; i++) {
      var L = rt[i][0];
      while (L - lon > 180) L -= 360;
      while (L - lon < -180) L += 360;
      pts.push([L, rt[i][1]]); lon = L;
    }
    var dense = [];
    for (i = 0; i < pts.length - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      var dist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), n = Math.max(4, Math.ceil(dist / 1.5));
      for (var j = 0; j < n; j++) {
        var t = j / n, t2 = t * t, t3 = t2 * t;
        dense.push([0, 1].map(function (d) {
          return 0.5 * ((2 * p1[d]) + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3);
        }));
      }
    }
    dense.push(pts[pts.length - 1]);
    var pieces = [[]], prevR = null, l0 = LON0[pk];
    dense.forEach(function (q, k) {
      var r = wrapLon(q[0] - l0);
      if (prevR !== null && Math.abs(r - prevR) > 180) {
        var prev = dense[k - 1], edge = prevR > 0 ? 179.99 : -179.99;
        var span = (prevR > 0 ? 360 - prevR + r : -(360 + prevR - r));
        var f = span ? (edge - prevR) / span : 0.5;
        var lat = prev[1] + (q[1] - prev[1]) * Math.min(1, Math.max(0, f));
        pieces[pieces.length - 1].push(project(l0 + edge, lat, pk));
        pieces.push([project(l0 - edge, lat, pk)]);
      }
      pieces[pieces.length - 1].push(project(q[0], q[1], pk));
      prevR = r;
    });
    return pieces.filter(function (p) { return p.length > 1; });
  }

  function buildGroup(s, startDelay) {
    var pk = sceneProj(s), g = el('g', { 'class': 'scene' }, fxEl);
    var G = { el: g, areas: [], routes: [], pts: [], t0: performance.now() + startDelay };
    (s.ar || []).forEach(function (a, i) {
      var ag = el('g', { 'class': 'area' }, g);
      var o = {
        el: ag, c: project(a[1], a[2], pk), r: areaRadius(a, pk),
        glow: el('circle', { 'class': 'area-glow' }, ag),
        ring: el('circle', { 'class': 'area-ring' }, ag),
        label: el('text', { 'class': 'area-label', 'text-anchor': 'middle' }, ag)
      };
      o.label.textContent = a[0];
      G.areas.push(o);
      setTimeout(function () { ag.classList.add('on'); }, startDelay + 150 + i * 220);
    });
    (s.rt || []).forEach(function (rt, i) {
      var rg = el('g', { 'class': 'route' + (s.rs === 'd' ? ' dash' : '') }, g);
      var pieces = routePieces(rt, pk), lens = [], total = 0;
      pieces.forEach(function (pc) {
        var L = 0; for (var j = 1; j < pc.length; j++) L += Math.hypot(pc[j][0] - pc[j - 1][0], pc[j][1] - pc[j - 1][1]);
        lens.push(L); total += L;
      });
      G.routes.push({
        pieces: pieces, lens: lens, total: total,
        halo: el('path', { 'class': 'route-halo' }, rg), line: el('path', { 'class': 'route-line' }, rg),
        head: el('path', { 'class': 'route-head' }, rg),
        start: startDelay + 500 + i * 650, dur: RM ? 0 : Math.max(1600, Math.min(4200, 1400 + pieces.length * 300 + total * 1.1))
      });
    });
    (s.pts || []).forEach(function (m, i) {
      var pg = el('g', { 'class': 'pt' }, g);
      var o = {
        el: pg, w: project(m[1], m[2], pk), pos: m[3] || 'r',
        ring: el('circle', { 'class': 'pt-ring', r: 6 }, pg),
        dot: el('circle', { 'class': 'pt-dot', r: 4 }, pg),
        label: el('text', { 'class': 'pt-label' }, pg)
      };
      o.label.textContent = m[0];
      G.pts.push(o);
      setTimeout(function () { pg.classList.add('on'); }, startDelay + 250 + i * 260);
    });
    groups.push(G);
    updateGroup(G, performance.now());
    kick();
    return G;
  }

  function f1(v) { return Math.round(v * 10) / 10; }

  function updateGroup(G, now) {
    var busy = false, k = cam.k;
    G.areas.forEach(function (o) {
      var c = toScreen(o.c), r = Math.max(6, o.r * k);
      o.glow.setAttribute('cx', f1(c[0])); o.glow.setAttribute('cy', f1(c[1])); o.glow.setAttribute('r', f1(r * 1.45));
      o.ring.setAttribute('cx', f1(c[0])); o.ring.setAttribute('cy', f1(c[1])); o.ring.setAttribute('r', f1(r));
      o.label.setAttribute('x', f1(c[0])); o.label.setAttribute('y', f1(c[1] - r - 7));
    });
    G.routes.forEach(function (R) {
      var prog = R.dur ? Math.max(0, Math.min(1, (now - G.t0 - R.start) / R.dur)) : 1;
      if (prog < 1) busy = true;
      prog = 1 - Math.pow(1 - prog, 2);
      var want = R.total * prog, d = '', last = null, prevPt = null;
      for (var i = 0; i < R.pieces.length && want > 0; i++) {
        var pc = R.pieces[i], a = toScreen(pc[0]);
        d += 'M' + f1(a[0]) + ',' + f1(a[1]);
        prevPt = pc[0];
        for (var j = 1; j < pc.length; j++) {
          var seg = Math.hypot(pc[j][0] - pc[j - 1][0], pc[j][1] - pc[j - 1][1]);
          var q = pc[j];
          if (seg >= want) { var f = want / seg; q = [pc[j - 1][0] + (pc[j][0] - pc[j - 1][0]) * f, pc[j - 1][1] + (pc[j][1] - pc[j - 1][1]) * f]; want = 0; }
          else want -= seg;
          var b = toScreen(q);
          d += 'L' + f1(b[0]) + ',' + f1(b[1]);
          last = b; prevPt = pc[j - 1];
          if (want <= 0) break;
        }
      }
      R.halo.setAttribute('d', d); R.line.setAttribute('d', d);
      if (last && prevPt && prog > 0.02) {
        var pp = toScreen(prevPt), ang = Math.atan2(last[1] - pp[1], last[0] - pp[0]);
        var s1 = 9, s2 = 5;
        var hx = last[0], hy = last[1];
        var p1x = hx - s1 * Math.cos(ang) + s2 * Math.sin(ang), p1y = hy - s1 * Math.sin(ang) - s2 * Math.cos(ang);
        var p2x = hx - s1 * Math.cos(ang) - s2 * Math.sin(ang), p2y = hy - s1 * Math.sin(ang) + s2 * Math.cos(ang);
        R.head.setAttribute('d', 'M' + f1(hx + 2 * Math.cos(ang)) + ',' + f1(hy + 2 * Math.sin(ang)) + 'L' + f1(p1x) + ',' + f1(p1y) + 'L' + f1(p2x) + ',' + f1(p2y) + 'Z');
      } else R.head.setAttribute('d', '');
    });
    G.pts.forEach(function (o) {
      var c = toScreen(o.w), x = f1(c[0]), y = f1(c[1]);
      o.dot.setAttribute('cx', x); o.dot.setAttribute('cy', y);
      o.ring.setAttribute('cx', x); o.ring.setAttribute('cy', y);
      var lx = c[0] + 9, ly = c[1] + 4.5, lw = o.lw || (o.lw = labelW(o.label.textContent)), anchor = 'start';
      if (o.pos === 'l') { lx = c[0] - 9; anchor = 'end'; }
      else if (o.pos === 't' || o.pos === 'b') { ly = o.pos === 't' ? c[1] - 11 : c[1] + 20; lx = Math.max(lw / 2 + 6, Math.min(view.w - lw / 2 - 6, c[0])); anchor = 'middle'; }
      // 标签快出屏幕时换到另一边
      if (anchor === 'end' && lx - lw < 6) { lx = c[0] + 9; anchor = 'start'; }
      else if (anchor === 'start' && lx + lw > view.w - 6 && c[0] - 9 - lw > 6) { lx = c[0] - 9; anchor = 'end'; }
      if (o.anchor !== anchor) { o.label.setAttribute('text-anchor', anchor); o.anchor = anchor; }
      o.label.setAttribute('x', f1(lx)); o.label.setAttribute('y', f1(ly));
    });
    return busy;
  }

  function clearGroups() {
    groups.forEach(function (G) {
      G.el.classList.add('leaving');
      setTimeout(function () {
        if (G.el.parentNode) G.el.parentNode.removeChild(G.el);
        var i = groups.indexOf(G); if (i >= 0) groups.splice(i, 1);
      }, 480);
    });
  }

  /* ================= 年份滚动 ================= */
  var yearEl = $('year'), yearShown = null, yearAnim = 0;
  function trim1(v) { return String(Math.round(v * 10) / 10); }
  function fmtYear(y, approx) {
    if (y <= -1e8) return '约 ' + trim1(-y / 1e8) + ' 亿年前';
    if (y <= -1e4) { var w = -y / 1e4; return '约 ' + (w >= 10 ? Math.round(w) : trim1(w)) + ' 万年前'; }
    y = Math.round(y);
    if (y < 0) return (approx ? '约' : '') + '公元前 ' + (-y) + ' 年';
    return (approx ? '约' : '') + '公元 ' + Math.max(1, y) + ' 年';
  }
  function setYear(s, instant) {
    cancelAnimationFrame(yearAnim);
    var to = s.y, from = yearShown;
    if (s.yt) { yearEl.textContent = s.yt; yearShown = to; return; }
    if (instant || RM || from === null || from === to) { yearEl.textContent = fmtYear(to, s.a); yearShown = to; return; }
    var logMode = from < -1e4 && to < -1e4, t0 = performance.now(), dur = 1300;
    var step = function (now) {
      var t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3), v;
      if (logMode) v = -Math.exp(Math.log(-from) + (Math.log(-to) - Math.log(-from)) * e);
      else v = from + (to - from) * e;
      if (t >= 1) v = to;
      yearEl.textContent = fmtYear(v, s.a);
      yearShown = v;
      if (t < 1) yearAnim = requestAnimationFrame(step);
    };
    yearAnim = requestAnimationFrame(step);
  }

  /* ================= 切换镜头 ================= */
  var cardT = 0, lastCh = null;
  function goScene(i, opt) {
    opt = opt || {};
    i = Math.max(0, Math.min(SC.length - 1, i));
    stopAll();
    var chChanged = SC[i].c !== SC[cur].c || lastCh === null;
    cur = i; sent = opt.sent && opt.sent < SC[i].sents.length ? opt.sent : 0;
    finished = false;
    var s = SC[i];
    clearGroups();
    var flyMs = moveCamera(s, opt.instant);
    buildGroup(s, opt.instant ? 0 : Math.min(900, flyMs * 0.45));
    setYear(s, opt.instant);
    setChapter(s, chChanged && !opt.instant && !opt.quiet);
    showSub(s.sents[sent]);
    updateProgress(); saveState();
    if (playing) {
      var my = token;
      var delay = opt.auto ? (chChanged ? 2200 : 800) : 420;
      timer = setTimeout(function () { if (my === token && playing) speakCurrent(); }, delay);
    }
  }

  function setChapter(s, showCard) {
    var c = CH[s.c - 1];
    $('chap').innerHTML = '<b>第 ' + s.c + ' 章</b>' + esc(c.title);
    markToc();
    if (lastCh !== s.c && showCard && !stage.classList.contains('covered')) {
      $('cardN').textContent = '第 ' + s.c + ' 章';
      $('cardT').textContent = c.title;
      var card = $('card');
      card.classList.add('show');
      clearTimeout(cardT);
      cardT = setTimeout(function () { card.classList.remove('show'); }, 2600);
    }
    lastCh = s.c;
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ================= 字幕与进度 ================= */
  var subEl = $('subText'), subT = 0;
  function showSub(text) {
    text = (text || '').replace(/[，：]$/, '');
    if (subEl.textContent === text) return;
    if (RM) { subEl.textContent = text; return; }
    subEl.classList.add('fade');
    clearTimeout(subT);
    subT = setTimeout(function () { subEl.textContent = text; subEl.classList.remove('fade'); }, 160);
  }

  function fraction() {
    var s = SC[cur], done = 0;
    for (var j = 0; j < sent; j++) done += s.sents[j].length;
    return (CUM[cur] + done) / TOTAL;
  }
  function updateProgress() {
    var f = fraction();
    $('progFill').style.width = (f * 100).toFixed(2) + '%';
    $('count').textContent = (cur + 1) + ' / ' + SC.length;
    var ticks = $('ticks').children;
    for (var i = 0; i < ticks.length; i++) ticks[i].classList.toggle('done', +ticks[i].dataset.f <= f + 1e-9);
    $('prog').setAttribute('aria-valuenow', Math.round(f * 100));
  }
  function buildTicks() {
    var box = $('ticks');
    CH.forEach(function (c, ci) {
      if (ci === 0) return;
      var f = CUM[CHSTART[ci + 1]] / TOTAL, t = document.createElement('i');
      t.style.left = (f * 100).toFixed(3) + '%'; t.dataset.f = f;
      box.appendChild(t);
    });
  }
  function sceneAt(f) {
    var pos = f * TOTAL, i = 0;
    while (i < SC.length - 1 && CUM[i + 1] <= pos) i++;
    return i;
  }
  (function progressEvents() {
    var prog = $('prog'), tip = $('progTip');
    var fAt = function (e) { var r = prog.getBoundingClientRect(); return Math.max(0, Math.min(0.9999, (e.clientX - r.left) / r.width)); };
    prog.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      var f = fAt(e), s = SC[sceneAt(f)];
      tip.textContent = '第 ' + s.c + ' 章 · ' + CH[s.c - 1].title;
      var r = prog.getBoundingClientRect();
      var x = Math.max(80, Math.min(r.width - 80, f * r.width));
      tip.style.left = x + 'px'; tip.classList.add('show');
    });
    prog.addEventListener('pointerleave', function () { tip.classList.remove('show'); });
    prog.addEventListener('click', function (e) { goScene(sceneAt(fAt(e)), {}); });
    prog.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); goScene(cur + (e.key === 'ArrowRight' ? 1 : -1), {}); }
    });
  })();

  /* ================= 目录与设置 ================= */
  function buildToc() {
    var ol = $('tocList');
    CH.forEach(function (c, ci) {
      var li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<span class="n">' + (ci + 1 < 10 ? '0' : '') + (ci + 1) + '</span><span class="t">' + esc(c.title) + '</span><span class="s">' + esc(c.sub) + '</span>';
      b.addEventListener('click', function () { closePanels(); goScene(CHSTART[ci + 1], {}); if (stage.classList.contains('covered')) play(true); });
      li.appendChild(b); ol.appendChild(li);
    });
  }
  function markToc() {
    var lis = $('tocList').children, c = SC[cur].c;
    for (var i = 0; i < lis.length; i++) lis[i].classList.toggle('cur', i + 1 === c);
  }
  function openPanel(id) {
    closePanels();
    $(id).hidden = false;
    if (id === 'toc') { var c = $('tocList').children[SC[cur].c - 1]; if (c && c.scrollIntoView) c.scrollIntoView({ block: 'center' }); }
  }
  function closePanels() { $('toc').hidden = true; $('settings').hidden = true; }
  ['toc', 'settings'].forEach(function (id) {
    var p = $(id);
    p.addEventListener('click', function (e) { if (e.target === p || e.target.hasAttribute('data-close')) closePanels(); });
  });
  $('btnToc').addEventListener('click', function () { openPanel('toc'); });
  $('btnSet').addEventListener('click', function () { openPanel('settings'); });

  function renderVoiceSel() {
    var sel = $('optVoiceSel'), note = $('voiceNote');
    sel.innerHTML = '';
    if (!hasTTS) {
      sel.disabled = true; note.textContent = '这个浏览器不支持语音合成，将只显示字幕。';
      return;
    }
    if (!voices.length) {
      sel.disabled = true;
      var o = document.createElement('option'); o.textContent = '未找到中文声音'; sel.appendChild(o);
      note.textContent = '没有找到中文语音，将按字数计时、只显示字幕。Mac 可在「系统设置 → 辅助功能 → 朗读内容」中添加中文声音（如「婷婷」）。';
      return;
    }
    sel.disabled = false;
    voices.forEach(function (v, i) {
      var o = document.createElement('option');
      o.value = i; o.textContent = v.name + '（' + v.lang + (v.localService ? '' : '，联网') + '）';
      if (v === voice) o.selected = true;
      sel.appendChild(o);
    });
    note.textContent = '标注「联网」的声音需要连接境外服务器，在国内可能无法播放，建议选本机声音。';
  }
  $('optVoiceSel').addEventListener('change', function (e) {
    voice = voices[+e.target.value] || voice; errCount = 0; saved.vn = voice && voice.name;
    saveState();
    if (playing) speakCurrent(true);
  });
  function updateVoiceBtn() {
    stage.classList.toggle('mute', !voiceUsable());
    var sw = $('optVoice'); sw.setAttribute('aria-checked', voiceOn ? 'true' : 'false');
    $('btnVoice').setAttribute('aria-label', voiceOn ? '关闭语音' : '打开语音');
  }
  function setVoiceOn(on) {
    voiceOn = on; errCount = 0; updateVoiceBtn(); saveState();
    if (on && hasTTS && !voices.length) toast('没有找到中文语音，将只显示字幕');
    if (playing) speakCurrent(true);
  }
  $('optVoice').addEventListener('click', function () { setVoiceOn(!voiceOn); });
  $('btnVoice').addEventListener('click', function () { setVoiceOn(!voiceOn); toast(voiceOn ? '语音讲解：开' : '语音讲解：关（只看字幕）'); });

  function setRate(r, restart) {
    rate = clampRate(r);
    $('btnRate').textContent = rate.toFixed(1) + '×';
    $('rateVal').textContent = rate.toFixed(1) + '×';
    $('optRate').value = rate;
    saveState();
    if (restart && playing) speakCurrent(true);
  }
  $('optRate').addEventListener('change', function (e) { setRate(+e.target.value, true); });
  $('optRate').addEventListener('input', function (e) { $('rateVal').textContent = (+e.target.value).toFixed(1) + '×'; });
  $('btnRate').addEventListener('click', function () {
    var n = rate >= 1.6 ? 0.8 : rate + 0.2;
    setRate(n, true); toast('语速 ' + rate.toFixed(1) + ' 倍');
  });

  /* ================= 控制按钮与键盘 ================= */
  $('btnPlay').addEventListener('click', toggle);
  $('btnPrev').addEventListener('click', function () { goScene(cur - 1, {}); });
  $('btnNext').addEventListener('click', function () { goScene(cur + 1, {}); });
  document.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag)) return;
    if (e.key === 'Escape') { closePanels(); return; }
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (stage.classList.contains('covered')) { startFrom(finished ? 0 : (saved.i > 0 ? cur : 0)); return; }
      toggle(); return;
    }
    if (e.key === 'ArrowRight') { e.preventDefault(); goScene(cur + 1, {}); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goScene(cur - 1, {}); }
  });

  var fullBtn = $('btnFull');
  if (document.fullscreenEnabled && !/iPhone|iPad|iPod/.test(navigator.userAgent)) {
    fullBtn.hidden = false;
    fullBtn.addEventListener('click', function () {
      try { if (document.fullscreenElement) document.exitFullscreen(); else stage.requestFullscreen(); } catch (e) { /* ignore */ }
    });
  }

  var toastT = 0;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  /* ================= 封面 ================= */
  function minutes() { return Math.round(TOTAL / 4.6 / 60); }
  function showCover(mode) {
    stage.classList.add('covered');
    clearTimeout(cardT); $('card').classList.remove('show');
    $('cover').classList.remove('gone');
    var btns = $('coverBtns'); btns.innerHTML = '';
    var mk = function (html, cls, fn) { var b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + cls; b.innerHTML = html; b.addEventListener('click', fn); btns.appendChild(b); return b; };
    if (mode === 'end') {
      $('coverKicker').textContent = '全片终';
      $('coverTitle').textContent = '放映结束';
      $('coverLede').innerHTML = '谢谢观看。人类的故事还在继续，<br>下一章由我们来写。';
      mk('从头再看一遍', 'primary', function () { startFrom(0); });
      mk('章节目录', '', function () { openPanel('toc'); });
      $('coverHint').textContent = '想核对书里说的年代和数字？设置里有核对记录的链接。';
      return;
    }
    if (mode === 'resume') {
      var s = SC[cur];
      mk('从上次的地方继续<small>第 ' + s.c + ' 章 · ' + esc(CH[s.c - 1].title) + ' · 第 ' + (cur + 1) + ' 段</small>', 'primary two', function () { startFrom(cur, sent); }).focus();
      mk('从头开始', '', function () { startFrom(0); });
    } else {
      mk('开始放映', 'primary', function () { startFrom(0); }).focus();
    }
  }
  function hideCover() {
    if (!stage.classList.contains('covered')) return;
    stage.classList.remove('covered');
    $('cover').classList.add('gone');
  }
  function startFrom(i, s) {
    hideCover();
    if (i !== cur || (s || 0) !== sent) goScene(i, { sent: s || 0, quiet: true });
    // 在点击事件里同步开始朗读，满足 iOS/Safari 必须由用户手势触发声音的要求
    play(true);
    lastCh = null;
    setChapter(SC[cur], true);
  }

  /* ================= 启动 ================= */
  window.addEventListener('resize', debounce(function () {
    measure();
    var t = targetCam(SC[cur]); fly = null; cam = t; showProj(t.pk); applyWorld();
    groups.forEach(function (G) { updateGroup(G, performance.now()); });
    kick();
  }, 120));
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  buildToc(); buildTicks();
  setRate(rate, false);
  updateVoiceBtn();
  $('coverMeta').textContent = CH.length + ' 章 · ' + SC.length + ' 个镜头 · 约 ' + minutes() + ' 分钟';
  measure();

  // 进度按「章节标题 + 章内第几段」保存，插入新章节后仍能回到原处
  var savedAt = -1;
  if (typeof saved.ct === 'string') {
    for (var ci = 0; ci < CH.length; ci++) {
      if (CH[ci].title === saved.ct) {
        var first = CHSTART[ci + 1], next = ci + 1 < CH.length ? CHSTART[ci + 2] : SC.length;
        savedAt = Math.min(first + Math.max(0, saved.ci | 0), next - 1);
        if (savedAt !== first + (saved.ci | 0)) saved.s = 0;
        break;
      }
    }
  } else if (saved.i > 0 && saved.i < SC.length) savedAt = saved.i;
  var resume = savedAt > 0 && !saved.done;
  saved.i = savedAt;
  cur = resume ? savedAt : 0;
  sent = resume && saved.s < SC[cur].sents.length ? (saved.s || 0) : 0;
  var s0 = SC[cur];
  cam = targetCam(s0); showProj(cam.pk); applyWorld();
  buildGroup(s0, 400);
  setYear(s0, true); setChapter(s0, false);
  subEl.textContent = s0.sents[sent];
  updateProgress();
  showCover(resume ? 'resume' : 'start');

  // 供自动化自测使用的只读接口
  window.__wh = {
    get cur() { return cur; }, get sent() { return sent; }, get playing() { return playing; }, get finished() { return finished; },
    count: SC.length, go: function (i) { goScene(i, { instant: true }); }, next: function () { sentenceDone(); }, cam: function () { return cam; }, view: function () { return view; }
  };
})();
