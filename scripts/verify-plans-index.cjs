#!/usr/bin/env node
/**
 * 志愿方案看板验证器
 * 用法: node scripts/verify-plans-index.cjs [docs/plans.html]
 *
 * 这一页的价值全在「索引说有几份方案，页面就要有几张卡，且每张卡的内容与索引一致」。
 * 所以断言的核心是「页面 ⇄ docs/data/students-index.json」的逐项对账，
 * 而不是「页面长得对不对」。
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const file = path.resolve(process.argv[2] || path.join(BASE, 'docs/plans.html'));
const html = fs.readFileSync(file, 'utf8');
const IDX = JSON.parse(fs.readFileSync(path.join(BASE, 'docs/data/students-index.json'), 'utf8'));

const text = html.replace(/<[^>]*>/g, ' ')
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ');

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => {
  if (ok) { pass++; console.log('  ✅ ' + name + (detail ? ' — ' + detail : '')); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
};

const students = (IDX.students || []).filter(s => s.planSlug);
/* 按 data-id 切卡片，避免用正则匹配嵌套结构 */
const cards = html.split('<article class="plan"').slice(1).map(chunk => {
  const id = (chunk.match(/data-id="([^"]+)"/) || [])[1] || null;
  const body = chunk.split('</article>')[0];
  return { id, body };
});
const short = n => String(n).replace(/ Secondary School| \(Secondary\)/, '');

console.log('\n══ 一、结构与残留');
t('无未替换变量', !/\$\{|undefined|NaN/.test(html));
t('无裸露的 Markdown 星号', !/\*\*/.test(html));
t('有生成器标记', /name="generator" content="psle-plans-index/.test(html));
t('有返回看板链接', html.includes('href="index.html"'));

console.log('\n══ 二、卡片 ⇄ 索引 对账');
t('卡片数与索引方案数一致', cards.length === students.length, `${cards.length} / ${students.length}`);
t('每张卡片的 id 都能在索引里找到',
  cards.every(c => students.some(s => s.id === c.id)),
  cards.map(c => c.id).join(','));
t('索引里每个学生都有对应卡片',
  students.every(s => cards.some(c => c.id === s.id)));

console.log('\n══ 三、每张卡的内容必须与索引一致');
for (const s of students) {
  const c = cards.find(x => x.id === s.id);
  if (!c) { t(`${s.id} 卡片存在`, false); continue; }
  const picks = (s.plan && s.plan.picks) || [];
  const names = picks.map(p => short(p.name));
  /* 必须精确比对：用 includes('Bartley') 时，页面写「Bartley X」也会通过（负向测试实测漏报）。
     所以直接抽出 .sn 的文本，按顺序与索引对齐。 */
  const shown = [...c.body.matchAll(/<span class="sn">([^<]*)<\/span>/g)].map(m => m[1].replace(/&#39;/g, "'"));
  t(`${s.id}：六所志愿校名与顺序逐一吻合`,
    picks.length === 6 && shown.length === 6 && shown.every((v, i) => v === names[i]),
    shown.length !== names.length ? `${shown.length}/${names.length}` : (shown.find((v, i) => v !== names[i]) || '全部一致'));
  /* 槽位必须 1..6 且按顺序渲染 */
  const slots = [...c.body.matchAll(/<span class="slot">(\d+)<\/span>/g)].map(m => +m[1]);
  t(`${s.id}：槽位顺序 1–${slots.length}`, slots.every((v, i) => v === i + 1), slots.join(','));
  t(`${s.id}：标注 AL 与分组`,
    c.body.includes(`AL <b>${s.al}</b>`) && (!s.pgShort || c.body.includes(s.pgShort)));
  t(`${s.id}：主池与可及数来自索引`,
    (s.plan.poolMixed == null || c.body.includes(`>${s.plan.poolMixed}<`)) &&
    (s.plan.withinCommuteReachable == null || c.body.includes(`>${s.plan.withinCommuteReachable}<`)),
    `主池 ${s.plan.poolMixed} / 可及 ${s.plan.withinCommuteReachable}`);
}

console.log('\n══ 四、链接可用性（页面上不能有死链）');
{
  const links = [...html.matchAll(/href="([^"#]+)"/g)].map(m => m[1])
    .filter(h => !/^https?:/.test(h));
  const dead = links.filter(h => !fs.existsSync(path.join(BASE, 'docs', h)));
  t('所有站内链接指向真实文件', dead.length === 0, dead.slice(0, 5).join(',') || `${links.length} 条全通`);
  const goLinks = [...html.matchAll(/class="go" href="([^"]+)"/g)].map(m => m[1]);
  t('每份方案都有「打开完整方案」', goLinks.length === students.length, `${goLinks.length} 个`);
}

console.log('\n══ 五、状态与说明');
t('「看板当前」只标一份', (html.match(/class="cur"/g) || []).length === 1);
t('标注的是 activeId 那位',
  (cards.find(c => c.body.includes('class="cur"')) || {}).id === IDX.activeId,
  IDX.activeId);
t('写出新增方案的方法', /build-report-plan\.cjs/.test(text) && /build-plans-index\.cjs/.test(text));
t('标注生成时间', /生成于 \d{4}/.test(text));
t('无承诺式表述', !/(一定|必然|百分之百)\s*(能|可以)?\s*(进|录取)/.test(text));

console.log('\n' + '═'.repeat(26));
console.log(pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
