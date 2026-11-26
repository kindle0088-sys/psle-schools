#!/usr/bin/env node
/**
 * abcd2-reverse-v2 专项验证器
 *
 * 通用 verify-plan-report.cjs 只验六步模板与数据一致性；本脚本补验
 * 「反向校验 v2」这层新增内容：家长新顺序、两套新顺序、2026 考生大盘、
 * 扩招结论、六校三年 COP（含 North Vista 2024 10–17）、与上一版对照、
 * 以及 S1 派位顺序口径的更正。
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const file = path.join(BASE, 'docs/reports/abcd2-reverse-v2-s1-choice-2026.html');
if (!fs.existsSync(file)) { console.error('✗ 报告不存在:', file); process.exit(2); }
const html = fs.readFileSync(file, 'utf8');
const strip = s => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const text = strip(html);

const R = JSON.parse(fs.readFileSync(path.join(BASE, 'data/_recommend-abcd2-reverse-v2.json'), 'utf8'));
const RESEARCH = JSON.parse(fs.readFileSync(path.join(BASE, 'data/research/abcd2-reverse-v2.json'), 'utf8'));
const PREV_PLAN = require(path.join(BASE, 'data/plans/abcd2-reverse.js'));
const { PLANS } = require(path.join(BASE, 'data/plans/abcd2-reverse-v2.js'));

let pass = 0, fail = 0; const fails = [];
const t = (name, ok, detail = '') => {
  if (ok) { pass++; console.log('  ✅ ' + name + (detail ? ' — ' + detail : '')); }
  else { fail++; fails.push(name); console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
};
const group = s => console.log('\n══ ' + s);
const short = n => String(n).replace(/ Secondary School| \(Secondary\)/, '');

/* ⚠️ 「方案 B / C」在审计对照表里先出现过一次，indexOf 会锚到表头。
   用 <h3> 锚定真正的方案章节，再切到下一个 <h3>。 */
const planSeg = title => {
  const a = html.indexOf('<h3>' + title);
  if (a < 0) return '';
  const b = html.indexOf('<h3>', a + 5);
  return html.slice(a, b > a ? b : html.length);
};
const allowed = new Set([
  ...Object.keys(RESEARCH.schools), ...Object.keys(RESEARCH.swapIn),
  ...Object.values(RESEARCH.schools).flatMap(r => []),
].map(short));
for (const p of PREV_PLAN.PLANS.A.picks) allowed.add(short(p.name));
const orderIn = title => [...planSeg(title).matchAll(/<b>([^<]+)<\/b>/g)]
  .map(m => m[1].trim()).filter(n => allowed.has(n)).slice(0, 6);

group('一、结构');
t('8 个章节锚点仍有', (html.match(/id="s[1-8]"/g) || []).length === 8);
t('div 标签闭合', (html.match(/<div\b/g) || []).length === (html.match(/<\/div>/g) || []).length);
t('含 v2 反向校验专节', text.includes('00 反向校验 v2：家长六志愿逐条核对'));
t('无模板变量残留', !/(undefined|NaN|\[object Object\]|\{\{[^}]+\}\})/.test(text));
t('报告标注 v2 学生', html.includes('<meta name="student" content="abcd2-reverse-v2">'));

group('二、三套顺序');
const expectA = Object.entries(RESEARCH.schools).sort((a, b) => a[1].familyRank - b[1].familyRank).map(([n]) => short(n));
const expectB = RESEARCH.alternativeOrders.B.order.map(short);
const expectC = RESEARCH.alternativeOrders.C.order.map(short);
const gotA = orderIn(PLANS.A.title), gotB = orderIn(PLANS.B.title), gotC = orderIn(PLANS.C.title);
t('方案 A = 家长新顺序', JSON.stringify(gotA) === JSON.stringify(expectA), gotA.join(' → '));
t('方案 B = 六校不换的新顺序', JSON.stringify(gotB) === JSON.stringify(expectB), gotB.join(' → '));
t('方案 C = 换校新顺序', JSON.stringify(gotC) === JSON.stringify(expectC), gotC.join(' → '));
t('B/C 与原顺序不同', JSON.stringify(gotB) !== JSON.stringify(gotA) && JSON.stringify(gotC) !== JSON.stringify(gotA));
t('C 新增 Springfield 且移出 North Vista', gotC.includes('Springfield') && !gotC.includes('North Vista') && gotA.includes('North Vista'));
t('B 把 Hougang 提到第 2', gotB[1] === 'Hougang' && gotA[5] === 'Hougang');

group('三、2026 大盘与扩招结论');
t('2026 考生数 40,906', text.includes('40,906'));
t('2024 龙年考生数 40,894', text.includes('40,894'));
t('两年差 12 人', /[+多差]\s*12\s*人/.test(text));
t('适合升读 98.5%', text.includes('98.5%'));
t('141 校参与 S1', text.includes('141 校参与 S1'));
t('写明逐校学额不公开', /逐校 S1 学额.{0,20}没有|没有逐校 S1 学额|逐校学额不存在公开来源/.test(text));
t('写明未见六校扩招计划', text.includes('都没有逐校 S1 学额字段，也没有这六所'));
t('全市均值 292 人/校且非承诺', text.includes('292 人/校') && text.includes('不是任何一所学校的承诺名额'));
t('Springfield 星号只写低位段', text.includes('PG1 低位段未招满') && !text.includes('PG3 会降分'));

group('四、六校事实核对');
for (const [name, rec] of Object.entries(RESEARCH.schools)) {
  const sn = short(name);
  const trend = rec.cop.map(c => c.status === 'no-s1'
    ? `${c.year} 无 S1 派位`
    : `${c.year} ${c.min}–${c.max}`).join(' → ');
  t(sn + ' COP 三年轨迹出现', html.includes(trend), trend);
  t(sn + ' 反向结论出现', text.includes(strip(rec.verdict).slice(0, 28)));
}
t('North Vista 2024 PG3 10–17 已按当前 MOE 页写入', text.includes('2024 10–17') && text.includes('2024 PG3 10–17'));
t('Naval Base EAP 需中二校内选拔', /中二.{0,20}校内选拔|校内选拔.{0,20}中二/.test(text));
t('Hougang 为六校唯一明确 Computing', /六校里唯一明确列 Computing/.test(text) || /只有 Hougang 明确列 Computing/.test(text));
t('Mobile Robotics 是科目不是社团', /Mobile Robotics 是科目，不是机器人社团/.test(text));
t('AI 命中为科技类归类', /AI 命中来自资讯科技/.test(text) || /归为「AI」命中/.test(text) || /归为「AI\/科技」命中/.test(text));
t('快照差异已披露', text.includes('本地 11-08 快照未登记') || text.includes('11-08 快照缺'));
t('开放日节含已结束与未开始场次', text.includes('开放日（含已结束场次') && text.includes('11-28 09:00–12:30'));

group('五、与上一版对照与口径更正');
t('上一版报告名出现', text.includes('abcd2-reverse-s1-choice-2026.html'));
t('上一版家长顺序六校齐全', RESEARCH.comparison.previousOrder.every(n => text.includes(n)));
t('对照表五列表头齐全', RESEARCH.comparison.heads.every(h => text.includes(h)));
t('给出哪版更合理的明确判断', /v2 比 abcd2-reverse 合理/.test(text));
t('更正 MOE 第 1 志愿先审口径', /1st school choice is considered first/.test(text) && /第 1 志愿先审/.test(text));
t('更正不是简单沿用旧说法', /上一版口径更正/.test(text) && /推广成「更稳的放前面也无害」/.test(text));
t('来源表含新增 MOE 派位图', text.includes('How S1 Posting works') && text.includes('how-posting-works'));

group('六、来源与负面断言');
t('来源条目数与研究数据一致', RESEARCH.sources.every(s => text.includes(s.title)));
t('不承诺录取', !/(一定|必然|百分之百)\s*(能进|录取)/.test(text));
t('不把 PR 写成与公民同权', /PR 同分还输公民|PR 同分输公民/.test(text));
t('不把扩招写成已确认', !/已确认扩招|确定扩招/.test(text));

console.log('\n══════════════════════════');
console.log(`${pass} 通过 / ${fail} 失败`);
if (fail) { console.log('失败项：' + fails.join('；')); process.exit(1); }
