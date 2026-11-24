#!/usr/bin/env node
/**
 * PSLE 考生人数页（docs/cohort.html）
 *
 * 数据源：data/psle-cohort.json（唯一来源，改数据只改 JSON 再跑本脚本）
 *
 * 为什么单独一页：COP 的年际波动不是随机噪声，上游是「这一届有多少考生」。
 * 把 7 年考生数、龙年实证、学额总量放在一起，才解释得清「为什么去年 14 分能进、
 * 今年 11 分才进」。看板只给当年的 COP，解释不了这件事。
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const P = (...a) => path.join(BASE, ...a);
const D = JSON.parse(fs.readFileSync(P('data/psle-cohort.json'), 'utf8'));
const CSS = fs.readFileSync(P('scripts/tpl/tokens.css'), 'utf8') + fs.readFileSync(P('scripts/tpl/plan.css'), 'utf8');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = v => (v == null ? '—' : v.toLocaleString('en-US'));
/* JSON 里的叙述文本用了 Markdown 的 **加粗**。直接 esc() 会把星号原样印出来，
   所以先转义再加粗 —— 顺序不能反，否则 esc 出来的 &lt;b&gt; 会被当成标签。 */
const md = s => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

const KNOWN = D.years.filter(y => y.psleCandidates);
const MAX = Math.max(...KNOWN.map(y => y.psleCandidates));
const MIN = Math.min(...KNOWN.map(y => y.psleCandidates));
const AVG = Math.round(KNOWN.reduce((a, y) => a + y.psleCandidates, 0) / KNOWN.length);
/* 2026 已是官方值（A），不再是「预测」。MODEL 只留作事后回看 ——
   把模型的 ≈40,800 当今年的数字，是这一页上一版最严重的错。 */
const CURRENT = D.years[D.years.length - 1];
const PREV = D.years[D.years.indexOf(CURRENT) - 1];
const MODEL = D.years.find(y => y.forecastPoint);
/* 只有官方明确公布「适合升读」比例的年份才进五年对照；2020/2021 本轮没核到，留空不猜 */
const FIVE = D.years.filter(y => y.suitablePct);
const AXIS_FLOOR = Math.floor((MIN - 900) / 1000) * 1000;

const yoy = y => {
  const prev = D.years[D.years.indexOf(y) - 1];
  if (!prev || !prev.psleCandidates || !y.psleCandidates) return null;
  return ((y.psleCandidates - prev.psleCandidates) / prev.psleCandidates) * 100;
};
const yoyAbs = y => {
  const prev = D.years[D.years.indexOf(y) - 1];
  return prev && prev.psleCandidates ? y.psleCandidates - prev.psleCandidates : null;
};
const notSuitable = y => Math.round(y.psleCandidates * (100 - y.suitablePct) / 100);

/* 柱状图：用行内宽度，不引依赖 */
const bar = (v, label, sub, highlight) => {
  const pct = ((v - MIN + 900) / (MAX - MIN + 900)) * 100;
  return `<div class="bar-row" style="grid-template-columns:88px 1fr 96px">
    <span class="lbl">${esc(label)}</span>
    <span class="bar-track"><i class="bar-fill${highlight ? ' hi' : ''}" style="display:block;width:${pct.toFixed(1)}%"></i></span>
    <span class="val">${n(v)}</span>
  </div>${sub ? `<div style="font-size:11.5px;color:var(--tx3);margin:-2px 0 6px 96px">${sub}</div>` : ''}`;
};


const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="generator" content="psle-cohort-page/v1">
<title>PSLE 考生人数与学额 · 2020–2026</title>
<style>
${CSS}
.profile div .v{font-variant-numeric:tabular-nums}
/* 柱状图：plan.css 是给报告用的，没有 .bar-row（那套在 school.css 里），
   这里补一份，否则会退化成竖排的纯文本 */
.bar-row{display:grid;gap:10px;align-items:center;font-size:13px;margin:7px 0 3px}
.bar-row .lbl{color:var(--tx2);font-variant-numeric:tabular-nums}
.bar-track{background:var(--chip);border-radius:4px;height:16px;overflow:hidden;display:block}
.bar-fill{height:100%;background:var(--accent-dim);border-radius:4px;display:block}
.bar-fill.hi{background:var(--accent)}
.bar-row .val{font-family:var(--mono);text-align:right;color:var(--tx2)}
/* hero 数据格：标签行数不一时，数值会被顶到不同高度（已实测过一次错位）。
   改成列式 + 数值贴底，无论标签几行都对齐。只作用于本页，不动共享的 plan.css。 */
.hero .profile div{display:flex;flex-direction:column}
.hero .profile .v{margin-top:auto}
.src{font-size:10.5px;padding:1px 5px;border-radius:3px;border:1px solid var(--line);color:var(--tx3);margin-left:4px}
.src.a{border-color:var(--accent-line);background:var(--accent-bg);color:var(--accent)}
.src.b{border-color:var(--warm-line);background:var(--warm-bg);color:var(--warm)}
</style>
</head>
<body>

<div class="hero">
  <div class="wrap">
    <a class="backlink" href="index.html">← 返回学校看板</a>
    <div class="eyebrow">PSLE · 上游变量</div>
    <h1>考生人数与学额<small>2020–2026 年新加坡 PSLE 考生数、适合升读比例、出生基数与学校学额</small></h1>
    <div class="sub">
      <b>COP 不是随机浮动的。</b>它的上游是两件事：这一届有多少考生，以及学校有多少学额。
      官方刚公布的 2026 届有 <b>${n(CURRENT.psleCandidates)}</b> 人应考、<b>${CURRENT.suitablePct}%</b> 评定适合升读中学——
      比 2025 年多 ${n(yoyAbs(CURRENT))} 人（<b>+${yoy(CURRENT).toFixed(1)}%</b>），几乎回到 2024 龙年峰值（${n(D.cases.psleCandidates)}）。
      2024 年 Raffles Girls' 的 COP 数值从 6 收紧到 5、St Patrick's 从 14 收紧到 11——有孩子拿 12 分却六个志愿全落空。
      <b>这张表就是为了让你在填志愿前知道今年站在哪一年的水位上。</b>
    </div>
    <div class="profile">
      <div><div class="k">2026 考生</div><div class="v">${n(CURRENT.psleCandidates)}</div></div>
      <div><div class="k">适合升读</div><div class="v">${CURRENT.suitablePct}%</div></div>
      <div><div class="k">${KNOWN.length} 年均值</div><div class="v">${n(AVG)}</div></div>
      <div><div class="k">2026 vs 2025</div><div class="v">+${yoy(CURRENT).toFixed(1)}%</div></div>
      <div><div class="k">近五年区间</div><div class="v">${n(Math.min(...FIVE.map(y => y.psleCandidates)))}–${n(Math.max(...FIVE.map(y => y.psleCandidates)))}</div></div>
      <div><div class="k">平均每校</div><div class="v">≈ ${D.capacity.avgSec1PerSchool}</div></div>
    </div>
  </div>
</div>

<div class="wrap">

<div class="toc">
  <b>目录</b>
  <a href="#s1">① 七年考生数</a>
  <a href="#s2">② 龙年实证</a>
  <a href="#s3">③ 学额够不够</a>
  <a href="#s4">④ 2026 怎么看</a>
  <a href="#s5">⑤ 方法：为什么用公民出生数</a>
  <a href="#s6">⑥ 对选校的实际含义</a>
  <a href="#s7">⑦ 数据来源</a>
</div>

<div class="note" style="margin-top:20px">
<b>读这张表前先分清三件事。</b>
① <b>考生人数</b>是官方每年 11 月新闻稿里的实数（<span class="src a">A</span>）；
② <b>公民出生数</b>是推算基数，用来提前一年预测考生数（<span class="src b">B</span>）；
③ <b>学额</b>只有全市总量公开，<b>逐校学额 MOE 不公布</b>（见第三节说明）。
</div>

<section>
<h2 id="s1"><span class="n">01</span>七年考生数：一个完整的起伏</h2>
<p class="lead">从 2020 到 2026 是一条完整的波浪：${KNOWN.map(y => n(y.psleCandidates) + (y.year === 2022 ? '（谷底）' : y.year === 2024 ? '（龙年峰值）' : y.year === CURRENT.year ? '（官方，七年最高）' : '')).join(' → ')}。峰谷差 <b>${n(MAX - MIN)}</b> 人，相当于 ${((MAX - MIN) / MIN * 100).toFixed(1)}%。2026 年的 ${n(MAX)} 是官方实数，不是推算。</p>

${KNOWN.map(y => bar(
  y.psleCandidates,
  `${y.year}`,
  y.year === CURRENT.year ? '官方 · 七年最高' : y.year === 2024 ? '龙年 · 上一个峰值' : y.year === 2022 ? '谷底' : (yoy(y) != null ? `同比 ${yoy(y) > 0 ? '+' : ''}${yoy(y).toFixed(1)}%` : ''),
  y.year === CURRENT.year || y.year === 2024 || y.year === 2022
)).join('\n')}

<p class="soft" style="font-size:12.4px">柱状图纵轴从 ${n(AXIS_FLOOR)} 起画（不是 0）——因为七年区间只有 ${n(MAX - MIN)} 人、约 ${((MAX - MIN) / MIN * 100).toFixed(1)}%，从 0 起画会全部拉平看不出起伏。<b>看长度对比可以，看比例不行</b>；要比例请用下表。</p>

<h3>近五年官方对照（2022–2026）</h3>
<div style="overflow-x:auto">
<table>
<thead><tr>
  <th class="mid">年份</th><th class="mid">考生人数</th><th class="mid">同比</th>
  <th class="mid">适合升读</th><th class="mid">倒推未适合</th><th>水位判断</th>
</tr></thead>
<tbody>
${FIVE.map(y => `<tr>
  <td class="num mid"><b>${y.year}</b></td>
  <td class="num mid">${n(y.psleCandidates)}</td>
  <td class="num mid">${yoy(y) == null ? '—' : `${yoy(y) > 0 ? '+' : ''}${yoy(y).toFixed(1)}%`}</td>
  <td class="num mid">${y.suitablePct.toFixed(1)}%</td>
  <td class="num mid">≈ ${n(notSuitable(y))}</td>
  <td class="soft" style="font-size:12.4px">${y.year === 2024 ? '龙年 · 上一个峰值' : y.year === CURRENT.year ? `官方 · 与 2024 峰值仅差 ${n(y.psleCandidates - D.cases.psleCandidates)} 人` : y.year === 2022 ? '谷底 · 相对宽松' : y.year === 2025 ? '回落 · 相对宽松' : '温和回升'}</td>
</tr>`).join('\n')}
</tbody>
</table>
</div>
<p class="soft" style="font-size:12.4px">「倒推未适合」= 考生数 ×（100 − 公布百分比）。官方只给四舍五入后的百分比，<b>这一列是估算，不是官方人数</b>。
适合升读比例五年只从 ${FIVE[0].suitablePct.toFixed(1)}% 变到 ${FIVE[FIVE.length - 1].suitablePct.toFixed(1)}%，<b>真正波动的是考生数，不是合格比例</b>。</p>

<h3>完整对照表（含出生基数）</h3>
<div style="overflow-x:auto">
<table>
<thead><tr>
  <th class="mid">PSLE 年份</th><th class="mid">对应出生年</th>
  <th class="mid">公民出生数<br><span class="soft">推算基数</span></th>
  <th class="mid">官方考生数</th><th class="mid">适合升读</th>
  <th class="mid">推算区间</th><th>备注</th>
</tr></thead>
<tbody>
${D.years.map(y => `<tr>
  <td class="num mid"><b>${y.year}</b></td>
  <td class="num mid">${y.birthYear}${y.birthYearNote ? `<br><span class="soft" style="font-size:11px">${y.birthYearNote}</span>` : ''}</td>
  <td class="num mid">${y.citizenBirths[0] === y.citizenBirths[1] ? '约 ' + n(y.citizenBirths[0]) : n(y.citizenBirths[0]) + '–' + n(y.citizenBirths[1])}</td>
  <td class="num mid">${y.psleCandidates ? '<b>' + n(y.psleCandidates) + '</b>' : '<span class="soft">未公布</span>'}</td>
  <td class="num mid">${y.suitablePct ? y.suitablePct.toFixed(1) + '%' : '<span class="soft">—</span>'}</td>
  <td class="num mid">${y.forecastPoint ? '<span class="soft">模型回看 ≈ ' + n(y.forecastPoint) + '</span>' : (y.forecast ? n(y.forecast[0]) + '–' + n(y.forecast[1]) : '<span class="soft">' + esc(y.forecastNote || '—') + '</span>')}</td>
  <td class="soft" style="font-size:12.4px">${esc(y.note)}</td>
</tr>`).join('\n')}
</tbody>
</table>
</div>
<p class="soft" style="font-size:12.4px">2020、2021 的「适合升读」本轮未核到官方原文，留空不猜；2026 的「模型回看」是当时预测值，<b>不是官方数字</b>。</p>
</section>

<section>
<h2 id="s2"><span class="n">02</span>龙年实证：考生涨 7.4%，COP 数值下行（门槛收紧）</h2>
<p class="lead">2024 年是近年<b>唯一一次有公开报道、可以事后验证 COP 变动</b>的年份：考生从 ${n(D.cases.previousYear)} 涨到 ${n(D.cases.psleCandidates)}（<b>+${D.cases.changePct}%</b>）。The Straits Times 采访的家长给出了具体数字。</p>

<table>
<thead><tr><th>学校</th><th class="mid">2023 COP</th><th class="mid">2024 COP</th><th class="mid">变动</th></tr></thead>
<tbody>
${D.cases.items.map(c => `<tr>
  <td>${esc(c.school)}</td>
  <td class="num mid">${c.cop.split('→')[0].trim()}</td>
  <td class="num mid">${c.cop.split('→')[1].trim()}</td>
  <td class="num mid"><b>${c.delta}</b></td>
</tr>`).join('\n')}
</tbody>
</table>

<h3>先给个基准：落空到底有多常见</h3>
<p>只说「有人六个志愿全落空」会让人误判量级。MOE 对<b>同一届（2024 龙年）</b>的官方说法是：</p>
<div class="grid2">
  <div class="panel"><h4>${D.postingOutcomes.firstThreeChoicesPct}% 以上</h4><p class="soft" style="margin:6px 0 0">被分配到自己填的<b>前三个</b>志愿</p></div>
  <div class="panel"><h4>${D.postingOutcomes.anyOfSixPct}% 以上</h4><p class="soft" style="margin:6px 0 0">被分配到<b>六个志愿之一</b></p></div>
</div>
<p class="soft" style="font-size:12.6px">需要 tie-breaker 的，${D.postingOutcomes.ballotingShare} 走了电脑抽签；MOE 称这些比例与往年「comparable」。<br>
<b>换句话说：即使在被称作「bumper cohort」的龙年，落空率也只有个位数百分比。</b>但这几个点落在谁头上是随机的，
而落在你头上就是 100% —— 所以下面的含义不是「不必紧张」，而是「用正确的余量把这几率压到更低」。</p>

<div class="warnbox">
<b>这一节最该记住的不是「COP 数值会下行」，而是「下行多少无法预测」。</b>
Raffles Girls' 和 Hwa Chong 只掉 1 分，<b>St Patrick's 掉了 3 分</b>。
<br><br>
${md(D.cases.narrative)}
<br><br><b>旁证（同期另一组独立数据）：</b>${md(D.cases.corroboration)}
</div>

<div class="note">
<b>我的判断：</b>COP 数值下行的幅度和学校的热门程度不成正比 —— 恰恰是<b>中段学校</b>波动更大。
顶尖校的报考者分数分布集中，上下浮动 1 分就到头；中段学校的报考池更「宽」，
多出来的考生会整体把它往上顶，反映在 COP 上就是 2–3 分的跳变。
所以「照去年 COP + 2 分选校」这个习惯，在考生人数上升的年份是不够的。
</div>
</section>

<section>
<h2 id="s3"><span class="n">03</span>学额够不够：总量够，逐校不一定</h2>
<p class="lead">这是本节必须说清的一件事：<b>MOE 公布的学额只有全市总量，没有逐校数据。</b></p>

<div class="note">
<b>先对齐时间：</b>2026 年考 PSLE 的这一届，<b>2027 年 1 月</b>才进 Sec 1。
所以严格说，「今年的学额」= <b>2027 年 S1 intake</b>，不是「2026 年学额」。
官方文件里也从来不用「2026 intake」这种说法——这个错位是很多讨论对不上的根源。
</div>

<h3>官方能查到的（MOE Education Statistics Digest 2026）</h3>
<table>
<thead><tr><th style="width:44%">指标</th><th class="mid">数值</th><th>口径</th></tr></thead>
<tbody>
<tr><td>中学在册总人数</td><td class="num mid">${n(D.capacity.secondaryEnrolment)}</td><td class="soft">2025 年，含政府/政府辅助/自主/专科</td></tr>
<tr><td>中学班级总数</td><td class="num mid">${n(D.capacity.secondaryClasses)}</td><td class="soft">2025 年</td></tr>
<tr><td>平均班级规模</td><td class="num mid">${D.capacity.averageClassSize} 人</td><td class="soft">在册 ÷ 班级数</td></tr>
<tr><td><b>Sec 1 在册人数</b></td><td class="num mid"><b>${n(D.capacity.sec1Enrolment)}</b></td><td class="soft">2025 学年在校的 Sec 1（即 2024 年考 PSLE 那一届）</td></tr>
<tr><td>Sec 1 班级数 / 班均</td><td class="num mid">${n(D.capacity.sec1Classes)} / ${D.capacity.sec1AverageClassSize} 人</td><td class="soft">推算单校学额时用这个，比全校班均 ${D.capacity.averageClassSize} 更贴</td></tr>
<tr><td>纯中学 / 含中学部的混合校</td><td class="num mid">${D.capacity.secondarySchoolsPure} / ${D.capacity.mixedLevelSchools}</td><td class="soft">2025 年</td></tr>
<tr><td>参与 S1 Posting 的学校</td><td class="num mid">${D.capacity.schoolsInS1Posting2026}</td><td class="soft">2026 年（2025 年 ${D.capacity.schoolsInS1Posting2025} 所、2024 年 ${D.capacity.schoolsInS1Posting2024} 所）</td></tr>
<tr><td><b>平均每校 Sec 1 人数</b></td><td class="num mid"><b>≈ ${D.capacity.avgSec1PerSchool}</b></td><td class="soft">${n(D.capacity.sec1Enrolment)} ÷ ${D.capacity.schoolsInS1Posting2025}</td></tr>
</tbody>
</table>

<h3>交叉校验：考生数 ≈ Sec 1 规模，但不是恒等</h3>
<p>把两个官方数字并排放，能验证这套口径的可靠度：</p>
<table>
<thead><tr><th>年份</th><th class="mid">PSLE 考生</th><th class="mid">其中合格</th><th class="mid">次年 Sec 1 在册</th><th class="mid">差额</th></tr></thead>
<tbody>
<tr>
  <td>${D.capacity.crossCheck.psleYear} 届 → ${D.capacity.crossCheck.psleYear + 1} 学年</td>
  <td class="num mid">${n(D.capacity.crossCheck.psleCandidates)}</td>
  <td class="num mid">≈ ${n(Math.round(D.capacity.crossCheck.psleCandidates * D.capacity.crossCheck.eligiblePct / 100))}</td>
  <td class="num mid">${n(D.capacity.crossCheck.sec1EnrolledNextYear)}</td>
  <td class="num mid"><b>+${n(D.capacity.crossCheck.diff)}</b></td>
</tr>
</tbody>
</table>
<p class="soft" style="font-size:12.6px">差额来自不走 PSLE 的通道：回流公民（SPERS）、直接录取的国际学生、madrasah 等。
<b>所以「考生数」是 Sec 1 规模的近似，不是恒等</b>——拿它做整年趋势可以，拿它精确算某校学额不行。</p>

<h3>四个渠道都查过：逐校学额没有任何公开来源</h3>
<table>
<thead><tr><th style="width:30%">渠道</th><th class="mid">有逐校学额</th><th>实际能查到什么</th></tr></thead>
<tbody>
<tr><td>MOE 统计年报（ESD 2026）</td><td class="mid">❌</td><td class="soft">58 个 sheet 全是聚合口径，最细到「Sec 1 在册 ${n(D.capacity.sec1Enrolment)}、${n(D.capacity.sec1Classes)} 班」，无逐校行</td></tr>
<tr><td>MOE SchoolFinder</td><td class="mid">❌</td><td class="soft">字段只有类型 / 性别 / COP / CCA / DSA / ALP·LLP / 地址，<b>没有 intake 或 enrolment</b></td></tr>
<tr><td>S1 Posting 官网</td><td class="mid">❌</td><td class="soft">只有流程、时间线、学校搜索，没有任何人数</td></tr>
<tr><td><b>S1 Portal</b>（Singpass 登录后）</td><td class="mid">❌</td><td class="soft">官方定义只有四项：查看孩子的分配资格与 DSA 结果、提交最多 6 个志愿、查询分配结果 —— <b>没有「各校剩余学额」这一项</b></td></tr>
</tbody>
</table>

<div class="warnbox">
<b>⚠️ 更正一个流传很广的误解：登录 S1 Portal 看不到各校还剩多少个位。</b><br><br>
MOE 对 S1 Portal 的功能定义原文是「view their child's S1 Posting eligibilities, DSA outcome, submit secondary school choices/eligibility options and check their child's S1 Posting result」——
四项，<b>一项都不是 vacancies</b>。网上（包括本页 2026-11-14 的上一版）说的「填报期内能看到剩余学额」，是错的。
</div>

<h3>那「空位」什么时候才真的存在？</h3>
<table>
<thead><tr><th style="width:22%">时点</th><th style="width:20%">谁看得到</th><th>你能做什么</th></tr></thead>
<tbody>
<tr><td><b>填报期</b><br><span class="soft">11 月底起 7 天</span></td><td>谁都看不到</td><td class="soft">只能靠往年 COP + 考生数趋势判断。这也是 MOE 的设计意图：你猜不到别人怎么填，就只能按真实偏好排序</td></tr>
<tr><td><b>放榜</b><br><span class="soft">12 月 18 日</span></td><td>MOE 内部</td><td class="soft">没被任何志愿录取的，会被派往<b>仍有空位</b>的学校，但不会给你一份空位清单</td></tr>
<tr><td><b>报到后</b><br><span class="soft">次年 1 月初</span></td><td>学校自己</td><td class="soft">有人出国、转学、appeal 成功才会真正放位。<b>这时直接打电话问学校招生办</b>，是唯一有实效的动作</td></tr>
</tbody>
</table>

<div class="note">
<b>为什么 MOE 故意不给看（我的判断）：</b>① 学额本身不固定，会按 cohort 调整，提前公布等于承诺；
② 填报期内的余量是动态的（DSA 占位、附属保留位、退档都会变），显示静态数字反而误导；
③ 一旦公开，填报会从「按偏好排序」变成「抢空位博弈」，分数高的也去猜，整体分配效率会崩。
</div>

<div class="note">
<b>能严谨做到的替代：</b>① 全市平均 ≈ ${D.capacity.avgSec1PerSchool} 人/校（${n(D.capacity.sec1Enrolment)} ÷ ${D.capacity.schoolsInS1Posting2025}，用官方总数算出，不是估算）；
② 学校官网若写明年年开班数（如「8 个 Sec 1 班」）× Sec 1 班均 ${D.capacity.sec1AverageClassSize} 人，可得该校的近似学额，但需逐校核实，且是<b>往年</b>数据；
③ 任何声称给出「某校 2027 年招生 N 人」的第三方数据，来源都不透明 —— 别拿它做决策。
</div>

<h3>MOE 对「考生变多怎么办」的官方说法</h3>
<p>2024 年龙年争议后，MOE 的回应是：<b>「学额规划会考虑国家与地方层面的需求，确保所有合格 Secondary 1 学生都有学额。」</b></p>
<div class="note">
<b>注意这句话保证的是什么。</b>它保证的是<b>总量</b>——每个合格学生都有学上；
它<b>不保证</b>你的孩子能进他填的那六所。龙年那批「六个志愿全落空、被派到一小时路程外的学校」的学生，
就是在「总量够」的前提下发生的。<b>所以学额总量不是安慰，志愿梯度才是。</b>
</div>
</section>

<section>
<h2 id="s4"><span class="n">04</span>2026：官方数字已公布，站在峰值附近</h2>
<p class="lead">2026 届对应 2014 年出生，公民出生数约 ${n(33000)}——比 2013 年（约 ${n(31400)}）高。SEAB 2026-11-24 官方文告给出实数：<b>${n(CURRENT.psleCandidates)} 人应考、${CURRENT.suitablePct}% 适合升读中学</b>。</p>

<div class="verdict">
<h3>官方数字与模型回看</h3>
<ul>
<li><b>考生人数：${n(CURRENT.psleCandidates)}</b>（SEAB / MOE《Release of 2026 PSLE Results》，<span class="src a">A</span>）。不再是「≈ ${n(MODEL.forecastPoint)} 预测」。</li>
<li><b>适合升读：${CURRENT.suitablePct}%</b>，按公布比例倒推约 ${n(notSuitable(CURRENT))} 人未适合升读（<b>估算，官方只给百分比</b>）。其余学生可重考 PSLE，或申请 Assumption Pathway School / NorthLight School。</li>
<li><b>与 2025 年（${n(PREV.psleCandidates)}）相比 +${n(yoyAbs(CURRENT))}（+${yoy(CURRENT).toFixed(1)}%）</b>，与 2024 龙年峰值（${n(D.cases.psleCandidates)}）只差 ${n(CURRENT.psleCandidates - D.cases.psleCandidates)} 人。</li>
<li><b>模型回看：点估计 ${n(MODEL.forecastPoint)}，区间 ${n(MODEL.forecast[0])}–${n(MODEL.forecast[1])}</b>；实际落在区间内，<b>比点估计高 ${n(CURRENT.psleCandidates - MODEL.forecastPoint)} 人</b>（${Math.abs(D.ratioBacktest.actual2026.pointErrorPct)}%）。更宽的经验带 ${n(D.ratioBacktest.bandFor2026[0])}–${n(D.ratioBacktest.bandFor2026[1])} 同样覆盖。<br>
<span class="soft" style="font-size:12.6px">2020–2025 六年的比值区间是 ${D.ratioBacktest.min}–${D.ratioBacktest.max}，2026 实际 ${D.ratioBacktest.actual2026.ratio} 落在其中——方向判断成立，但不等于能精确到个位。</span></li>
<li><b>参与学校：${D.capacity.schoolsInS1Posting2026} 所</b>中学参加 2026 S1 Posting（官方文告原文）。</li>
</ul>
</div>

<h3>2026 届的官方时间线（MOE / SEAB）</h3>
<table>
<thead><tr><th style="width:26%">节点</th><th>时间</th><th class="mid">性质</th></tr></thead>
<tbody>
<tr><td>PSLE 放榜</td><td>${esc(D.timeline2026.psleResults)}</td><td class="mid"><span class="src a">官方</span></td></tr>
<tr><td>提交 6 个志愿</td><td>${esc(D.timeline2026.choiceWindow)}</td><td class="mid">规则</td></tr>
<tr><td>S1 分配结果</td><td>${esc(D.timeline2026.postingResults)}，通过 S1 Portal / SMS / 小学查询</td><td class="mid"><span class="src b">暂定</span></td></tr>
<tr><td>入学</td><td>${esc(D.timeline2026.enrolment)}</td><td class="mid">规则</td></tr>
</tbody>
</table>
<p class="soft" style="font-size:12.4px">放榜与填报窗口已是官方确认日期；<b>只有 S1 派位结果仍标 tentative</b>（SEAB 原文：will be released tentatively on Friday, 18 December 2026），实际日期会另行确认。</p>

<div class="warnbox">
<b>对 2026 填志愿的三个直接含义：</b><br>
① <b>不要把「去年 COP + 0」当稳妥。</b>考生人数回到峰值附近，<b>COP 数值下行 1–3 分</b>（门槛收紧）是常态 ——
注意方向别搞反：数值变小就是更难进。<br>
② <b>六个志愿里至少 2–3 所的 COP 要明显宽松于孩子分数。</b>这是 SEAB 2026 文告原文建议（at least 2 to 3 schools whose previous years' COPs are less stringent），不是本项目自己加的保守系数。<br>
③ <b>别拿「顶尖校只降 1 分」外推到你填的中段校。</b>2024 年 RGS / HCI 各降 1 分，St Patrick's 降了 3 分 ——
中段校波动更大，而那批家长判断失误恰恰全落在这里。
</div>
</section>

<section>
<h2 id="s5"><span class="n">05</span>方法：为什么用公民出生数，而不是总出生数</h2>
<p class="lead">这是整张表唯一的技术点，也是 2022 年那次偏差的根源。</p>

<table>
<thead><tr><th style="width:26%">口径</th><th>说明</th><th class="mid">用它对不对</th></tr></thead>
<tbody>
<tr><td>总出生数</td><td>含公民、永久居民、外国人。2010 年约 3.8 万</td><td class="mid">❌ 会系统性高估</td></tr>
<tr><td><b>公民出生数</b></td><td>只算公民。PSLE 考生里公民占绝大多数，且 PR/外国学生数量受政策调节、波动大</td><td class="mid">✅ 回测拟合最好</td></tr>
</tbody>
</table>

<p>用总出生数回测 2022 年（对应 2010 年出生）时，预测明显高于实际的 ${n(37095)}；
换成公民出生数后，其余年份的误差都收敛到数百人量级。<b>2026 年模型当时把点估计定在 ${n(MODEL.forecastPoint)}，
正是因为把基数从「总出生 42,232」换成了「公民出生约 ${n(D.ratioBacktest.base2026)}」；官方实数 ${n(CURRENT.psleCandidates)} 落在模型区间内。</b></p>

<div class="note">
<b>为什么不能直接说「1 个公民出生 ≈ 1 个 PSLE 考生」。</b>
两者之间隔着几年的人口流动：有人随家庭移居海外、有人从海外回流（SPERS）、
也有 PR 转公民。<b>所以这是比例关系，不是恒等式</b>——回测用的是「考生数 ÷ 该年公民出生数」的比值，
而不是出生数本身。
</div>
</section>

<section>
<h2 id="s6"><span class="n">06</span>对你选校的实际含义</h2>
<table>
<thead><tr><th style="width:30%">场景</th><th>该怎么做</th></tr></thead>
<tbody>
<tr><td>考生数上升年（如 2024、2026）</td><td>余量要求上调 <b>1–2 分</b>；稳妥档门槛从「余量 ≥5」提到「≥6」；冲刺位可以留，但别把仅剩的稳妥位也拿去冲</td></tr>
<tr><td>考生数下降年（如 2022、2025）</td><td>同等分数能买到更好的学校，可以适度上调冲刺档比例</td></tr>
<tr><td>COP 刚好等于孩子分数</td><td><b>无论哪一年都按高风险处理。</b>同分还要过 tie-breaker（公民身份 → 志愿顺序 → 抽签）</td></tr>
<tr><td>想确认某校今年的真实学额</td><td><b>查不到。</b>S1 Portal 不显示各校余量，SchoolFinder 与统计年报也没有逐校字段（见第三节）。
唯一有实效的动作：出结果后直接问学校招生办，尤其<b>次年 1 月初报到前后</b>那几天</td></tr>
</tbody>
</table>

<div class="verdict">
<h3>一句话</h3>
<p><b>考生人数决定的是「整体水位」，不是「某所学校的分数线」。</b>
水位高的年份，同样的分数买到的东西会缩水；具体缩多少，取决于那所学校今年有多少人报、有多少学额——
这两个数字官方都不提前公布。<b>所以能做的只有一件事：把梯度拉开。</b></p>
</div>
</section>

<section>
<h2 id="s7"><span class="n">07</span>数据来源与等级</h2>
<table>
<thead><tr><th style="width:34%">数据</th><th>来源</th><th class="mid">等级</th></tr></thead>
<tbody>
<tr><td>2020–2026 年 PSLE 考生人数</td><td>SEAB / MOE 各年「Release of PSLE Results」新闻稿（2026 篇：2026-11-24）</td><td class="mid"><span class="tag a">A</span></td></tr>
<tr><td>2022–2026 年「评定适合升读中学」百分比</td><td>SEAB / MOE 各年成绩新闻稿；2026 原文「of which 98.5% are assessed suitable for secondary school」</td><td class="mid"><span class="tag a">A</span></td></tr>
<tr><td>2024 年 COP 变动与落空案例</td><td>The Straits Times 报道（引 MOE 回应与家长采访）</td><td class="mid"><span class="tag a">A</span></td></tr>
<tr><td>中学在册人数 / 班级数 / 班均 / 学校数 / Sec 1 在册</td><td>MOE Education Statistics Digest 2026 统计表（Sheet 4 / 7 / 9）</td><td class="mid"><span class="tag a">A</span></td></tr>
<tr><td>参与 S1 Posting 的学校数（${D.capacity.schoolsInS1Posting2026} / ${D.capacity.schoolsInS1Posting2025} / ${D.capacity.schoolsInS1Posting2024}）</td><td>SEAB 2026 / MOE 2025 / 2024 PSLE 成绩新闻稿</td><td class="mid"><span class="tag a">A</span></td></tr>
<tr><td>公民出生数（各年区间）</td><td>项目整理，用于回测与预测</td><td class="mid"><span class="tag b">B</span></td></tr>
<tr><td>2026 年模型点估计（≈ ${n(MODEL.forecastPoint)}）</td><td>本项目模型，基于 2014 年公民出生基数；<b>仅作事后回看，不是官方值</b></td><td class="mid"><span class="tag b">B</span></td></tr>
<tr><td>逐校 S1 学额</td><td><b>无任何公开来源</b>（S1 Portal 亦不显示，官方定义中无此项）</td><td class="mid">—</td></tr>
<tr><td>S1 Portal 功能范围 / 2026 时间线</td><td>MOE S1 Posting 官网 s1.placement.moe.gov.sg · SEAB《Release of 2026 PSLE Results》（2026-11-24 核对）</td><td class="mid"><span class="tag a">A</span></td></tr>
<tr><td>分配结果比例（80% / 90% / 抽签 1/10）</td><td>MOE 发言人回复 Straits Times（2024 龙年那届）</td><td class="mid"><span class="tag a">A</span></td></tr>
</tbody>
</table>

<div class="warnbox">
<b>两条必须知道的局限：</b><br>
① <b>2026 的 ${n(CURRENT.psleCandidates)} 已是官方实数（A 级）；${n(MODEL.forecastPoint)} 只是此前模型的点估计</b>，两者不能混用；<br>
② <b>考生数与 COP 的因果关系是统计性的，不是机械的。</b>同样是 ${n(CURRENT.psleCandidates)} 人，如果今年学额也扩了，COP 数值可能不动；
如果学额冻结，<b>中段校的 COP 数值会明显下行（门槛收紧）</b>——方向别记反：COP 变小 = 更难进。
</div>
</section>

<div class="foot">
<b>生成信息</b>　本页由 <code>scripts/build-cohort-page.cjs</code> 从 <code>data/psle-cohort.json</code> 生成，
数据更新于 ${esc(D.updatedAt)}。<br>
<b>本次修订</b>　${esc(D.revision)}<br>
<b>关联页面</b>　<a href="index.html">学校看板</a> ｜ <a href="map.html">通勤地图</a> ｜ <a href="guide.html">填报手册</a> ｜ <a href="openhouse.html">开放日</a> ｜ <a href="plans.html">志愿方案</a><br>
<b>免责</b>　推算部分为个人研究，非 MOE 官方预测。COP 受考生数、学额、报考偏好三者共同影响，本页只解释第一个变量。
</div>

</div>
</body>
</html>
`;

const out = P('docs/cohort.html');
fs.writeFileSync(out, html, 'utf8');
console.log(`▸ 输出 ${out}（${(html.length / 1024).toFixed(0)}KB）`);
console.log(`  已知年份 ${KNOWN.length} 个 · 均值 ${AVG} · 2026 官方 ${CURRENT.psleCandidates} · 模型回看 ${MODEL.forecastPoint}`);
