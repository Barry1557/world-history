// 统计：镜头数、字数、预计时长，以及每章概况
import { chapters, scenes } from '../src/scenes.js';
import { checkScenes } from './check.mjs';
const { errors } = checkScenes(chapters, scenes);
const total = scenes.reduce((n, s) => n + s.t.length, 0);
chapters.forEach((c, i) => {
  const ss = scenes.filter((s) => s.c === i + 1);
  const n = ss.reduce((a, s) => a + s.t.length, 0);
  console.log(`${String(i + 1).padStart(2)} ${c.title.padEnd(14, '　')} ${String(ss.length).padStart(3)} 个镜头 ${String(n).padStart(5)} 字`);
});
const lens = scenes.map((s) => s.t.length);
console.log(`\n共 ${chapters.length} 章，${scenes.length} 个镜头，旁白 ${total} 字（最短 ${Math.min(...lens)}，最长 ${Math.max(...lens)}）`);
console.log(`按 1 倍速约每秒 4.6 字估算：约 ${Math.round(total / 4.6 / 60)} 分钟（另加镜头切换停顿约 ${Math.round(scenes.length * 1.2 / 60)} 分钟）`);
if (errors.length) { console.log('\n问题：\n' + errors.join('\n')); process.exitCode = 1; }
