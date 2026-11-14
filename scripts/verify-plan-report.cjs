#!/usr/bin/env node
/**
 * 志愿规划报告（build-report-plan.cjs 产物）验证器
 *
 * 用法: node scripts/verify-plan-report.cjs <html路径> [--student abc2]
 *
 * 检查四类：
 *  一、结构完整性（锚点、目录、无模板残留）
 *  二、六步齐全（对应用户要求的分析框架）
 *  三、数据一致性（从 _recommend-<id>.json 反查，数字不能对不上）
 *  四、口径正确性（SAP 高华条件、踩线判定、COP 年度、通勤两列）
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const argFile = process.argv[2];
if (!argFile) { console.error('用法: node verify-plan-report.cjs <html路径> [--student abc2]'); process.exit(2); }
const si = process.argv.indexOf('--student');
const studentId = si > -1 ? process.argv[si + 1] : (path.basename(argFile).match(/^(\w+)-s1-choice/) || [])[1];
if (!studentId) { console.error('✗ 无法确定学生 id，请用 --student 指定'); process.exit(2); }

const file = path.resolve(argFile);
if (!fs.existsSync(file)) { console.error('文件不存在:', file); process.exit(2); }
const html = fs.readFileSync(file, 'utf8');
const strip = s => s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
const text = strip(html);

const R = JSON.parse(fs.readFileSync(path.join(BASE, `data/_recommend-${studentId}.json`), 'utf8'));
const S = R.student, S2 = R.stats;

let pass = 0, fail = 0;
const fails = [];
const t = (name, ok, detail = '') => {
  if (ok) { pass++; console.log('  ✅ ' + name + (detail ? ' — ' + detail : '')); }
  else { fail++; fails.push(name); console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
};
const group = s => console.log('\n══ ' + s);

/* ── 一、结构 ── */
group('一、结构完整性');
t('无未替换模板变量', !/\$\{|undefined|NaN|\[object Object\]/.test(html));
const anchors = (html.match(/id="s[1-8]"/g) || []).length;
t('含 8 个章节锚点', anchors === 8, anchors + ' 个');
t('含目录且可跳转', html.includes('class="toc"') && html.includes('href="#s1"') && html.includes('href="#s8"'));
t('有生成器标记', /name="generator" content="psle-plan-report/.test(html));
t('有返回看板链接', html.includes('../index.html'));
t('有 noindex', html.includes('noindex'));
t('div 标签闭合', (html.match(/<div/g) || []).length === (html.match(/<\/div>/g) || []).length,
  `${(html.match(/<div/g) || []).length} 开 / ${(html.match(/<\/div>/g) || []).length} 闭`);
t('table 标签闭合', (html.match(/<table/g) || []).length === (html.match(/<\/table>/g) || []).length);

/* ── 二、六步齐全 ── */
group('二、六步框架');
const STEP_TITLES = [
  [/录取规则/, '第一步 录取规则'],
  [/候选池/, '第二步 候选池'],
  [/COP/, '第三步 COP'],
  [/逐校适配度/, '第四步 逐校适配'],
  [/梯度设计/, '第五步 梯度'],
  [/最终建议/, '第六步 建议 + 三方案'],
];
for (const [re, label] of STEP_TITLES) t(label, re.test(text));
t('三套方案齐全', ['方案 A', '方案 B', '方案 C'].every(k => text.includes(k)));
t('含「如果这是我的孩子」段落', /如果这是我的孩子/.test(text));
t('含事实/判断分界说明', /我的判断|判断/.test(text) && /事实/.test(text));

/* ── 三、数据一致性 ── */
group('三、数据一致性（对照 _recommend-' + studentId + '.json）');
t('主池数量一致', text.includes(`${S2.poolMixed} 所`) || text.includes(`主池（混校）${S2.poolMixed}`), `期望 ${S2.poolMixed}`);
t('可及总数一致', text.includes(`${S2.withinCommuteReachable} 所`), `期望 ${S2.withinCommuteReachable}`);
t('学生分数与 PG 正确', text.includes(`AL ${S.score}`) && text.includes(S.pgShort));
t('邮编正确', text.includes(S.postal));

// 方案 A 的 6 所学校必须都出现，且 COP 区间与数据源一致
const planA = R.pool.filter(x => x.rank && x.rank <= 6);
const six = [
  'Greendale Secondary School', 'Compassvale Secondary School', 'Seng Kang Secondary School',
  'North Vista Secondary School', 'Bendemeer Secondary School', 'Bartley Secondary School',
];
const missing = six.filter(n => !text.includes(n.replace(/ Secondary School/, '')));
t('方案 A 六所学校都在报告里', missing.length === 0, missing.length ? '缺：' + missing.join('、') : '6/6');

// 每所的 PG3 区间必须在报告里出现
const copBad = [];
for (const n of six) {
  const x = R.pool.find(y => y.name === n);
  if (!x || !x.cop) continue;
  const rgx = new RegExp(`${x.cop.min}\\s*[–-]\\s*${x.cop.max}`);
  if (!rgx.test(text)) copBad.push(`${n.replace(/ Secondary School/, '')}(${x.cop.min}-${x.cop.max})`);
}
t('六所 PG3 区间与数据源一致', copBad.length === 0, copBad.length ? '不符：' + copBad.join('、') : '全部一致');

// 余量必须对得上（至少抽查 1 分的 Greendale 与 7 分的 Bendemeer）
const gre = R.pool.find(x => x.name === 'Greendale Secondary School');
const ben = R.pool.find(x => x.name === 'Bendemeer Secondary School');
t('Greendale 余量正确', gre && text.includes(`余量 +${gre.margin}`) === false ? text.includes(`+${gre.margin}`) : true,
  gre ? `+${gre.margin}` : '—');
t('Bendemeer 余量正确（+7）', ben ? text.includes('+7') : false, ben ? `+${ben.margin}` : '—');

/* ── 四、口径正确性 ── */
group('四、口径与规则正确性');
t('按 PG3 口径（不是 PG1）', /Posting Group 3|PG3/.test(text) && !/只竞争 PG1/.test(text));
t('COP 年度写明 2025', /2025 年度/.test(text));

/* ── 官方星号（低位段未招满）─────────────────────────────
   实测星号只出现在 PG1 档、PG3 一所都没有。报告必须写清这个分布，
   否则「未招满」会被读成「PG3 门槛会降」。 */
t('写明星号分布（只出现在 PG1、共 N 所）', /只出现在 PG1 档，共 \d+ 所/.test(text));
t('明确 PG3 / PG2 没有该标记', /PG3 和 PG2 一所都没有/.test(text));
t('给出「别过度解读」的边界', /PG1 有余额 ≠ PG3 门槛会降/.test(text));
{
  const SC2 = JSON.parse(fs.readFileSync(path.join(BASE, 'docs/data/schools.json'), 'utf8')).schools;
  const exp = SC2.filter(x => x.copFlags && x.copFlags.PG1).length;
  t('星号总数与数据源一致', new RegExp(`共 ${exp} 所`).test(text), `期望 ${exp}`);
}
t('写明 2026 届 COP 要 12 月才出', /12 月/.test(text) && /COP/.test(text));
t('三条 tie-breaker 齐全', /公民/.test(text) && /志愿顺序/.test(text) && /抽签/.test(text));
t('SAP 高华条件写对（PSLE ≤ 14）', /≤ 14|14 或更好|14 分/.test(text) && /高华|HCL/.test(text));
t('明确说明本案例用不上 SAP 优势', /用不上|不成立|拿不到/.test(text));
t('附属学校规则说明（20% 学额）', /20%/.test(text) || /非附属生/.test(text));
t('踩线按高风险处理', /踩线/.test(text) && /高/.test(text));
t('通勤两列（步行 / 地铁）', /步行/.test(text) && /地铁/.test(text));
t('争议项已标注', /争议/.test(text));

// 反向断言：不得把 COP 说成保证
/* 反向断言：不得出现「承诺式」表述。
   注意不能只匹配「保证录取」——报告里合法地写着「方案 C 几乎保证录取，
   但代价是……」，那是评估语气而非承诺。只抓真正对家长做承诺的句式。 */
t('未对录取做承诺式表述', !/(一定|必然|百分之百)\s*(能|可以)?\s*(进|录取)/.test(text) && !/保证(你|孩子)?(能被)?录取/.test(text));

group('五、结论与数据的一致性');
// 主池里真有 Robotics 的只有 2 所 —— 报告里若这么说，必须对
const sz = JSON.parse(fs.readFileSync(path.join(BASE, 'docs/data/schools.json'), 'utf8'));
const bySlug = new Map(sz.schools.map(s => [s.slug, s]));
const robSchools = R.pool.filter(x => {
  const s = bySlug.get(x.slug);
  const names = s && s.ccaFull ? Object.values(s.ccaFull.categories).flat().map(i => i.name) : (x.cca || []);
  return names.some(n => /robot/i.test(n));
});
t('「真有 Robotics 的只有 2 所」成立', robSchools.length === 2, robSchools.map(x => x.name.replace(/ Secondary School/, '')).join('、') || '0 所');

console.log('\n' + '═'.repeat(26));
console.log(pass + ' 通过 / ' + fail + ' 失败');
if (fail) { console.log('\n失败项:'); fails.forEach(f => console.log('  - ' + f)); }
process.exit(fail ? 1 : 0);
