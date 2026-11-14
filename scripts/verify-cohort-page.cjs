#!/usr/bin/env node
/**
 * 考生人数页验证器
 * 用法: node scripts/verify-cohort-page.cjs [docs/cohort.html]
 *
 * 重点不是「页面长得对不对」，而是「数字有没有资格被引用」：
 * 官方数字必须与 JSON 完全一致，推算值必须显式标为推算，
 * 不可得的数据（逐校学额）必须写明不可得 —— 不能留白让人自己猜。
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const file = path.resolve(process.argv[2] || path.join(BASE, 'docs/cohort.html'));
const html = fs.readFileSync(file, 'utf8');
const D = JSON.parse(fs.readFileSync(path.join(BASE, 'data/psle-cohort.json'), 'utf8'));
/* 实体必须先解再比对：Raffles Girls' School 里的撇号会被 esc 成 &#39;，
   不还原就永远对不上 */
const text = html.replace(/<[^>]*>/g, '')
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => {
  if (ok) { pass++; console.log('  ✅ ' + name + (detail ? ' — ' + detail : '')); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
};

console.log('\n══ 一、结构与残留');
t('无未替换变量', !/\$\{|undefined|NaN/.test(html));
t('有生成器标记', /name="generator" content="psle-cohort-page/.test(html));
t('7 个章节锚点', (html.match(/id="s[1-7]"/g) || []).length === 7);
t('有返回看板链接', html.includes('href="index.html"'));

console.log('\n══ 二、官方数字一致性');
const known = D.years.filter(y => y.psleCandidates);
const bad = known.filter(y => !text.includes(y.psleCandidates.toLocaleString('en-US')));
t(`官方考生数全部出现（${known.length} 年）`, bad.length === 0, bad.map(y => y.year).join(',') || '全部一致');
t('2026 标注为预测', /推算|预测/.test(text) && text.includes('40,800'));
t('写明官方 2026 人数尚未公布', /未公布/.test(text) && /11-24|11-25|11 月/.test(text));

console.log('\n══ 三、不可得的数据必须写明');
t('明确写出逐校学额不公开', /逐校.*不公布|不公布.*逐校|无公开来源/.test(text));
t('写明 S1 Portal 才能看到 vacancies', /S1 Portal/.test(text));
t('给出可核的平均每校值', text.includes(D.capacity.avgSec1PerSchool));
t('平均值的算法写出来了', new RegExp(`${D.capacity.sec1Enrolment.toLocaleString('en-US')}\\s*÷\\s*${D.capacity.schoolsInS1Posting2025}`).test(text));

console.log('\n══ 四、龙年实证');
t('三所学校的 COP 变动都在', D.cases.items.every(c => text.includes(c.school)));
t('写明了 MOE 的回应口径', /学额规划|足够学额|合格/.test(text));
t('区分「总量够」与「逐校不够」', /总量/.test(text) && /不保证/.test(text));

console.log('\n══ 五、口径与免责');
t('标出来源等级', html.includes('class="tag a"') || html.includes('class="src a"'));
t('说明公民出生数 vs 总出生数', /公民出生数/.test(text) && /总出生数/.test(text));
t('无承诺式表述', !/(一定|必然|百分之百)\s*(能|可以)?\s*(进|录取)/.test(text));

console.log('\n' + '═'.repeat(26));
console.log(pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
