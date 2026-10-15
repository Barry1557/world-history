// 把一段旁白拆成字幕句（构建脚本和页面共用同一份，保证配音的字幕时间点对得上）
// 页面里由构建脚本去掉 export 后内联进 app.js。
export function splitText(t) {
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
