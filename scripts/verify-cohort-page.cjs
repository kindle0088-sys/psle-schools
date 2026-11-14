#!/usr/bin/env node
/**
 * 考生人数页验证器
 * 用法: node scripts/verify-cohort-page.cjs [docs/cohort.html]
 *
 * 重点不是「页面长得对不对」，而是「数字有没有资格被引用」：
 * 官方数字必须与 JSON 完全一致，推算值必须显式标为推算，
 * 不可得的数据（逐校学额）必须写明不可得 —— 不能留白让人自己猜。
 *
 * ⚠️ 2026-11-14 修订过一条反向断言。旧版写的是：
 *     t('写明 S1 Portal 才能看到 vacancies', /S1 Portal/.test(text))
 *   这条断言本身在**强制页面保留一个错误事实**（S1 Portal 并不显示学额）。
 *   教训：断言只能验「有没有说」，不能验「说得对不对」——
 *   凡是把某个具体说法写进断言，就要同时问一句「这个说法本身核实过吗」。
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
const known = D.years.filter(y => y.psleCandidates);

console.log('\n══ 一、结构与残留');
t('无未替换变量', !/\$\{|undefined|NaN/.test(html));
t('有生成器标记', /name="generator" content="psle-cohort-page/.test(html));
t('7 个章节锚点', (html.match(/id="s[1-7]"/g) || []).length === 7);
t('有返回看板链接', html.includes('href="index.html"'));
t('页脚有修订记录（改了什么都留痕）', /本次修订/.test(text));
t('无裸露的 Markdown 标记', !/\*\*/.test(html), '页面上不该出现 ** 星号');

console.log('\n══ 二、官方数字一致性');
const bad = known.filter(y => !text.includes(y.psleCandidates.toLocaleString('en-US')));
t(`官方考生数全部出现（${known.length} 年）`, bad.length === 0, bad.map(y => y.year).join(',') || '全部一致');
t('2026 标注为推算', /推算|预测/.test(text) && text.includes('40,800'));
t('写明官方 2026 人数尚未公布', /未公布/.test(text) && /11-24|11-25/.test(text));
t('参与 S1 Posting 的学校数用官方值', text.includes(String(D.capacity.schoolsInS1Posting2025)));

console.log('\n══ 三、口径算术（这几条都是上一版错过的）');
/* 上一版把 6 年（2020–2025）的均值标成「5 年均值」 */
t('均值标签的年数与实际年份数一致',
  text.includes(known.length + ' 年均值') && !/5 年均值/.test(text),
  known.length + ' 年');
/* 上一版拿全校班均 33.4 当 Sec 1 的乘数，ESD 原表 Sec 1 班均是 34.9 */
t('推算单校学额用的是 Sec 1 班均而非全校班均',
  text.includes(String(D.capacity.sec1AverageClassSize)) && !/× 平均班额 33\.4/.test(text),
  D.capacity.sec1AverageClassSize + ' 人');
t('平均每校 = Sec 1 在册 ÷ 参与校数',
  new RegExp(`${D.capacity.sec1Enrolment.toLocaleString('en-US')}\\s*÷\\s*${D.capacity.schoolsInS1Posting2025}`).test(text),
  D.capacity.avgSec1PerSchool + ' 人');
/* 2024 届 → 2025 学年 Sec 1：官方两数并排，证明「考生数 ≠ Sec 1 规模」 */
t('给出考生数与次年 Sec 1 在册的交叉校验',
  text.includes('+' + D.capacity.crossCheck.diff) && text.includes('SPERS'),
  '+' + D.capacity.crossCheck.diff);

console.log('\n══ 四、COP 方向不能被读反');
/* 「COP 掉/降」在中文里会被读成「变容易」，实际数值下行 = 门槛收紧。
   上一版更严重：§2 说涨→降，§4 又说「COP 上行 1–3 分」，自相矛盾。 */
t('明确「数值下行 = 门槛收紧」的口径', /数值下行/.test(text) && /收紧/.test(text));
t('不再出现与证据矛盾的「COP 上行 / 上移」', !/COP[^。；]{0,10}(上行|上移)/.test(text));
t('不再断言「不降反升」', !/不降反升/.test(text));
t('给出落空率的基准（前3志愿 80% / 六志愿 90%）',
  text.includes(D.postingOutcomes.firstThreeChoicesPct + '%') &&
  text.includes(D.postingOutcomes.anyOfSixPct + '%'));

console.log('\n══ 五、不可得的数据必须写明（含反向断言）');
t('明确写出逐校学额无公开来源', /无任何公开来源|无公开来源/.test(text));
/* 反向：绝不能声称 S1 Portal 能看到学额 —— 这是上一版的事实错误。
   ⚠️ 不能用窄正则枚举动词（「可以看到」「能看到」「即可看到」…永远漏一个），
   改为按句判断：句子里同时出现「学额类词」+「看/显示的肯定式」且没有否定词 = 违规。 */
const s1Claims = text.split(/[。；\n]/)
  .filter(x => x.includes('S1 Portal'))
  .filter(x => /(学额|余量|vacanc)/i.test(x)
            && /(看到|可见|查看|显示|查到)/.test(x)
            && !/(不显示|看不到|查不到|无法|没有|不提供|并非|不是|亦不)/.test(x));
t('未声称 S1 Portal 可查学额', s1Claims.length === 0,
  s1Claims.length ? s1Claims.map(x => x.trim().slice(0, 46)).join(' ｜ ') : '无违规句');
t('正面写明 S1 Portal 不显示学额',
  /S1 Portal[^。]{0,60}(不显示|看不到|查不到|没有)/.test(text));
t('说明空位真实存在的时点（放榜 / 报到后）',
  /报到/.test(text) && /放榜/.test(text) && /招生办/.test(text));

console.log('\n══ 六、推算的误差带是算出来的，不是拍的');
const R = D.ratioBacktest;
t('回测比值自洽（考生 ÷ 出生 = 记录的比值）',
  R.byYear.every(r => Math.abs(r.candidates / r.births - r.ratio) < 0.001));
t('2026 误差带由回测反推',
  R.bandFor2026.every((v, i) => Math.abs(v - R.base2026 * (i ? R.max : R.min)) < 100),
  R.bandFor2026.map(v => v.toLocaleString('en-US')).join('–'));
t('页面写出了这个经验区间',
  text.includes(R.bandFor2026[0].toLocaleString('en-US')) &&
  text.includes(R.bandFor2026[1].toLocaleString('en-US')));
t('不再出现没有依据的「误差至少 ±500」', !/误差至少在 ±500 人量级/.test(text));

console.log('\n══ 七、龙年实证');
t('三所学校的 COP 变动都在', D.cases.items.every(c => text.includes(c.school)));
t('写明了 MOE 的回应口径', /学额规划|足够学额|合格/.test(text));
t('区分「总量够」与「逐校不够」', /总量/.test(text) && /不保证/.test(text));
t('有独立旁证（联合早报 25 所）', /25 所/.test(text));

console.log('\n══ 八、时间线与口径');
t('2026 时间线含分配结果日', text.includes('2026-12-18'));
t('写明入学年份是 2027', /2027 年 1 月/.test(text));
t('标出「暂定」性质', /暂定/.test(text));
t('柱状图截断轴已说明', /从 36,000 起/.test(text) && /不是 0/.test(text));
t('标出来源等级', html.includes('class="tag a"') || html.includes('class="src a"'));
t('说明公民出生数 vs 总出生数', /公民出生数/.test(text) && /总出生数/.test(text));
t('无承诺式表述', !/(一定|必然|百分之百)\s*(能|可以)?\s*(进|录取)/.test(text));

console.log('\n' + '═'.repeat(26));
console.log(pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
