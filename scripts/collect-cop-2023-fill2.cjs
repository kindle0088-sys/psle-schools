#!/usr/bin/env node
/*
 * 第二阶段：从通配符 CDX 缓存（.tmp/cdx-wildcard24.json）读时间戳，补齐剩余 2023 COP。
 * 不再逐校请求 CDX —— 避免 Wayback 429 限流。
 * 只处理 cop-history.json 中 2023 非 ok 的校；严格校验年份标签=2023；逐校落盘。
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const P = (...a) => path.join(BASE, ...a);
const HIST = P('data/cop-history.json');
const CDX = P('.tmp/cdx-wildcard24.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const YEAR = 2023;
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
  const rows = {}; let basis = null;
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

(async () => {
  const hist = JSON.parse(fs.readFileSync(HIST, 'utf8'));
  const j = JSON.parse(fs.readFileSync(CDX, 'utf8'));
  const reports = Object.keys(JSON.parse(fs.readFileSync(P('docs/data/school-reports.json'), 'utf8')).reports);
  const inWin = ts => { const t = ts.slice(0, 4) + '-' + ts.slice(4, 6) + '-' + ts.slice(6, 8); return t >= '2023-12-20' && t <= '2024-12-18'; };
  const map = new Map();
  for (const [ts, orig] of j.slice(1)) {
    const m = orig.match(/schoolname=([^&]+)/); if (!m) continue;
    const q = decodeURIComponent(m[1]).replace(/\+/g, ' ');
    const slug = q.toLowerCase().replace(/['.%]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
    if (!inWin(ts)) continue;
    if (!map.has(slug)) map.set(slug, []);
    map.get(slug).push({ ts, q });
  }
  const targets = reports.filter(s => !(hist.schools[s] && hist.schools[s][String(YEAR)] && hist.schools[s][String(YEAR)].status === 'ok'));
  console.log(`待补 ${targets.length} 校`);
  let ok = 0, noSnap = 0, other = 0;
  for (const slug of targets) {
    const rec = hist.schools[slug] || {};
    const cands = (map.get(slug) || []).slice(0, 4);
    if (!cands.length) {
      rec[String(YEAR)] = { status: 'no-snapshot', note: 'Wayback 2024 窗口内无该校 SchoolFinder 存档' };
      hist.schools[slug] = rec;
      fs.writeFileSync(HIST, JSON.stringify(hist, null, 1) + '\n', 'utf8');
      console.log(`  ${slug.padEnd(34)} 无存档`); noSnap++; continue;
    }
    let done = false;
    for (const { ts, q } of cands) {
      let html;
      try {
        const r = await fetch(`https://web.archive.org/web/${ts}id_/https://www.moe.gov.sg/schoolfinder/schooldetail?schoolname=${q}`, { headers: { 'User-Agent': UA }, redirect: 'follow' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        html = await r.text();
      } catch (e) {
        rec[String(YEAR)] = { status: 'fetch-fail', archiveTs: ts, err: e.message };
        await sleep(1500); continue;
      }
      const t = parseTable(html);
      await sleep(900);
      if (!t) { rec[String(YEAR)] = { status: 'no-render', archiveTs: ts }; continue; }
      if (t.year !== YEAR) { rec[String(YEAR)] = { status: 'wrong-year', archiveTs: ts, labelYear: t.year }; continue; }
      const pg3 = t.rows.PG3 && t.rows.PG3.nonAff;
      if (!pg3) { rec[String(YEAR)] = { status: 'no-pg3', archiveTs: ts, labelYear: t.year, basis: t.basis }; continue; }
      if (pg3.min === 0 && pg3.max === 0) { rec[String(YEAR)] = { status: 'anomaly', archiveTs: ts, raw: pg3, note: '存档页 PG3 为 0–0 占位，不当 0 分使用' }; continue; }
      rec[String(YEAR)] = {
        status: 'ok', archiveTs: ts, labelYear: t.year, basis: t.basis,
        pg3: { min: pg3.min, max: pg3.max, vacanciesRemain: pg3.star },
        allGroups: Object.fromEntries(Object.entries(t.rows).map(([k, v]) => [k, v.nonAff])),
        archiveUrl: `https://web.archive.org/web/${ts}/https://www.moe.gov.sg/schoolfinder/schooldetail?schoolname=${q}`,
      };
      hist.schools[slug] = rec;
      fs.writeFileSync(HIST, JSON.stringify(hist, null, 1) + '\n', 'utf8');
      console.log(`  ${slug.padEnd(34)} 2023 = ${pg3.min}-${pg3.max}  (ts ${ts})`);
      ok++; done = true; break;
    }
    if (!done) {
      hist.schools[slug] = rec;
      fs.writeFileSync(HIST, JSON.stringify(hist, null, 1) + '\n', 'utf8');
      console.log(`  ${slug.padEnd(34)} ${JSON.stringify(rec[String(YEAR)])}`);
      other++;
    }
  }
  console.log(`\n补齐 ok ${ok} / 无存档 ${noSnap} / 其他 ${other}`);
  const vals = reports.map(s => hist.schools[s] && hist.schools[s][String(YEAR)] && hist.schools[s][String(YEAR)].status === 'ok');
  console.log(`2023 ok 总计 ${vals.filter(Boolean).length}/${vals.length}`);
})();
