#!/usr/bin/env node
/**
 * 开放日汇总页（docs/openhouse.html）
 *
 * 定位：把 13 所深度报告学校的 2026 年开放日集中到一页，解决三个具体问题：
 *   ① 哪天有空、来得及去哪些（状态按构建当天算，不是写死的「已结束」）
 *   ② 每场到底有什么活动（有官方说明就列，没有就明写「未公布」，不编）
 *   ③ 信息互相矛盾的地方在哪（MOE 列表 vs 第三方日历 vs 学校公告）
 *
 * 数据：data/school-openhouses.json（日期时间与活动来源分级见该文件）
 *       docs/data/schools.json（地址 / 电话 / 官网，不在这里重复维护）
 *       data/_recommend-abc2.json（用于标出「方案 A 的 6 所里哪几所还赶得上」）
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const P = (...a) => path.join(BASE, ...a);
const CSS = fs.readFileSync(P('scripts/tpl/tokens.css'), 'utf8') + fs.readFileSync(P('scripts/tpl/plan.css'), 'utf8');

const OH = JSON.parse(fs.readFileSync(P('data/school-openhouses.json'), 'utf8'));
const SC = JSON.parse(fs.readFileSync(P('docs/data/schools.json'), 'utf8')).schools;
const bySlug = new Map(SC.map(s => [s.slug, s]));

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = n => String(n || '').replace(/ Secondary School| \(Secondary\)/, '');

/* ── 日期工具：一律按新加坡时区算，避免 CI/本机时区把「今天」算错一天 ── */
const sgtNow = () => {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
};
const TODAY = (() => { const t = sgtNow(); return `${t.y}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`; })();
const dayNum = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const weekday = iso => WD[new Date(iso + 'T00:00:00Z').getUTCDay()];
const md = iso => `${+iso.slice(5, 7)} 月 ${+iso.slice(8, 10)} 日`;

/** 相对状态：已结束 / 就是今天 / 还有 N 天 */
const statusOf = ev => {
  const d = dayNum(ev.date), t = dayNum(TODAY);
  if (d < t) return { key: 'past', label: '已结束', days: d - t };
  if (d === t) return { key: 'today', label: '就是今天', days: 0 };
  return { key: 'upcoming', label: `还有 ${d - t} 天`, days: d - t };
};
const timeOf = ev => (ev.start && ev.end ? `${ev.start}–${ev.end}` : ev.start ? `${ev.start} 起` : '时间未公布');
const modeOf = m => ({ physical: '实体', virtual: '线上', hybrid: '实体 + 线上' }[m] || m);
const regOf = r => ({
  none: '无需报名',
  required: '需报名',
  unknown: '未说明',
  'opens-2026-11-23': '报名 11-23 开放',
}[r] || r);

/* ── 摊平所有场次 ─────────────────────────────────────────── */
const rows = [];
for (const [slug, v] of Object.entries(OH.schools)) {
  const s = bySlug.get(slug);
  if (!s) throw new Error('学校不在 schools.json：' + slug);
  for (const ev of v.events || []) {
    rows.push({
      slug, name: s.name, short: short(s.name), school: v, ev,
      status: statusOf(ev),
      contact: s.contact || {},
      addr: s.address || '',
    });
  }
}
rows.sort((a, b) => dayNum(a.ev.date) - dayNum(b.ev.date) || String(a.ev.start).localeCompare(String(b.ev.start)));

const upcoming = rows.filter(r => r.status.key !== 'past');
const past = rows.filter(r => r.status.key === 'past');
const eOnly = Object.entries(OH.schools).filter(([, v]) => v.status === 'e-only').map(([k]) => k);
const noInfo = Object.entries(OH.schools).filter(([, v]) => !(v.events || []).length && v.status !== 'e-only').map(([k]) => k);
const noActivities = rows.filter(r => !(r.ev.activities || []).length);

/* ── 方案 A 的 6 所里，还赶得上哪几场 ─────────────────────── */
/** Bartley 不在 13 所名单里，但它出现在方案 A 里，电话从 schools.json 取 ——
    手写会写错（我第一版就写成 6281 6000，实际 6288 9013）。 */
const BARTLEY_PHONE = (SC.find(x => x.slug === 'bartley-secondary-school') || {}).contact?.phone || null;

const PLAN_A_NAMES = ['Greendale Secondary School', 'Compassvale Secondary School', 'Seng Kang Secondary School', 'North Vista Secondary School', 'Bendemeer Secondary School', 'Bartley Secondary School'];
const planAUpcoming = PLAN_A_NAMES.map(n => {
  const up = rows.find(x => x.name === n && x.status.key !== 'past');
  const pa = rows.filter(x => x.name === n && x.status.key === 'past').pop();   // 取最近一场已结束的
  return { name: n, hit: up || null, past: pa || null, any: rows.some(x => x.name === n) };
});

/* ── 渲染 ─────────────────────────────────────────────────── */
const statusTag = st => `<span class="st st-${st.key}">${st.label}</span>`;

const overviewRows = rows.map(r => `<tr>
  <td><b>${esc(r.short)}</b></td>
  <td class="num mid">${md(r.ev.date)}<br><span class="soft" style="font-size:11px">${weekday(r.ev.date)}</span></td>
  <td class="num mid">${esc(timeOf(r.ev))}</td>
  <td class="mid">${esc(modeOf(r.ev.mode))}</td>
  <td class="mid soft" style="font-size:12.2px">${esc(regOf(r.ev.registration))}</td>
  <td class="mid">${statusTag(r.status)}</td>
</tr>`).join('\n');

const card = (slug) => {
  const v = OH.schools[slug];
  const s = bySlug.get(slug);
  if (!s) return '';
  const evs = rows.filter(r => r.slug === slug);
  const body = evs.length
    ? evs.map(r => {
      const ev = r.ev;
      /* 没有活动清单时不在这里补一句「官方未公布」——
         卡片页脚已经写过了，同一句话出现两次显得像凑字数。 */
      const acts = (ev.activities || []).length
        ? `<ul class="acts">${ev.activities.map(a => `<li>${esc(a)}</li>`).join('')}</ul>`
        : '';
      return `<div class="ev">
        <div class="ev-hd">
          <span class="ev-date">${md(ev.date)}${ev.endDate ? '–' + md(ev.endDate) : ''} · ${weekday(ev.date)}</span>
          ${statusTag(r.status)}
          <span class="ev-time">${esc(timeOf(ev))}</span>
          <span class="badge">${esc(modeOf(ev.mode))}</span>
          <span class="badge${ev.registration === 'required' || String(ev.registration).startsWith('opens') ? ' badge-risk' : ''}">${esc(regOf(ev.registration))}</span>
        </div>
        <div class="ev-ttl">${esc(ev.title)}</div>
        ${acts}
        ${ev.note ? `<p class="ev-note">${esc(ev.note)}</p>` : ''}
        ${ev.regUrl ? `<p class="ev-note">报名：<a href="${esc(ev.regUrl)}" target="_blank" rel="noopener">${esc(ev.regUrl)}</a></p>` : ''}
      </div>`;
    }).join('\n')
    : `<p class="soft" style="font-size:13px;margin:8px 0 0">${esc(v.sourceNote || '没有公布任何场次。')}</p>`;

  return `<article class="school">
  <header>
    <div class="sname">${esc(short(s.name))}</div>
    <div class="sbadges"><span class="badge">${esc(v.headline || '')}</span></div>
  </header>
  ${body}
  <p class="ev-foot">
    ${esc(s.address || '')} ｜ 电话 ${esc(s.contact?.phone || '—')}
    ${s.contact?.website ? ` ｜ <a href="${esc(s.contact.website)}" target="_blank" rel="noopener">学校官网</a>` : ''}
    <br><span class="soft">${esc(v.sourceNote || '')}</span>
  </p>
</article>`;
};

const cardOrder = rows.map(r => r.slug).filter((v, i, a) => a.indexOf(v) === i)
  .concat(Object.keys(OH.schools).filter(k => !rows.some(r => r.slug === k)));

/** 需要留意的场次：备注里写了矛盾/未公布，或者压根没有开始时间 */
const isSuspect = r => /不一致|未公布|冲突|待定|TBC/.test(r.ev.note || '') || !r.ev.start;
const CONFLICT_N = rows.filter(isSuspect).length;
const conflictRows = rows.filter(isSuspect).map(r => `<tr>
  <td><b>${esc(r.short)}</b></td>
  <td class="num mid">${md(r.ev.date)}</td>
  <td class="soft">${esc(r.ev.note || '时间未公布')}</td>
</tr>`).join('\n');

const planRows = planAUpcoming.map(x => {
  /* 不在 13 所名单里的也要占满 4 格：跨列会让整张表的列宽跳动，
     而且读者会以为「这行少了信息」。解释放到表下面一句话。 */
  if (!x.any) return `<tr><td class="soft">${esc(short(x.name))}</td><td class="num mid soft">—</td><td class="num mid soft">—</td><td class="mid soft">无记录</td></tr>`;
  if (!x.hit) {
    /* 已结束也要把日期和时间填上：表头写的是「日期 / 时间 / 状态」，
       把整行压成「已结束 + 一句话」会让读者以为这所学校没有日期信息。 */
    const r = x.past;
    return `<tr><td>${esc(short(x.name))}</td><td class="num mid">${md(r.ev.date)} · ${weekday(r.ev.date)}</td><td class="num mid">${esc(timeOf(r.ev))}</td><td class="mid">${statusTag(r.status)}</td></tr>`;
  }
  return `<tr><td><b>${esc(short(x.name))}</b></td><td class="num mid">${md(x.hit.ev.date)} · ${weekday(x.hit.ev.date)}</td><td class="num mid">${esc(timeOf(x.hit.ev))}</td><td class="mid">${statusTag(x.hit.status)}</td></tr>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="generator" content="psle-openhouse/1">
<title>2026 中学开放日 · 13 所深度报告学校</title>
<style>
${CSS}
.oh-hero{padding:34px 0 26px}
/* 状态标记：已结束用灰、今天用琥珀、还有几天用青 —— 不表达好坏，只表达时间紧迫度 */
.st{display:inline-block;font-size:11px;padding:1px 7px;border-radius:4px;white-space:nowrap;
  border:1px solid var(--line);color:var(--tx3);background:var(--chip)}
.st-today{border-color:var(--warm-line);background:var(--warm-bg);color:var(--warm);font-weight:600}
.st-upcoming{border-color:var(--accent-line);background:var(--accent-bg);color:var(--accent);font-weight:600}
.ev{border-top:1px dashed var(--line);padding:12px 0}
.ev:first-of-type{border-top:0}
.ev-hd{display:flex;flex-wrap:wrap;gap:7px;align-items:center;font-size:12.6px}
.ev-date{font-family:var(--mono);font-weight:600}
.ev-time{font-family:var(--mono);color:var(--tx2)}
.ev-ttl{font-size:13.6px;font-weight:600;margin-top:6px}
.acts{margin:7px 0 0;padding-left:19px;font-size:13px;line-height:1.75;color:var(--tx2)}
.ev-note{margin:7px 0 0;font-size:12.4px;color:var(--tx3);line-height:1.7}
.ev-foot{margin:12px 0 0;padding-top:10px;border-top:1px solid var(--line);font-size:12.2px;color:var(--tx2);line-height:1.8}
</style>
</head>
<body>

<div class="hero oh-hero">
  <div class="wrap">
    <a class="backlink" href="index.html">← 返回学校看板</a>
    <div class="eyebrow">PSLE 2026 · 2027 年 1 月入学</div>
    <h1>13 所深度报告学校的开放日<small>共 ${rows.length} 场活动 · 按 ${TODAY} 计算，还剩 ${upcoming.length} 场没结束</small></h1>
    <div class="sub">
      这一页只回答三件事：<b>哪天有空</b>、<b>去了能看什么</b>、<b>哪几条信息互相矛盾</b>。
      日期时间来自 MOE 官方汇总，活动内容只有在学校自己讲清楚时才写，没公布的一律标「未公布」——不替学校编节目单。
    </div>
    <div class="profile">
      <div><div class="k">收录学校</div><div class="v">${Object.keys(OH.schools).length} 所</div></div>
      <div><div class="k">活动场次</div><div class="v">${rows.length} 场</div></div>
      <div><div class="k">还能去</div><div class="v">${upcoming.length} 场</div></div>
      <div><div class="k">已结束</div><div class="v">${past.length} 场</div></div>
      <div><div class="k">有活动细节</div><div class="v">${rows.length - noActivities.length}/${rows.length}</div></div>
    </div>
  </div>
</div>

<div class="wrap">

<div class="toc">
  <b>目录</b>
  <a href="#s1">① 一眼看完</a>
  <a href="#s2">② 逐校详情</a>
  <a href="#s3">③ 矛盾与缺口</a>
  <a href="#s4">④ 方案 A 还赶得上吗</a>
  <a href="#s5">⑤ 现场怎么问</a>
  <a href="#s6">⑥ 来源与边界</a>
</div>

<div class="note" style="margin-top:20px">
<b>先说三个容易搞错的地方。</b>
① <b>今天是 ${TODAY}</b>，13 所里有 ${past.length} 场已在 11-14 办完 —— 这一批邻里学校习惯在 PSLE 出分前两周的周六集中办；
② <b>开放日不是录取环节</b>，去不去不影响 S1 分配，也不会让 COP 变低；
③ <b>「官方未公布活动」不等于没安排</b>，只是没人写出来，这种时候打电话问比到现场碰运气靠谱。
</div>

<section>
<h2 id="s1"><span class="n">01</span>一眼看完：${rows.length} 场按时间排</h2>
<p class="lead">同一所学校的多场活动分行列出。状态按 ${TODAY} 计算 —— 重新构建本页就会跟着变，不是写死的。</p>
<div style="overflow-x:auto">
<table>
<thead><tr>
  <th style="width:24%">学校</th><th class="mid" style="width:16%">日期</th><th class="mid" style="width:16%">时间</th>
  <th class="mid" style="width:10%">形式</th><th class="mid" style="width:14%">报名</th><th class="mid">状态</th>
</tr></thead>
<tbody>
${overviewRows}
</tbody>
</table>
</div>
${eOnly.length ? `<p class="soft" style="font-size:12.6px">另有 ${eOnly.map(k => esc(short(bySlug.get(k)?.name))).join('、')} 只有线上开放日，没有实体场，不入上表（见第 03 节）。</p>` : ''}
</section>

<section>
<h2 id="s2"><span class="n">02</span>逐校详情：活动、报名、联系方式</h2>
<p class="lead">按最早一场的日期排列。有学校把活动清单写清楚了，有学校只给了日期——这个差别本身就是信息：<b>写清楚的通常是认真在准备的</b>。</p>
${cardOrder.map(card).join('\n')}
</section>

<section>
<h2 id="s3"><span class="n">03</span>矛盾与缺口：${CONFLICT_N + eOnly.length + noInfo.length} 处需要留意</h2>
<p class="lead">这一节比上面两张表更有用——如果只看汇总站，下面这些坑一个都看不见。</p>

<h3>时间对不上的三处</h3>
<table>
<thead><tr><th style="width:22%">学校</th><th class="mid" style="width:14%">日期</th><th>具体情况</th></tr></thead>
<tbody>
${conflictRows || '<tr><td colspan="3" class="soft">没有发现冲突</td></tr>'}
</tbody>
</table>

${eOnly.length ? `<h3>没有实体开放日的</h3>
<div class="warnbox">
<b>${eOnly.map(k => esc(short(bySlug.get(k)?.name))).join('、')}</b>：MOE 正式列表里这一行没有任何日期时间，学校官网只有「e-Open House」线上入口。
第三方汇总也把它归入「无年末开放日」一栏。<b>想实地看校园，只能直接打电话约</b>（${esc(bySlug.get(eOnly[0])?.contact?.phone || '—')}）。
<br><br>这一点对选校有实际影响：线上开放日看不到通勤、看不到课间走廊的样子、问不到在读学生的真话——而这三件恰好是我们最看重的。
</div>` : ''}

${noInfo.length ? `<div class="warnbox"><b>${noInfo.map(k => esc(short(bySlug.get(k)?.name))).join('、')}</b> 没有任何公开场次信息。</div>` : ''}

<h3>${rows.length} 场里只有 ${rows.length - noActivities.length} 场写了活动内容</h3>
<p>能查到具体安排的是 <b>${rows.length - noActivities.length} 场</b>（${rows.filter(r => (r.ev.activities || []).length).map(r => esc(r.short)).filter((v, i, a) => a.indexOf(v) === i).join('、')}）。
其余 ${noActivities.length} 场，MOE 只给了日期与时段，学校也没在官网写得更多。</p>
<p class="soft" style="font-size:12.8px">我的判断：这不是学校偷懒，而是这类开放日的实际形态很固定——<b>校园参观 + 科目/CCA 摊位 + 校长讲座</b>。但习惯不等于承诺，所以页面不替你补这段。真要知道，电话问一句「当天有没有校长讲座、CCA 摊位在几楼」即可。</p>
</section>

<section>
<h2 id="s4"><span class="n">04</span>方案 A 的 6 所，还赶得上吗</h2>
<p class="lead">志愿报告里排的 6 个位置，逐所对照开放日状态。按 ${TODAY} 算。</p>
<table>
<thead><tr><th style="width:34%">志愿校</th><th class="mid">日期</th><th class="mid">时间</th><th class="mid">状态</th></tr></thead>
<tbody>
${planRows}
</tbody>
</table>
<p class="soft" style="font-size:12.4px">Bartley 是方案 A 的第 6 志愿，但不在 13 所深度报告名单里，所以这一页没有它的开放日记录 —— 想要的话可以直接打电话${BARTLEY_PHONE ? `（${esc(BARTLEY_PHONE)}）` : ''}或看学校官网。</p>
<div class="note">
<b>如果只打算去一天，我的建议是 11 月 21 日（周六）。</b>
那天 Compassvale（10:00–14:30）、Edgefield（9:00–13:00）、Yusof Ishak（8:00–12:30）、Bendemeer（8:30–13:00）四所都在开，
而且都在东北部——<b>但四所选三所就到顶了</b>：Yusof Ishak 8:00 开始、Compassvale 10:00 开始，中间还隔着榜鹅到盛港的车程。
现实排法是「上午一所 + 下午一所」，别贪。
</div>
</section>

<section>
<h2 id="s5"><span class="n">05</span>现场怎么问：六个问题就够</h2>
<p class="lead">开放日最容易变成逛庙会——看表演、拿纪念品、听校长讲愿景，出来什么都没解决。带着问题去，半天就值了。</p>
<div class="grid2">
  <div class="panel"><h4>① CCA 到底怎么分配</h4><p class="soft" style="font-size:12.8px;margin:6px 0 0">Sec 1 是按志愿优先还是学校指派？机器人、戏剧这类热门社有没有选拔、几个名额？——这直接决定「冲着某个社团选这所学校」成不成立，也是我们看板里 CCA 数据的最大盲区。</p></div>
  <div class="panel"><h4>② ALP 是全体上还是选拔</h4><p class="soft" style="font-size:12.8px;margin:6px 0 0">问「所有 Sec 1 学生都上吗、每周几节」。ALP 写在 MOE 页面上，但「课时内全体」和「课后兴趣组」是两件完全不同的事。</p></div>
  <div class="panel"><h4>③ 科目分层的实际门槛</h4><p class="soft" style="font-size:12.8px;margin:6px 0 0">Full SBB 之下，G3 科目什么时候能调、依据什么？Sec 1 开学时的起点若偏低，后面还有几次机会。</p></div>
  <div class="panel"><h4>④ 让在读学生讲真话</h4><p class="soft" style="font-size:12.8px;margin:6px 0 0">找学生导览员问两个问题就够了：「你最喜欢和最不喜欢这所学校的什么」「CCA 一周占多少小时」。这比任何宣传册有用。</p></div>
  <div class="panel"><h4>⑤ 实测一次通勤</h4><p class="soft" style="font-size:12.8px;margin:6px 0 0">别开车。按平时上学的时段走一趟，你会立刻知道我们算出来的「步行 14 分钟」在真实路况下是 14 还是 25 —— 这一条只有亲自走才算数。</p></div>
  <div class="panel"><h4>⑥ 顺带核对 COP 走向</h4><p class="soft" style="font-size:12.8px;margin:6px 0 0">问「这两年录取区间有没有收紧」。有些学校自己会讲实话，而且我们手上有 2023–2025 三年数据可以对照（见各校深度报告）。</p></div>
</div>
</section>

<section>
<h2 id="s6"><span class="n">06</span>来源与边界</h2>
<table>
<thead><tr><th style="width:26%">内容</th><th>来源</th><th class="mid">等级</th></tr></thead>
<tbody>
${OH.sources.map(s => `<tr><td>${esc(s.usedFor || '')}</td><td class="soft" style="font-size:12.4px">${esc(s.label)}${s.url ? `<br><a href="${esc(s.url)}" target="_blank" rel="noopener" style="font-size:11.5px">${esc(s.url)}</a>` : ''}</td><td class="mid"><span class="tag ${s.grade === 'A' ? 'a' : s.grade === 'B' ? 'b' : 'c'}">${esc(s.grade)}</span></td></tr>`).join('\n')}
</tbody>
</table>
<div class="warnbox">
<b>四条边界，说清楚免得误用：</b><br>
${OH.caveats.map((c, i) => `${'①②③④⑤'[i]} ${esc(c)}`).join('<br>')}
</div>
<p class="soft" style="font-size:12.4px">本页生成于 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Singapore' })} SGT；状态按 ${TODAY} 计算，数据更新于 ${esc(OH.updatedAt)}。</p>
</section>

<div class="foot">
<b>关联页面</b>　<a href="index.html">学校看板</a> ｜ <a href="map.html">通勤地图</a> ｜ <a href="guide.html">填报手册</a> ｜ <a href="cohort.html">考生数据</a> ｜ <a href="plans.html">志愿方案</a><br>
<b>口径</b>　日期时间以 MOE Schoolbag 官方汇总为准；活动内容仅在来源明确时列出；地址电话取自 MOE SchoolFinder。<br>
<b>免责</b>　开放日时间可能临时调整，出发前请以学校官网或电话确认为准。个人研究工具输出，非 MOE 官方建议。
</div>

</div>
</body>
</html>
`;

const out = P('docs/openhouse.html');
fs.writeFileSync(out, html, 'utf8');
console.log(`▸ 输出 docs/openhouse.html（${(html.length / 1024).toFixed(0)}KB）`);
console.log(`  ${Object.keys(OH.schools).length} 所 · ${rows.length} 场 · 还能去 ${upcoming.length} 场 · 已结束 ${past.length} 场`);
console.log(`  有活动细节 ${rows.length - noActivities.length}/${rows.length} 场 ｜ 无实体场 ${eOnly.length} 所 ｜ 冲突 ${conflictRows ? '有' : '无'}`);
