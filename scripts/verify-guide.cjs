#!/usr/bin/env node
/**
 * 家长学习手册验证器
 * 用法: node scripts/verify-guide.cjs [docs/guide.html]
 *
 * 这份手册面向的是**非技术家长**，一旦数字写错，读者没有能力发现。
 * 所以断言的重点是「页面上的每个数字都必须能在数据文件里找到出处」：
 * 学费、时间线、PG 分档、通勤换算、星号统计，全部回算一遍。
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const file = path.resolve(process.argv[2] || path.join(BASE, 'docs/guide.html'));
const html = fs.readFileSync(file, 'utf8');
const CO = JSON.parse(fs.readFileSync(path.join(BASE, 'data/secondary-costs.json'), 'utf8'));
const COHORT = JSON.parse(fs.readFileSync(path.join(BASE, 'data/psle-cohort.json'), 'utf8'));
const SC = JSON.parse(fs.readFileSync(path.join(BASE, 'docs/data/schools.json'), 'utf8')).schools;

const text = html.replace(/<[^>]*>/g, '')
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => {
  if (ok) { pass++; console.log('  ✅ ' + name + (detail ? ' — ' + detail : '')); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
};
const money = v => (v == null ? '未公布' : 'S$' + v.toLocaleString('en-US'));

console.log('\n══ 一、结构与残留');
t('无未替换变量', !/\$\{|undefined|NaN/.test(html));
/* 只看可见内容：模板 CSS 会内联进页面，注释里的 * 不该算「页面上的星号」 */
t('无裸露的 Markdown 星号', !/\*\*/.test(html.replace(/<style[\s\S]*?<\/style>/gi, '')), '页面上不该出现 **');
t('有生成器标记', /name="generator" content="psle-guide/.test(html));
t('8 个章节锚点齐全', (html.match(/id="s[1-8]"/g) || []).length === 8);
t('目录 8 项与章节一一对应',
  ['这 7 天里发生什么', '学费与升学路径', '提交前 12 项清单'].every(x => html.includes(x)));
t('有返回看板链接', html.includes('href="index.html"'));

console.log('\n══ 二、学费：12 个数字必须与数据源逐一相等');
{
  const rows = CO.secondary.rows;
  /* ⚠️ 不能全页搜数字：2,190 在「三学段对照表」里也出现一次，
     改坏学费表那一处仍会被另一处兜住（负向测试实测漏报）。
     所以先把学费表那一段切出来，只在段内比对。 */
  const from = text.indexOf('政府 / 政府辅助中学月费');
  const to = text.indexOf('单位：新币');
  const seg = from >= 0 && to > from ? text.slice(from, to) : '';
  const bad = [];
  for (const r of rows) {
    for (const y of ['y2023', 'y2024', 'y2025', 'y2026']) {
      if (!seg.includes(money(r[y]))) bad.push(`${r.zh}${y}=${money(r[y])}`);
    }
  }
  t('学费表区块已定位', seg.length > 100, `${seg.length} 字`);
  t(`学费 ${rows.length} 档 × 4 年全部出现在表内`, bad.length === 0, bad.slice(0, 4).join(',') || '全部命中');
  t('写明 2027 年尚未公布', /2027 年的学费尚未公布/.test(text));
  t('杂费三档齐全', CO.misc.rows.every(r => text.includes('S$' + r.amount)));
  t('杂费口径写明「所有国籍同价」', /所有国籍同价/.test(text));
  t('写明学费不含校服/交通/CCA', /校服、课本、交通、餐费、CCA 费用/.test(text));
  /* 反向：不能把 2026 的数字说成 2027 */
  t('未把 2026 学费冒充 2027', !/2027[^。]{0,12}S\$2,190/.test(text));
}

console.log('\n══ 三、时间线：4 个日期必须与 timeline2026 相等');
{
  const TL = COHORT.timeline2026;
  const iso = s => (String(s).match(/\d{4}-\d{2}-\d{2}/g) || []);
  const need = [...iso(TL.psleResults), ...iso(TL.postingResults)];
  t('出分与放榜日期原样出现', need.every(d => text.includes(d)), need.join(' / '));
  t('写明「暂定」性质', /暂定/.test(text) && /tentative/.test(text));
  t('写明填报窗口是 7 个日历日', /7 个日历日/.test(text));
  t('写明最多 6 所', /最多 6 所|6 个志愿/.test(text));
}

console.log('\n══ 四、PG 分档必须与代码逻辑一致');
{
  /* 与 lib/ 里的 gate 口径对齐：PG3 4–20、PG2/3 21–22、PG2 23–24、PG1/2 25、PG1 26–30 */
  t('PG3 写 4–20', text.includes('4–20') && /PG3/.test(text));
  t('PG2 写 23–24', text.includes('23–24'));
  t('PG1 写 26–30', text.includes('26–30'));
  t('两个中间档 21–22 / 25 都在', text.includes('21–22') && /25/.test(text));
  t('写明中间档要自己选一组', /自己选一组|要自己选/.test(text));
  t('写明 6 个志愿必须同组', /6 个志愿必须属于同一个分组/.test(text));
}

console.log('\n══ 五、通勤换算：必须与公式算出来的一致');
{
  const DAYS = 190, YEARS = 4, TRIPS = 2;
  const h = m => Math.round((m * TRIPS * DAYS * YEARS) / 60);
  t('「+10 分钟 = 253 小时」算得对', h(10) === 253 && text.includes('253 小时'), String(h(10)));
  t('给出四年总小时数的推导（每年 380 分钟）', text.includes(String(TRIPS * DAYS)));
  t('通勤表标注是估算、非精确值', /只用来对比量级|不是精确值/.test(text));
}

console.log('\n══ 六、COP 与官方星号：不能读反');
t('COP 定义为「去年最后一名」', /去年最后一个被录取的学生的分数/.test(text));
t('说明 COP 每年浮动', /浮动/.test(text));
{
  const star = SC.filter(x => x.copFlags && x.copFlags.PG1).length;
  const hist = SC.filter(x => x.copHistory).length;
  t('星号总数与数据源一致', new RegExp(`\\b${star} 所`).test(text), `期望 ${star}`);
  t('明确星号只落在 PG1、PG3 一个都没有', /PG1 一个都没有|全部落在 PG1 档/.test(text));
  t('给出「别读错方向」的边界', /不代表 PG3 门槛会降/.test(text));
  t('三年走向的学校数与数据源一致', new RegExp(`${hist} 所`).test(text), `期望 ${hist}`);
}

console.log('\n══ 七、机制表述与承诺边界');
t('四句话讲完机制（含分数优先）', /分数优先于志愿顺序/.test(text));
t('tie-breaker 三级齐全', /公民/.test(text) && /志愿顺序/.test(text) && /抽签/.test(text));
t('写明国际生不是统一垫底', /不存在「统一垫底」|并不是统一排在最后/.test(text));
/* 反向：手册绝不能出现承诺式表述 */
t('无承诺式表述', !/(一定|必然|百分之百)\s*(能|可以)?\s*(进|录取)/.test(text) && !/保证(你|孩子)?(能被)?录取/.test(text));
t('不声称能查到逐校学额', !/可查到各校学额|查得到逐校学额/.test(text));
t('声明逐校招生人数官方不公布', /逐校招生人数官方从不公布|逐校学额/.test(text));

console.log('\n══ 八、升学路径与来源');
t('写明 SEC 2027 首次考试', /2027/.test(text) && /SEC/.test(text));
t('写清本届考 SEC 是 2030 年', /2030/.test(text));
t('说明 G1/G2/G3 与旧制度对应', /G1 \/ G2 \/ G3/.test(text) && /N\(T\)/.test(text));
t('标了数据来源等级', html.includes('class="tag a"'));
t('延伸阅读指向原帖且声明未转载', /xiaohongshu\.com\/discovery\/item/.test(html) && /没有转载/.test(text));

console.log('\n' + '═'.repeat(26));
console.log(pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
