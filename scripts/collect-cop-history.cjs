#!/usr/bin/env node
/**
 * 从 Internet Archive 提取历史 PG3 COP
 *
 * 背景：MOE 不发布历史 COP，SchoolFinder 只显示「上一届」。
 * 但 Wayback 存了 2021 年起每年一份学校详情页（URL 形态 ?schoolname=<slug>），
 * 页面里自带「PSLE score range of YYYY」的年份标注 —— 官方内容 + 第三方存档。
 *
 * 口径提醒（写进数据里，别让下游误用）：
 *   · 2023 起才有 Posting Group（PG3 首次出现在「range of 2023」）
 *   · 2021–2022 是 Express / N(A) / N(T) 课程口径，不是 PG3
 *   · 2020 及更早是 T-score，页面上的 AL 数字是 MOE 的换算值
 *
 * 窗口规则：某年 COP 在当年 12 月 posting 结束后才显示，直到次年 posting。
 * 因此按时间戳圈定候选快照，再以页面上的年份标注为准（猜错就换下一个候选）。
 *
 * 用法: node scripts/collect-cop-history.cjs [--years 2023,2024] [--all]
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const P = (...a) => path.join(BASE, ...a);
const args = process.argv.slice(2);
const YEARS = args.includes('--years')
  ? args[args.indexOf('--years') + 1].split(',').map(Number)
  : [2023, 2024];
const ALL = args.includes('--all');

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 默认只做有深度报告的学校；--all 则做全部 147 所（Wayback 限速，会比较慢） */
const slugs = ALL
  ? JSON.parse(fs.readFileSync(P('data/schools.json'), 'utf8')).map(s => s.slug)
  : Object.keys(JSON.parse(fs.readFileSync(P('docs/data/school-reports.json'), 'utf8')).reports);

const readCell = html => {
  const txt = String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  if (!txt || txt === '-') return null;
  const m = txt.match(/(\d+)\s*[–-]\s*(\d+)\s*(\*)?/);
  return m ? { min: +m[1], max: +m[2], star: !!m[3] } : null;
};

function parseTable(html) {
  const ym = html.match(/PSLE score range of (\d{4})/);
  const i = html.indexOf('score range of');
  if (i < 0) return null;
  const seg = html.slice(i, i + 6000);
  const rows = {};
  let basis = null;
  for (const tr of seg.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr[1].matchAll(/<(th|td)[^>]*>([\s\S]*?)<\/\1>/g)].map(c => c[2]);
    if (!cells.length) continue;
    const label = cells[0].replace(/<[^>]+>/g, '').trim();
    let key = null;
    if (/Posting Group\s*(\d)/i.test(label)) { key = 'PG' + label.match(/Posting Group\s*(\d)/i)[1]; basis = 'PG'; }
    else if (/^Express$/i.test(label)) { key = 'Express'; basis = 'Course'; }
    else if (/^Normal Academic$/i.test(label)) { key = 'NA'; basis = 'Course'; }
    else if (/^Normal Technical$/i.test(label)) { key = 'NT'; basis = 'Course'; }
    if (!key) continue;
    rows[key] = { aff: readCell(cells[1]), nonAff: readCell(cells[2]) };
  }
  return { year: ym ? +ym[1] : null, basis, rows };
}

async function cdx(slug, attempt = 1) {
  const u = `moe.gov.sg/schoolfinder/schooldetail%3Fschoolname%3D${slug}`;
  const url = `http://web.archive.org/cdx/search/cdx?url=${u}&output=json&fl=timestamp,statuscode&filter=statuscode:200&limit=100`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('CDX ' + r.status);
    const j = await r.json();
    return j.slice(1).map(x => x[0]);
  } catch (e) {
    if (attempt < 3) { await sleep(2500 * attempt); return cdx(slug, attempt + 1); }
    throw e;
  }
}

async function snap(ts, slug, attempt = 1) {
  const url = `https://web.archive.org/web/${ts}id_/https://www.moe.gov.sg/schoolfinder/schooldetail?schoolname=${slug}`;
  try {
    const r = await fetch(url, { redirect: 'follow' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } catch (e) {
    if (attempt < 3) { await sleep(2500 * attempt); return snap(ts, slug, attempt + 1); }
    throw e;
  }
}

/* COP 年份 Y 的展示窗口：Y-12-20 起，到 (Y+1)-12-18 止 */
const inWindow = (ts, y) => {
  const t = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
  return t >= `${y}-12-20` && t <= `${y + 1}-12-18`;
};

(async () => {
  const out = { _note: '', checkedAt: new Date().toISOString().slice(0, 10), years: YEARS, schools: {} };
  for (const slug of slugs) {
    const rec = {};
    let stamps = [];
    try { stamps = await cdx(slug); } catch (e) { rec._cdxError = e.message; }
    await sleep(1200);

    for (const y of YEARS) {
      const cands = stamps.filter(ts => inWindow(ts, y));
      if (!cands.length) { rec[y] = { status: 'no-snapshot' }; continue; }

      let done = false;
      for (const ts of cands.slice(0, 2)) {          // 最多试 2 个候选
        let html;
        try { html = await snap(ts, slug); } catch (e) { rec[y] = { status: 'fetch-fail', err: e.message, archiveTs: ts }; continue; }
        const t = parseTable(html);
        await sleep(1400);
        if (!t) { rec[y] = { status: 'no-render', archiveTs: ts }; done = true; break; }
        if (t.year !== y) continue;                   // 标错年份，换下一个候选
        const pg3 = t.rows.PG3 && t.rows.PG3.nonAff;
        if (!pg3) { rec[y] = { status: 'no-pg3', archiveTs: ts, labelYear: t.year, basis: t.basis }; done = true; break; }
        if (pg3.min === 0 && pg3.max === 0) {
          rec[y] = { status: 'anomaly', archiveTs: ts, labelYear: t.year, basis: t.basis, raw: pg3 };
          done = true; break;
        }
        rec[y] = {
          status: 'ok', archiveTs: ts, labelYear: t.year, basis: t.basis,
          pg3: { min: pg3.min, max: pg3.max, vacanciesRemain: pg3.star },
          allGroups: Object.fromEntries(Object.entries(t.rows).map(([k, v]) => [k, v.nonAff])),
          archiveUrl: `https://web.archive.org/web/${ts}/https://www.moe.gov.sg/schoolfinder/schooldetail?schoolname=${slug}`,
        };
        done = true; break;
      }
      if (!done && !rec[y]) rec[y] = { status: 'no-snapshot' };
    }
    out.schools[slug] = rec;
    const brief = YEARS.map(y => `${y}:${rec[y] ? rec[y].status : '?'}`).join(' ');
    console.log(`  ${slug.padEnd(36)} ${brief}`);
  }

  out._note = 'Wayback 存档的 MOE SchoolFinder 页面提取。PG3 自 2023 年 posting 起存在；2021–2022 为 Express 课程口径，2020 及更早为 T-score。vacanciesRemain=true 对应 MOE 的 * 标记（该段 posting 后仍有学额）。';
  fs.writeFileSync(P('data/cop-history.json'), JSON.stringify(out, null, 1) + '\n', 'utf8');

  const stat = y => {
    const vals = Object.values(out.schools).map(r => r[y] && r[y].status);
    return `ok ${vals.filter(v => v === 'ok').length}/${vals.length}`;
  };
  console.log('\n' + YEARS.map(y => `${y}: ${stat(y)}`).join(' ｜ '));
  console.log('写入 data/cop-history.json');
})();
