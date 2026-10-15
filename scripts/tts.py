"""给每段旁白配音（AI 旁白）。

用法：
    node scripts/tts-list.mjs tts-list.json
    python3 scripts/tts.py tts-list.json [--prune] [--limit 分钟]

- 用 edge-tts（微软神经网络声音），声音和语速在 scripts/tts-config.json 里改。
- 每段旁白一个 mp3，文件名由旁白原文决定；已经配好的会跳过，只补新增或改过的段落。
- 同时记下每个词在第几毫秒读出来（manifest.json），构建时据此让字幕和声音逐句对齐。
- --prune：删掉旁白已经改掉、不再用到的旧音频。
- --limit：最多运行多少分钟就停下（已完成的会保存，下次接着配）。
"""
import argparse
import asyncio
import json
import os
import sys
import time

import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def align(text, words):
    """把 edge-tts 返回的词和原文对上：[[第几个字, 第几毫秒], ...]"""
    out, cursor = [], 0
    for offset, word in words:
        word = (word or '').strip()
        if not word:
            continue
        idx = text.find(word, cursor)
        if idx < 0 or idx - cursor > 12:
            continue
        out.append([idx, round(offset / 10000)])   # edge-tts 的时间单位是 100 纳秒
        cursor = idx + len(word)
    return out


async def synth(text, cfg):
    kw = dict(rate=cfg.get('rate', '+0%'), pitch=cfg.get('pitch', '+0Hz'))
    try:
        comm = edge_tts.Communicate(text, cfg['voice'], boundary='WordBoundary', **kw)
    except TypeError:   # 旧版 edge-tts 没有 boundary 参数，默认就是逐词
        comm = edge_tts.Communicate(text, cfg['voice'], **kw)
    audio, words = bytearray(), []
    async for chunk in comm.stream():
        if chunk['type'] == 'audio':
            audio += chunk['data']
        elif chunk['type'] == 'WordBoundary':
            words.append((chunk['offset'], chunk.get('text', '')))
    if len(audio) < 2000:
        raise RuntimeError('没有收到音频')
    return bytes(audio), words


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('list')
    ap.add_argument('--prune', action='store_true')
    ap.add_argument('--limit', type=float, default=0, help='最多运行多少分钟')
    ap.add_argument('--jobs', type=int, default=4)
    args = ap.parse_args()

    with open(args.list, encoding='utf-8') as f:
        cfg = json.load(f)
    items = cfg['items']
    outdir = os.path.join(ROOT, 'docs', cfg['dir'])
    os.makedirs(outdir, exist_ok=True)
    mpath = os.path.join(outdir, 'manifest.json')
    manifest = {}
    if os.path.exists(mpath):
        with open(mpath, encoding='utf-8') as f:
            manifest = json.load(f)

    def save():
        tmp = mpath + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
        os.replace(tmp, mpath)

    seen, todo = set(), []
    for it in items:
        if it['h'] in seen:
            continue
        seen.add(it['h'])
        if it['h'] in manifest and os.path.exists(os.path.join(outdir, it['h'] + '.mp3')):
            continue
        todo.append(it)
    print(f'共 {len(seen)} 段旁白，已有 {len(seen) - len(todo)} 段，需要配音 {len(todo)} 段（声音：{cfg["voice"]}）', flush=True)

    deadline = time.time() + args.limit * 60 if args.limit else None
    sem = asyncio.Semaphore(args.jobs)
    done = failed = 0

    async def one(it):
        nonlocal done, failed
        async with sem:
            if deadline and time.time() > deadline:
                return
            for attempt in range(6):
                try:
                    audio, words = await asyncio.wait_for(synth(it['t'], cfg), timeout=90)
                    path = os.path.join(outdir, it['h'] + '.mp3')
                    with open(path + '.tmp', 'wb') as f:
                        f.write(audio)
                    os.replace(path + '.tmp', path)
                    # edge-tts 输出 48 kbps 恒定码率，按字节数算时长
                    manifest[it['h']] = {'d': round(len(audio) * 8 / 48), 'w': align(it['t'], words)}
                    done += 1
                    if done % 20 == 0:
                        save()
                        print(f'  已完成 {done}/{len(todo)}', flush=True)
                    return
                except Exception as e:  # 网络抖动或被限流：等一会儿重试
                    wait = 3 * (attempt + 1) ** 2
                    print(f'  第 {attempt + 1} 次失败（{type(e).__name__}: {e}），{wait} 秒后重试', flush=True)
                    await asyncio.sleep(wait)
            failed += 1

    await asyncio.gather(*(one(it) for it in todo))

    if args.prune:
        removed = 0
        for name in os.listdir(outdir):
            if name.endswith('.mp3') and name[:-4] not in seen:
                os.remove(os.path.join(outdir, name))
                removed += 1
        for h in list(manifest):
            if h not in seen:
                del manifest[h]
        if removed:
            print(f'删除了 {removed} 个不再使用的旧音频', flush=True)
    save()
    left = len(todo) - done - failed
    print(f'本次配音 {done} 段，失败 {failed} 段' + (f'，还剩 {left} 段下次继续' if left else ''), flush=True)
    if failed and not done:
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
