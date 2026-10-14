// 构建：投影陆地 → 内联样式、数据、脚本 → 生成单文件 docs/index.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildMaps, SCALE } from './geo.mjs';
import { chapters, scenes } from '../src/scenes.js';
import { checkScenes } from './check.mjs';

const LON0 = { a: 11, p: 154 };   // a：以欧亚非为中心；p：以太平洋为中心（用于跨太平洋的镜头）

const problems = checkScenes(chapters, scenes);
if (problems.errors.length) {
  console.error('内容数据有错误：\n' + problems.errors.join('\n'));
  process.exit(1);
}
problems.warnings.forEach((w) => console.warn('提示：' + w));

const maps = buildMaps(LON0);
const rawY = (p) => { const p2 = p * p, p4 = p2 * p2; return p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4))); };
const W = 2 * Math.PI * 0.8707 * SCALE, H = 2 * rawY(Math.PI / 2) * SCALE;

const mapSvg = Object.entries(maps).map(([k, m]) =>
  `      <g class="proj" id="proj-${k}"${k === 'a' ? '' : ' style="display:none"'}>\n` +
  `        <path class="sphere" d="${m.sphere}"/>\n` +
  `        <path class="grat" d="${m.grat}"/>\n` +
  `        <path class="land" d="${m.land}"/>\n` +
  `      </g>`).join('\n');

const data = {
  scale: SCALE, W: +W.toFixed(2), H: +H.toFixed(2), lon0: LON0,
  chapters,
  scenes: scenes.map((s) => {
    const o = { c: s.c, y: s.y, cam: s.cam, t: s.t };
    for (const k of ['a', 'yt', 'p', 'pts', 'ar', 'rt', 'rs']) if (s[k] !== undefined) o[k] = s[k];
    return o;
  }),
};

const tpl = readFileSync(new URL('../src/template.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const json = JSON.stringify(data).replace(/</g, '\\u003c');

const html = tpl
  .replace('/*STYLE*/', () => css)
  .replace('<!--MAPS-->', () => mapSvg)
  .replace('/*DATA*/', () => 'window.WH = ' + json + ';')
  .replace('/*APP*/', () => js);

mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
writeFileSync(new URL('../docs/index.html', import.meta.url), html);
const chars = scenes.reduce((n, s) => n + s.t.length, 0);
console.log(`已生成 docs/index.html：${(html.length / 1024).toFixed(0)} KB，${chapters.length} 章，${scenes.length} 个镜头，旁白 ${chars} 字`);
