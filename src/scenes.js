// 世界历史放映厅 · 内容入口
//
// 每一章是 src/scenes/ 下的一个文件，导出 { title, sub, scenes }。
// 下面的 ORDER 决定章节的播放顺序；插入新章节只需新建文件并加进 ORDER。
//
// 每个镜头一条：
//   y    年份：负数为公元前；小于等于 -10000 时按「约 X 万年前 / 亿年前」显示
//   a    true 表示年份前加「约」
//   yt   直接指定年份文字（不滚动）
//   cam  [经度, 纬度, 缩放]，缩放 1 = 整个世界
//   p    'p' 表示用以太平洋为中心的地图（跨太平洋的镜头）
//   pts  地点标记 [名称, 经度, 纬度, 标签位置 r/l/t/b]
//   ar   文明范围 [名称, 经度, 纬度, 半径（纬度度数）]
//   rt   迁徙或航线 [[经度, 纬度], ...]（按顺序画出，末端带箭头）
//   rs   'd' 表示用虚线画航线（史前迁徙）
//   t    旁白（60–150 字）

import earthDay from './scenes/earth-day.js';
import outOfAfrica from './scenes/out-of-africa.js';
import agriculture from './scenes/agriculture.js';
import dawn from './scenes/dawn.js';
import bronzeCollapse from './scenes/bronze-collapse.js';
import axial from './scenes/axial.js';
import persiaGreece from './scenes/persia-greece.js';
import qinHanRome from './scenes/qin-han-rome.js';
import fallOfRome from './scenes/fall-of-rome.js';
import islam from './scenes/islam.js';
import tangCharlemagneVikings from './scenes/tang-charlemagne-vikings.js';
import song1066 from './scenes/song-1066.js';
import crusades from './scenes/crusades.js';
import mongolsPlague from './scenes/mongols-plague.js';
import zhenghePrinting from './scenes/zhenghe-printing.js';
import exploration from './scenes/exploration.js';
import reformationScience from './scenes/reformation-science.js';
import revolutions from './scenes/revolutions.js';
import steamOpiumMeiji from './scenes/steam-opium-meiji.js';
import imperialismWw1 from './scenes/imperialism-ww1.js';
import depressionWw2 from './scenes/depression-ww2.js';
import coldWarInternet from './scenes/cold-war-internet.js';
import steppe from './scenes/steppe.js';
import ancientIndia from './scenes/ancient-india.js';
import ancientAfrica from './scenes/ancient-africa.js';
import classicAmericas from './scenes/classic-americas.js';
import iran from './scenes/iran.js';
import koreaJapan from './scenes/korea-japan.js';
import southeastAsia from './scenes/southeast-asia.js';
import turksSeljuks from './scenes/turks-seljuks.js';
import goldenAfrica from './scenes/golden-africa.js';
import rus from './scenes/rus.js';

const ORDER = [
  earthDay, outOfAfrica, agriculture, dawn, bronzeCollapse, axial, persiaGreece,
  steppe, qinHanRome, ancientIndia, fallOfRome, ancientAfrica, classicAmericas,
  islam, iran, tangCharlemagneVikings, koreaJapan, song1066, southeastAsia,
  turksSeljuks, crusades, mongolsPlague, goldenAfrica, rus, zhenghePrinting,
  exploration, reformationScience, revolutions, steamOpiumMeiji, imperialismWw1, depressionWw2, coldWarInternet,
];

export const chapters = ORDER.map(({ title, sub }) => ({ title, sub }));
export const scenes = ORDER.flatMap((ch, i) => ch.scenes.map((s) => ({ c: i + 1, ...s })));
