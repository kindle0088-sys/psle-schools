/**
 * extract-slugs.cjs — 从 SchoolFinder 列表页 SSR 里提取全部学校 slug
 *
 * 列表页 `/schoolfinder/secondary school` 一次性 SSR 出全部 147 所中学的元数据
 * （RSC payload 里的 JSON，被转义成 \" 形式）。浏览器 DOM 只渲染前 20 个，
 * 所以不能靠 DOM 取，必须从源码里抠。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = process.argv[2] || path.join(ROOT, '.tmp/list.html');
const OUT = path.join(ROOT, 'data/schools-index.json');

const raw = fs.readFileSync(SRC, 'utf8');
console.log('源文件:', SRC);
console.log('大小  :', (raw.length / 1024 / 1024).toFixed(2), 'MB');

// 1) slug 列表（原始转义形式 \"slug\":\"xxx\"）
const slugs = [...new Set(
  [...raw.matchAll(/\\"slug\\":\\"([a-z0-9-]+)\\"/g)].map((m) => m[1])
)];
console.log('slug  :', slugs.length, '个');

// 2) 学校名 + code（按记录块配对）
//    每条记录形如 {\"id\":148,...,\"slug\":\"xxx\",\"school_name\":\"YYY\",...,\"school_code\":\"3072\"
const recRe = /\{\\"id\\":(\d+)[^{]*?\\"slug\\":\\"([a-z0-9-]+)\\",\\"school_name\\":\\"([^\\"]+)\\"[^}]*?\\"school_code\\":\\"([0-9A-Z]+)\\"/g;
const recs = [];
let m;
while ((m = recRe.exec(raw))) {
  recs.push({ id: +m[1], slug: m[2], name: m[3], code: m[4] });
}
console.log('记录  :', recs.length, '条（带名/code）');

// 3) 区域（icode_description 紧跟 school_area）
const areaMap = new Map();
const areaRe = /\\"slug\\":\\"([a-z0-9-]+)\\"/g;
// 简单做法：按 slug 位置切片，在其后 2000 字符内找 icode_description
for (const s of slugs) {
  const i = raw.indexOf(`\\"slug\\":\\"${s}\\"`);
  if (i < 0) continue;
  const seg = raw.slice(i, i + 2200);
  const am = seg.match(/\\"icode_description\\":\\"([^\\"]+)\\"/);
  if (am) areaMap.set(s, am[1]);
}

// 4) 合并
const byslug = new Map(recs.map((r) => [r.slug, r]));
const out = slugs.map((slug) => {
  const r = byslug.get(slug) || {};
  return {
    slug,
    name: r.name || null,
    code: r.code || null,
    area: areaMap.get(slug) || null,
  };
});

const missingName = out.filter((x) => !x.name).length;
const missingArea = out.filter((x) => !x.area).length;

console.log('---');
console.log('缺名称:', missingName, '| 缺区域:', missingArea);
console.log('样例  :');
out.slice(0, 5).forEach((x) => console.log('  ', x.slug.padEnd(40), x.area || '-', '|', x.name || '-'));

fs.writeFileSync(OUT, JSON.stringify(out, null, 1), 'utf8');
console.log('\n✅ 写入', OUT, '(' + out.length + ' 条)');
