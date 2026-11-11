/**
 * v2 报告校验：重点验证「PG3 口径」是否真的用对了。
 *
 * 这是本版的核心，一旦口径错，整份报告都不可信。
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(BASE, 'docs/reports/abc1-s1-choice-2026-v2.html'), 'utf8');
const schools = JSON.parse(fs.readFileSync(path.join(BASE, 'docs/data/schools.json'), 'utf8')).schools;
const R = JSON.parse(fs.readFileSync(path.join(BASE, 'data/_recommend.json'), 'utf8'));
const NEARBY = JSON.parse(fs.readFileSync(path.join(BASE, 'data/moe-nearby-828765.json'), 'utf8'));

const rawByName = new Map(schools.map(s => [s.name, s]));
const recByName = new Map([...R.pool, ...R.singleSex, ...R.outOfReach].map(x => [x.name, x]));

let pass = 0, fail = 0;
const t = (n, ok, d = '') => {
  if (ok) { pass++; console.log('  ✅', n, d ? '— ' + d : ''); }
  else { fail++; console.log('  ❌', n, d ? '— ' + d : ''); }
};

/** 从原始数据取 PG3 非附属区间 */
const pg3Of = s => {
  const r = (s.cop?.rows || []).find(x => x.label === 'Posting Group 3');
  return r && r.nonAff ? r.nonAff : null;
};

console.log('══ 一、核心：PG3 口径');
const PICK = ['Compassvale Secondary School', 'North Vista Secondary School', 'Punggol Secondary School',
  'Seng Kang Secondary School', 'Hougang Secondary School', 'Bendemeer Secondary School'];

for (const n of PICK) {
  const raw = rawByName.get(n), rec = recByName.get(n);
  if (!raw || !rec) { t(n + ' 存在', false); continue; }
  const g = pg3Of(raw);
  const same = g && rec.cop.min === g.min && rec.cop.max === g.max;
  t(`${n.replace(/ Secondary School/, '')} 用的是 PG3 行`, same,
    `原始 PG3 ${g.min}-${g.max} / 报告 ${rec.cop.min}-${rec.cop.max}`);
}

console.log('\n══ 二、不能再用 PG1 行（回归检查）');
for (const n of PICK) {
  const raw = rawByName.get(n);
  const pg1 = (raw.cop?.rows || []).find(x => x.label === 'Posting Group 1')?.nonAff;
  const rec = recByName.get(n);
  if (!pg1) continue;
  t(`${n.replace(/ Secondary School/, '')} 未误用 PG1（${pg1.min}-${pg1.max}）`,
    rec.cop.max !== pg1.max, `报告用的是 ${rec.cop.max}`);
}

console.log('\n══ 三、余量算式');
for (const n of PICK) {
  const rec = recByName.get(n);
  t(`${n.replace(/ Secondary School/, '')} 余量 = ${rec.cop.max} − 17`, rec.margin === rec.cop.max - 17, `${rec.margin}`);
}

console.log('\n══ 四、上一版误推的三所确实够不着');
for (const [n, expectMax] of [['Edgefield Secondary School', 14], ['Yusof Ishak Secondary School', 15], ['Pei Hwa Secondary School', 14]]) {
  const g = pg3Of(rawByName.get(n));
  t(`${n.replace(/ Secondary School/, '')} PG3 上限 = ${expectMax}，17 分够不着`,
    g && g.max === expectMax && g.max < 17, `实测 ${g ? g.min + '-' + g.max : '无'}`);
  t(`  报告中已把它列为够不着`, R.outOfReach.some(x => x.name === n));
}

console.log('\n══ 五、MOE 附近列表');
t(`列表含 ${NEARBY.count} 所`, NEARBY.count === 17, String(NEARBY.count));
t('报告引用了这 17 所的名字', NEARBY.schools.every(s => html.includes(s.replace(/ Secondary School| \(Secondary\)/, '').slice(0, 12))));
const moeCanGet = R.pool.filter(x => x.moeNearby).length;
t('MOE 附近且够得着的混校 = 8 所', moeCanGet === 8, String(moeCanGet));
t('报告写明 9 所（含男校）', html.includes('8 所混校 + 1 所男校'));

console.log('\n══ 六、分层数字');
t('全岛 147 所', html.includes('>147<') || html.includes('147'));
t('有 PG3 档 130 所', html.includes('>130<') || html.includes('130 '));
const withPg3 = schools.filter(s => pg3Of(s)).length;
t(`实测有 PG3 档 ${withPg3} 所`, withPg3 === 130, String(withPg3));
const canNat = schools.filter(s => { const g = pg3Of(s); return g && g.max >= 17; }).length;
t(`实测全国够得着 ${canNat} 所`, canNat === 68 && html.includes('68'), String(canNat));

console.log('\n══ 七、可选学校都是够得着的');
for (const x of R.pool) {
  if (x.margin < 0) { t('池中不应有够不着的 ' + x.name, false); }
}
t('候选池 19 所全部 margin ≥ 0', R.pool.every(x => x.margin >= 0), `${R.pool.length} 所`);

console.log('\n══ 八、结构完整性');
t('无未替换模板变量', !/\$\{/.test(html));
t('含 6 个志愿行', (html.match(/<td class="num"><b>[1-6]<\/b><\/td>/g) || []).length === 6);
t('含 3 个方案', (html.match(/class="plan(?!s)/g) || []).length === 3);
t('含 COP 口径说明', html.includes('Posting Group 3 行的非附属区间'));

// 单校深度报告入口：数量应与索引一致，且指向真实存在的文件
const REPORTS = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(BASE, 'docs/data/school-reports.json'), 'utf8')).reports || {}; }
  catch (_) { return {}; }
})();
const linked = [...html.matchAll(/class="deeplink" href="([^"]+)"/g)].map(m => m[1]);
// 索引里可能有「够不着、因此不在 v2 候选池」的学校，所以入口数只需 ≤ 索引总数，
// 真正的约束是「不重复」+「不超集」+「文件真实存在」。
t('深度报告入口无重复', new Set(linked).size === linked.length, `${linked.length} 个`);
t('入口数不超过索引总数', linked.length <= Object.keys(REPORTS).length,
  `${linked.length} ≤ ${Object.keys(REPORTS).length}`);
const broken = linked.filter(f => !fs.existsSync(path.join(BASE, 'docs', f)));
t('深度报告链接均指向存在的文件', broken.length === 0, broken.join(', ') || '全部有效');
t('不含与 v1 的对比总结', !/上一版|本版修正了什么|旧口径/.test(html));
t('v1 已加废弃提示',
  fs.readFileSync(path.join(BASE, 'docs/reports/abc1-s1-choice-2026.html'), 'utf8').includes('本版已作废'));
t('导航已指向 v2',
  fs.readFileSync(path.join(BASE, 'docs/index.html'), 'utf8').includes('abc1-s1-choice-2026-v2.html'));

console.log(`\n══════ ${pass} 通过 / ${fail} 失败 ══════`);
process.exit(fail ? 1 : 0);
