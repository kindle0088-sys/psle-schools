#!/usr/bin/env node
/**
 * 单校深度报告生成器
 *
 * 输入
 *   data/school-profiles/<slug>.json   每校的分析性内容（人工撰写）
 *   docs/data/schools.json             硬数据（COP / CCA / DSA / 科目 / 地址）
 *   data/network.json                  MRT 网络（算通勤）
 *   scripts/tpl/school.css             共享样式
 *
 * 输出
 *   docs/reports/school-<slug>.html
 *
 * 用法
 *   node scripts/build-school-reports.cjs                # 生成全部
 *   node scripts/build-school-reports.cjs <slug> [...]   # 只生成指定校
 *   node scripts/build-school-reports.cjs --list         # 列出可生成的校
 */
const fs = require('fs');
const path = require('path');
const Iso = require('../lib/iso.cjs');

const BASE = path.resolve(__dirname, '..');
const P = (...a) => path.join(BASE, ...a);

const CSS = fs.readFileSync(P('scripts/tpl/school.css'), 'utf8');
const SCHOOLS = JSON.parse(fs.readFileSync(P('docs/data/schools.json'), 'utf8')).schools;
const NET = JSON.parse(fs.readFileSync(P('data/network.json'), 'utf8'));
const POOL = JSON.parse(fs.readFileSync(P('data/_student-pool.json'), 'utf8'));

const SCORE = POOL.student.score;          // 17
const ORIGIN = POOL.origin;                // 邮编 828765 的坐标

const graph = Iso.buildGraph(NET);
const stationMin = Iso.solveFrom(graph, ORIGIN).stationMin;
const commutes = Iso.timeToSchools(graph, stationMin, SCHOOLS);
const COMMUTE = Object.fromEntries(commutes.map(c => [c.school.slug, c]));

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── 取该校 PG3（或对应档位）的录取区间 ──────────────────────────
function pgRow(sc, pg) {
  const rows = sc.cop?.rows || [];
  if (!rows.length) return null;
  const only = rows.length === 1 && (rows[0].kind === 'IP' || /Integrated/i.test(rows[0].label || ''));
  if (only) return { ...rows[0].nonAff, label: rows[0].label, kind: 'IP' };
  const want = 'Posting Group ' + pg;
  const r = rows.find(x => x.label === want);
  if (!r) return null;
  const v = r.nonAff || r.aff;
  return v ? { ...v, label: r.label, kind: r.kind, isAff: !r.nonAff } : null;
}

function fmtRange(v) {
  if (!v) return 'N/A';
  const base = v.min === v.max ? String(v.min) : `${v.min} – ${v.max}`;
  return v.markMax ? `${base} (${v.markMax})` : base;
}

// ── 渲染 ────────────────────────────────────────────────────────
function render(pf) {
  const sc = SCHOOLS.find(s => s.slug === pf.slug);
  if (!sc) throw new Error(`schools.json 里找不到 ${pf.slug}`);
  const pg = pf.pg || 3;
  const g = pgRow(sc, pg);
  const cm = COMMUTE[pf.slug] || {};
  const margin = g && g.max != null ? g.max - SCORE : null;

  const profileCells = [
    { k: g?.kind === 'IP' ? 'IP 录取区间' : `PG${pg} 区间（${sc.cop?.year || 2025}）`, v: fmtRange(g) },
    { k: `AL ${SCORE} 余量`, v: margin == null ? '—' : (margin >= 0 ? `+${margin} 分` : `${margin} 分`) },
    { k: `通勤（自 ${POOL.student.postal}）`, v: cm.minutes != null ? `约 ${cm.minutes} 分钟` : '—' },
    ...(pf.profileExtra || []),
  ];

  const toc = [
    '30 秒判断', '学校底色与校史', '学业与升学出路', '旗舰项目',
    'CCA 全解析', '真实声音', '开放日必问清单', '数据来源与可信度',
  ];

  const checklist = (pf.checklist || []).map(t => `<li>${t}</li>`).join('\n');

  const srcRows = (pf.sources || []).map(s =>
    `<tr><td><b>${s.label}</b></td><td>${s.value}</td><td class="mid"><span class="tag ${s.grade === 'A' ? 'a' : s.grade === 'B' ? 'b' : 'c'}">${s.grade}</span></td></tr>`
  ).join('\n');

  const corrections = (pf.corrections || []).length
    ? `<h3>我剔除掉的错误信息</h3>
<p>网上流传的择校资料里，这所学校有几条被反复抄错的数字。我逐条回到一手来源核对过：</p>
<table>
<thead><tr><th style="width:34%">流传的说法</th><th>实际情况</th></tr></thead>
<tbody>
${pf.corrections.map(c => `<tr><td>${c.claim}</td><td>${c.truth}</td></tr>`).join('\n')}
</tbody>
</table>`
    : '';

  const heroSub = pf.heroSub || '';
  const eyebrow = `单校深度报告 · ${sc.area} · ${pf.kindLabel || '政府混校'}`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(pf.nameZh)} ${esc(sc.name)} · 单校深度报告</title>
<style>
${CSS}
</style>
</head>
<body>

<div class="hero">
  <div class="wrap">
    <a class="backlink" href="../index.html">← 返回学校看板</a>
    <div class="eyebrow">${esc(eyebrow)}</div>
    <h1>${esc(pf.nameZh)}<small>${esc(sc.name)}${pf.abbr ? '（' + esc(pf.abbr) + '）' : ''}</small></h1>
    <div class="sub">${heroSub}</div>
    <div class="profile">
${profileCells.map(c => `      <div><div class="k">${esc(c.k)}</div><div class="v">${esc(c.v)}</div></div>`).join('\n')}
    </div>
    <div class="addr">${esc(sc.address)}${pf.unitLabel || ''}${sc.nearStation ? `　·　最近站 ${esc(sc.nearStation.codes.join('/'))} ${esc(sc.nearStation.name)}，步行约 ${sc.nearStation.distM}m` : ''}</div>
  </div>
</div>

<div class="wrap">

<div class="toc">
  <b>目录</b>
${toc.map((t, i) => `  <a href="#s${i + 1}">${'①②③④⑤⑥⑦⑧'[i]} ${esc(t)}</a>`).join('\n')}
</div>

<div class="note" style="margin-top:20px">
<b>先说清楚这份报告怎么写的。</b>${pf.howWritten || '所有硬数据（COP、O-Level 成绩、CCA、科目、地址）来自 <b>MOE SchoolFinder 与学校官网</b>；教师与学生的具体言行来自 <b>官方或可核到出处的报道</b>；网络评论单独标注并标明样本量。<b>凡是查不到、或官网自己没写全的，我直接标出来，不用二手软文填空。</b>'}
</div>

${pf.s1}
${pf.s2}
${pf.s3}
${pf.s4}
${pf.s5}
${pf.s6}

<!-- ============ 7 ============ -->
<section>
<h2 id="s7"><span class="n">07</span>开放日必问清单</h2>
<p class="lead">${pf.checklistLead || '带着这几条去开放日，比听宣讲会有用。每一条都对应一个光看资料无法判断的点。'}</p>
<ol class="checklist">
${checklist}
</ol>
</section>

<!-- ============ 8 ============ -->
<section>
<h2 id="s8"><span class="n">08</span>数据来源与可信度</h2>
<p class="lead">A 级＝官方一手（MOE、学校官网、官方文件）；B 级＝权威二手（主流媒体、官方平台报道）；C 级＝网络整理，需现场核实。</p>
<table>
<thead><tr><th style="width:34%">内容</th><th>来源</th><th style="width:52px">可信度</th></tr></thead>
<tbody>
${srcRows}
</tbody>
</table>
${corrections}
</section>

<div class="foot">
<b>报告生成：</b>${pf.generatedAt || new Date().toISOString().slice(0, 10)}　·　数据口径：COP 为 ${sc.cop?.year || 2025} 年度 S1 Posting 结果，AL ${SCORE} 属 PG${pg}，只与同档学生竞争<br>
<b>通勤模型：</b>MRT 站间 ${NET.params.rideMinPerStop} 分钟、换乘 ${NET.params.transferMin} 分钟、进站等车 ${NET.params.accessOverheadMin} 分钟、步行 80m/min；不含巴士接驳，最近站步行 &gt;800m 的学校实际耗时更长<br>
<b>免责：</b>录取区间每年浮动，本报告只用于缩小考察范围，不构成志愿填报保证。开放日实地确认永远优先于任何二手资料。
</div>

</div>
</body>
</html>
`;
}

// ── 主流程 ──────────────────────────────────────────────────────
const PROFILE_DIR = P('data/school-profiles');
const args = process.argv.slice(2);

if (args.includes('--list')) {
  const files = fs.existsSync(PROFILE_DIR) ? fs.readdirSync(PROFILE_DIR).filter(f => f.endsWith('.json')) : [];
  console.log(`可用 profile（${files.length}）：`);
  files.forEach(f => console.log('  ' + f.replace(/\.json$/, '')));
  process.exit(0);
}

const wanted = args.filter(a => !a.startsWith('--'));
const files = fs.readdirSync(PROFILE_DIR).filter(f => f.endsWith('.json'));
let built = 0, failed = 0;

for (const f of files) {
  const slug = f.replace(/\.json$/, '');
  if (wanted.length && !wanted.includes(slug)) continue;
  try {
    const pf = JSON.parse(fs.readFileSync(path.join(PROFILE_DIR, f), 'utf8'));
    if (!pf.slug) pf.slug = slug;
    const html = render(pf);
    const out = P('docs/reports', `school-${slug}.html`);
    fs.writeFileSync(out, html);
    const cm = COMMUTE[slug] || {};
    const g = pgRow(SCHOOLS.find(s => s.slug === slug) || {}, pf.pg || 3);
    console.log(`✓ ${slug.padEnd(34)} ${(html.length / 1024).toFixed(0)}KB  PG3 ${fmtRange(g)}  通勤 ${cm.minutes ?? '—'}min`);
    built++;
  } catch (e) {
    console.error(`✗ ${slug}: ${e.message}`);
    failed++;
  }
}

console.log(`\n生成 ${built} 份${failed ? `，失败 ${failed} 份` : ''}`);
process.exit(failed ? 1 : 0);
