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
t('9 个章节锚点齐全', (html.match(/id="s[1-9]"/g) || []).length === 9);
{
  /* 目录项与章节锚点必须双向对得上：只查「标题文字存在」的话，
     漏一个目录项、或者目录指向不存在的锚点，都发现不了。 */
  const tocHrefs = [...html.matchAll(/href="#(s\d+)"/g)].map(m => m[1]);
  const ids = [...html.matchAll(/id="(s\d+)"/g)].map(m => m[1]);
  t('目录项数与章节数一致', tocHrefs.length === ids.length && ids.length === 9,
    `${tocHrefs.length} 目录 / ${ids.length} 章节`);
  t('每个目录锚点都真实存在', tocHrefs.every(h => ids.includes(h)), tocHrefs.join(','));
  t('每个章节都进了目录', ids.every(i => tocHrefs.includes(i)));
}
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
  t('写明「暂定」性质（仅 S1 派位结果）', /暂定/.test(text) && /tentative/.test(text));
  /* 2026-11-24 修：旧版出分行也硬贴「暂定」，官方放榜后就成了错误标签。
     标签必须跟随数据源，不能用「页面里有没有暂定」这种假阳性断言。 */
  t('出分行定性跟随数据源（已公布 ≠ 暂定）',
    /暂定|tentative/.test(TL.psleResults)
      ? /暂定/.test(text)
      : text.includes('官方已公布') && !/2026-11-24（官方[^。；\n]{0,40}暂定/.test(text));
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

console.log('\n══ 九、AL 与百分比换算：数字必须能从官方档位重算出来');
/* 这一段刻意不复用生成器里的算法 —— 验证器自己再枚举一遍四科组合。
   如果两边写的是同一段代码，那只能证明「代码没变」，证明不了「数字对」。 */
const OFFICIAL = [[90, 100], [85, 89], [80, 84], [75, 79], [65, 74], [45, 64], [20, 44], [0, 19]];
const ALB = JSON.parse(fs.readFileSync(path.join(BASE, 'data/al-bands.json'), 'utf8'));

t('数据源 8 个 AL 档位与官方区间逐一相等',
  ALB.standard.bands.length === 8 && ALB.standard.bands.every((b, i) =>
    b.al === i + 1 && b.min === OFFICIAL[i][0] && b.max === OFFICIAL[i][1]),
  ALB.standard.bands.map(b => `AL${b.al}:${b.min}-${b.max}`).join(' '));

t('档位首尾相接、不重叠不留缝',
  ALB.standard.bands.every((b, i) => i === 0 || b.max === ALB.standard.bands[i - 1].min - 1),
  'AL1 90 起、AL8 19 止');

{
  /* ⚠️ 不能全页 includes('45–64')：这个字符串在「总分表」的第 24 行也出现，
     改坏 AL 表那一处仍会被另一处兜住（负向测试实测漏报）。
     所以先把单科表切出来，逐行比对区间与档宽。 */
  const from = html.indexOf('单科：每个 AL 对应的原始分百分比');
  const to = html.indexOf('四科总分：能反推出多少百分比', from);
  const seg = from >= 0 && to > from ? html.slice(from, to) : '';
  const rows = [...seg.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map(m => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map(x => x[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()))
    .filter(r => r.length >= 3 && /^AL \d$/.test(r[0]));

  const want = OFFICIAL.map(([mn, mx], i) => {
    const label = i === 0 ? `≥ ${mn}` : i === 7 ? `&lt; 20` : `${mn}–${mx}`;
    const w = (i === 0 || i === 7) ? '—' : String(mx - mn + 1);
    return { al: `AL ${i + 1}`, label, w };
  });
  t('单科表 8 行且 AL 顺序正确',
    rows.length === 8 && rows.every((r, i) => r[0] === want[i].al), rows.map(r => r[0]).join(','));
  const badLabel = rows.filter((r, i) => want[i] && r[1] !== want[i].label);
  t('每行区间与官方定义逐字一致', badLabel.length === 0,
    badLabel.map(r => `${r[0]}≠${r[1]}`).join(' ') || '8 行全对');
  const badWidth = rows.map((r, i) => ({ r, i })).filter(({ r, i }) => want[i] && r[2] !== want[i].w);
  t('每行档宽与区间长度一致', badWidth.length === 0,
    badWidth.map(({ r, i }) => `${r[0]}:${r[2]}≠${want[i].w}`).join(' ') || '8 行全对');
  t('开区间两端写成「≥ 90」「< 20」',
    seg.includes('≥ 90') && seg.includes('&lt; 20'));
}

{
  /* 自己重算总分表 */
  const agg = new Map();
  for (let a = 1; a <= 8; a++) for (let b = a; b <= 8; b++)
  for (let c = b; c <= 8; c++) for (let d = c; d <= 8; d++) {
    const s = a + b + c + d;
    const lo = [a, b, c, d].reduce((t2, k) => t2 + OFFICIAL[k - 1][0], 0);
    const hi = [a, b, c, d].reduce((t2, k) => t2 + OFFICIAL[k - 1][1], 0);
    const cur = agg.get(s) || { lo: Infinity, hi: -Infinity };
    agg.set(s, { lo: Math.min(cur.lo, lo), hi: Math.max(cur.hi, hi) });
  }

  /* 从页面里把总分表抠出来逐行比对 */
  const from = html.indexOf('四科总分：能反推出多少百分比');
  const to = html.indexOf('三条必须记住', from);
  const seg = from >= 0 && to > from ? html.slice(from, to) : '';
  const rows = [...seg.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map(m => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map(x => x[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()))
    .filter(c => c.length >= 4);

  t('总分表覆盖 4–32 共 29 行', rows.length === 29, `${rows.length} 行`);
  t('总分列连续 4→32',
    rows.every((r, i) => +r[0] === 4 + i), rows.map(r => r[0]).join(','));

  const badAvg = rows.filter(r => Math.abs(+r[1] - (+r[0] / 4)) > 0.006);
  t('平均 AL = 总分 ÷ 4', badAvg.length === 0, badAvg.map(r => r[0]).join(',') || '全部一致');

  const badRange = rows.filter(r => {
    const hit = r[3].match(/([\d.]+)\s*[–-]\s*([\d.]+)/);
    if (!hit) return true;
    const w = agg.get(+r[0]);
    return Math.abs(+hit[1] - w.lo / 4) > 0.06 || Math.abs(+hit[2] - w.hi / 4) > 0.06;
  });
  t('每行百分比区间与独立重算一致', badRange.length === 0, badRange.map(r => r[0] + ':' + r[3]).join(' ') || '29 行全对');

  /* 四科同档的行必须直接等于官方档位，这是最容易被手改坏的地方 */
  const even = [[4, '90–100'], [8, '85–89'], [12, '80–84'], [16, '75–79'], [20, '65–74'], [24, '45–64'], [28, '20–44'], [32, '0–19']];
  const badEven = even.filter(([s2, want]) => {
    const r = rows.find(x => +x[0] === s2);
    return !r || r[2] !== want;
  });
  t('四科同档的行等于官方档位（4/8/…/32）', badEven.length === 0,
    badEven.map(([s2, w]) => `${s2}≠${w}`).join(' ') || '8 行全对');
}

t('说明总分不能换算成百分比平均', /总分不是百分比平均|不能换算成一个百分比平均/.test(text));
t('举出同分的两种极端组合', /同样 18 分/.test(text) && /31\.5/.test(text));
t('基础科折算 A→6 / B→7 / C→8',
  ALB.foundation.bands.map(b => b.al + b.equiv).join('') === 'A6B7C8');
t('写明有一科基础科时总分最好只能是 9', /总分最好也只能是 9/.test(text));
t('高华写明不计入总分', /不计入 4–32 总分/.test(text) || /不进总分/.test(text));
t('高华 4 个等级齐全', ['Distinction', 'Merit', 'Pass', 'Ungraded'].every(x => text.includes(x)));
t('写明原始分是查不到的（避免误用）', /从不公布考生原始分/.test(text) && /查不到/.test(text));
{
  /* 文本节点里不能出现裸 `<`（AL8 的「< 20」最容易漏转义） */
  const body = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  t('没有裸露的 < 字符', !/< \d/.test(body.replace(/&lt;/g, '§')));
}

console.log('\n' + '═'.repeat(26));
console.log(pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
