// 把 world-atlas 的陆地数据投影成紧凑的 SVG path（构建时使用）
import { readFileSync } from 'node:fs';
import { geoNaturalEarth1, geoPath, geoGraticule } from 'd3-geo';
import { feature } from 'topojson-client';

export const SCALE = 360;          // 投影比例（每弧度多少单位）

// 构造一个记录点序列的 path context，输出相对坐标、保留 1 位小数并去掉过密的点
function compactContext(minDist) {
  let out = [], ring = [], lastX = 0, lastY = 0;
  const flush = () => {
    if (ring.length < 3 && !ring.open) { ring = []; return; }
    let s = '', started = false;
    for (let i = 0; i < ring.length; i++) {
      const X = Math.round(ring[i][0] * 10), Y = Math.round(ring[i][1] * 10);
      if (i === 0) s += 'M' + fmt(X) + ',' + fmt(Y);
      else {
        const dx = X - lastX, dy = Y - lastY;
        if (dx === 0 && dy === 0) continue;
        const sx = fmt(dx), sy = fmt(dy);
        // 相邻数字能被无歧义拆开时省略分隔符
        if (!started) { s += 'l'; started = true; }
        else if (!(sx[0] === '-' || (sx[0] === '.' && /\.\d+$/.test(s)))) s += ' ';
        s += sx + (sy[0] === '-' || (sy[0] === '.' && sx.includes('.')) ? '' : ',') + sy;
      }
      lastX = X; lastY = Y;
    }
    if (!ring.open) s += 'z';
    out.push(s);
    ring = [];
  };
  const fmt = (v) => {
    const a = Math.abs(v), sign = v < 0 ? '-' : '';
    const ip = Math.floor(a / 10), fp = a % 10;
    return sign + (fp ? (ip ? ip : '') + '.' + fp : String(ip));
  };
  return {
    beginPath() {},
    moveTo(x, y) { if (ring.length) flush(); ring = [[x, y]]; },
    lineTo(x, y) {
      const p = ring[ring.length - 1];
      if (p && Math.hypot(x - p[0], y - p[1]) < minDist) return;
      ring.push([x, y]);
    },
    closePath() { flush(); },
    arc() {},
    result() { if (ring.length) { ring.open = true; flush(); } const r = out.join(''); out = []; return r; },
  };
}

export function buildMaps(views) {
  const topo = JSON.parse(readFileSync(new URL('../node_modules/world-atlas/land-50m.json', import.meta.url)));
  const land = feature(topo, topo.objects.land);
  const grat = geoGraticule().step([15, 15]).extentMajor([[-180, -80 - 1e-6], [180, 80 + 1e-6]])();
  const res = {};
  for (const [key, lon0] of Object.entries(views)) {
    const proj = geoNaturalEarth1().rotate([-lon0, 0]).scale(SCALE).translate([0, 0]).precision(0.3);
    const landCtx = compactContext(0.35);
    geoPath(proj, landCtx)(land);
    const gratCtx = compactContext(0.5);
    geoPath(proj, gratCtx)(grat);
    const sphCtx = compactContext(0.5);
    geoPath(proj, sphCtx)({ type: 'Sphere' });
    res[key] = { lon0, land: landCtx.result(), grat: gratCtx.result(), sphere: sphCtx.result() };
  }
  return res;
}
