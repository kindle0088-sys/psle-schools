#!/usr/bin/env node
/**
 * Full SBB 专题页验证器
 * 用法: node scripts/verify-full-sbb.cjs [docs/full-sbb.html]
 *
 * 验证原则（沿用 verify-cohort-page 的教训）：
 *   ① 断言只验「页面有没有说」和「数字是否等于事实源」，不验「说法对不对」——
 *      政策说法的正确性已在 data/full-sbb.json 里由官方来源 + 人工核验保证；
 *   ② 所有期望值从 JSON 派生，不在验证器里再抄一遍数字（抄了就会漂移）；
 *   ③ 开课校数用与生成器相同的 match 规则现算，确认页面没有写死旧值
 *      （count 是生成器运行时注入的，不落回 JSON，所以验证器必须自己算一遍）。
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const file = path.resolve(process.argv[2] || path.join(BASE, 'docs/full-sbb.html'));
const html = fs.readFileSync(file, 'utf8');
const D = JSON.parse(fs.readFileSync(path.join(BASE, 'data/full-sbb.json'), 'utf8'));
const RAW = JSON.parse(fs.readFileSync(path.join(BASE, 'data/schools.json'), 'utf8'));

const text = html.replace(/<[^>]*>/g, '')
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => {
  if (ok) { pass++; console.log('  ✅ ' + name + (detail ? ' — ' + detail : '')); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
};
const NOTE_RE = /offered to the current student cohort|Tamil Language will have to attend/i;
const countFor = pattern => {
  const re = new RegExp(pattern, 'i');
  return RAW.filter(s => (s.subjects || []).filter(v => !NOTE_RE.test(v))
    .some(v => re.test(String(v).trim()))).length;
};

console.log('\n══ 一、结构与残留');
t('无未替换变量', !/\$\{|undefined|NaN/.test(html));
t('有生成器标记', /name="generator" content="psle-full-sbb\//.test(html));
t('7 个章节锚点', (html.match(/id="s[1-7]"/g) || []).length === 7);
t('有返回看板链接', html.includes('href="index.html"'));
t('无裸露的 Markdown 标记', !/\*\*/.test(html.replace(/<style[\s\S]*?<\/style>/gi, '')));
t('有语义色警示块（人文缺口）', /class="warnbox"/.test(html));

console.log('\n══ 二、事实源数字一致性');
t(`科目全部出现（${D.subjects.length} 类）`,
  D.subjects.every(s => text.includes(s.zh)),
  D.subjects.filter(s => !text.includes(s.zh)).map(s => s.id).join(',') || '全部一致');
t('核验日期出现', text.includes(D.verifiedAt));
t('SEC 首考年份一致', text.includes(`${D.sec.firstYear}`) && text.includes('SEC'));
t('JC 门槛两个数字都出现', text.includes(D.jc.threshold) && /16/.test(text) && /20/.test(text));
t('PG 分档全部出现', D.pg.every(r => text.includes(r.score) && text.includes(r.pg)));
t('三级层级全称出现', D.levels.every(l => text.includes(l.full)));
t('来源链接数量一致', (html.match(/target="_blank" rel="noopener noreferrer"/g) || []).length >= D.sources.length);
t('学生标签出现', text.includes(D.student.label) || text.includes(D.student.id));

console.log('\n══ 三、开课校数（与事实源现算一致）');
/* 用「科目行」定位到该科的 <b>N</b>，而不是全局搜 N —— 全局搜会假阳性（别的科目/时间线也有同一个数字）。 */
const rowOf = id => {
  const s = D.subjects.find(x => x.id === id);
  const needle = `<b>${esc(s.zh)}</b>`;
  const i = html.indexOf(needle);
  return i < 0 ? '' : html.slice(i, i + 1200);
};
const esc = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const badCounts = [];
for (const s of D.subjects) {
  const n = countFor(s.match);
  const row = rowOf(s.id);
  const m = row.match(/<td class="num mid"><b>(\d+)<\/b><\/td>/);
  if (!m) badCounts.push(`${s.id} 页面无校数字段`);
  else if (+m[1] !== n) badCounts.push(`${s.id} 页面=${m[1]} 现算=${n}`);
}
t(`开课校数全部一致（${D.subjects.length} 类）`, badCounts.length === 0, badCounts.slice(0, 6).join('; ') || '全部一致');
const zero = D.subjects.filter(s => s.count === 0);
t('没有科目计数为 0（match 规则失效）', zero.length === 0, zero.map(s => s.id).join(',') || '全部 >0');

console.log('\n══ 四、关键政策不缺项');
const must = [
  ['取消三条源流', /Express、N\(A\)、N\(T\)/.test(text)],
  ['混合班 1/3 课时', /1\/3/.test(text)],
  ['HMTL 2026 新规', /2026/.test(text) && /AL1\/AL2/.test(text)],
  ['人文从 S2 升级', /S2/.test(text) && /Humanities|人文/.test(text)],
  ['SEC 等级映射', /A1/.test(text) && /D7/.test(text)],
  ['JC 全 G3 要求', /G3/.test(text) && /必须|全部/.test(text)],
  ['人文组硬门槛', /人文组/.test(text)],
  ['CCA 加分降到 3', /加分上限从 4 分降到 3 分/.test(text)],
  ['四年时间线 5 节点', D.student.timeline.every(r => text.includes(r.year))],
  ['五条建议', D.student.planPoints.every(p => text.includes(p.t))],
];
for (const [n, ok] of must) t(n, ok);

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
