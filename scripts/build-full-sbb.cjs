#!/usr/bin/env node
/**
 * Full SBB 专题页（docs/full-sbb.html）
 *
 * 定位：独立于择校看板的一页通识 —— 讲清 Full SBB 是什么、科目怎么分层、
 * 每门科目是必修还是选修 / 能读哪几个级别 / 全岛多少校开设，
 * 最后落到「以本项目学生 abcd2 为例，四年后怎么规划 JC」。
 *
 * 事实源全部来自 data/full-sbb.json（MOE / SEAB 官方，2026-11-25 核验）。
 * 开课校数不写死：每次从 data/subjects 的 match 规则对 data/schools.json
 * （SchoolFinder 官方采集）现算，避免数据更新后页面陈旧。
 *
 * 配色：沿用 tpl/tokens.css + plan.css。科目「必修/选修」「级别」一律中性徽章，
 * 不用颜色暗示好坏；语义色只用于风险提示（如「人文缺口」）。
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const P = (...a) => path.join(BASE, ...a);
const CSS = fs.readFileSync(P('scripts/tpl/tokens.css'), 'utf8') + fs.readFileSync(P('scripts/tpl/plan.css'), 'utf8');

const D = JSON.parse(fs.readFileSync(P('data/full-sbb.json'), 'utf8'));
const RAW = JSON.parse(fs.readFileSync(P('data/schools.json'), 'utf8'));

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NOTE_RE = /offered to the current student cohort|Tamil Language will have to attend/i;

/* ── 开课校数现算：每校的 subjects 去重后，按该科的 match 规则计数 ── */
const countFor = pattern => {
  const re = new RegExp(pattern, 'i');
  let n = 0;
  for (const s of RAW) {
    const subs = (s.subjects || []).filter(v => !NOTE_RE.test(v)).map(v => String(v).trim());
    if (subs.some(v => re.test(v))) n++;
  }
  return n;
};
D.subjects.forEach(s => { s.count = countFor(s.match); });
D.commonSubjects.items.forEach(s => { s.count = countFor(s.match); });

/* ── 片段渲染 ─────────────────────────────────────────────── */
const levelChips = levels => ['G1', 'G2', 'G3']
  .map(g => `<span class="lv ${levels.includes(g) ? 'on' : ''}">${g}</span>`).join('');

const catLabel = { core: '核心科目', elective: '选修科目' };

const sourceRows = D.sources.map(s => `<tr>
  <td>${esc(s.label)}</td>
  <td class="soft" style="font-size:12.2px">${esc(s.covers)}</td>
  <td class="mid"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">链接</a></td>
  <td class="mid"><span class="tag ${s.grade === 'A' ? 'a' : 'b'}">${s.grade}</span></td>
</tr>`).join('\n');

const pgRows = D.pg.map(r => `<tr${r.note.includes('本届') ? ' style="background:var(--accent-bg)"' : ''}>
  <td class="num mid"><b>${esc(r.score)}</b></td>
  <td class="mid"><b>${esc(r.pg)}</b></td>
  <td class="mid">${esc(r.start)}</td>
  <td class="soft" style="font-size:12.6px">${esc(r.note)}</td>
</tr>`).join('\n');

const levelRows = D.levels.map(l => `<tr>
  <td class="mid"><b>${esc(l.k)}</b></td>
  <td class="soft">${esc(l.full)}</td>
  <td class="mid">${esc(l.old)}</td>
  <td class="num soft" style="font-size:12.2px">${esc(l.sec.trim())}</td>
  <td class="soft" style="font-size:12.4px">${esc(l.use)}</td>
</tr>`).join('\n');

const moreRows = D.moreDemanding.rows.map(r => `<tr>
  <td class="mid">${esc(r.start)}</td>
  <td class="mid">${esc(r.psleStandard)}</td>
  <td class="mid">${esc(r.psleFoundation)}</td>
  <td class="mid"><b>${esc(r.option)}</b></td>
</tr>`).join('\n');

const humRows = D.humanitiesUpgrade.rows.map(r => `<tr>
  <td class="mid">${esc(r.s1Level)}</td>
  <td>${esc(r.s1Subjects)}</td>
  <td class="mid"><b>${esc(r.option)}</b></td>
</tr>`).join('\n');

/* 科目表：核心在前，选修在后；每组按开课校数降序 */
const subjectSection = cat => {
  const list = D.subjects.filter(s => s.cat === cat).sort((a, b) => b.count - a.count);
  return list.map(s => `<tr>
    <td><b>${esc(s.zh)}</b><br><span class="soft" style="font-size:11.6px">${esc(s.en)}</span></td>
    <td class="mid"><span class="badge ${s.compulsory.includes('必修') ? 'badge-moe' : ''}">${esc(s.compulsory)}</span></td>
    <td class="mid">${levelChips(s.levels)}</td>
    <td class="num mid soft" style="font-size:12px">${esc(Object.values(s.codes).join(' / '))}</td>
    <td class="num mid"><b>${s.count}</b></td>
    <td class="soft" style="font-size:12.3px">${esc(s.note)}</td>
  </tr>`).join('\n');
};

const commonRows = D.commonSubjects.items.map(s => `<tr>
  <td><b>${esc(s.zh)}</b><br><span class="soft" style="font-size:11.6px">${esc(s.en)}</span></td>
  <td class="num mid"><b>${s.count}</b></td>
</tr>`).join('\n');

const gradeRows = D.sec.grades.map(g => `<tr>
  <td class="mid"><b>${esc(g.level)}</b></td>
  <td class="num">${esc(g.grades)}</td>
</tr>`).join('\n');
const mapG3Rows = D.sec.mapG3toG2.map(([a, b]) => `<tr><td class="num mid">${esc(a)}</td><td class="num mid">${esc(b)}</td></tr>`).join('\n');
const mapG2Rows = D.sec.mapG2toG1.map(([a, b]) => `<tr><td class="num mid">${esc(a)}</td><td class="num mid">${esc(b)}</td></tr>`).join('\n');

const jcCompRows = D.jc.composition.map(r => `<tr>
  <td class="num mid"><b>${esc(r.k)}</b></td>
  <td>${esc(r.v)}</td>
</tr>`).join('\n');
const jcGradeRows = D.jc.gradeReq.map(r => `<tr>
  <td>${esc(r.subject)}</td>
  <td class="mid"><b>${esc(r.grade)}</b></td>
</tr>`).join('\n');

const timeline = D.student.timeline.map(r => `<div class="step">
  <div class="no">${esc(r.year)}</div>
  <div class="t"><b>${esc(r.stage)}</b><span class="soft" style="font-size:12.8px">${esc(r.action)}</span></div>
</div>`).join('\n');

const planPoints = D.student.planPoints.map((p, i) => `<div class="pp">
  <div class="pp-no">${String(i + 1).padStart(2, '0')}</div>
  <div><b>${esc(p.t)}</b><p>${esc(p.d)}</p></div>
</div>`).join('\n');

const interestChips = D.student.interests.map(x => `<span class="chip hit">${esc(x)}</span>`).join('');

const toc = [
  ['s1', 'Full SBB 到底是什么'],
  ['s2', 'G1 / G2 / G3 与你的起点'],
  ['s3', '起点怎么定、级别怎么调'],
  ['s4', '科目全景：必修与选修'],
  ['s5', 'SEC 考试与等级'],
  ['s6', '四年后：JC 路径规划'],
  ['s7', '数据来源与边界'],
];

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="generator" content="psle-full-sbb/v1">
<title>全面科目编班 Full SBB 详解 · 科目、分级与 JC 路径</title>
<style>
${CSS}
.hb-hero{padding:34px 0 26px}
.hb-hero h1{font-size:27px;line-height:1.4;margin:8px 0 0}
.hb-hero .sub{margin-top:12px;max-width:760px}
.toc{display:flex;flex-wrap:wrap;gap:6px 15px;align-items:baseline}
.toc b{margin-right:2px}
.lv{display:inline-block;font-family:var(--mono);font-size:11px;padding:2px 6px;border-radius:4px;margin:1px;
  background:var(--chip);border:1px solid var(--line);color:var(--tx3)}
.lv.on{background:var(--accent-bg);border-color:var(--accent-line);color:var(--accent);font-weight:600}
.pp{display:flex;gap:13px;padding:12px 0;border-bottom:1px dashed var(--line)}
.pp:last-child{border-bottom:0}
.pp-no{font-family:var(--mono);font-size:12px;color:var(--accent);font-weight:600;flex:0 0 24px;padding-top:2px}
.pp b{display:block;font-size:14px}
.pp p{margin:3px 0 0;font-size:13px;color:var(--tx2);line-height:1.7}
.step{display:flex;gap:12px;padding:11px 0;border-bottom:1px dashed var(--line)}
.step:last-child{border-bottom:0}
.step .no{flex:0 0 52px;height:26px;border-radius:5px;background:var(--accent-bg);color:var(--accent);
  font-size:11px;font-family:var(--mono);font-weight:700;display:flex;align-items:center;justify-content:center}
.step .t{flex:1}
.step .t b{display:block;font-size:13.6px;margin-bottom:2px}
.hb-foot{margin-top:34px;padding-top:18px;border-top:1px solid var(--line);font-size:12.4px;color:var(--tx3);line-height:1.9}
.ext{border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:12px 0}
.scroll{overflow-x:auto}
</style>
</head>
<body>

<div class="hero hb-hero">
  <div class="wrap">
    <a class="backlink" href="index.html">← 返回学校看板</a>
    <div class="eyebrow">PSLE · 升学机制专题 · Full SBB</div>
    <h1>全面科目编班：不再分流之后，孩子四年怎么读<small>取消 Express / N(A) / N(T)，改按单科分 G1 / G2 / G3 —— 附全科目清单与 JC 路径规划</small></h1>
    <div class="sub">
      这一页讲三件事：<b>Full SBB 到底改了什么</b>、<b>每门科目是必修还是选修、能读哪一级</b>、
      以及<b>以本项目学生 abcd2（AL 18 / PG3 / PR）为例，四年后冲 JC 要怎么安排</b>。
      所有政策与考纲数字均来自 MOE / SEAB 官方页面，核验于 ${esc(D.verifiedAt)}。
    </div>
    <div class="profile">
      <div><div class="k">全面实施</div><div class="v">2024 年起</div></div>
      <div><div class="k">层级</div><div class="v">G1 / G2 / G3</div></div>
      <div><div class="k">SEC 首考</div><div class="v">${D.sec.firstYear} 年</div></div>
      <div><div class="k">JC 新门槛</div><div class="v">2028 起</div></div>
      <div><div class="k">科目总数</div><div class="v">${D.subjects.length} 类</div></div>
    </div>
  </div>
</div>

<div class="wrap">

<div class="toc">
  <b>目录</b>
${toc.map(([id, t], i) => `  <a href="#${id}">${'①②③④⑤⑥⑦'[i]} ${esc(t)}</a>`).join('\n')}
</div>

<div class="note" style="margin-top:20px">
<b>先纠正三个最常见的误解。</b>
① <b>Posting Group 不是新分流</b>——它只用于入学与起点定位，进校后按单科走班；
② <b>G3 不等于「好学生」</b>，只是该科读最高难度，孩子完全可能数学 G3、母语 G2；
③ <b>进了 PG3 也不是稳进 JC</b>——JC 从 2028 起要求 L1R4 ≤ 16 且全部 G3，其中人文组是硬性一块。
</div>

<section>
<h2 id="s1"><span class="n">01</span>Full SBB 到底是什么</h2>
<p class="lead">一句话：<b>把「一个学生整批按一个 stream 读」改成「每一科按自己的层级读」</b>。2024 年起，Express、N(A)、N(T) 三条源流取消。</p>

<div class="grid2">
  <div class="panel">
    <h4>取消之前</h4>
    <p class="soft" style="font-size:13.2px;margin:7px 0 0">一个 PSLE 总分 → 进 Express / N(A) / N(T) 之一 → <b>所有科目同一难度、同一班</b>，四年不变。某科强但另一科弱，只能一起迁就。</p>
  </div>
  <div class="panel">
    <h4>取消之后</h4>
    <p class="soft" style="font-size:13.2px;margin:7px 0 0">总分只决定<b>入学组别与起点层级</b>；进校后<b>按科目走班</b>，数学可以 G3、母语可以 G2，且可在合适节点上调或下调。</p>
  </div>
</div>

<div class="verdict">
<h3>四个关键词</h3>
<ul>
  <li><b>混合班（mixed form class）</b>：初中约 <b>1/3 课时</b>与不同背景的同学一起上 6 门共同课程；其余时间按科目层级走班。</li>
  <li><b>单科分层</b>：英语、母语、数学、科学、人文学科各有 G1 / G2 / G3，按能力就读。</li>
  <li><b>可升可降</b>：起点不是终点。校内表现、 aptitude 与兴趣都能成为上调依据；读不动也能下调以调整负荷。</li>
  <li><b>出口重算</b>：SEC（2027 首考）+ PSE（2028 起）统一录取，JC / Poly / ITE 门槛相应调整。</li>
</ul>
</div>

<p class="soft" style="font-size:12.6px">并非所有学校都实施 Full SBB：<b>IP 直通车学校、Crest / Spectra 等特殊课程校</b>因全校采用专门课程，不实施标准 Full SBB，但部分科目层面的灵活性仍可能适用。</p>
</section>

<section>
<h2 id="s2"><span class="n">02</span>G1 / G2 / G3 与你的起点</h2>
<p class="lead">G = General。三级分别对应原来的 N(T) / N(A) / Express 标准，考 SEC 时难度与给分方式都不同。</p>

<div class="scroll">
<table>
<thead><tr><th class="mid" style="width:8%">层级</th><th style="width:16%">全称</th><th class="mid" style="width:16%">对应旧制</th><th style="width:26%">SEC 等级</th><th>适合</th></tr></thead>
<tbody>
${levelRows}
</tbody>
</table>
</div>
<p class="soft" style="font-size:12.4px">SEC 等级沿袭旧制：G1 用 A–E、G2 用 1–6、G3 用 A1–9，<b>标准没有降低</b>，只是换了个统一证书。</p>

<h3>总分决定起点：Posting Group 对照</h3>
<div class="scroll">
<table>
<thead><tr><th class="mid" style="width:18%">PSLE 总分</th><th class="mid" style="width:20%">Posting Group</th><th class="mid" style="width:16%">S1 起点层级</th><th>说明</th></tr></thead>
<tbody>
${pgRows}
</tbody>
</table>
</div>
<p class="soft" style="font-size:12.4px">高亮行是本届学生 abcd2 所在档。<b>起点是「多数科目」的层级</b>，不是所有科目都锁死——下一节讲怎么按单科调整。</p>
</section>

<section>
<h2 id="s3"><span class="n">03</span>起点怎么定、级别怎么调</h2>
<p class="lead">这里是最实用的部分：进了中学，哪些科目能往上调、靠什么调、什么时候调。</p>

<h3>上调：按单科 PSLE AL（英语 / 母语 / 数学 / 科学）</h3>
<div class="scroll">
<table>
<thead><tr><th class="mid" style="width:18%">起点层级</th><th class="mid" style="width:26%">PSLE 标准级</th><th class="mid" style="width:22%">PSLE 基础级</th><th class="mid">可选读</th></tr></thead>
<tbody>
${moreRows}
</tbody>
</table>
</div>
<div class="note">${esc(D.moreDemanding.note)}</div>

<h3>高级母语（HMTL）：2026 起改了规则</h3>
<div class="verdict">
<p style="margin:0;font-size:13.8px">${esc(D.hmtl.rule2026)}</p>
<p style="margin:8px 0 0;font-size:13.8px">${esc(D.hmtl.jcUse)}</p>
</div>
<div class="warnbox"><b>一个容易踩的坑：</b>${esc(D.hmtl.caveat)}</div>

<h3>人文学科：从 S2 起也能上调</h3>
<p class="soft" style="font-size:13px">${esc(D.humanitiesUpgrade.note)}</p>
<div class="scroll">
<table>
<thead><tr><th class="mid" style="width:24%">S1 人文层级</th><th style="width:40%">S1 读的内容</th><th class="mid">S2 起可选读</th></tr></thead>
<tbody>
${humRows}
</tbody>
</table>
</div>

<h3>下调：负荷太重可以调低</h3>
<p class="soft" style="font-size:13px">PSLE 某科读基础级、但整体够 G3 的孩子，可经学校同意把该科降到 G2；母语学习困难可降到 G1 / G2。入学后也可依表现与学校整体评估下调，把精力重新分配。</p>
</section>

<section>
<h2 id="s4"><span class="n">04</span>科目全景：必修与选修</h2>
<p class="lead">先分清两块：<b>初中的 6 门共同课程</b>（不分层级、一起上）与<b>按 G1/G2/G3 走班的科目</b>。下表列全 ${D.subjects.length} 类科目，"开课校数"是从全岛 ${RAW.length} 所中学的 SchoolFinder 科目字段现算。</p>

<h3>初中共同课程（mixed form class，约 1/3 课时）</h3>
<div class="scroll">
<table>
<thead><tr><th>科目</th><th class="mid" style="width:22%">全岛开课校数</th></tr></thead>
<tbody>
${commonRows}
</tbody>
</table>
</div>
<p class="soft" style="font-size:12.4px">${esc(D.commonSubjects.note)} 这几门在 SEC 里不都作为分级考试科目；其中美术、音乐、设计与工艺到高中可作为选修继续读。</p>

<h3>核心科目（高中必修，按层级走班）</h3>
<div class="scroll">
<table>
<thead><tr>
  <th style="width:22%">科目</th>
  <th class="mid" style="width:13%">性质</th>
  <th class="mid" style="width:13%">可考级别</th>
  <th class="mid" style="width:16%">SEC 代码</th>
  <th class="mid" style="width:9%">开课校</th>
  <th>要点</th>
</tr></thead>
<tbody>
${subjectSection('core')}
</tbody>
</table>
</div>

<h3>选修科目</h3>
<div class="scroll">
<table>
<thead><tr>
  <th style="width:22%">科目</th>
  <th class="mid" style="width:13%">性质</th>
  <th class="mid" style="width:13%">可考级别</th>
  <th class="mid" style="width:16%">SEC 代码</th>
  <th class="mid" style="width:9%">开课校</th>
  <th>要点</th>
</tr></thead>
<tbody>
${subjectSection('elective')}
</tbody>
</table>
</div>

<div class="note">
<b>怎么读这张表。</b>「开课校数」来自 MOE SchoolFinder 当前 cohort 的科目清单（写法变体已归并），
反映<b>全岛有多少学校提供</b>，不是录取难度、也不是好坏。数量少的科目（如生物技术、戏剧）意味着<b>选择前要先确认目标学校是否开设</b>。
「SEC 代码」为 2027 年考生用代码；带"应用"字样的科目多为获批学校才开，部分即将停考，已在要点里注明。
</div>
</section>

<section>
<h2 id="s5"><span class="n">05</span>SEC 考试与等级</h2>
<p class="lead">2027 年起，N(T)、N(A)、O-Level 三张考卷合并为一张 <b>${esc(D.sec.name)}</b>，按学生实际修读的层级出卷。</p>

<div class="grid2">
  <div class="panel">
    <h4>等级制（沿用旧标准）</h4>
    <table style="margin:9px 0 0">
    <thead><tr><th class="mid">层级</th><th>等级</th></tr></thead>
    <tbody>${gradeRows}</tbody>
    </table>
    <p class="soft" style="font-size:12px;margin:8px 0 0">${esc(D.sec.award)}</p>
  </div>
  <div class="panel">
    <h4>考试时间</h4>
    <p class="soft" style="font-size:13px;margin:8px 0 0">${esc(D.sec.timing)}</p>
    <p class="soft" style="font-size:12.4px;margin:8px 0 0">一张证书上会同时显示不同层级的科目——类似 A-Level 的 H1/H2/H3。</p>
  </div>
</div>

<h3>跨层级怎么换算</h3>
<p class="soft" style="font-size:13px">${esc(D.sec.mapNote)}</p>
<div class="grid2">
  <div class="panel">
    <h4>G3 → G2</h4>
    <table style="margin:9px 0 0"><thead><tr><th class="mid">G3</th><th class="mid">折 G2</th></tr></thead><tbody>${mapG3Rows}</tbody></table>
  </div>
  <div class="panel">
    <h4>G2 → G1</h4>
    <table style="margin:9px 0 0"><thead><tr><th class="mid">G2</th><th class="mid">折 G1</th></tr></thead><tbody>${mapG2Rows}</tbody></table>
  </div>
</div>
<p class="soft" style="font-size:12.4px">例如 G3 数学 A1 在合并计分时按 G2 的 1 分算；G2 的 1–3 分再折成 G1 的 A。这个映射只服务升学算分，不改变孩子实际考到的等级。</p>
</section>

<section>
<h2 id="s6"><span class="n">06</span>四年后：JC 路径规划</h2>
<p class="lead">以本项目学生 <b>${esc(D.student.label)}</b> 为例。兴趣清单：${interestChips}</p>

<h3>规则先行：2028 起 JC 门槛</h3>
<div class="verdict">
<h3>${esc(D.jc.name)}</h3>
<p style="font-size:15px;margin:0"><b>${esc(D.jc.threshold)}</b></p>
<p style="font-size:13.3px;margin:8px 0 0">${esc(D.jc.changed)} ${esc(D.jc.allG3)}</p>
</div>

<div class="scroll">
<table>
<thead><tr><th class="mid" style="width:10%">组成</th><th>计什么</th></tr></thead>
<tbody>${jcCompRows}</tbody>
</table>
</div>
<div class="warnbox">
<b>${esc(D.jc.groupRule)}</b><br>
${esc(D.jc.warning)}
</div>

<h3>单科硬门槛（不达标则计分无效）</h3>
<div class="scroll">
<table>
<thead><tr><th style="width:60%">科目</th><th class="mid">要求</th></tr></thead>
<tbody>${jcGradeRows}</tbody>
</table>
</div>
<p class="soft" style="font-size:12.4px">${esc(D.jc.bonus)}</p>

<h3>以 abcd2 为例的计分组合（示意）</h3>
<div class="ext">
  <p style="margin:0;font-size:13.4px;line-height:1.9">
    <b>L1</b> = 英语（或高华，取较低值）｜
    <b>R1</b> = 人文 G3（<span class="tight">需补</span>）｜
    <b>R2</b> = 高级数学或纯理科 G3｜
    <b>R3</b> = 另一门理科 G3｜
    <b>R4</b> = Computing / D&amp;T / 营养食品 G3
  </p>
  <p class="soft" style="margin:8px 0 0;font-size:12.4px">五科各按 A1=1、A2=2…C6=6 计，总和 ≤16 即达 JC 学术门槛；再减最多 3 分 CCA 加分用于派位。这是组合示意，不是预测分数。</p>
</div>

<h3>四年时间线</h3>
${timeline}

<h3>五条具体建议</h3>
${planPoints}

<div class="note">
<b>起点判断：</b>${esc(D.student.startLevel)}
</div>
</section>

<section>
<h2 id="s7"><span class="n">07</span>数据来源与边界</h2>
<p class="lead">本页所有政策、考纲、门槛均来自官方页面；开课校数为本项目对官方科目清单的现算统计。</p>

<div class="scroll">
<table>
<thead><tr><th style="width:34%">来源</th><th>覆盖内容</th><th class="mid" style="width:8%">链接</th><th class="mid" style="width:8%">等级</th></tr></thead>
<tbody>${sourceRows}</tbody>
</table>
</div>

<div class="warnbox">
<b>三条边界，写在这里免得误用：</b><br>
① 本页讲<b>机制与规则</b>，不构成录取保证；门槛会随年份调整，以官方最新公告为准；<br>
② 「开课校数」是当前 cohort 快照，<b>下一届可能变化</b>，选科前务必向目标学校确认；<br>
③ 四年后的 JC 规划是<b>基于当前规则的推演</b>，政策、学校开科、孩子兴趣都可能变——把它当作「现在该注意什么」的清单，而不是既定路线。
</div>

<div class="hb-foot">
<b>相关页面</b>　<a href="index.html">学校看板</a>
｜ <a href="map.html">通勤地图</a>
｜ <a href="cohort.html">考生人数</a>
｜ <a href="guide.html">家长手册</a>
｜ <a href="openhouse.html">开放日</a> ｜ <a href="plans.html">志愿方案</a><br>
<b>生成信息</b>　本页由 <code>scripts/build-full-sbb.cjs</code> 从 <code>data/full-sbb.json</code> 与
<code>data/schools.json</code> 生成，数据核验 ${esc(D.verifiedAt)}。<br>
<b>免责</b>　个人研究工具输出，非 MOE 官方建议。政策以官方最新公告为准。
</div>

</div>
</body>
</html>
`;

fs.writeFileSync(P('docs/full-sbb.html'), html, 'utf8');
console.log(`▸ 输出 docs/full-sbb.html（${(html.length / 1024).toFixed(0)}KB）`);
console.log(`  科目 ${D.subjects.length} 类（核心 ${D.subjects.filter(s => s.cat === 'core').length} / 选修 ${D.subjects.filter(s => s.cat === 'elective').length}）+ 共同课程 ${D.commonSubjects.items.length} 门`);
console.log(`  来源 ${D.sources.length} 条（A 级 ${D.sources.filter(s => s.grade === 'A').length}）· 开课校数基于 ${RAW.length} 校现算`);
