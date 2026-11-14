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
// 学生画像统一从配置读，不再依赖 analyze-student 的中间产物
const STU = require('../lib/student.cjs').load();

const SCORE = STU.al;
const ORIGIN = STU.home.coords;
if (!ORIGIN) {
  console.error(`\n✗ data/students/${STU.id}.json 缺少 home.lat/lon。\n` +
    '  单校报告的通勤时间按学生家出发计算，必须有坐标。\n' +
    '  填上坐标，或先跑 scripts/analyze-student.cjs 让 OneMap 地理编码一次。\n');
  process.exit(1);
}

const graph = Iso.buildGraph(NET);
const stationMin = Iso.solveFrom(graph, ORIGIN).stationMin;
const commutes = Iso.timeToSchools(graph, stationMin, SCHOOLS);
const COMMUTE = Object.fromEntries(commutes.map(c => [c.school.slug, c]));

/* 步行路网数据（scripts/walk-dist.cjs 产出）。缺失时降级为地铁单源。 */
const Walk = require('../lib/walk.cjs');
const WALK = Walk.load(STU.id);
if (!WALK) {
  console.warn('\n⚠️ 未找到 data/walk-' + STU.id + '.json，报告只显示地铁通勤。' +
    '\n   需要步行数据请先跑：node scripts/walk-dist.cjs\n');
}

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
  const cmx = Walk.merge(WALK ? WALK.bySlug.get(pf.slug) : null, cm.minutes);
  const margin = g && g.max != null ? g.max - SCORE : null;

  /* 步行 / 地铁两列：争议项给区间并注明两家引擎分歧，不取平均 */
  const walkText = !cmx || cmx.walkMin == null ? '—'
    : (cmx.walkRange ? `${cmx.walkRange[0]}–${cmx.walkRange[1]} 分钟（争议）` : `${cmx.walkMin} 分钟`);
  const mrtText = !cmx || cmx.mrtMin == null ? '—' : `${cmx.mrtMin} 分钟`;
  const fastest = !cmx ? '—' : (cmx.best === 'walk' ? '步行' : '地铁');

  const profileCells = [
    { k: g?.kind === 'IP' ? 'IP 录取区间' : `PG${pg} 区间（${sc.cop?.year || 2025}）`, v: fmtRange(g) },
    { k: `AL ${SCORE} 余量`, v: margin == null ? '—' : (margin >= 0 ? `+${margin} 分` : `${margin} 分`) },
    { k: `步行（自 ${STU.home.postal}）`, v: walkText },
    { k: '地铁', v: mrtText },
    { k: '通勤计分', v: cmx && cmx.minutes != null ? `${cmx.minutes} 分钟（${fastest}）` : '—' },
    ...(pf.profileExtra || []),
  ];

  /* ── PG3 三年走向 ────────────────────────────────────────
     当年值来自 SchoolFinder 线上页面，历史值来自 Wayback 存档（官方内容）。
     缺年用 ? 占位而不是跳过 —— 跳过会让「2023 → 2025」看起来像连续两年。 */
  const HY = [2023, 2024, 2025];
  const pg3Now = (sc.cop?.rows || []).find(r => r.label === 'Posting Group 3');
  const histVal = y => {
    if (y === (sc.cop?.year || 2025)) return pg3Now && pg3Now.nonAff ? pg3Now.nonAff : null;
    const v = sc.copHistory && sc.copHistory[String(y)];
    return v && v.status === 'ok' ? v.pg3 : null;
  };
  const trendCells = HY.map(y => ({ y, v: histVal(y) }));
  let trendBlock = '';
  if (trendCells.filter(c => c.v).length >= 2) {
    const first = trendCells.find(c => c.v);
    const last = [...trendCells].reverse().find(c => c.v);
    const dMax = last.v.max - first.v.max;   // 上端 = 录取门槛，变大 = 变宽松
    const dMin = last.v.min - first.v.min;   // 下端 = 当年最强的那名考生
    const fmtD = n => (n === 0 ? '持平' : (n > 0 ? `+${n} 分` : `${n} 分`));
    /* 缺口分两种，不能混为一谈：没有存档 vs 存档页本身是坏值（Outram 2024 显示 0–0）。
       后者是「数据存在但不可用」，说成「无存档」会让人以为再去抓一次就有。 */
    const miss = trendCells.filter(c => !c.v).map(c => {
      const v = sc.copHistory && sc.copHistory[String(c.y)];
      return v && v.status === 'anomaly'
        ? `${c.y} 年（存档页显示 0–0，坏值，已弃用）`
        : `${c.y} 年（没有可用存档）`;
    }).join('、');
    const vac = sc.copFlags && sc.copFlags.PG1
      ? '<br>另外，MOE 用 <code>*</code> 标记该校 <b>PG1 档在 S1 posting 结束后仍有学额</b>——说明最低档没招满、学校整体不紧张（但不代表 PG3 门槛会降）。'
      : '';
    trendBlock = `
<div class="note">
<b>PG3 录取区间：${first.y} → ${last.y} 的走向</b>
<!-- 用三张卡片而不是表格：表格在 .note 里表头与数值列宽对不齐（实测过一次），
     而且只有一行数据也不需要表头行。 -->
<div style="display:flex;gap:9px;align-items:stretch;margin:11px 0 9px">
${trendCells.map((c, i) => `${i ? '  <div style="align-self:center;color:var(--tx3);font-size:14px">→</div>' : ''}
  <div style="flex:1;border:1px solid var(--line);border-radius:7px;padding:7px 11px;background:rgba(255,255,255,.55)">
    <div style="font-size:10.5px;color:var(--tx3);letter-spacing:.4px">${c.y}</div>
    <div style="font-family:var(--mono);font-size:15px;font-weight:600;margin-top:2px">${c.v ? `${c.v.min}–${c.v.max}` : '?'}</div>
  </div>`).join('\n')}
</div>
<p style="margin:0 0 6px;font-size:13px">
${first.y} → ${last.y}：<b>上端 ${fmtD(dMax)}</b>（上端 = 录取门槛，变大表示变宽松）、<b>下端 ${fmtD(dMin)}</b>（下端 = 当年最强的那名考生）。</p>
<p class="soft" style="font-size:12.4px;margin:0">
历史值来自 <b>Wayback 存档的 MOE SchoolFinder 页面</b>（官方内容，不是二手整理表）；${last.y} 年值来自 SchoolFinder 线上页面。
${miss ? `「?」= ${miss}——不是「该年为 0 分」。` : ''}${vac}</p>
</div>`;
  }

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
<!-- 生成器标记：验证器据此区分本模板产物与 v1 手写报告，避免对老报告套新断言 -->
<meta name="generator" content="psle-school-report/v2">
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
${trendBlock}
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
<b>通勤模型：</b>步行 = 自 ${STU.home.postal} 出发的 <b>OSM 步行路网最短路径</b>（${WALK ? WALK.walkMetersPerMin : 80}m/min，OSRM foot profile；Valhalla pedestrian 交叉校验，两引擎分歧 &gt;1.4× 标「争议」并显示区间）；地铁 = MRT 站间 ${NET.params.rideMinPerStop} 分钟、换乘 ${NET.params.transferMin} 分钟、进站等车 ${NET.params.accessOverheadMin} 分钟 + 站到校步行；<b>两者取最快者用于通勤评分</b>。不含巴士接驳，故步行路网不通、必须坐车的学校实际更慢<br>
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
    const cmx = Walk.merge(WALK ? WALK.bySlug.get(slug) : null, cm.minutes);
    const g = pgRow(SCHOOLS.find(s => s.slug === slug) || {}, pf.pg || 3);
    const label = !cmx ? '—'
      : `${cmx.minutes ?? '—'}min(${cmx.best === 'walk' ? '步行' : '地铁'}${cmx.walkDisputed ? '·争议' : ''})`;
    console.log(`✓ ${slug.padEnd(34)} ${(html.length / 1024).toFixed(0)}KB  PG3 ${fmtRange(g)}  通勤 ${label}`);
    built++;
  } catch (e) {
    console.error(`✗ ${slug}: ${e.message}`);
    failed++;
  }
}

console.log(`\n生成 ${built} 份${failed ? `，失败 ${failed} 份` : ''}`);
process.exit(failed ? 1 : 0);
