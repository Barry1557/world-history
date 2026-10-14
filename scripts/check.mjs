// 检查镜头数据是否完整、旁白字数是否在 60–150 之间
export function checkScenes(chapters, scenes) {
  const errors = [], warnings = [];
  const num = (v) => typeof v === 'number' && isFinite(v);
  const ll = (p) => Array.isArray(p) && num(p[0]) && num(p[1]) && Math.abs(p[1]) <= 90;
  let lastC = 1;
  scenes.forEach((s, i) => {
    const id = `第 ${i + 1} 个镜头（第 ${s.c} 章）`;
    if (!Number.isInteger(s.c) || s.c < 1 || s.c > chapters.length) errors.push(`${id}：章节号无效`);
    if (s.c < lastC) errors.push(`${id}：章节顺序倒退`);
    lastC = s.c;
    if (!num(s.y)) errors.push(`${id}：缺少年份 y`);
    if (!Array.isArray(s.cam) || s.cam.length !== 3 || !s.cam.every(num)) errors.push(`${id}：cam 应为 [经度, 纬度, 缩放]`);
    if (typeof s.t !== 'string') errors.push(`${id}：缺少旁白 t`);
    else if (s.t.length < 60 || s.t.length > 150) errors.push(`${id}：旁白 ${s.t.length} 字，应在 60–150 字之间`);
    (s.pts || []).forEach((m) => { if (typeof m[0] !== 'string' || !ll([m[1], m[2]])) errors.push(`${id}：标记格式错误 ${JSON.stringify(m)}`); });
    (s.ar || []).forEach((a) => { if (typeof a[0] !== 'string' || !ll([a[1], a[2]]) || !num(a[3])) errors.push(`${id}：范围格式错误 ${JSON.stringify(a)}`); });
    (s.rt || []).forEach((r) => { if (!Array.isArray(r) || r.length < 2 || !r.every(ll)) errors.push(`${id}：航线格式错误`); });
    if (s.p && s.p !== 'p') errors.push(`${id}：p 只能是 'p'`);
  });
  chapters.forEach((c, i) => { if (!scenes.some((s) => s.c === i + 1)) errors.push(`第 ${i + 1} 章没有镜头`); });
  return { errors, warnings };
}
