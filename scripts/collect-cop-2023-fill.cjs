#!/usr/bin/env node
/*
 * 补齐 cop-history.json 里缺失的 2023 PG3 COP —— 只补缺的校，不覆盖已有记录。
 *
 * 背景：2026-11-24 之前判定 Wayback 被「网络策略拒绝」是误判 —— 真因是
 * web.archive.org 拒绝 Node/curl 的默认 UA。带浏览器 UA 后 CDX 与存档页均 HTTP 200。
 *
 * 数据源：Wayback 存档的 MOE SchoolFinder 官方页面（A 级），与已有 13 校同口径。
 * 严格性：
 *   ① 存档页年份标签必须 === 2023（否则跳过，不把 2024 数据当 2023）；
 *   ② 只处理 cop-history.json 中没有 ok 的 2023 记录的校；
 *   ③ 0–0 / 无 PG3 / 抓取失败一律记状态，不写入假数值；
 *   ④ 每校成功即落盘，中途失败不丢已完成部分。
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const P = (...a) => path.join(BASE, ...a);
const HIST_PATH = P('data/cop-history.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const YEAR = 2023;
/* 与 collect-cop-history.cjs 同口径：Y-12-20 到 (Y+1)-12-18 */
const inWindow = ts => {
  const t = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
  return t >= `${YEAR}-12-20` && t <= `${YEAR + 1}-12-18`;
};
const nameOf = slug => slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

/* ---------- 解析（与 collect-cop-history.cjs 保持一致） ---------- */
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

/* ---------- Wayback 访问（带浏览器 UA） ---------- */
async function cdx(query) {
  const url = `https://web.archive.org/cdx/search/cdx?url=moe.gov.sg/schoolfinder/schooldetail%3Fschoolname%3D${encodeURIComponent(query)}&output=json&fl=timestamp,statuscode&filter=statuscode:200&from=2023&to=2025&limit=100`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('CDX HTTP ' + r.status);
  const j = await r.json();
  return j.slice(1).map(x => x[0]);
}
async function snap(ts, query) {
  const url = `https://web.archive.org/web/${ts}id_/https://www.moe.gov.sg/schoolfinder/schooldetail?schoolname=${query}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!r.ok) throw new Error('SNAP HTTP ' + r.status);
  return r.text();
}

(async () => {
  const hist = JSON.parse(fs.readFileSync(HIST_PATH, 'utf8'));
  const reports = JSON.parse(fs.readFileSync(P('docs/data/school-reports.json'), 'utf8')).reports;
  const targets = Object.keys(reports).filter(slug => {
    const v = hist.schools[slug] && hist.schools[slug][String(YEAR)];
    return !(v && v.status === 'ok');
  });
  console.log(`待补 ${targets.length} 校（已有 ok 的 ${Object.keys(hist.schools).filter(s => hist.schools[s] && hist.schools[s][String(YEAR)] && hist.schools[s][String(YEAR)].status === 'ok').length} 校保持不动）`);

  let ok = 0, fail = 0;
  for (const slug of targets) {
    let rec = hist.schools[slug] || {};
    let stamps = [];
    try {
      stamps = await cdx(slug);
      await sleep(350);
      const full = await cdx(nameOf(slug));
      stamps = [...stamps, ...full];
      await sleep(350);
    } catch (e) {
      rec[String(YEAR)] = { status: 'cdx-fail', err: e.message };
      hist.schools[slug] = rec;
      fs.writeFileSync(HIST_PATH, JSON.stringify(hist, null, 1) + '\n', 'utf8');
      console.log(`  ${slug.padEnd(34)} CDX失败 ${e.message}`);
      fail++; continue;
    }

    /* 候选：slug 形态与完整校名形态各自筛窗口，优先 slug（与已有 13 校 archiveUrl 一致） */
    const cands = [];
    const seen = new Set();
    for (const ts of stamps) {
      if (!inWindow(ts) || seen.has(ts)) continue;
      seen.add(ts);
      cands.push({ ts, query: slug });
    }
    for (const ts of stamps) {
      if (!inWindow(ts) || seen.has(ts)) continue;
      seen.add(ts);
      cands.push({ ts, query: encodeURIComponent(nameOf(slug)) });
    }
    if (!cands.length) {
      rec[String(YEAR)] = { status: 'no-snapshot' };
      hist.schools[slug] = rec;
      fs.writeFileSync(HIST_PATH, JSON.stringify(hist, null, 1) + '\n', 'utf8');
      console.log(`  ${slug.padEnd(34)} 窗口内无快照`);
      fail++; continue;
    }

    let done = false;
    for (const { ts, query } of cands.slice(0, 6)) {
      let html;
      try { html = await snap(ts, query); }
      catch (e) {
        rec[String(YEAR)] = { status: 'fetch-fail', err: e.message, archiveTs: ts };
        continue;
      }
      const t = parseTable(html);
      await sleep(700);
      if (!t) { rec[String(YEAR)] = { status: 'no-render', archiveTs: ts }; continue; }
      /* 🔴 严格：年份标签必须是 2023，否则不能当 2023 COP 用 */
      if (t.year !== YEAR) {
        rec[String(YEAR)] = { status: 'wrong-year', archiveTs: ts, labelYear: t.year };
        continue;
      }
      const pg3 = t.rows.PG3 && t.rows.PG3.nonAff;
      if (!pg3) { rec[String(YEAR)] = { status: 'no-pg3', archiveTs: ts, labelYear: t.year, basis: t.basis }; continue; }
      if (pg3.min === 0 && pg3.max === 0) {
        rec[String(YEAR)] = { status: 'anomaly', archiveTs: ts, labelYear: t.year, basis: t.basis, raw: pg3, note: '存档页 PG3 为 0–0 占位，不当作 0 分使用' };
        continue;
      }
      rec[String(YEAR)] = {
        status: 'ok', archiveTs: ts, labelYear: t.year, basis: t.basis,
        pg3: { min: pg3.min, max: pg3.max, vacanciesRemain: pg3.star },
        allGroups: Object.fromEntries(Object.entries(t.rows).map(([k, v]) => [k, v.nonAff])),
        archiveUrl: `https://web.archive.org/web/${ts}/https://www.moe.gov.sg/schoolfinder/schooldetail?schoolname=${query}`,
      };
      hist.schools[slug] = rec;
      fs.writeFileSync(HIST_PATH, JSON.stringify(hist, null, 1) + '\n', 'utf8');
      console.log(`  ${slug.padEnd(34)} 2023 = ${pg3.min}-${pg3.max}  (ts ${ts})`);
      ok++; done = true; break;
    }
    if (!done && !rec[String(YEAR)]) rec[String(YEAR)] = { status: 'no-snapshot' };
    if (!done) {
      hist.schools[slug] = rec;
      fs.writeFileSync(HIST_PATH, JSON.stringify(hist, null, 1) + '\n', 'utf8');
      console.log(`  ${slug.padEnd(34)} ${JSON.stringify(rec[String(YEAR)])}`);
      fail++;
    }
  }
  console.log(`\n补齐 ok ${ok} / 待补 ${targets.length}，未取到 ${fail}`);
  const vals = Object.values(hist.schools).map(r => r[String(YEAR)] && r[String(YEAR)].status === 'ok');
  console.log(`cop-history.json 2023 ok 总计 ${vals.filter(Boolean).length}/${vals.length}`);
})();
