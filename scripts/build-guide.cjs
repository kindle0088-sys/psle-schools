#!/usr/bin/env node
/**
 * 家长学习手册（docs/guide.html）
 *
 * 定位：不针对某个孩子，讲清「出分后到提交志愿」这段时间里，家长需要知道的机制与取舍。
 * 与其它页面的分工：
 *   · 看板 / 地图 / 深度报告 = 查具体学校
 *   · 志愿方案报告 = 针对某个分数排出 6 个位置
 *   · 本页 = 在没定学校之前，先把规则、概念、成本搞明白
 *
 * 数据来源：
 *   data/secondary-costs.json  学费、杂费、升学路径、分配机制
 *   data/psle-cohort.json      timeline2026（出分 / 填报 / 放榜）
 *   docs/data/schools.json     COP、三年走向、官方星号
 *   data/_recommend-*.json     通勤分布示例（按学生地址，非通用）
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const P = (...a) => path.join(BASE, ...a);
const CSS = fs.readFileSync(P('scripts/tpl/tokens.css'), 'utf8') + fs.readFileSync(P('scripts/tpl/plan.css'), 'utf8');

const CO = JSON.parse(fs.readFileSync(P('data/secondary-costs.json'), 'utf8'));
const COHORT = JSON.parse(fs.readFileSync(P('data/psle-cohort.json'), 'utf8'));
const SC = JSON.parse(fs.readFileSync(P('docs/data/schools.json'), 'utf8')).schools;
const TL = COHORT.timeline2026;
const ALB = JSON.parse(fs.readFileSync(P('data/al-bands.json'), 'utf8'));

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = v => (v == null ? '—' : v.toLocaleString('en-US'));
const money = v => (v == null ? '未公布' : 'S$' + n(v));
/** 把 "2026-11-24 或 11-25（暂定…）" 压成 "11 月 24 / 25 日"，避免 hero 格子折行 */
const shortDate = s => {
  const t = String(s).split('（')[0];
  const m = t.match(/(\d{4})-(\d{2})-(\d{2})\s*或\s*(?:\d{4}-)?(\d{2})-(\d{2})/);
  if (m) return `${+m[2]} 月 ${+m[3]} / ${+m[5]} 日`;
  const one = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  return one ? `${+one[2]} 月 ${+one[3]} 日` : t;
};

/* ── 通勤账：通用公式 + 一个按地址计算的示例 ────────────────── */
const DAYS = 190;   // 每年上学日（约数）
const YEARS = 4;    // 中学 4 年（SEC 路线）
const TRIPS = 2;    // 每天往返
/** 单程多 m 分钟，四年累计多少小时 */
const commuteHours = m => Math.round((m * TRIPS * DAYS * YEARS) / 60);

let poolStats = null;
try {
  const R = JSON.parse(fs.readFileSync(P('data/_recommend-abc2.json'), 'utf8'));
  const mins = R.pool.map(x => x.minutes).filter(v => v != null).sort((a, b) => a - b);
  if (mins.length >= 5) {
    const lo = mins[0], hi = mins[mins.length - 1];
    poolStats = {
      count: mins.length, lo, hi, spread: hi - lo,
      hours: commuteHours(hi - lo),
      days: Math.round(commuteHours(hi - lo) / 8),
      buckets: [
        { label: '≤15 分钟', n: mins.filter(m => m <= 15).length },
        { label: '16–25 分钟', n: mins.filter(m => m > 15 && m <= 25).length },
        { label: '26–35 分钟', n: mins.filter(m => m > 25 && m <= 35).length },
        { label: '>35 分钟', n: mins.filter(m => m > 35).length },
      ],
      postal: R.student.postal,
    };
  }
} catch { /* 没有候选池数据时，示例段落自动省略 */ }

/* ── 从数据里挑两个三年走向的例子（不写死） ─────────────── */
const trendOf = slug => {
  const s = SC.find(x => x.slug === slug);
  if (!s || !s.copHistory) return null;
  const now = (s.cop.rows || []).find(r => r.label === 'Posting Group 3');
  const y = ['2023', '2024', '2025'].map(k => {
    if (k === '2025') return now && now.nonAff ? `${now.nonAff.min}–${now.nonAff.max}` : '?';
    const v = s.copHistory[k];
    return v && v.status === 'ok' && v.pg3 ? `${v.pg3.min}–${v.pg3.max}` : '?';
  });
  const first = s.copHistory['2023'] && s.copHistory['2023'].status === 'ok' ? s.copHistory['2023'].pg3 : null;
  const last = now && now.nonAff ? now.nonAff : null;
  return { name: s.name.replace(/ Secondary School| \(Secondary\)/, ''), y, dMax: first && last ? last.max - first.max : null };
};
const TREND_A = trendOf('serangoon-secondary-school');
const TREND_B = trendOf('greendale-secondary-school');
const STAR_N = SC.filter(x => x.copFlags && x.copFlags.PG1).length;
const HAS_HIST = SC.filter(x => x.copHistory).length;

/* ── 学费表 ───────────────────────────────────────────── */
const feeRows = CO.secondary.rows.map(r => `
  <tr>
    <td><b>${esc(r.zh)}</b>${r.zh === '公民' ? '' : `<br><span class="soft" style="font-size:11.5px">${esc(r.note)}</span>`}</td>
    <td class="num mid">${money(r.y2023)}</td>
    <td class="num mid">${money(r.y2024)}</td>
    <td class="num mid">${money(r.y2025)}</td>
    <td class="num mid"><b>${money(r.y2026)}</b></td>
  </tr>`).join('');

const miscRows = CO.misc.rows.map(r => `<tr><td>${esc(r.level)}</td><td class="num mid">S$${r.amount}</td></tr>`).join('');

const levelRows = CO.otherLevels2026.rows.map(r => `
  <tr><td>${esc(r.level)}</td>
  <td class="num mid">${r.citizen === 0 ? '免' : money(r.citizen)}</td>
  <td class="num mid">${money(r.pr)}</td>
  <td class="num mid">${money(r.asean)}</td>
  <td class="num mid">${money(r.nonAsean)}</td></tr>`).join('');

const pathRows = CO.pathway.facts.map(f => `<tr><td style="width:38%">${esc(f.k)}</td><td>${esc(f.v)}</td></tr>`).join('');

const pgRows = [
  { k: '4–20', v: 'PG3', note: '对应原 Express 水平' },
  { k: '21–22', v: 'PG2 或 PG3', note: '中间档，自己选一组' },
  { k: '23–24', v: 'PG2', note: '对应原 N(A) 水平' },
  { k: '25', v: 'PG1 或 PG2', note: '中间档，自己选一组' },
  { k: '26–30', v: 'PG1', note: '对应原 N(T) 水平' },
].map(r => `<tr><td class="num mid"><b>${r.k}</b></td><td class="mid"><b>${r.v}</b></td><td class="soft">${r.note}</td></tr>`).join('');

const principleList = CO.posting.principles.map(p => `<li>${esc(p)}</li>`).join('');

const CHECKLIST = [
  '在 S1 Option Form 上核对孩子的<b>姓名、Birth Certificate 号 / FIN、总分、Posting Group</b>',
  '确认 <b>Singpass 能登录</b>（登不上就工作日去小学，别等最后一天）',
  '把 6 所学校按<b>真实偏好</b>排序（不是按 COP 高低排）',
  '6 个志愿<b>全部填满</b>，空着等于主动放弃机会',
  '至少 2–3 所的往年 COP <b>明显宽松于</b>孩子分数（MOE 自己也这么建议）',
  '别把「去年 COP + 0」当稳妥 —— 那叫踩线，不叫稳',
  '同一 Posting Group 的学校才能填在一起（中间档尤其注意）',
  'SAP 校：孩子 PSLE <b>≤14 且高华及格</b>才有优势，15 分及以上用不上',
  '查一遍<b>通勤</b>：按 CCA 结束后的时间走一次，不是按早上走',
  '确认该校<b>有没有孩子想进的 CCA</b>，以及 Sec 1 的社团分配规则',
  '提交后<b>保存确认页</b>（截图或 PDF）',
  '放榜日 12/18 当天再查一次结果，未录取的当天就可以打电话问学校',
].map(t => `<li><label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer;flex:1"><input type="checkbox" style="margin-top:3px;flex:0 0 auto"> <span>${t}</span></label></li>`).join('');


/* ── AL ⇄ 百分比：所有数字都从 data/al-bands.json 派生 ──────────────
   两件事必须守住：
   1) 单科 AL 的定义区间直接读数据，不在模板里再抄一遍数字；
   2) 总分 4–32 的百分比是「算出来的区间」，不是查表常数 ——
      因为同一个总分对应多种 AL 组合，区间宽度正是「总分 ≠ 百分比平均」的证据。 */
const SUBJ = ALB.total.subjects;
const AL_BANDS = ALB.standard.bands;
/** AL 区间显示：开区间要写成「≥ 90」「< 20」，不能写「90–100」误导 */
const alRange = b => (b.openTop ? `≥ ${b.min}` : b.openBottom ? `&lt; ${b.max + 1}` : `${b.min}–${b.max}`);   // 文本节点里的 < 必须转义
/** 带宽：开区间一端没有精确宽度 */
const alWidth = b => (b.openTop || b.openBottom ? '—' : String(b.max - b.min + 1));

/** 枚举四科 AL 的全部组合（无序，减少重复），按总分归并出百分比上下限 */
const TOTAL = (() => {
  const agg = new Map();
  for (let a = 1; a <= 8; a++)
  for (let b = a; b <= 8; b++)
  for (let c = b; c <= 8; c++)
  for (let d = c; d <= 8; d++) {
    const s = a + b + c + d;
    const pick = [a, b, c, d].map(k => AL_BANDS[k - 1]);
    const lo = pick.reduce((t, x) => t + x.min, 0);
    const hi = pick.reduce((t, x) => t + x.max, 0);
    const cur = agg.get(s) || { lo: Infinity, hi: -Infinity, loCombo: null, hiCombo: null };
    if (lo < cur.lo) { cur.lo = lo; cur.loCombo = [a, b, c, d]; }
    if (hi > cur.hi) { cur.hi = hi; cur.hiCombo = [a, b, c, d]; }
    agg.set(s, cur);
  }
  /* 「四科接近」= AL 尽量平均的那组组合（如 15 → 3/4/4/4），与上面的极端值分开给，
     因为家长真正想知道的通常是「各科差不多时大概多少分」。 */
  const balanced = s => {
    const base = Math.floor(s / SUBJ), rem = s % SUBJ;
    return Array.from({ length: SUBJ }, (_, i) => base + (i < rem ? 1 : 0));
  };
  const rows = [];
  for (let s = ALB.total.min; s <= ALB.total.max; s++) {
    const a = agg.get(s);
    if (!a) continue;
    const bal = balanced(s).map(k => AL_BANDS[k - 1]);
    const balLo = bal.reduce((t, x) => t + x.min, 0);
    const balHi = bal.reduce((t, x) => t + x.max, 0);
    const even = s % SUBJ === 0;
    rows.push({
      score: s,
      avgAl: +(s / SUBJ).toFixed(2),
      balLo: balLo / SUBJ,
      balHi: balHi / SUBJ,
      // 整除时四科同档，直接给官方档位区间；否则给均衡组合的中点
      balText: even ? `${balLo / SUBJ}–${balHi / SUBJ}` : `≈ ${((balLo + balHi) / SUBJ / 2).toFixed(1)}`,
      lo: a.lo / SUBJ,
      hi: a.hi / SUBJ,
      span: (a.hi - a.lo) / SUBJ,
      even,
      loCombo: a.loCombo.join('/'),
      hiCombo: a.hiCombo.join('/'),
    });
  }
  return rows;
})();

const alBandRows = AL_BANDS.map(b => `<tr>
  <td class="num mid"><b>AL ${b.al}</b></td>
  <td class="num mid">${alRange(b)}</td>
  <td class="num mid soft">${alWidth(b)}</td>
  <td class="soft" style="font-size:12.8px">${esc(b.meaning)}</td>
</tr>`).join('\n');

const alTotalRows = TOTAL.map(r => `<tr${r.even ? ' style="background:rgba(255,255,255,.022)"' : ''}>
  <td class="num mid"><b>${r.score}</b></td>
  <td class="num mid soft">${r.avgAl.toFixed(2)}</td>
  <td class="num mid">${r.balText}</td>
  <td class="num mid"><span class="soft">${r.lo.toFixed(1)}</span> – ${r.hi.toFixed(1)} <span class="soft" style="font-size:11px">（${r.span.toFixed(1)}）</span></td>
</tr>`).join('\n');

/* 正文举例用：18 分是跨度最大的一档之一，正好说明「同分不同科」。
   只取实际用到的那一档 —— 多留一个没人读的变量，迟早变成第二个「假配置」。 */
const T18 = TOTAL.find(r => r.score === 18);

const alFoundRows = ALB.foundation.bands.map(b => `<tr>
  <td class="num mid"><b>AL ${esc(b.al)}</b></td>
  <td class="num mid">${b.min}–${b.max}</td>
  <td class="num mid"><b>AL ${b.equiv}</b></td>
  <td class="soft" style="font-size:12.8px">${b.equiv === 6 ? '基础科最高档，但已相当于标准科的 AL6' : b.equiv === 7 ? '相当于标准科 AL7' : '相当于标准科 AL8'}</td>
</tr>`).join('\n');

const alHmtlRows = ALB.hmtl.grades.map(g => `<tr>
  <td><b>${esc(g.grade)}</b></td>
  <td class="num mid">${g.min}–${g.max}</td>
  <td class="soft" style="font-size:12.8px">${g.short === 'D' ? '同分争 SAP 校最后一个位时排最前' : g.short === 'M' ? '排在 D 之后、P 之前' : g.short === 'P' ? '有优先权，但排在 D / M 之后' : '不享有优先权'}</td>
</tr>`).join('\n');

/** 有基础科时的最好可能总分：基础科最高折 AL6，其余三科 AL1 */
const FOUND_BEST = ALB.foundation.bands[0].equiv + (SUBJ - 1);

const toc = [
  ['s1', '这 7 天里发生什么'],
  ['s2', '30 秒看懂分数与分组'],
  ['s3', 'AL 与百分比换算'],
  ['s4', '电脑到底怎么分学校'],
  ['s5', '通勤这笔账'],
  ['s6', 'COP 怎么看'],
  ['s7', '学费与升学路径'],
  ['s8', '提交前 12 项清单'],
  ['s9', '延伸阅读与数据来源'],
];

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="generator" content="psle-guide/v1">
<title>家长学习手册 · PSLE 出分后怎么填中学志愿</title>
<style>
${CSS}
.hb-hero{padding:34px 0 26px}
.hb-hero h1{font-size:27px;line-height:1.4;margin:8px 0 0}
.hb-hero .sub{margin-top:12px;max-width:720px}
/* 目录项在窄屏会挤成一段：卡片底色由 plan.css 给，这里只补布局 */
.toc{display:flex;flex-wrap:wrap;gap:6px 15px;align-items:baseline}
.toc b{margin-right:2px}
.step{display:flex;gap:12px;padding:11px 0;border-bottom:1px dashed var(--line)}
.step:last-child{border-bottom:0}
.step .no{flex:0 0 26px;height:26px;border-radius:50%;background:var(--accent-bg);color:var(--accent);font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center}
.step .t{flex:1}
.step .t b{display:block;margin-bottom:2px}
ol.chk{list-style:none;padding:0;margin:0;counter-reset:c}
/* li 本身做 flex：否则 ::before 的编号会独占一行，复选框被挤到下一行 */
ol.chk li{counter-increment:c;display:flex;gap:9px;align-items:flex-start;padding:8px 0;
  border-bottom:1px dashed var(--line);font-size:13.4px;line-height:1.65}
ol.chk li:last-child{border-bottom:0}
ol.chk li::before{content:counter(c);flex:0 0 16px;text-align:right;color:var(--tx3);
  font-family:var(--mono);font-size:11.5px;line-height:1.9}
.hb-foot{margin-top:34px;padding-top:18px;border-top:1px solid var(--line);font-size:12.4px;color:var(--tx3);line-height:1.9}
.ext{border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:12px 0}
.ext .ttl{font-weight:650;font-size:14px}
.ext .meta{font-size:11.5px;color:var(--tx3);margin-top:3px}
</style>
</head>
<body>

<div class="hero hb-hero">
  <div class="wrap">
    <a class="backlink" href="index.html">← 返回学校看板</a>
    <div class="eyebrow">PSLE · 家长学习手册</div>
    <h1>出分之后，怎么把这 6 个位置填好<small>不讲择校玄学，只讲机制、成本和一个能自己算的取舍</small></h1>
    <div class="sub">
      这份手册写给<b>第一次经历 S1 Posting 的家长</b>。它不推荐具体学校——那是看板和志愿报告的事。
      它解决的是更前面的问题：<b>规则到底怎么运作、哪些数字能信、哪些说法是误传。</b>
    </div>
    <div class="profile">
      <div><div class="k">出分</div><div class="v">${esc(shortDate(TL.psleResults))}</div></div>
      <div><div class="k">填报窗口</div><div class="v">放榜日起 7 天</div></div>
      <div><div class="k">志愿数</div><div class="v">最多 6 所</div></div>
      <div><div class="k">放榜</div><div class="v">${esc(shortDate(TL.postingResults))}</div></div>
      <div><div class="k">入学</div><div class="v">${esc(TL.enrolment.replace('入学', ''))}</div></div>
    </div>
  </div>
</div>

<div class="wrap">

<div class="toc">
  <b>目录</b>
${toc.map(([id, t], i) => `  <a href="#${id}">${'①②③④⑤⑥⑦⑧⑨'[i]} ${esc(t)}</a>`).join('\n')}
</div>

<div class="note" style="margin-top:20px">
<b>先说三件最容易搞错的事。</b>
① <b>COP 不是门槛</b>，它是去年最后一名被录取者的分数，每年会动 1–3 分；
② <b>第一志愿填最想去的不会吃亏</b>——分数不够时系统直接看下一志愿，不存在「冲高被退档连累后面」；
③ <b>能查到的学额只有全市总量</b>，逐校招生人数官方从不公布，任何声称给出的都是二手估算。
</div>

<section>
<h2 id="s1"><span class="n">01</span>这 7 天里发生什么</h2>
<p class="lead">时间线每年一样，但真正要动手的只有中间那 7 天。下面四个时间点，每个都写清「你要做什么」。</p>

<table>
<thead><tr><th style="width:26%">时间</th><th style="width:26%">发生什么</th><th>你要做什么</th></tr></thead>
<tbody>
<tr>
  <td><b>${esc(TL.psleResults)}</b><br><span class="soft" style="font-size:11.5px">${/暂定|tentative/.test(TL.psleResults) ? '暂定' : '官方已公布'}</span></td>
  <td>放榜，上午 11:00</td>
  <td>拿成绩单 + <b>S1 Option Form</b>（上面有 S1 PIN）。当场核对总分与 Posting Group 有没有印错。</td>
</tr>
<tr>
  <td><b>同一天 11:30 起</b><br><span class="soft" style="font-size:11.5px">共 7 个日历日</span></td>
  <td>填报开放</td>
  <td>用 <b>Singpass</b> 登录 S1 Portal 填最多 6 所。<b>登不上就去小学</b>——小学只有工作日开门，别拖到最后一天才发现。</td>
</tr>
<tr>
  <td><b>最后一日 16:30</b></td>
  <td>截止</td>
  <td>截止前可以反复修改，改完<b>保存确认页</b>。过了这个点，任何理由都改不了。</td>
</tr>
<tr>
  <td><b>${esc(TL.postingResults)}</b><br><span class="soft" style="font-size:11.5px">暂定</span></td>
  <td>分配结果</td>
  <td>通过 S1 Portal / SMS / 小学查询。若 6 个志愿全部落空，<b>当天就可以打电话</b>问心仪学校有没有空位。</td>
</tr>
</tbody>
</table>

<p class="soft" style="font-size:12.6px">「暂定」= 官方原文是 tentative，实际日期要等全部流程完成才公布。<b>别按去年的日期倒推今年。</b></p>
</section>

<section>
<h2 id="s2"><span class="n">02</span>30 秒看懂分数与分组</h2>
<p class="lead">PSLE 每科给一个等级（AL1 最好，AL8 最差），四科相加得总分，范围 4–32。<b>总分决定孩子走哪个 Posting Group</b>，而分组决定你能填哪些学校。</p>

<table>
<thead><tr><th class="mid" style="width:22%">总分</th><th class="mid" style="width:26%">Posting Group</th><th>说明</th></tr></thead>
<tbody>
${pgRows}
</tbody>
</table>

<div class="warnbox">
<b>中间档有两条硬规则，很多人到最后一刻才发现：</b><br>
① 21–22 分和 25 分的孩子<b>要自己选一组</b>，不是系统自动分配；<br>
② <b>6 个志愿必须属于同一个分组</b> —— 选了 PG2 就不能在里面混一所只有 PG3 的学校。
</div>

<div class="note">
<b>分组不是「快慢班」。</b>2024 年起全面实施 Full SBB，中学不再按总分分班，而是<b>同一班里每个科目按难度分 G1 / G2 / G3</b>（分别对应原 N(T) / N(A) / Express 标准）。
分组只是<b>起点</b>：进了中学，哪科强就能往上调。所以「差一分掉一个分组」没有想象中那么致命——但也别赌，起点会影响前两年的科目组合。
</div>
</section>

<section>
<h2 id="s3"><span class="n">03</span>AL 与百分比怎么换算</h2>
<p class="lead">成绩单上只有 AL，没有百分比。但老师、补习班、家长群常说「差不多 85 分」——这一节把两者的对应关系摊开，也说清为什么<b>四科总分不能换算成一个百分比平均</b>。</p>

<h3>单科：每个 AL 对应的原始分百分比</h3>
<p>这是官方定义，不是经验值。AL 只看孩子自己考了多少分，与同届其他考生无关——这也是 AL 取代 T-score 的核心变化。</p>
<table>
<thead><tr><th class="mid" style="width:14%">AL</th><th class="mid" style="width:20%">原始分百分比</th><th class="mid" style="width:12%">档宽</th><th>大致含义</th></tr></thead>
<tbody>
${alBandRows}
</tbody>
</table>
<p class="soft" style="font-size:12.6px">${esc(ALB.standard.unevenReason)}</p>

<div class="note">
<b>这张表最容易忽略的一点：档宽差 4 倍。</b>
AL2–AL4 各只有 <b>5 分</b>宽，而 AL6 有 <b>20 分</b>、AL7 有 <b>25 分</b>。
所以「从 AL6 提到 AL5」要跨过 10 分以上的档界，「从 AL2 提到 AL1」只要跨 1 分——但家长通常按「提高一个等级」来估补习强度，这两件事的工作量根本不是一个量级。
</div>

<h3>四科总分：能反推出多少百分比</h3>
<p>下表 4–32 分全部列出。请重点看最后一列括号里的数字：<b>同一个总分，对应的百分比是一个可宽可窄的区间</b>——
因为 AL 是分档，四科既可「均衡」也可「极端偏科」。</p>
<div style="overflow-x:auto">
<table>
<thead><tr>
  <th class="mid" style="width:12%">总分</th>
  <th class="mid" style="width:16%">平均 AL</th>
  <th class="mid" style="width:24%">四科接近时<br><span class="soft">百分比</span></th>
  <th class="mid">同分可能跨度<br><span class="soft">括号内为区间宽度</span></th>
</tr></thead>
<tbody>
${alTotalRows}
</tbody>
</table>
</div>
<p class="soft" style="font-size:12.4px">带底色的行（4 / 8 / 12 / 16 / 20 / 24 / 28）是四科恰好同档的情况，可以直接对应上表。
「四科接近」按 AL 尽量平均的组合算（如总分 15 → AL 3/4/4/4），偏科越严重就越往区间两端走。</p>

<div class="warnbox">
<b>三条必须记住：</b><br>
① <b>总分不是百分比平均。</b>同样 ${T18.score} 分，可能来自 AL ${esc(T18.loCombo)}，也可能来自 AL ${esc(T18.hiCombo)}；
对应百分比从 <b>${T18.lo.toFixed(1)}</b> 到 <b>${T18.hi.toFixed(1)}</b>，幅宽 <b>${T18.span.toFixed(1)} 个点</b>。
所以「${T18.score} 分相当于百分之多少」这个问题本身没有唯一答案。<br>
② <b>AL 不是线性刻度。</b>总分少 1 分在百分比上值多少，取决于那 1 分是从哪个档跨过去的：从 AL1→AL2 是 11–15 分，从 AL6→AL7 是 20 分以上。<br>
③ <b>百分比是档位的定义区间，不是孩子的实际得分。</b>MOE 从不公布考生原始分，成绩单上只有 AL —— 用这张表估算，只能得到「大概在哪一段」，不是精确分数。
</div>

<h3>两个特殊情况：基础科目与高华</h3>
<div class="grid2">
  <div class="panel">
    <h4>基础科目（Foundation）：最高只折到 AL6</h4>
    <table style="margin:9px 0 0">
    <thead><tr><th class="mid">基础科</th><th class="mid">原始分</th><th class="mid">折算标准科</th><th>说明</th></tr></thead>
    <tbody>
${alFoundRows}
    </tbody>
    </table>
    <p class="soft" style="font-size:12.4px;margin:9px 0 0">折算只为 S1 分配能算出四科总分。<b>只要有一科读基础科，总分最好也只能是 ${FOUND_BEST}</b>（AL6+1+1+1）——这是选科时最容易被忽略的代价。</p>
  </div>
  <div class="panel">
    <h4>高华（HCL / HML / HTL）：不进总分</h4>
    <table style="margin:9px 0 0">
    <thead><tr><th>等级</th><th class="mid">原始分</th><th>作用</th></tr></thead>
    <tbody>
${alHmtlRows}
    </tbody>
    </table>
    <p class="soft" style="font-size:12.4px;margin:9px 0 0">${esc(ALB.hmtl.hmtlEligibility)}</p>
  </div>
</div>

<div class="note">
<b>数据边界，说清楚免得误用：</b>AL 档位来自 MOE 官方计分说明（本页 2026-11 核对）；
但「原始分区间」只是档位的定义，<b>孩子的实际原始分是查不到的</b>。
所以这张表的正确用法是：<b>把 AL 换算成一个大致百分比段位</b>（比如帮孩子理解「AL3 意味着 80 分出头」），
而不是把总分乘 4 当成百分制总分去跟别的孩子比 —— 后者在数学上就不成立。
</div>
</section>

<section>
<h2 id="s4"><span class="n">04</span>电脑到底怎么分学校</h2>
<p class="lead">这一节值得认真看。理解了机制，你就不会做「为了保险把差学校放第一」这种反效果的操作。</p>

<div class="verdict">
<h3>四句话讲完机制</h3>
<ol style="margin:0;padding-left:20px;line-height:2">
${principleList}
</ol>
</div>

<h3>同分的时候才比这三样</h3>
<table>
<thead><tr><th class="mid" style="width:16%">顺序</th><th style="width:32%">比什么</th><th>含义</th></tr></thead>
<tbody>
${CO.posting.tiebreaker.map((t, i) => `<tr><td class="num mid">${i + 1}</td><td><b>${esc(t)}</b></td><td class="soft">${
  i === 0 ? '公民 → PR → 国际生。只有总分相同才启用，所以<b>国际生分数高照样排在公民前面</b>，不存在「统一垫底」'
  : i === 1 ? '同分同身份时，把你填在前面的那个人优先 —— 这也是「按真实偏好排序」有用的原因'
  : '前两项都一样，才交给电脑抽签。这一步纯随机'
}</td></tr>`).join('\n')}
</tbody>
</table>

<div class="note">
<b>由此得出三条实操结论：</b><br>
① <b>第一志愿就填最想去的</b>。分数不够时系统看第二志愿，冲高没有代价；<br>
② <b>6 个一定填满</b>。空着的志愿等于主动放弃一次机会；<br>
③ <b>「稳妥」要靠余量，不靠顺序</b>。把稳妥校放第 6 位就够，不需要为了它牺牲第 1 位。
</div>
</section>

<section>
<h2 id="s5"><span class="n">05</span>通勤这笔账</h2>
<p class="lead">几乎所有家长都说「距离重要」，但很少有人把它换算成数字。换个算法，这件事会清楚很多。</p>

<div class="verdict">
<h3>一个能自己代进去的公式</h3>
<p style="font-size:15px;line-height:1.9;margin:0">
单程多 <b>1 分钟</b> ＝ 每天多 2 分钟（往返）＝ 每年多 <b>${TRIPS * DAYS}</b> 分钟（按 ${DAYS} 个上学日）＝ 中学 4 年多 <b>${Math.round(TRIPS * DAYS * YEARS / 60)} 小时</b>。
</p>
<p style="margin:10px 0 0;font-size:13.5px" class="soft">
换句话说：<b>单程多 10 分钟 = 四年多 ${commuteHours(10)} 小时 ≈ ${Math.round(commuteHours(10) / 8)} 个工作日</b>。
这还没算 CCA 结束后晚归、雨天、等车、放学后还要做功课的那部分。
</p>
</div>

${poolStats ? `
<h3>代入一个真实的候选池</h3>
<p>以邮编 <b>${esc(poolStats.postal)}</b> 为起点、45 分钟上限筛出的 <b>${poolStats.count} 所</b>候选学校为例：通勤最短 <b>${poolStats.lo} 分钟</b>、最长 <b>${poolStats.hi} 分钟</b>。
这中间的 <b>${poolStats.spread} 分钟</b>差距，四年累计是 <b>${n(poolStats.hours)} 小时 ≈ ${poolStats.days} 个工作日</b>。</p>

<table>
<thead><tr><th>单程通勤</th><th class="mid">候选池里有多少所</th><th class="mid">四年累计（相对 0 分钟）</th></tr></thead>
<tbody>
${poolStats.buckets.map(b => {
  const mid = b.label === '≤15 分钟' ? 12 : b.label === '16–25 分钟' ? 20 : b.label === '26–35 分钟' ? 30 : 40;
  return `<tr><td>${b.label}</td><td class="num mid"><b>${b.n}</b> 所</td><td class="num mid">${n(commuteHours(mid))} 小时</td></tr>`;
}).join('\n')}
</tbody>
</table>
<p class="soft" style="font-size:12.4px">累计值按每档中位数估算（12 / 20 / 30 / 40 分钟），只用来对比量级，不是精确值。</p>
` : ''}

<div class="note">
<b>我的建议是把通勤当「硬约束」，而不是「加分项」。</b>
加分项的意思是「近一点更好，远一点也能忍」；硬约束的意思是<b>超过某条线就直接排除</b>。
理由很实际：四年里每天两趟，孩子累了不会告诉你「是因为通勤」，只会表现为作业做不完、CCA 缺席、早上起不来。
<br><br>
具体怎么定这条线：<b>按 CCA 结束后的时间走一次</b>，不是按早上七点走。很多学校的差距就在放学那一段。
</div>
</section>

<section>
<h2 id="s6"><span class="n">06</span>COP 怎么看</h2>
<p class="lead"><b>COP（截分点）= 去年最后一个被录取的学生的分数。</b>它是结果，不是门槛。每年随报考热度浮动 1–3 分是常态。</p>

<div class="grid2">
  <div class="panel">
    <h4>能信的部分</h4>
    <p class="soft" style="margin:6px 0 0">它真实反映了<b>去年这批人怎么填</b>。同一所学校的多年 COP 连起来看，能看出它在收紧还是在放松。</p>
  </div>
  <div class="panel">
    <h4>不能信的部分</h4>
    <p class="soft" style="margin:6px 0 0">它<b>不代表今年</b>。今年的 COP 要等 12 月放榜后才产生，事前任何人都拿不到。</p>
  </div>
</div>

${TREND_A && TREND_B ? `
<h3>三年走向：同一个分数，含义可能完全不同</h3>
<p>我们把 2023 年以来的 PG3 区间补齐了（${HAS_HIST} 所，来源是 Wayback 存档的 MOE SchoolFinder 页面）。两所对比很说明问题：</p>
<table>
<thead><tr><th>学校</th><th class="mid">2023</th><th class="mid">2024</th><th class="mid">2025</th><th class="mid">上端变化</th></tr></thead>
<tbody>
<tr><td><b>${esc(TREND_A.name)}</b></td>${TREND_A.y.map(v => `<td class="num mid">${v}</td>`).join('')}<td class="num mid">${TREND_A.dMax == null ? '—' : (TREND_A.dMax > 0 ? '+' : '') + TREND_A.dMax + ' 分'}</td></tr>
<tr><td><b>${esc(TREND_B.name)}</b></td>${TREND_B.y.map(v => `<td class="num mid">${v}</td>`).join('')}<td class="num mid">${TREND_B.dMax == null ? '—' : (TREND_B.dMax > 0 ? '+' : '') + TREND_B.dMax + ' 分'}</td></tr>
</tbody>
</table>
<p class="soft" style="font-size:12.6px">看<b>上端</b>（区间右端）才有意义——那是录取门槛。上端变小表示门槛收紧。三年只动 1 分很常见，但收紧 2 分以上就要重新掂量余量。</p>
` : ''}

<h3>还有一个官方信号：低位段有没有招满</h3>
<p>MOE 在 SchoolFinder 里用星号 <code>*</code> 标一件事：<b>某个 Posting Group 在分配结束后仍有学额</b>。
我们查了全岛 139 所（另 8 所专科校不参与分组分配），<b>${STAR_N} 所带这个标记，而且全部落在 PG1 档，PG3 一个都没有</b>。</p>
<div class="warnbox">
<b>别读错方向。</b>「PG1 还有余额」说明这所学校<b>最低档没招满、整体不紧张</b>；
但它<b>不代表 PG3 门槛会降</b>——因为 PG3 段一所都没出现余额。把它当「学校不热门」的旁证，别当「更容易进」的保证。
</div>
</section>

<section>
<h2 id="s7"><span class="n">07</span>学费与升学路径</h2>
<p class="lead">读四年中学的实际支出，和「中四考什么」这件事，在选校阶段就该知道。下面全部是官方公布口径。</p>

<h3>政府 / 政府辅助中学月费（含所有国籍）</h3>
<div style="overflow-x:auto">
<table>
<thead><tr><th style="width:26%">身份</th><th class="mid">2023</th><th class="mid">2024</th><th class="mid">2025</th><th class="mid">2026</th></tr></thead>
<tbody>
${feeRows}
</tbody>
</table>
</div>
<p class="soft" style="font-size:12.6px">单位：新币 / 月。<b>${esc(CO.secondary.y2027Note)}</b></p>

<h3>杂费（所有国籍同价，${CO.misc.since} 年起并档）</h3>
<table style="max-width:420px">
<thead><tr><th>学段</th><th class="mid">每月</th></tr></thead>
<tbody>${miscRows}</tbody>
</table>

<h3>同一年（2026）三个学段的对照</h3>
<table>
<thead><tr><th>学段</th><th class="mid">公民</th><th class="mid">PR</th><th class="mid">东盟国际生</th><th class="mid">非东盟国际生</th></tr></thead>
<tbody>${levelRows}</tbody>
</table>
<p class="soft" style="font-size:12.6px">以上只是<b>学费与杂费</b>。校服、课本、交通、餐费、CCA 费用、校外补习都不含在内。</p>

<h3>中四考什么：O 水准要退场了</h3>
<table>
<thead><tr><th style="width:38%">项目</th><th>内容</th></tr></thead>
<tbody>${pathRows}</tbody>
</table>
<div class="note">
<b>对本届家长的实际含义：</b>孩子 2027 年 1 月入学，<b>2030 年考 SEC</b>。也就是说，
坊间讨论的「O 水准几分能进 JC」这套算法，到他们那一届已经换了一个名字和一套计分方式。
选校时看历史成绩仍然有用（它反映学校教学水平），但<b>别把某个具体的 O 水准分数当成四年后的目标线</b>。
</div>
</section>

<section>
<h2 id="s8"><span class="n">08</span>提交前 12 项清单</h2>
<p class="lead">填报那天照着过一遍。勾选状态不会保存，刷新就没了——需要留存请截图。</p>
<ol class="chk">
${CHECKLIST}
</ol>
</section>

<section>
<h2 id="s9"><span class="n">09</span>延伸阅读与数据来源</h2>

<div class="ext">
  <div class="ttl">PSLE 出分后 7 天，中学志愿怎么填？</div>
  <div class="meta">小红书 · 家长向科普 · 原帖标题</div>
  <p style="margin:9px 0 0;font-size:13.2px;line-height:1.8">
  这篇是我们动手做这份手册的起点。它讲清了时间线、分组、分派机制和外国孩子的实务，是很适合第一次经历 S1 Posting 的家长先读一遍的材料。
  <b>本页没有转载它的原文与配图</b>——它引用的 COP 数字来自 SchoolFinder，我们直接用了原始来源，并补了三年走向与星号标记。
  </p>
  <p style="margin:9px 0 0;font-size:12.6px" class="soft">
  原文链接：<a href="https://www.xiaohongshu.com/discovery/item/6af8924c000000002b028afe" target="_blank" rel="noopener noreferrer">xiaohongshu.com/discovery/item/6af8924c...</a>
  （内容可能随作者更新而变化，以原帖为准）
  </p>
</div>

<h3>本页数据来源</h3>
<table>
<thead><tr><th style="width:32%">内容</th><th>来源</th><th class="mid">等级</th></tr></thead>
<tbody>
<tr><td>出分 / 填报 / 放榜时间线</td><td>SEAB 重要日期页 · MOE S1 Posting 官网（2026-11 核对）</td><td class="mid"><span class="tag a">A</span></td></tr>
<tr><td>Posting Group 分档与 tie-breaker</td><td>MOE S1 Posting 官网</td><td class="mid"><span class="tag a">A</span></td></tr>
<tr><td>学费与杂费（2023–2026）</td><td>MOE 新闻稿 2023-10-18</td><td class="mid"><span class="tag a">A</span></td></tr>
<tr><td>SEC / Full SBB 时点与规则</td><td>SEAB《Secondary Education Certificate》· MOE Full SBB</td><td class="mid"><span class="tag a">A</span></td></tr>
<tr><td>三年 COP 走向</td><td>Wayback 存档的 MOE SchoolFinder 页面</td><td class="mid"><span class="tag a">A</span></td></tr>
<tr><td>「低位段未招满」星号</td><td>MOE SchoolFinder 官方脚注 · 全量 139 所采集</td><td class="mid"><span class="tag a">A</span></td></tr>
<tr><td>通勤小时数换算</td><td>本项目计算（每年 ${DAYS} 个上学日 × 往返 2 趟 × 4 年）</td><td class="mid"><span class="tag b">B</span></td></tr>
</tbody>
</table>

<div class="warnbox">
<b>三条边界，写在这里免得误用：</b><br>
① 本页讲的是<b>机制</b>，不构成录取建议；COP 每年浮动，踩线不等于稳；<br>
② <b>逐校招生人数官方从不公布</b>，本页也没有——只有全市平均（约 292 人/校）；<br>
③ 通勤小时数是<b>按固定假设换算</b>的（${DAYS} 天 × 2 趟 × 4 年），实际受 CCA、天气、等车影响，只用来看量级。
</div>
</section>

<div class="hb-foot">
<b>相关页面</b>　<a href="index.html">学校看板</a>（147 所，含 COP / CCA / 通勤）
｜ <a href="map.html">通勤地图</a>
｜ <a href="cohort.html">考生人数与学额</a>
｜ <a href="openhouse.html">开放日</a> ｜ <a href="plans.html">志愿方案</a><br>
<b>生成信息</b>　本页由 <code>scripts/build-guide.cjs</code> 从 <code>data/secondary-costs.json</code> 与相关数据生成，
数据更新 ${esc(CO.updatedAt)}。<br>
<b>免责</b>　个人研究工具输出，非 MOE 官方建议。政策以官方最新公告为准。
</div>

</div>
</body>
</html>
`;

fs.writeFileSync(P('docs/guide.html'), html, 'utf8');
console.log(`▸ 输出 docs/guide.html（${(html.length / 1024).toFixed(0)}KB）`);
console.log(`  学费 ${CO.secondary.rows.length} 档 × 4 年 · 星号 ${STAR_N} 所 · 三年走向 ${HAS_HIST} 所`);
console.log(`  通勤：+10 分钟 = ${commuteHours(10)} 小时${poolStats ? ` · 池内极差 ${poolStats.spread} 分钟 = ${poolStats.hours} 小时` : ''}`);
