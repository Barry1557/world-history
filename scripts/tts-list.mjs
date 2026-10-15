// 列出全部旁白和对应的音频文件名，交给 scripts/tts.py 配音
import { writeFileSync } from 'node:fs';
import { scenes } from '../src/scenes.js';
import { audioKey, ttsConfig } from './tts-common.mjs';

const items = scenes.map((s) => ({ h: audioKey(s.t), t: s.t }));
const out = { ...ttsConfig, items };
const file = process.argv[2] || 'tts-list.json';
writeFileSync(file, JSON.stringify(out));
console.log(`已列出 ${items.length} 段旁白 → ${file}`);
