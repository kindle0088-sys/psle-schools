#!/usr/bin/env node
/**
 * 开放日页验证器
 * 用法: node scripts/verify-openhouse.cjs [docs/openhouse.html]
 *
 * 这一页最容易出的错不是排版，而是三件事：
 *   ① 状态写死在构建时（第二天就把「还有 3 天」说成「还有 2 天」）—— 读者会白跑一趟；
 *   ② 学校漏掉（13 所说成 13 所，实际只渲染了 12）；
 *   ③ 把「官方没公布」写成具体活动 —— 编造比缺失有害得多。
 * 所以断言围绕这三点。状态已改为浏览器端现算：验证器守「静态 HTML 不写死相对天数」
 * +「脚本按 SGT 重算」；脚本生效后的实际文字另用 Chrome headless 探针核对。
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const file = path.resolve(process.argv[2] || path.join(BASE, 'docs/openhouse.html'));
const html = fs.readFileSync(file, 'utf8');
const OH = JSON.parse(fs.readFileSync(path.join(BASE, 'data/school-openhouses.json'), 'utf8'));
const SC = JSON.parse(fs.readFileSync(path.join(BASE, 'docs/data/schools.json'), 'utf8')).schools;
const bySlug = new Map(SC.map(s => [s.slug, s]));

const text = html.replace(/<[^>]*>/g, '')
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => {
  if (ok) { pass++; console.log('  ✅ ' + name + (detail ? ' — ' + detail : '')); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
};

const slugs = Object.keys(OH.schools);
const events = [];
for (const [slug, v] of Object.entries(OH.schools)) for (const ev of v.events || []) events.push({ slug, ev });

console.log('\n══ 一、结构与残留');
t('无未替换变量', !/\$\{|undefined|NaN/.test(html));
t('有生成器标记', /name="generator" content="psle-openhouse\//.test(html));
t('6 个章节锚点齐全', (html.match(/id="s[1-6]"/g) || []).length === 6);
t('目录 6 项与章节对得上', (html.match(/href="#s[1-6]"/g) || []).length === 6);
t('有返回看板链接', html.includes('href="index.html"'));

console.log('\n══ 二、13 所学校一所都不能漏');
t('数据里有 13 所学校', slugs.length === 13, `${slugs.length} 所`);
t('每所都能在 schools.json 找到', slugs.every(s => bySlug.has(s)),
  slugs.filter(s => !bySlug.has(s)).join(',') || '全部匹配');
{
  const short = n => String(n).replace(/ Secondary School| \(Secondary\)/, '');
  /* ⚠️ 不能全页 includes：学校名在第 01 节的总览表里也出现，
     删掉整张卡片仍然「找得到」，断言会假通过（负向测试实测）。
     只在第 02 节里按卡片标题找。 */
  const from = html.indexOf('<h2 id="s2"');
  const to = html.indexOf('<h2 id="s3"', from);
  const seg = from >= 0 && to > from ? html.slice(from, to) : '';
  const missing = slugs.filter(s => !seg.includes(`<div class="sname">${short(bySlug.get(s).name)}</div>`));
  t('第 02 节里 13 所学校各有卡片', missing.length === 0, missing.map(s => short(bySlug.get(s).name)).join(',') || '13 所齐全');
}
/* 2026-11-21：深度报告扩到 54 所，开放日只覆盖其中一部分。
   这里应断言「开放日学校都有深度报告」（子集关系），不再是两批完全相同。 */
{
  const reportSlugs = Object.keys(JSON.parse(fs.readFileSync(path.join(BASE, 'docs/data/school-reports.json'), 'utf8')).reports);
  const noReport = slugs.filter(s => !reportSlugs.includes(s));
  t('开放日学校都有深度报告（子集关系）', noReport.length === 0 && reportSlugs.length >= slugs.length,
    `开放日 ${slugs.length} 所 / 深度报告 ${reportSlugs.length} 所${noReport.length ? '，缺: ' + noReport.join(',') : ''}`);
}

console.log('\n══ 三、日期与状态：构建时不写死，浏览器端现算');
{
  /* ⚠️ 不能用标题文字定位：目录里也有「一眼看完」「逐校详情」，
     indexOf 会锚到目录上，切出来的段落是空的（本次踩过，报「0 行」）。
     用章节 id 切片才稳。 */
  const from = html.indexOf('<h2 id="s1"');
  const to = html.indexOf('<h2 id="s2"', from);
  const seg = from >= 0 && to > from ? html.slice(from, to) : '';
  const trs = [...seg.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map(m => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map(x => x[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()))
    .filter(c => c.length >= 7);
  t('总览表场次数与数据一致', trs.length === events.length, `${trs.length} / 期望 ${events.length}`);
  t('总览表每行 7 格（学校 / COP / 日期 / 时间 / 形式 / 报名 / 状态）',
    trs.every(c => c.length === 7), [...new Set(trs.map(c => c.length))].join(','));

  /* 2026-11-25 实测：页面 11-24 构建后，4 场「还有 N 天」第二天就错了。
     修法是把状态移到浏览器端现算。验证器不再比对构建时的那串数字，
     改为守「静态 HTML 里不许有相对状态」+「脚本确实按 SGT 重算」。 */
  const allStatus = [...html.matchAll(/<span class="st" data-evdate="([^"]+)">([^<]*)<\/span>/g)];
  const dates = new Set(events.map(e => e.ev.date));
  const badDate = allStatus.filter(m => !dates.has(m[1]));
  const covered = [...dates].filter(d => allStatus.some(m => m[1] === d));
  t('状态标签只带事件日期', allStatus.length > 0 && badDate.length === 0,
    `${allStatus.length} 个标签${badDate.length ? '，异常: ' + badDate.slice(0, 3).map(m => m[1]).join(',') : ''}`);
  t('每场活动都有状态标签', covered.length === dates.size, `${covered.length}/${dates.size} 个日期被覆盖`);
  const staticHtml = html.replace(/<script>[\s\S]*?<\/script>/g, '');
  t('构建时没有写死相对天数', !/还有 [0-9]+ 天|就是今天<\/span>|已结束<\/span>/.test(staticHtml),
    '静态 HTML 中无相对状态文字');
  t('实时计算脚本齐全（SGT 偏移 + 逐标签重算）',
    /Date\.now\(\)\+8\*3600\*1000/.test(html) && /data-evdate/.test(html) &&
    /就是今天/.test(html) && /还有 /.test(html) && /已结束/.test(html));
  t('动态计数与今天占位齐全',
    ['ohToday', 'ohUpcoming', 'ohPast'].every(id => html.includes('id="' + id + '"')));
  t('方案表按学校分组，由脚本挑未结束场次',
    (html.match(/data-plan-school="/g) || []).length >= 5 &&
    /querySelectorAll\('#oh-plan tbody tr\[data-plan-school\]'\)/.test(html));
  t('页面明确写「打开当天实时计算」', /打开当天实时计算|打开页面的当天/.test(staticHtml));
}

console.log('\n══ 三之二、2025 PG3 区间必须与 schools.json 一致');
{
  const from = html.indexOf('<h2 id="s1"');
  const to = html.indexOf('<h2 id="s2"', from);
  const seg = from >= 0 && to > from ? html.slice(from, to) : '';
  /* ⚠️ 不能只查整段：表下的脚注里也写着「2025 PG3 非附属」，
     把表头改成 2024 仍然会通过（负向测试实测）。只在表头里查。 */
  const thead = (seg.match(/<thead>([\s\S]*?)<\/thead>/) || [])[1] || '';
  t('表头标明年度与口径', /2025 PG3/.test(thead) && /非附属/.test(thead),
    thead.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60));

  const trs = [...seg.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map(m => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map(x => x[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()))
    .filter(c => c.length === 7);

  /* 独立重算：直接从 schools.json 取 PG3 的 nonAff 区间，与页面逐行比对 */
  const want = new Map();
  for (const s2 of SC) {
    const g = ((s2.cop && s2.cop.rows) || []).find(r => r.label === 'Posting Group 3');
    if (g && g.nonAff) want.set(s2.slug, `${g.nonAff.min}–${g.nonAff.max}`);
  }
  const bad = [];
  for (const e of events) {
    const short = String(bySlug.get(e.slug).name).replace(/ Secondary School| \(Secondary\)/, '');
    const row = trs.find(c => c[0].includes(short) && c[2].includes(`${+e.ev.date.slice(5, 7)} 月`));
    if (!row) { bad.push(`${short} 行未找到`); continue; }
    const exp = want.get(e.slug);
    if (row[1] !== exp) bad.push(`${short}: ${row[1]} ≠ ${exp}`);
  }
  t('每行的 PG3 与数据源逐字一致', bad.length === 0, bad.slice(0, 4).join(' ｜ ') || `${trs.length} 行全对`);

  t('COP 不是门槛的说法写清了', /不是门槛|不是「门槛」/.test(text));
  /* Montfort 有附属区间：必须表态「本表用非附属」，否则家长会拿错数 */
  const mf = SC.find(x => x.slug === 'montfort-secondary-school');
  const g = ((mf.cop.rows) || []).find(r => r.label === 'Posting Group 3');
  if (g && g.aff) {
    t('Montfort 的附属区间被单独说明', /Montfort[\s\S]{0,80}附属|另设[\s\S]{0,20}附属/.test(text), `${g.aff.min}–${g.aff.max}`);
  }
}

console.log('\n══ 四、时间与报名格式');
{
  const badTime = events.filter(e => e.ev.start && !/^\d{2}:\d{2}$/.test(e.ev.start));
  t('开始时间都是 HH:MM', badTime.length === 0, badTime.map(e => e.ev.start).join(',') || '全部合法');
  const badOrder = events.filter(e => e.ev.start && e.ev.end && e.ev.end <= e.ev.start);
  t('结束时间晚于开始时间', badOrder.length === 0, badOrder.map(e => e.slug).join(',') || '全部合法');
  const badDate = events.filter(e => !/^2026-1[12]-\d{2}$/.test(e.ev.date));
  t('日期都在 2026 年 11–12 月', badDate.length === 0, badDate.map(e => e.ev.date).join(',') || '全部合法');
  const badMode = events.filter(e => !['physical', 'virtual', 'hybrid'].includes(e.ev.mode));
  t('形式只有实体/线上/混合三种', badMode.length === 0, badMode.map(e => e.ev.mode).join(',') || '全部合法');
  const needReg = events.filter(e => e.ev.registration === 'required');
  t('需报名的场次都给了报名链接或说明', needReg.every(e => e.ev.regUrl || /报名|预约/.test(e.ev.note || '')),
    needReg.map(e => e.slug.replace('-secondary-school', '')).join(',') || '无');
}

console.log('\n══ 五、不编造：没公布就必须写「未公布」');
{
  const noActs = events.filter(e => !(e.ev.activities || []).length);
  const disclosed = events.filter(e => (e.ev.activities || []).length);
  t('有活动细节的场次真的列了条目', disclosed.length > 0 && disclosed.every(e =>
    e.ev.activities.some(a => text.includes(a))), `${disclosed.length} 场`);
  /* 「官方未公布」由卡片页脚统一说明，措辞可能是「具体活动」或「分场次安排」，两种都认 */
  t('没有活动细节的场次明确写「未公布」',
    noActs.length === 0 || /官方未公布/.test(text), `${noActs.length} 场无细节`);
  /* 反向：页面不得出现「保证」「一定」这类对读者的承诺 */
  t('无承诺式表述', !/(一定|必然|百分之百)\s*(能|可以)?\s*(进|录取)/.test(text));
  t('声明开放日不是录取环节', /不是录取环节/.test(text));
  t('说明时间可能临时调整', /时间可能临时调整|以学校官网或电话确认/.test(text));
}

console.log('\n══ 六、矛盾与缺口必须被点名');
{
  t('点名 Bendemeer 的结束时间冲突', /Bendemeer[\s\S]{0,120}(13:00|14:00)/.test(html) && /不一致/.test(text));
  t('点名 Outram 的 30 分钟差异', /Outram[\s\S]{0,160}(14:30|14:00)/.test(html));
  t('点名 Punggol 时间未公布', /Punggol[\s\S]{0,120}(未公布|TBC)/.test(html));
  const eOnly = Object.entries(OH.schools).filter(([, v]) => v.status === 'e-only').map(([k]) => k);
  t('只有线上开放日的学校单独说明', eOnly.length === 0 || /e-Open House/.test(text), eOnly.join(','));
  t('写明「官方未公布 ≠ 没安排」', /不等于没有安排|不等于没安排|官方未公布具体活动/.test(text));
}

{
  /* 第 04 节表头是「志愿校 / 日期 / 时间 / 状态」，曾把已结束的行压成两格，
     结果「已结束」跑到日期列下面，读者以为这所学校没有日期。 */
  const from = html.indexOf('<h2 id="s4"');
  const to = html.indexOf('<h2 id="s5"', from);
  const seg = from >= 0 && to > from ? html.slice(from, to) : '';
  const counts = [...seg.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map(m => (m[1].match(/<td[^>]*>/g) || []).length).filter(n => n > 0);
  t('方案对照表每行 4 格，与表头一致', counts.length >= 5 && counts.every(n => n === 4), counts.join(','));
}

console.log('\n══ 七、联系方式取自 schools.json（不重复维护）');
{
  const bad = slugs.filter(s => {
    const phone = bySlug.get(s).contact?.phone;
    return phone && !html.includes(phone);
  });
  t('13 所电话都出现在页面上', bad.length === 0, bad.map(s => s.replace('-secondary-school', '')).join(',') || '13 所齐全');
  const addrBad = slugs.filter(s => {
    const a = bySlug.get(s).address;
    return a && !html.includes(a.split(',')[0]);
  });
  t('地址与数据源一致', addrBad.length === 0, addrBad.map(s => s.replace('-secondary-school', '')).join(',') || '13 所齐全');
}

console.log('\n══ 八、导航入口');
{
  for (const p of ['index.html', 'map.html', 'guide.html', 'cohort.html', 'plans.html']) {
    const f = path.join(BASE, 'docs', p);
    if (!fs.existsSync(f)) continue;
    t(`${p} 指向开放日页`, fs.readFileSync(f, 'utf8').includes('openhouse.html'));
  }
}

console.log('\n' + '═'.repeat(26));
console.log(pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
