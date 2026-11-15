#!/usr/bin/env node
/**
 * 志愿方案看板（docs/plans.html）
 *
 * 以前主界面只有一个「我的志愿方案」链接，指向当前学生的报告 ——
 * 有了第二个孩子之后，这变成了「谁最后生成就指谁」或者一串并列链接，
 * 都不对。现在改成：主界面固定一个入口 → 本页列出所有方案 → 点进去看完整报告。
 *
 * 数据源：docs/data/students-index.json（由两个报告生成器写入，含六所志愿摘要）
 * 新增一份方案 = 在 data/students/ 下加配置 + 跑对应生成器，本页自动出现。
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const P = (...a) => path.join(BASE, ...a);
const CSS = fs.readFileSync(P('scripts/tpl/plan.css'), 'utf8');

const IDX = JSON.parse(fs.readFileSync(P('docs/data/students-index.json'), 'utf8'));
const students = (IDX.students || []).filter(s => s.planSlug);

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = n => String(n).replace(/ Secondary School| \(Secondary\)/, '');
const when = iso => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '—';
  return d.toLocaleString('zh-CN', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' });
};
const tierCls = t => (t === '冲刺' ? 'reach' : t === '稳妥' ? 'safe' : 'match');

/* 报告文件不一定存在：索引可能领先于实际产物（比如只跑了索引没跑报告） */
const exists = rel => fs.existsSync(P('docs', rel));

const card = s => {
  const pl = s.plan || {};
  const picks = (pl.picks || []).slice().sort((a, b) => a.slot - b.slot);
  const ok = exists(pl.report || '');
  const isActive = s.id === IDX.activeId;
  return `
<article class="plan" data-id="${esc(s.id)}">
  <header>
    <div class="who">
      <div class="nm">${esc(s.label || s.id)}${isActive ? '<span class="cur">看板当前</span>' : ''}</div>
      <div class="meta">AL <b>${s.al}</b> · ${esc(s.pgShort || '')} · 邮编 ${esc(s.postal || '—')} · 通勤上限 ${s.maxCommuteMin || '—'} 分钟</div>
    </div>
    <div class="stat">
      <div><span class="k">主池</span><span class="v">${pl.poolMixed != null ? pl.poolMixed : '—'}</span></div>
      <div><span class="k">可及</span><span class="v">${pl.withinCommuteReachable != null ? pl.withinCommuteReachable : '—'}</span></div>
    </div>
  </header>

  <ol class="slots">
    ${picks.length ? picks.map(p => `<li>
      <span class="slot">${p.slot}</span>
      <span class="sn">${esc(short(p.name))}</span>
      ${p.tier ? `<span class="tr tr-${tierCls(p.tier)}">${esc(p.tier)}</span>` : ''}
    </li>`).join('') : '<li class="empty">这份方案还没有六所志愿的摘要</li>'}
  </ol>

  <footer>
    <span class="ts">生成于 ${esc(when(pl.generatedAt || s.updatedAt))}</span>
    ${ok
      ? `<a class="go" href="${esc(pl.report)}">打开完整方案 →</a>`
      : `<span class="miss">报告文件缺失（${esc(pl.report || '未记录')}）</span>`}
  </footer>
</article>`;
};

const body = students.length
  ? students.map(card).join('\n')
  : `<div class="note">还没有任何志愿方案。<br>在 <code>data/students/&lt;id&gt;.json</code> 里配置学生画像，然后跑
     <code>STUDENT=&lt;id&gt; node scripts/build-report-plan.cjs</code>，本页会自动出现。</div>`;

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="generator" content="psle-plans-index/v1">
<title>志愿方案 · PSLE 择校看板</title>
<style>
${CSS}
.plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px;margin-top:22px}
.plan{border:1px solid var(--line);border-radius:11px;background:var(--card);padding:16px 17px 13px;display:flex;flex-direction:column}
.plan header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.plan .nm{font-size:16px;font-weight:650;display:flex;align-items:center;gap:7px}
.plan .cur{font-size:10px;font-weight:400;padding:1px 6px;border-radius:3px;border:1px solid var(--line);color:var(--tx3)}
.plan .meta{font-size:12px;color:var(--tx3);margin-top:4px}
.plan .stat{display:flex;gap:14px;text-align:right;flex:0 0 auto}
.plan .stat .k{display:block;font-size:10.5px;color:var(--tx3)}
.plan .stat .v{display:block;font-size:16px;font-weight:650;font-family:var(--mono);color:var(--tx)}
.plan .slots{list-style:none;margin:14px 0 12px;padding:0;flex:1}
.plan .slots li{display:flex;align-items:center;gap:9px;padding:6px 0;border-bottom:1px dashed var(--line2);font-size:13.2px}
.plan .slots li:last-child{border-bottom:0}
.plan .slot{flex:0 0 18px;text-align:right;font-family:var(--mono);font-size:11px;color:var(--tx3)}
.plan .sn{flex:1;min-width:0}
.plan .tr{font-size:10.5px;padding:1px 6px;border-radius:3px;border:1px solid;white-space:nowrap}
/* 档位只用来说明「风险高低」，不是好坏，所以三色都压得比较淡 */
.tr-reach{border-color:rgba(251,191,36,.5);color:#8a5a00;background:var(--warm-bg)}
.tr-match{border-color:rgba(56,189,248,.38);color:#0b5c78;background:#eef7fb}
.tr-safe{border-color:rgba(15,92,78,.32);color:var(--accent);background:var(--accent-bg)}
.plan footer{display:flex;justify-content:space-between;align-items:center;gap:10px;padding-top:10px;border-top:1px solid var(--line2)}
.plan .ts{font-size:11.5px;color:var(--tx3)}
.plan .go{font-size:13px;font-weight:600;text-decoration:none;white-space:nowrap}
.plan .go:hover{text-decoration:underline}
.plan .miss{font-size:11.5px;color:var(--risk)}
.plan .slots .empty{font-size:12.5px;color:var(--tx3)}
.howto{margin-top:26px}
</style>
</head>
<body>

<div class="hero">
  <div class="wrap">
    <a class="backlink" href="index.html">← 返回学校看板</a>
    <div class="eyebrow">PSLE · 志愿方案</div>
    <h1>志愿方案<small>每个孩子一份，各 6 个志愿；方案 A 是推荐组合</small></h1>
    <div class="sub">
      每份方案都基于各自的分数、住址与兴趣算出候选池，再按「冲刺 / 匹配 / 稳妥」排 6 个位置。
      点开可以看到完整的六步分析、逐校适配度、B / C 两套备选方案，以及每条推荐的理由与风险。
    </div>
  </div>
</div>

<div class="wrap">
<div class="plans">
${body}
</div>

<div class="note howto">
<b>怎么新增一份方案。</b>在 <code>data/students/</code> 下加一份学生配置（分数 / 分组 / 邮编 / 通勤上限 / 兴趣），
然后跑 <code>STUDENT=&lt;id&gt; node scripts/build-report-plan.cjs</code>，再跑一次
<code>node scripts/build-plans-index.cjs</code> —— 本页会自动多一张卡。
</div>

<div class="foot" style="margin-top:26px;padding-top:16px;border-top:1px solid var(--line);font-size:12.4px;color:var(--tx3);line-height:1.9">
<b>相关页面</b>　<a href="index.html">学校看板</a> ｜ <a href="map.html">通勤地图</a> ｜
<a href="guide.html">填报手册</a> ｜ <a href="cohort.html">考生人数与学额</a><br>
<b>端口径</b>　COP 为上一年度 S1 Posting 实际录取区间，仅供参考，不构成录取保证。<br>
<b>生成</b>　本页由 <code>scripts/build-plans-index.cjs</code> 从 <code>docs/data/students-index.json</code> 生成，
索引更新于 ${esc(when(IDX.generatedAt))} SGT。
</div>

</div>
</body>
</html>
`;

fs.writeFileSync(P('docs/plans.html'), html, 'utf8');
console.log(`▸ 输出 docs/plans.html（${(html.length / 1024).toFixed(0)}KB）`);
console.log(`  方案 ${students.length} 份：${students.map(s => `${s.label || s.id}(AL ${s.al})`).join(' ｜ ')}`);
const missing = students.filter(s => !exists((s.plan || {}).report || ''));
if (missing.length) console.log(`  ⚠ ${missing.length} 份报告文件缺失：${missing.map(s => s.id).join(',')}`);
