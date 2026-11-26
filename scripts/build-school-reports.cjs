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
const Nav = require('../lib/nav.cjs');
const Snapshot = require('../lib/snapshot.cjs');
const Iso = require('../lib/iso.cjs');
const Subjects = require('../lib/subjects.cjs');

const BASE = path.resolve(__dirname, '..');
const P = (...a) => path.join(BASE, ...a);

/* 色板单独维护：tokens.css 在前，组件样式在后 */
const CSS = fs.readFileSync(P('scripts/tpl/tokens.css'), 'utf8') + fs.readFileSync(P('scripts/tpl/school.css'), 'utf8');
const SCHOOLS = JSON.parse(fs.readFileSync(P('docs/data/schools.json'), 'utf8')).schools;
const NET = JSON.parse(fs.readFileSync(P('data/network.json'), 'utf8'));
/* 学生画像按 profile 的 student 字段逐份加载；未指定的沿用默认 abc1。
   2026-11-25 复盘：39 份校报的叙述段按 abc4（AL15）写，动态卡片却一律
   按 abc1（AL17）算，余量差 2 分 —— 根因就是这里原来只 load 一次。 */
const Student = require('../lib/student.cjs');
/* 步行路网数据（scripts/walk-dist.cjs 产出）。缺失时降级为地铁单源。 */
const Walk = require('../lib/walk.cjs');
const graph = Iso.buildGraph(NET);
const CTX = new Map();

/* 学生专属事实源：评分快照（科目/CCA 命中、余量、通勤）与公交路网。
   2026-11-26 起 54 份校报全部按 abcd2 生成，这两份数据必须与画像同 id，
   否则报告就会出现「叙述说命中、动态说没命中」这类静默矛盾。 */
function loadStudentData(id, stu) {
  const recPath = P(`data/_recommend-${id}.json`);
  if (!fs.existsSync(recPath)) {
    console.error(`\n✗ 缺少 ${recPath}。请先跑 STUDENT=${id} node scripts/score-candidates.cjs。\n`);
    process.exit(1);
  }
  const REC = JSON.parse(fs.readFileSync(recPath, 'utf8'));
  if (REC.student && REC.student.id !== id) {
    console.error(`\n✗ ${recPath} 的 student.id=${REC.student.id}，与 ${id} 不一致。\n`);
    process.exit(1);
  }
  const REC_MAP = new Map([...(REC.pool || []), ...(REC.outOfReach || []), ...(REC.singleSex || [])]
    .map(x => [x.slug, x]));

  let BUS = null, BUS_MAP = new Map();
  if (stu.commuteMode === 'bus') {
    const busPath = P(`data/bus-${id}.json`);
    if (!fs.existsSync(busPath)) {
      console.error(`\n✗ commuteMode=bus 需要 ${busPath}。请先跑 STUDENT=${id} node scripts/collect-bus.cjs。\n`);
      process.exit(1);
    }
    BUS = JSON.parse(fs.readFileSync(busPath, 'utf8'));
    if (BUS.studentId !== id) {
      console.error(`\n✗ ${busPath} 的 studentId=${BUS.studentId}，与 ${id} 不一致。\n`);
      process.exit(1);
    }
    BUS_MAP = new Map((BUS.rows || []).map(x => [x.slug, x.bus || null]));
  }
  return { REC, REC_MAP, BUS, BUS_MAP };
}

function contextFor(id) {
  if (CTX.has(id)) return CTX.get(id);
  const stu = Student.load(id);
  const origin = stu.home.coords;
  if (!origin) {
    console.error(`\n✗ data/students/${id}.json 缺少 home.lat/lon。\n` +
      '  单校报告的通勤时间按学生家出发计算，必须有坐标。\n');
    process.exit(1);
  }
  const stationMin = Iso.solveFrom(graph, origin).stationMin;
  const commutes = Iso.timeToSchools(graph, stationMin, SCHOOLS);
  const commute = Object.fromEntries(commutes.map(c => [c.school.slug, c]));
  const walk = Walk.load(id);
  if (!walk) console.warn(`\n⚠️ 未找到 data/walk-${id}.json，${id} 的校报步行列会缺失。`);
  const extra = loadStudentData(id, stu);
  const ctx = { STU: stu, SCORE: stu.al, ORIGIN: origin, COMMUTE: commute, WALK: walk, ...extra };
  CTX.set(id, ctx);
  return ctx;
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
function render(pf, ctx) {
  const { STU, SCORE, COMMUTE, WALK, REC, REC_MAP, BUS, BUS_MAP } = ctx;
  const sc = SCHOOLS.find(s => s.slug === pf.slug);
  if (!sc) throw new Error(`schools.json 里找不到 ${pf.slug}`);
  const pg = pf.pg || 3;
  const g = pgRow(sc, pg);
  const cm = COMMUTE[pf.slug] || {};
  const cmx = Walk.merge(WALK ? WALK.bySlug.get(pf.slug) : null, cm.minutes);
  const margin = g && g.max != null ? g.max - SCORE : null;
  const rec = REC_MAP.get(pf.slug) || null;
  const bus = BUS ? (BUS_MAP.get(pf.slug) || null) : null;
  const busMode = STU.commuteMode === 'bus';

  /* 步行 / 地铁两列：争议项给区间并注明两家引擎分歧，不取平均 */
  const walkText = !cmx || cmx.walkMin == null ? '—'
    : (cmx.walkRange ? `${cmx.walkRange[0]}–${cmx.walkRange[1]} 分钟（争议）` : `${cmx.walkMin} 分钟`);
  const mrtText = !cmx || cmx.mrtMin == null ? '—' : `${cmx.mrtMin} 分钟`;
  const fastest = !cmx ? '—' : (cmx.best === 'walk' ? '步行' : '地铁');

  const busOver = busMode && bus && bus.total > STU.maxCommuteMin;
  const busText = !busMode ? null
    : (bus ? `${bus.total} 分钟（${bus.svc} 路 · 下车步行 ${bus.walkFromStopMin} 分钟${busOver ? `；超出 ${STU.maxCommuteMin} 分钟上限` : ''}）` : '无直达车');
  const scoreBasis = busMode
    ? (bus ? { min: bus.total, how: busOver ? '公交·超限' : '公交' } : { min: null, how: '—' })
    : (cmx && cmx.minutes != null ? { min: cmx.minutes, how: fastest } : { min: null, how: '—' });

  const profileCells = [
    { k: g?.kind === 'IP' ? 'IP 录取区间' : `PG${pg} 区间（${sc.cop?.year || 2025}）`, v: fmtRange(g) },
    { k: `AL ${SCORE} 余量`, v: margin == null ? '—' : (margin >= 0 ? `+${margin} 分` : `${margin} 分（高于上限）`) },
    { k: `步行（自 ${STU.home.postal}）`, v: walkText },
    ...(busMode ? [{ k: `公交（${STU.boardingStop ? STU.boardingStop.code : '指定站'} 上车）`, v: busText }] : []),
    { k: busMode ? '地铁（仅参考）' : '地铁', v: mrtText },
    { k: '通勤计分', v: scoreBasis.min != null ? `${scoreBasis.min} 分钟（${scoreBasis.how}）` : '—' },
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
    /* 缺口分三种，不能混为一谈：没有存档 / 官方明确说明该年无 S1 派位（Outram 2024，
       页上 0–0 只是占位，COP 定义上不存在）/ 真正的坏值。说成「无存档」会让人以为
       再去抓一次就有；说成「坏值」则掩盖了「那一年压根没招生」这个关键事实。 */
    const miss = trendCells.filter(c => !c.v).map(c => {
      const v = sc.copHistory && sc.copHistory[String(c.y)];
      if (v && v.status === 'anomaly') {
        return v.note && /无 S1 学生派位/.test(v.note)
          ? `${c.y} 年（MOE 存档页注明该年无 S1 学生派位，故无 COP；0–0 仅为占位）`
          : `${c.y} 年（存档页显示 0–0，坏值，已弃用）`;
      }
      return `${c.y} 年（没有可用存档）`;
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
  <div style="flex:1;border:1px solid var(--line);border-radius:7px;padding:7px 11px;background:var(--surface)">
    <div style="font-size:10.5px;color:var(--tx3);letter-spacing:.4px">${c.y}</div>
    <div style="font-family:var(--mono);font-size:15px;font-weight:600;margin-top:2px">${c.v ? `${c.v.min}–${c.v.max}` : '?'}</div>
  </div>`).join('\n')}
</div>
<p style="margin:0 0 6px;font-size:13px">
${first.y} → ${last.y}：<b>上端 ${fmtD(dMax)}</b>（上端 = 录取门槛，变大表示变宽松）、<b>下端 ${fmtD(dMin)}</b>（下端 = 当年最强的那名考生）。</p>
<p class="soft" style="font-size:12.4px;margin:0">
2024／2025 年值来自 <b>MOE SchoolFinder 线上页面</b>（改版后直接公开相邻两届，官方 A 级）；更早年份来自 <b>Wayback 存档的 MOE SchoolFinder 页面</b>（同为官方内容，不是二手整理表）。
${miss ? `「?」= ${miss}——不是「该年为 0 分」。` : ''}${vac}</p>
</div>`;
  }

  /* ── 开设科目 + 强项/特色高亮（2026-11-24 批量新增）─────────────
     判定逻辑在 lib/subjects.cjs：特色=全岛开课校数<=40，强项=校方 ALP/LLP 点名学科。
     两项都是客观、可复核的事实标注，不代替「这个科目好不好」的主观判断。 */
  const SP = Subjects.subjectProfile(pf.slug);
  let subjectBlock = '';
  if (SP.subjectsFound) {
    const chipCls = i => i.strong && i.rare ? ' both' : i.strong ? ' strong' : i.rare ? ' rare' : '';
    const badge = i => i.strong && i.rare ? '<span class="sbadge sr">强·特</span>'
      : i.strong ? '<span class="sbadge s">强项</span>'
      : i.rare ? '<span class="sbadge r">特色</span>' : '';
    const chips = SP.items.map(i =>
      `<span class="subj-chip${chipCls(i)}">${esc(i.name)}${badge(i)}</span>`).join('\n');
    const strongList = SP.items.filter(i => i.strong).map(i => i.name);
    const rareList = SP.items.filter(i => i.rare).map(i => i.name);
    const progList = SP.programmes.length
      ? `<p class="soft" style="font-size:12.4px;margin:10px 0 0"><b>校方列出的重点／选修项目：</b>${SP.programmes.map(esc).join('　·　')}</p>`
      : '';
    subjectBlock = `
<div class="note subjects-block">
<b>开设科目（SchoolFinder，2026-11 官方快照）</b>
<p class="soft" style="font-size:12.4px;margin:6px 0 10px">
这是<b>本届在读学生</b>实际开设的科目，下一届可能调整；列出科目≠组合一定排得出（还要看年级与选课组合）。当前cohort快照${SP.denom}所普通课程校参与统计。</p>
<div class="subject-chips">
${chips}
</div>
${progList}
<p class="soft" style="font-size:12.4px;margin:10px 0 0">
<b>高亮口径（客观标注，不代表好坏）：</b>
<span class="subj-chip strong strong-demo">强项示例</span> = 校方 ALP／LLP／选修项目名里点名的学科领域（本次命中 ${strongList.length} 项${strongList.length ? '：' + strongList.map(esc).join('、') : ''}）；
<span class="subj-chip rare rare-demo">特色示例</span> = 全岛 ≤${SP.rareMax}/${SP.denom} 所校开设的科目（本次 ${rareList.length} 项${rareList.length ? '：' + rareList.map(esc).join('、') : ''}）；
两者兼有标「强·特」。口径由 <code>lib/subjects.cjs</code> 统一判定，阈值随报告公开，便于复核。科目清单以 <b>MOE SchoolFinder</b>（官方一手，本届在读）为准；校方重点／选修项目同时出现在 SchoolFinder 与学校官网的 curriculum／programmes 页，各校官网来源见第八节。</p>
</div>`;
  }

  /* ── abcd2 画像匹配卡（2026-11-26 全量切换）────────────────
     所有判定从学生配置 + _recommend-abcd2.json 现算，不在模板里写校名。
     正文的叙述写于早期画像，数字已同步重算；这张卡是最终核对口径。 */
  const CCA_ZH = { Robotics: '机器人', AI: 'AI', Drama: '戏剧', Swimming: '游泳', Cooking: '烹饪' };
  const detail = (rec && rec.subjectHitDetail) || {};
  const subjRows = (STU.interests.subjects || STU.interests.academic || []).map(k => {
    const d = detail[k] || { exact: [], related: [], relatedNote: null };
    const exact = d.exact || [], related = d.related || [];
    const state = exact.length ? `<span class="tag a">命中</span>`
      : related.length ? `<span class="tag c">仅 G1</span>` : `<span class="tag b">未开设</span>`;
    const note = exact.length ? esc(exact.join(' / '))
      : related.length ? esc(related.join(' / ')) + (d.relatedNote ? `　<span class="soft">${esc(d.relatedNote)}</span>` : '')
        : '<span class="soft">MOE 本届登记里没有这一项</span>';
    return `<tr><td>${esc(k)}</td><td>${state}</td><td>${note}</td></tr>`;
  }).join('\n');
  const ccaHits = rec && Array.isArray(rec.ccaHits) ? rec.ccaHits : [];
  const ccaRows = (STU.interests.cca || []).map(k => {
    const zh = CCA_ZH[k] || k;
    const hit = ccaHits.includes(zh);
    return `<tr><td>${esc(k)}</td><td>${hit ? '<span class="tag a">命中</span>' : '<span class="tag b">未命中</span>'}</td><td class="soft">${hit ? 'MOE SchoolFinder 当前登记有对应社团；Sec 1 名额需开放日确认' : '当前登记里没有对应社团'}</td></tr>`;
  }).join('\n');
  const isPR = !!(STU.citizenship && STU.citizenship.status === 'PR');
  const marginText = margin == null ? '无可用区间'
    : margin >= 0 ? `余量 <b>+${margin} 分</b>` : `高于 PG3 上限 <b>${-margin} 分</b>（冲刺档）`;
  const busLine = busMode
    ? (bus
      ? `从 <b>${esc(STU.boardingStop ? STU.boardingStop.code : '指定站')} ${esc(STU.boardingStop ? STU.boardingStop.name : '')}</b> 上 ${esc(bus.svc)} 路、${esc(bus.hops)} 站到 <b>${esc(bus.stopName)}</b>、再步行 ${esc(bus.walkFromStopMin)} 分钟，合计 <b>${esc(bus.total)} 分钟</b>；地铁仅列作参考，不计分。满分线 ${esc(STU.commuteFullMarkMin)} 分钟、上限 ${esc(STU.maxCommuteMin)} 分钟。${busOver ? `<b>本校超出 ${esc(STU.maxCommuteMin)} 分钟上限，按家长口径不合格。</b>` : ''}`
      : `<b>该站没有到本校的不换乘公交</b>；地铁仅列作参考，不计分。`)
    : `通勤按${esc(STU.commuteMode)}口径计分，满分线 ${esc(STU.commuteFullMarkMin)} 分钟、上限 ${esc(STU.maxCommuteMin)} 分钟。`;
  const fitBlock = `
<div class="note fit-block" id="fit-abcd2">
<b>abcd2 画像匹配 · 自动核算</b>
<p style="font-size:13.4px;margin:8px 0 10px">
学生 <b>${esc(STU.label)}</b>｜<b>AL ${SCORE} / PG3</b>｜PG3 区间 <b>${esc(fmtRange(g))}</b>，${marginText}。
${isPR ? '身份 <b>PR</b>：S1 同分排序为公民 → PR → 国际生，同分输公民；政府／政府辅助中学学费约 S$580–700／月。' : ''}
</p>
<p style="font-size:13.4px;margin:0 0 12px">${busLine}</p>
<h4 style="margin:0 0 6px">学术兴趣（画像里 7 项科目，逐项对照本届开设科目）</h4>
<div style="overflow-x:auto"><table style="margin:0">
<thead><tr><th style="width:28%">兴趣科目</th><th style="width:14%">本校</th><th>对应科目 / 说明</th></tr></thead>
<tbody>${subjRows}</tbody></table></div>
<h4 style="margin:14px 0 6px">CCA 兴趣（按顺序：机器人 → AI → 戏剧 → 游泳 → 烹饪）</h4>
<div style="overflow-x:auto"><table style="margin:0">
<thead><tr><th style="width:28%">兴趣</th><th style="width:14%">本校</th><th>说明</th></tr></thead>
<tbody>${ccaRows}</tbody></table></div>
<p class="soft" style="font-size:12.4px;margin:10px 0 0">
判定口径：科目命中 = <code>data/schools.json</code> 的 MOE 本届登记；「仅 G1」= 只有 Computer Applications 等 G1 关联课，PG3 是否能修 G2/G3 需现场确认。CCA 命中 = MOE 当前登记的社团名称，不保证 Sec 1 有名额。<b>命中不等于录取保证</b>；本卡的分数与余量按 AL ${SCORE} 现算，取代正文里基于旧画像的 comparative 描述。</p>
</div>`;

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
<meta name="student" content="${esc(STU.id)}">
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
${fitBlock}
${trendBlock}
${subjectBlock}
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
${Snapshot.line()}<br>
<b>报告生成：</b>${pf.generatedAt || new Date().toISOString().slice(0, 10)}　·　数据口径：COP 为 ${sc.cop?.year || 2025} 年度 S1 Posting 结果，AL ${SCORE} 属 PG${pg}，只与同档学生竞争<br>
<b>通勤模型：</b>${busMode
    ? `<b>公交口径（${STU.id}）</b>：从 ${esc(STU.boardingStop ? `${STU.boardingStop.code} ${STU.boardingStop.name}` : '指定站')} 上车，只取下游方向、不换乘，下车后步行；与纯步行取较快者计分，地铁仅参考不计分（数据 <code>data/bus-${esc(STU.id)}.json</code> / <code>data/walk-${esc(STU.id)}.json</code>）。`
    : `步行 = 自 ${STU.home.postal} 出发的 <b>OSM 步行路网最短路径</b>（${WALK ? WALK.walkMetersPerMin : 80}m/min，OSRM foot profile；Valhalla pedestrian 交叉校验，两引擎分歧 &gt;1.4× 标「争议」并显示区间）；地铁 = MRT 站间 ${NET.params.rideMinPerStop} 分钟、换乘 ${NET.params.transferMin} 分钟、进站等车 ${NET.params.accessOverheadMin} 分钟 + 站到校步行；<b>两者取最快者用于通勤评分</b>。`}<br>
<b>相关页面：</b>${Nav.foot(null, '../')}<br>
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
    const ctx = contextFor(pf.student || 'abc1');
    const html = render(pf, ctx);
    const out = P('docs/reports', `school-${slug}.html`);
    fs.writeFileSync(out, html);
    const cm = ctx.COMMUTE[slug] || {};
    const cmx = Walk.merge(ctx.WALK ? ctx.WALK.bySlug.get(slug) : null, cm.minutes);
    const g = pgRow(SCHOOLS.find(s => s.slug === slug) || {}, pf.pg || 3);
    const busRow = ctx.BUS ? ctx.BUS_MAP.get(slug) : null;
    const label = ctx.STU.commuteMode === 'bus'
      ? (busRow ? `${busRow.total}min(公交 ${busRow.svc})` : '无直达公交')
      : (!cmx ? '—' : `${cmx.minutes ?? '—'}min(${cmx.best === 'walk' ? '步行' : '地铁'}${cmx.walkDisputed ? '·争议' : ''})`);
    console.log(`✓ ${slug.padEnd(34)} ${(html.length / 1024).toFixed(0)}KB  PG3 ${fmtRange(g)}  通勤 ${label}`);
    built++;
  } catch (e) {
    console.error(`✗ ${slug}: ${e.message}`);
    failed++;
  }
}

console.log(`\n生成 ${built} 份${failed ? `，失败 ${failed} 份` : ''}`);
process.exit(failed ? 1 : 0);
