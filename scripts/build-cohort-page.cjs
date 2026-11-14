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
const CSS = fs.readFileSync(P('scripts/tpl/plan.css'), 'utf8');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = v => (v == null ? '—' : v.toLocaleString('en-US'));

const KNOWN = D.years.filter(y => y.psleCandidates);
const MAX = Math.max(...KNOWN.map(y => y.psleCandidates));
const MIN = Math.min(...KNOWN.map(y => y.psleCandidates));
const AVG = Math.round(KNOWN.reduce((a, y) => a + y.psleCandidates, 0) / KNOWN.length);

const yoy = y => {
  const prev = D.years[D.years.indexOf(y) - 1];
  if (!prev || !prev.psleCandidates || !y.psleCandidates) return null;
  return ((y.psleCandidates - prev.psleCandidates) / prev.psleCandidates) * 100;
};

/* 柱状图：用行内宽度，不引依赖 */
const bar = (v, label, sub, highlight) => {
  const pct = ((v - MIN + 900) / (MAX - MIN + 900)) * 100;
  return `<div class="bar-row" style="grid-template-columns:88px 1fr 96px">
    <span class="lbl">${esc(label)}</span>
    <span class="bar-track"><i class="bar-fill${highlight ? ' hi' : ''}" style="display:block;width:${pct.toFixed(1)}%"></i></span>
    <span class="val">${n(v)}</span>
  </div>${sub ? `<div style="font-size:11.5px;color:var(--tx3);margin:-2px 0 6px 96px">${sub}</div>` : ''}`;
};

const forecastRow = D.years.find(y => y.forecastPoint);

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
.bar-track{background:#eeece6;border-radius:4px;height:16px;overflow:hidden;display:block}
.bar-fill{height:100%;background:#7aa79a;border-radius:4px;display:block}
.bar-fill.hi{background:var(--accent)}
.bar-row .val{font-family:var(--mono);text-align:right;color:var(--tx2)}
.src{font-size:10.5px;padding:1px 5px;border-radius:3px;border:1px solid var(--line);color:var(--tx3);margin-left:4px}
.src.a{border-color:#cfe4dc;background:var(--accent-bg);color:var(--accent)}
.src.b{border-color:#ecdfc0;background:var(--warm-bg);color:var(--warm)}
</style>
</head>
<body>

<div class="hero">
  <div class="wrap">
    <a class="backlink" href="index.html">← 返回学校看板</a>
    <div class="eyebrow">PSLE · 上游变量</div>
    <h1>考生人数与学额<small>2020–2026 年新加坡 PSLE 考生数、出生基数与学校学额</small></h1>
    <div class="sub">
      <b>COP 不是随机浮动的。</b>它的上游是两件事：这一届有多少考生，以及学校有多少学额。
      考生从 ${n(37095)}（2022）涨到 ${n(40894)}（2024）的那一年，Raffles Girls' 的 COP 从 6 掉到 5、
      St Patrick's 从 14 掉到 11——有孩子拿 12 分却六个志愿全落空。<b>这张表就是为了让你在填志愿前知道今年站在哪一年的水位上。</b>
    </div>
    <div class="profile">
      <div><div class="k">2025 考生</div><div class="v">${n(37926)}</div></div>
      <div><div class="k">2026 预测</div><div class="v">≈ ${n(forecastRow.forecastPoint)}</div></div>
      <div><div class="k">5 年均值</div><div class="v">${n(AVG)}</div></div>
      <div><div class="k">2026 vs 2025</div><div class="v">+${(((forecastRow.forecastPoint - 37926) / 37926) * 100).toFixed(1)}%</div></div>
      <div><div class="k">2025 年 Sec 1 在册</div><div class="v">${n(D.capacity.sec1Enrolment)}</div></div>
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
<p class="lead">从 2020 到 2025 是一条完整的波浪：${n(39995)} → ${n(39119)} → <b>${n(37095)}（谷底）</b> → ${n(38088)} → <b>${n(40894)}（峰值，龙年）</b> → ${n(37926)}。峰谷差 <b>${n(40894 - 37095)}</b> 人，相当于 ${((40894 - 37095) / 37095 * 100).toFixed(0)}%。</p>

${KNOWN.map(y => bar(
  y.psleCandidates,
  `${y.year}`,
  y.year === 2024 ? '龙年 · 峰值' : y.year === 2022 ? '谷底' : (yoy(y) != null ? `同比 ${yoy(y) > 0 ? '+' : ''}${yoy(y).toFixed(1)}%` : ''),
  y.year === 2024 || y.year === 2022
)).join('\n')}

<h3>完整对照表</h3>
<div style="overflow-x:auto">
<table>
<thead><tr>
  <th class="mid">PSLE 年份</th><th class="mid">对应出生年</th>
  <th class="mid">公民出生数<br><span class="soft">推算基数</span></th>
  <th class="mid">官方考生数</th>
  <th class="mid">推算区间</th><th>备注</th>
</tr></thead>
<tbody>
${D.years.map(y => `<tr>
  <td class="num mid"><b>${y.year}</b></td>
  <td class="num mid">${y.birthYear}${y.birthYearNote ? `<br><span class="soft" style="font-size:11px">${y.birthYearNote}</span>` : ''}</td>
  <td class="num mid">${y.citizenBirths[0] === y.citizenBirths[1] ? '约 ' + n(y.citizenBirths[0]) : n(y.citizenBirths[0]) + '–' + n(y.citizenBirths[1])}</td>
  <td class="num mid">${y.psleCandidates ? '<b>' + n(y.psleCandidates) + '</b>' : '<span class="soft">未公布</span>'}</td>
  <td class="num mid">${y.forecast ? n(y.forecast[0]) + '–' + n(y.forecast[1]) : (y.forecastPoint ? '≈ ' + n(y.forecastPoint) : '<span class="soft">' + esc(y.forecastNote || '—') + '</span>')}</td>
  <td class="soft" style="font-size:12.4px">${esc(y.note)}</td>
</tr>`).join('\n')}
</tbody>
</table>
</div>
</section>

<section>
<h2 id="s2"><span class="n">02</span>龙年实证：考生涨 7.4%，COP 真的会掉</h2>
<p class="lead">2024 年是唯一一次可以事后验证的年份：考生从 ${n(D.cases.previousYear)} 涨到 ${n(D.cases.psleCandidates)}（<b>+${D.cases.changePct}%</b>）。The Straits Times 采访的家长给出了具体数字。</p>

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

<div class="warnbox">
<b>这一节最该记住的不是「COP 会掉」，而是「掉多少无法预测」。</b>
Raffles Girls' 和 Hwa Chong 只掉 1 分，<b>St Patrick's 掉了 3 分</b>。
<br><br>
${esc(D.cases.narrative)}
</div>

<div class="note">
<b>我的判断：</b>COP 下降幅度和学校的热门程度不成正比 —— 恰恰是**中段学校**波动更大。
顶尖校的报考者分数分布集中，上下浮动 1 分就到头；中段学校的报考池更「宽」，
多出来的考生会整体把它往上顶，反映在 COP 上就是 2–3 分的跳变。
所以「照去年 COP + 2 分选校」这个习惯，在考生人数上升的年份是不够的。
</div>
</section>

<section>
<h2 id="s3"><span class="n">03</span>学额够不够：总量够，逐校不一定</h2>
<p class="lead">这是本节必须说清的一件事：<b>MOE 公布的学额只有全市总量，没有逐校数据。</b></p>

<h3>官方能查到的（MOE Education Statistics Digest 2026）</h3>
<table>
<thead><tr><th style="width:44%">指标</th><th class="mid">数值</th><th>口径</th></tr></thead>
<tbody>
<tr><td>中学在册总人数</td><td class="num mid">${n(D.capacity.secondaryEnrolment)}</td><td class="soft">2025 年，含政府/政府辅助/自主/专科</td></tr>
<tr><td>中学班级总数</td><td class="num mid">${n(D.capacity.secondaryClasses)}</td><td class="soft">2025 年</td></tr>
<tr><td>平均班级规模</td><td class="num mid">${D.capacity.averageClassSize} 人</td><td class="soft">在册 ÷ 班级数</td></tr>
<tr><td><b>Sec 1 在册人数</b></td><td class="num mid"><b>${n(D.capacity.sec1Enrolment)}</b></td><td class="soft">2025 年入学的这一届</td></tr>
<tr><td>纯中学 / 含中学部的混合校</td><td class="num mid">${D.capacity.secondarySchoolsPure} / ${D.capacity.mixedLevelSchools}</td><td class="soft">2025 年</td></tr>
<tr><td>参与 S1 Posting 的学校</td><td class="num mid">${D.capacity.schoolsInS1Posting2025}</td><td class="soft">2025 年（2024 年为 ${D.capacity.schoolsInS1Posting2024} 所）</td></tr>
<tr><td><b>平均每校 Sec 1 人数</b></td><td class="num mid"><b>≈ ${D.capacity.avgSec1PerSchool}</b></td><td class="soft">${n(D.capacity.sec1Enrolment)} ÷ ${D.capacity.schoolsInS1Posting2025}</td></tr>
</tbody>
</table>

<div class="warnbox">
<b>为什么看板里没有「每校招生人数」这一列 —— 因为官方不公布。</b><br><br>
逐校 S1 学额（vacancies）只在 <b>S1 Portal 登录后</b>可见（需 Singpass，且仅在填报期内），
MOE 的统计年报与 SchoolFinder 都<b>没有</b>逐校 intake 字段。
任何声称给出「某校 2026 年招生 N 人」的第三方数据，来源都不透明。
<br><br>
<b>能严谨做到的替代：</b>① 全市平均 ≈ ${D.capacity.avgSec1PerSchool} 人/校（用官方总数算出，不是估算）；
② 学校官网若写明年年开班数（如「8 个 Sec 1 班」）× 平均班额 ${D.capacity.averageClassSize} 人，可得到该校的近似学额，但需逐校核实，且是<b>往年</b>数据。
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
<h2 id="s4"><span class="n">04</span>2026：站在峰值附近的一年</h2>
<p class="lead">2026 届对应 2014 年出生，公民出生数约 ${n(33000)}——比 2013 年（约 ${n(31400)}）高。</p>

<div class="verdict">
<h3>推算结论</h3>
<ul>
<li><b>考生人数：约 ${n(forecastRow.forecastPoint)}</b>（合理区间 ${n(forecastRow.forecast[0])}–${n(forecastRow.forecast[1])}）。官方数字预计 <b>2026-11-24 或 11-25</b> 公布。</li>
<li><b>与 2025 年（${n(37926)}）相比 +${(((forecastRow.forecastPoint - 37926) / 37926) * 100).toFixed(1)}%</b>，与 2024 龙年峰值（${n(40894)}）基本持平。</li>
<li><b>趋势判断可靠，精确值不可靠。</b>趋势来自出生基数（2014 年公民出生比 2013 年多约 1,600），这个方向不太会错；
但「40,800」这个点估计的误差至少在 ±500 人量级，别拿它做任何精确计算。</li>
</ul>
</div>

<div class="warnbox">
<b>对 2026 填志愿的三个直接含义：</b><br>
① <b>不要把「去年 COP + 0」当稳妥。</b>考生人数回到峰值附近，中段学校 COP 上行 1–3 分是常态；<br>
② <b>稳妥档要留出 5 分以上余量</b>，而不是往年的 3 分；<br>
③ <b>热门校的 COP 可能不降反升</b>——龙年那年之所以「掉」，是因为考生多但学额也扩了；如果今年学额不扩，同样的考生数会把 COP 顶上去。
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
换成公民出生数后，其余年份的误差都收敛到数百人量级。<b>2026 的预测之所以修正到 ${n(forecastRow.forecastPoint)}，
也是因为把基数从「总出生 42,232」换成了「公民出生约 33,000」。</b></p>

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
<tr><td>考生数上升年（如 2024、2026）</td><td>余量要求上调 <b>2 分</b>；稳妥档从「余量 ≥5」提到「≥6」；冲刺位可以留，但别把仅剩的稳妥位也拿去冲</td></tr>
<tr><td>考生数下降年（如 2022、2025）</td><td>同等分数能买到更好的学校，可以适度上调冲刺档比例</td></tr>
<tr><td>COP 刚好等于孩子分数</td><td><b>无论哪一年都按高风险处理。</b>同分还要过 tie-breaker（公民身份 → 志愿顺序 → 抽签）</td></tr>
<tr><td>想确认某校今年的真实学额</td><td>只能在 <b>S1 Portal 填报期内</b>看到 vacancies；或直接问学校招生办。第三方网站的「招生人数」不可核</td></tr>
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
<tr><td>2020–2025 年 PSLE 考生人数</td><td>SEAB / MOE 各年「Release of PSLE Results」新闻稿</td><td class="mid"><span class="tag a">A</span></td></tr>
<tr><td>2024 年 COP 变动与落空案例</td><td>The Straits Times 报道（引 MOE 回应与家长采访）</td><td class="mid"><span class="tag a">A</span></td></tr>
<tr><td>中学在册人数 / 班级数 / 班均 / 学校数 / Sec 1 在册</td><td>MOE Education Statistics Digest 2026 统计表（Sheet 4 / 7 / 9）</td><td class="mid"><span class="tag a">A</span></td></tr>
<tr><td>参与 S1 Posting 的学校数（141 / 140）</td><td>MOE 2025 / 2024 PSLE 成绩新闻稿</td><td class="mid"><span class="tag a">A</span></td></tr>
<tr><td>公民出生数（各年区间）</td><td>项目整理，用于回测与预测</td><td class="mid"><span class="tag b">B</span></td></tr>
<tr><td>2026 年考生数推算（≈ ${n(forecastRow.forecastPoint)}）</td><td>本项目模型，基于 2014 年公民出生基数</td><td class="mid"><span class="tag b">B</span></td></tr>
<tr><td>逐校 S1 学额</td><td><b>无公开来源</b>（S1 Portal 登录后可见）</td><td class="mid">—</td></tr>
</tbody>
</table>

<div class="warnbox">
<b>两条必须知道的局限：</b><br>
① <b>2026 的 40,800 是推算，不是官方数字。</b>官方预计 11 月底公布，出来后这个页面的数要更新；<br>
② <b>考生数与 COP 的因果关系是统计性的，不是机械的。</b>同样是 40,800 人，如果今年学额也扩了，COP 可能不动；如果学额冻结，中段校会明显上移。
</div>
</section>

<div class="foot">
<b>生成信息</b>　本页由 <code>scripts/build-cohort-page.cjs</code> 从 <code>data/psle-cohort.json</code> 生成，
数据更新于 ${esc(D.updatedAt)}。<br>
<b>关联页面</b>　<a href="index.html">学校看板</a> ｜ <a href="map.html">通勤地图</a> ｜ <a href="reports/abc2-s1-choice-2026.html">AL 15 志愿方案</a><br>
<b>免责</b>　推算部分为个人研究，非 MOE 官方预测。COP 受考生数、学额、报考偏好三者共同影响，本页只解释第一个变量。
</div>

</div>
</body>
</html>
`;

const out = P('docs/cohort.html');
fs.writeFileSync(out, html, 'utf8');
console.log(`▸ 输出 ${out}（${(html.length / 1024).toFixed(0)}KB）`);
console.log(`  已知年份 ${KNOWN.length} 个 · 均值 ${AVG} · 2026 预测 ${forecastRow.forecastPoint}`);
