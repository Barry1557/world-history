// AI 旁白的公共部分：配置、音频文件名、字幕时间点
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const ttsConfig = JSON.parse(readFileSync(new URL('./tts-config.json', import.meta.url), 'utf8'));
export const audioDir = new URL('../docs/' + ttsConfig.dir + '/', import.meta.url);

// 文件名由「声音 + 语速 + 音调 + 旁白原文」决定：旁白一改，文件名就变，自动重新配音
export function audioKey(text, cfg = ttsConfig) {
  return createHash('sha1').update(`${cfg.voice}|${cfg.rate}|${cfg.pitch}|${text}`).digest('hex').slice(0, 16);
}

export function loadManifest() {
  const f = new URL('manifest.json', audioDir);
  if (!existsSync(f)) return {};
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return {}; }
}

// 由配音时记录的「第几个字 → 第几毫秒」推算每一句字幕的起始时间
export function sentenceStarts(text, sents, entry) {
  const w = entry.w || [], d = entry.d || 0, out = [];
  let cursor = 0;
  sents.forEach((s, k) => {
    let pos = text.indexOf(s, cursor);
    if (pos < 0) pos = cursor;
    cursor = pos + s.length;
    if (k === 0) { out.push(0); return; }
    const hit = w.find((x) => x[0] >= pos);
    let ms = hit ? hit[1] : Math.round(d * pos / text.length);
    if (hit && hit[0] - pos > 6) ms = Math.round(d * pos / text.length);   // 对不上时按字数比例估算
    out.push(Math.max(ms, out[out.length - 1] + 200));
  });
  return out;
}
