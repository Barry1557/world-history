# 世界历史放映厅

纪录片式的世界历史速览网页：自动播放，地图动画 + 中文语音讲解 + 字幕。
47 章、1028 个镜头、旁白约 10.9 万字（1 倍速约 6 个半小时），从「把地球 46 亿年压成一天」讲到互联网，各大洲、各地区都有专章。

- 成品：`docs/index.html`（单个文件，不加载任何外部资源，国内网络可直接打开）
- 核对记录：`docs/fact-check.md`
- 项目要求与约定：`CLAUDE.md`

## 发布到 GitHub Pages

1. 打开仓库页面 → **Settings** → 左侧 **Pages**。
2. **Source** 选 **Deploy from a branch**。
3. **Branch** 选 `main`，文件夹选 `/docs`，点 **Save**。
4. 等一两分钟，页面顶部会出现网址，形如 `https://<用户名>.github.io/world-history/`。

## 本地修改与构建（给开发者）

```bash
npm install      # 安装 world-atlas、d3-geo 等构建依赖
npm run build    # 生成 docs/index.html
npm run stats    # 统计镜头数、字数、时长，并检查每条旁白 60–150 字
npm test         # 无头浏览器自测，截图在 test-shots/
```

改旁白只需改 `src/scenes/` 下对应章节的文件，然后重新构建。

## AI 旁白

旁白默认用微软神经网络声音「云希」预先配好的音频（`docs/audio/yunxi/`），字幕跟着声音逐句走；某段没有音频时自动改用本机语音。
旁白改动推到 `main` 后，GitHub Actions 会自动给改过的段落重新配音并重新构建页面（也可以在仓库的 **Actions → AI 旁白配音 → Run workflow** 手动运行）。
换声音或语速：改 `scripts/tts-config.json`。
