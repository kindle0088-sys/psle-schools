/**
 * 校验 data/cca-catalog.json 的数据契约：
 *  ① 每所 MOE 登记的 CCA，都必须在目录里有对应条目（name 或 aliases 命中）
 *  ② 目录里标记 moe:true 的项，必须真实存在于该校 MOE 登记里（反向验证）
 *  ③ 类别必须是约定的四种
 *  ④ 统计 MOE 覆盖率，供报告引用
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const cat = JSON.parse(fs.readFileSync(path.join(BASE, 'data/cca-catalog.json'), 'utf8'));
const schools = JSON.parse(fs.readFileSync(path.join(BASE, 'docs/data/schools.json'), 'utf8')).schools;

/**
 * MOE 的名称带各种括号后缀：(Girls and Boys) / (NPCC) / (NCC) (Land) / (Media Production)。
 * 全部剥掉再归一化，否则同一社团两边名称永远对不上。
 */
const norm = s => String(s).toLowerCase()
  .replace(/\([^)]*\)/g, '')
  .replace(/[^a-z0-9]/g, '');

const CATS = new Set(Object.keys(cat._meta.categories));

let pass = 0, fail = 0;
const t = (name, ok, extra = '') => {
  if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
};

console.log('\n【一】目录 vs MOE 登记：双向覆盖\n');

for (const [slug, entry] of Object.entries(cat.schools)) {
  const s = schools.find(x => x.slug === slug);
  if (!s) { t(slug + ' 存在于 schools.json', false); continue; }

  const moeList = (s.cca || []).map(norm);
  const catNames = new Set();
  entry.items.forEach(it => {
    catNames.add(norm(it.name));
    (it.aliases || []).forEach(a => catNames.add(norm(a)));
  });

  // ① MOE 里每一项都要在目录里
  const missing = moeList.filter(m => !catNames.has(m));
  t(`${slug} MOE ${moeList.length} 项全部在目录中`, missing.length === 0, '缺: ' + missing.join(', '));

  // ② 标记 moe:true 的，必须在 MOE 登记里真实存在
  const moeFlagged = entry.items.filter(it => it.moe);
  const bogus = moeFlagged.filter(it => {
    const names = [norm(it.name), ...(it.aliases || []).map(norm)];
    return !names.some(n => moeList.includes(n));
  });
  t(`${slug} 标记 moe 的 ${moeFlagged.length} 项均真实登记`, bogus.length === 0, '虚标: ' + bogus.map(b => b.name).join(', '));

  // ③ moeCount 字段与实际一致
  t(`${slug} moeCount 字段准确`, entry.moeCount === (s.cca || []).length,
    `声明 ${entry.moeCount} / 实际 ${(s.cca || []).length}`);

  // ④ 类别合法
  const badCat = entry.items.filter(it => !CATS.has(it.cat));
  t(`${slug} 类别合法`, badCat.length === 0, badCat.map(b => b.name + ':' + b.cat).join(', '));
}

console.log('\n【二】覆盖率统计\n');
const rows = [];
for (const [slug, entry] of Object.entries(cat.schools)) {
  const total = entry.items.length + (entry.dsaOnly || []).length;
  const moe = entry.moeCount;
  rows.push({ slug, total, moe, only: entry.items.filter(i => !i.moe).length, source: entry.source, pct: Math.round(moe / total * 100) });
}
rows.sort((a, b) => a.pct - b.pct);
console.log('学校'.padEnd(36) + '总项  MOE  仅官网  MOE覆盖  来源');
rows.forEach(r => {
  console.log(r.slug.padEnd(36) + String(r.total).padStart(3) + String(r.moe).padStart(6) +
    String(r.only).padStart(7) + String(r.pct + '%').padStart(8) + '  ' + r.source);
});

console.log(`\n合计：${rows.reduce((a, b) => a + b.total, 0)} 项，其中官网独有 ${rows.reduce((a, b) => a + b.only, 0)} 项`);

console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
