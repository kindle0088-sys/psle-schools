#!/usr/bin/env node
/**
 * abcd2-reverse 专项验证器
 *
 * 通用 verify-plan-report.cjs 只验六步模板与数据一致性；本脚本补验
 * 「反向校验」这层新增内容：家长原顺序、两套新顺序、2026 考生大盘、
 * 扩招结论、六校 COP 三年轨迹、EAP 中二选拔等。
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const file = path.join(BASE, 'docs/reports/abcd2-reverse-s1-choice-2026.html');
if (!fs.existsSync(file)) { console.error('✗ 报告不存在:', file); process.exit(2); }
const html = fs.readFileSync(file, 'utf8');
const strip = s => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const text = strip(html);

const R = JSON.parse(fs.readFileSync(path.join(BASE, 'data/_recommend-abcd2-reverse.json'), 'utf8'));
const RESEARCH = JSON.parse(fs.readFileSync(path.join(BASE, 'data/research/abcd2-reverse.json'), 'utf8'));
const { PLANS } = require(path.join(BASE, 'data/plans/abcd2-reverse.js'));

let pass = 0, fail = 0; const fails = [];
const t = (name, ok, detail = '') => {
  if (ok) { pass++; console.log('  ✅ ' + name + (detail ? ' — ' + detail : '')); }
  else { fail++; fails.push(name); console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
};
const group = s => console.log('\n══ ' + s);
const short = n => String(n).replace(/ Secondary School| \(Secondary\)/, '');
const seg = (from, to) => {
  const a = html.indexOf(from);
  const b = to ? html.indexOf(to, a + 1) : html.length;
  return a > -1 && b > a ? html.slice(a, b) : '';
};
const orderIn = title => {
  const s = seg(title, title === PLANS.A.title ? PLANS.B.title : title === PLANS.B.title ? PLANS.C.title : 'class="verdict"');
  return [...s.matchAll(/<td><b>([^<]+)<\/b>/g)].map(m => m[1].trim()).filter(n => n.length < 40).slice(0, 6);
};

group('一、结构');
t('8 个章节锚点仍有', (html.match(/id="s[1-8]"/g) || []).length === 8);
t('div 标签闭合', (html.match(/<div\b/g) || []).length === (html.match(/<\/div>/g) || []).length);
t('含反向校验专节', text.includes('00 反向校验：家长六志愿逐条核对'));
t('无模板变量残留', !/(undefined|NaN|\[object Object\]|\{\{[^}]+\}\})/.test(text));

group('二、三套顺序');
const expectA = Object.entries(RESEARCH.schools).sort((a, b) => a[1].familyRank - b[1].familyRank).map(([n]) => short(n));
const expectB = RESEARCH.alternativeOrders.B.order.map(short);
const expectC = RESEARCH.alternativeOrders.C.order.map(short);
const gotA = orderIn(PLANS.A.title), gotB = orderIn(PLANS.B.title), gotC = orderIn(PLANS.C.title);
t('方案 A = 家长原顺序', JSON.stringify(gotA) === JSON.stringify(expectA), gotA.join(' → '));
t('方案 B = 六校不换新顺序', JSON.stringify(gotB) === JSON.stringify(expectB), gotB.join(' → '));
t('方案 C = 换校新顺序', JSON.stringify(gotC) === JSON.stringify(expectC), gotC.join(' → '));
t('B/C 与原顺序不同', JSON.stringify(gotB) !== JSON.stringify(gotA) && JSON.stringify(gotC) !== JSON.stringify(gotA));
t('C 新增 Springfield 且移出 Outram', gotC.includes('Springfield') && !gotC.includes('Outram') && gotA.includes('Outram'));

group('三、2026 大盘与扩招结论');
t('2026 考生数 40,906', text.includes('40,906'));
t('2024 龙年考生数 40,894', text.includes('40,894'));
t('两年差 12 人', /[+多差]\s*12\s*人/.test(text));
t('适合升读 98.5%', text.includes('98.5%'));
t('141 校参与 S1', text.includes('141 校参与 S1'));
t('写明逐校学额不公开', /逐校 S1 学额.{0,20}没有|没有逐校 S1 学额|逐校学额不存在公开来源/.test(text));
t('写明未见六校扩招计划', text.includes('没有这六所的扩招计划'));
t('全市均值 292 人/校且非承诺', text.includes('292 人/校') && text.includes('不是任何一所学校的承诺名额'));

group('四、六校事实核对');
for (const [name, rec] of Object.entries(RESEARCH.schools)) {
  const sn = short(name);
  const trend = rec.cop.map(c => c.status === 'no-s1' ? `${c.year} 无 S1 派位` : `${c.year} ${c.min}–${c.max}`).join(' → ');
  t(sn + ' COP 三年轨迹出现', html.includes(trend), trend);
  t(sn + ' 反向结论出现', text.includes(strip(rec.verdict).slice(0, 28)));
}
t('Outram 2024 无 S1 派位原文口径', text.includes('Outram 2024 无 S1 派位') || text.includes('2024 无 S1 派位、2025 才有 9–17'));
t('Outram 迁校地址出现', text.includes('48 Anchorvale Crescent'));
t('Naval Base EAP 需中二校内选拔', /中二.{0,20}校内选拔|校内选拔.{0,20}中二/.test(text));
t('Hougang 为六校唯一明确 Computing', /六校里只有 Hougang 明确列 Computing/.test(text));
t('Mobile Robotics 是科目不是社团', /Mobile Robotics 是科目，不是机器人社团/.test(text));
t('AI 命中为科技类归类', /AI 命中来自资讯科技/.test(text) || /归为「AI」命中/.test(text));

group('五、顺序挑战逻辑');
t('指出 Hougang 第 6 位浪费', /Hougang 不该排第 6|Hougang 被浪费了|第 6 位 Hougang/.test(text));
t('指出 Naval Base 挡住 Hougang', /前一位 Naval Base 若录取|Naval Base 不该挡在它前面/.test(text));
t('写明官方 2–3 个较宽松志愿建议', text.includes('2–3 个往年 COP 较宽松的学校') || text.includes('2–3 个较宽松'));
t('六校余量 ≥2 只有两所', /Junyuan（\+3）与 Hougang（\+2）/.test(text));
t('方案 C 的取舍写清', text.includes('失去 Outram 的泳池') && (text.includes('7/7 + Computing') || text.includes('7/7 + 明确 Computing')));
t('不承诺录取', !/(一定|必然|百分之百)\s*(能|可以)?\s*(进|录取)/.test(text) && !/保证(你|孩子)?(能被)?录取/.test(text));

group('六、来源可追溯');
for (const s of RESEARCH.sources.slice(0, 12)) {
  t('来源出现：' + s.id, html.includes(s.url) || text.includes(s.title));
}
t('全部方案校都在主池或 outOfReach', [...new Set([...expectA, ...expectB, ...expectC])].every(n =>
  R.pool.some(x => short(x.name) === n) || R.outOfReach.some(x => short(x.name) === n)));

console.log('\n' + '═'.repeat(26));
console.log(pass + ' 通过 / ' + fail + ' 失败');
if (fail) { console.log('\n失败项:'); fails.forEach(f => console.log('  - ' + f)); }
process.exit(fail ? 1 : 0);
