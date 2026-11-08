/**
 * 报告数据校验：把 HTML 里的关键数字与底层数据逐条比对。
 *
 * 只做「事实层」校验（COP / 通勤 / 评分 / 分档计数），
 * 不校验判词——判词是主观判断，本来就无法自动核对。
 */
const fs = require('fs');
const path = require('path');
const Iso = require('../lib/iso.cjs');

const BASE = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(BASE, 'docs/reports/abc1-s1-choice-2026.html'), 'utf8');
const raw = JSON.parse(fs.readFileSync(path.join(BASE, 'docs/data/schools.json'), 'utf8')).schools;
const R = JSON.parse(fs.readFileSync(path.join(BASE, 'data/_recommend.json'), 'utf8'));
const net = JSON.parse(fs.readFileSync(path.join(BASE, 'data/network.json'), 'utf8'));

const byName = new Map(R.pool.map(x => [x.name, x]));
const rawByName = new Map(raw.map(x => [x.name, x]));

let pass = 0, fail = 0;
const t = (n, ok, d = '') => {
  if (ok) { pass++; console.log('  ✅', n, d ? '— ' + d : ''); }
  else { fail++; console.log('  ❌', n, d ? '— ' + d : ''); }
};

console.log('══ 一、报告结构');
t('页面标题正确', /<title>PSLE 志愿规划 · AL 17/.test(html));
t('含 6 个主选志愿', /志愿<\/th>/.test(html) && (html.match(/<td class="num"><b>[1-6]<\/b><\/td>/g) || []).length === 6,
  `找到 ${(html.match(/<td class="num"><b>[1-6]<\/b><\/td>/g) || []).length} 行`);
t('含 3 个方案', (html.match(/class="plan(?!s)/g) || []).length === 3, `找到 ${(html.match(/class="plan(?!s)/g) || []).length} 个`);
t('无未替换的模板变量', !/\$\{/.test(html));

console.log('\n══ 二、COP 与底层数据一致');
const PICKNAMES = ['Bartley Secondary School', 'Compassvale Secondary School', 'Yusof Ishak Secondary School',
  'Bendemeer Secondary School', 'North Vista Secondary School', 'Punggol Secondary School'];
for (const n of PICKNAMES) {
  const r = byName.get(n), s = rawByName.get(n);
  if (!r || !s) { t(n + ' 存在', false); continue; }
  // 底层 raw 里取非附属最宽松档
  let g = null;
  for (const row of (s.cop?.rows || [])) {
    const v = row.nonAff;
    if (v && (!g || v.max > g.max)) g = v;
  }
  const ok = g && r.cop.min === g.min && r.cop.max === g.max;
  const inHtml = html.includes(`${g.min}–${g.max}${g.markMax ? '(' + g.markMax + ')' : ''}`);
  t(`${n.replace(/ Secondary School/, '')} COP`, ok && inHtml, `原始 ${g.min}-${g.max} / 报告 ${r.cop.min}-${r.cop.max} / HTML 中出现=${inHtml}`);
}

console.log('\n══ 三、余量计算');
for (const n of PICKNAMES) {
  const r = byName.get(n);
  const expect = r.cop.max - 17;
  t(`${n.replace(/ Secondary School/, '')} 余量 = ${r.cop.max} − 17`, r.margin === expect, `计算值 ${r.margin}`);
}

console.log('\n══ 四、通勤时间可复现');
(async () => {
  const j = await (await fetch('https://www.onemap.gov.sg/api/common/elastic/search?searchVal=' +
    R.student.postal + '&returnGeom=Y&getAddrDetails=Y&pageNum=1')).json();
  const origin = { lat: +j.results[0].LATITUDE, lon: +j.results[0].LONGITUDE };
  const graph = Iso.buildGraph(net);
  const sm = Iso.solveFrom(graph, origin).stationMin;
  const times = new Map(Iso.timeToSchools(graph, sm, raw.filter(s => s.lat && s.lon)).map(x => [x.school.name, x]));
  for (const n of PICKNAMES) {
    const r = byName.get(n), tt = times.get(n);
    t(`${n.replace(/ Secondary School/, '')} ${r.minutes} 分钟`, tt && tt.minutes === r.minutes, `重算 ${tt?.minutes}`);
  }

  console.log('\n══ 五、评分公式');
  for (const n of PICKNAMES) {
    const r = byName.get(n), s = r.scores;
    const calc = Math.round(s.safety * .30 + s.commute * .25 + s.academic * .15 + s.cca * .15 + s.feature * .15);
    t(`${n.replace(/ Secondary School/, '')} 总分 ${r.total}`, calc === r.total, `按公式 ${calc}`);
  }

  console.log('\n══ 六、分档计数');
  const t2 = { reach: 0, match: 0, safe: 0 };
  R.pool.forEach(x => { if (x.margin >= 11) t2.safe++; else if (x.margin >= 9) t2.match++; else t2.reach++; });
  t('冲刺档 9 所', t2.reach === 9, String(t2.reach));
  t('匹配档 12 所', t2.match === 12, String(t2.match));
  t('稳妥档 10 所', t2.safe === 10, String(t2.safe));
  t('HTML 中三档数字一致',
    html.includes(`${t2.reach} 所`) && html.includes(`${t2.match} 所`) && html.includes(`${t2.safe} 所`));

  console.log('\n══ 七、排除逻辑');
  t('报告声明 IP 最高门槛 9 分', /最高门槛是 9 分/.test(html));
  t('报告声明 SAP 最高门槛 12 分', /最高门槛是 12 分/.test(html));
  const ipMax = Math.max(...raw.filter(s => s.ip).flatMap(s => (s.cop?.rows || []).map(r => r.nonAff?.max ?? 0)));
  const sapMax = Math.max(...raw.filter(s => s.sap).flatMap(s => (s.cop?.rows || []).map(r => r.nonAff?.max ?? 0)));
  t('IP 实测最高门槛确实是 9', ipMax === 9, String(ipMax));
  t('SAP 实测最高门槛确实是 12', sapMax === 12, String(sapMax));

  console.log('\n══ 八、关键事实陈述');
  const noRobot = raw.filter(s => (s.cca || []).some(c => /robot/i.test(c))).length;
  const noCook = raw.filter(s => (s.cca || []).some(c => /cook|culinary/i.test(c))).length;
  const dramaN = raw.filter(s => (s.cca || []).some(c => /drama|theatre/i.test(c))).length;
  const swimN = raw.filter(s => (s.cca || []).some(c => /swim|water polo/i.test(c))).length;
  t('Robotics 确实 0 所', noRobot === 0, String(noRobot));
  t('Cooking 确实 0 所', noCook === 0, String(noCook));
  t('Drama 确实 10 所', dramaN === 10, String(dramaN));
  t('Swimming 确实 6 所', swimN === 6, String(swimN));

  console.log('\n══ 九、通勤模型乐观度的标注');
  const peiHwa = byName.get('Pei Hwa Secondary School');
  const greendale = byName.get('Greendale Secondary School');
  t('Pei Hwa 步行 1898m 已在报告中提示', peiHwa && html.includes('1898m'), String(peiHwa?.accessWalkM));
  t('Greendale 步行 1363m 已在报告中提示', greendale && html.includes('1363m'), String(greendale?.accessWalkM));

  console.log(`\n══════ ${pass} 通过 / ${fail} 失败 ══════`);
  process.exit(fail ? 1 : 0);
})();
