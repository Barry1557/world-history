# 世界历史放映厅

纪录片式的世界历史速览网页：自动播放，地图动画 + 中文语音讲解 + 字幕。
22 章、205 个镜头，从「把地球 46 亿年压成一天」讲到互联网。

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

改旁白只需改 `src/scenes.js`，然后重新构建。
