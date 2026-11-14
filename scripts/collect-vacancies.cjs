#!/usr/bin/env node
/**
 * 采集 MOE 的「未招满」星号标记（vacancies remaining）
 *
 * 官方脚注原文：
 *   * The last posted student had a PSLE score better than 30. However, as the
 *     school still had vacancies after S1 posting, its cut-off point is
 *     reflected as 30 as it could have admitted a S1-eligible student with
 *     PSLE score of 30.
 *
 * 也就是说：某个 Posting Group 的区间后面带 *，表示**该段在 S1 posting 结束后仍有学额**。
 * 这是官方唯一一个能反映「这所学校紧不紧张」的标记，而且不需要任何推算。
 *
 * 之前的 collect-details.cjs 用 /(\d+)\s*[–-]\s*(\d+)/ 取数，星号被直接丢弃。
 * 本脚本只做一件事：把星号补回来，同时校验已有的 COP 数值有没有变（防静默漂移）。
 *
 * 用法: node scripts/collect-vacancies.cjs [--limit N] [--delay ms]
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const P = (...a) => path.join(BASE, ...a);
const args = process.argv.slice(2);
const LIMIT = args.includes('--limit') ? +args[args.indexOf('--limit') + 1] : Infinity;
const DELAY = args.includes('--delay') ? +args[args.indexOf('--delay') + 1] : 700;

const schools = JSON.parse(fs.readFileSync(P('data/schools.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 从 COP 表格里读一行：返回 {min,max,star}
   star 来自单元格尾部那个 *（MOE 用来标「仍有学额」） */
const readCell = html => {
  const txt = String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  if (!txt || txt === '-') return null;
  const m = txt.match(/(\d+)\s*[–-]\s*(\d+)\s*(\*)?/);
  if (!m) return null;
  return { min: +m[1], max: +m[2], star: !!m[3] };
};

function parseCopTable(html) {
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
    rows[key] = { aff: cells[1] ? readCell(cells[1]) : null, nonAff: cells[2] ? readCell(cells[2]) : null };
  }
  return { year: ym ? +ym[1] : null, basis, rows };
}

async function fetchSchool(slug, attempt = 1) {
  const url = `https://www.moe.gov.sg/schoolfinder/schooldetail/${slug}`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (personal research; psle-schools)' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } catch (e) {
    if (attempt < 3) { await sleep(1500 * attempt); return fetchSchool(slug, attempt + 1); }
    throw e;
  }
}

(async () => {
  const out = {};
  const drift = [];
  const failed = [];
  const list = schools.slice(0, LIMIT === Infinity ? schools.length : LIMIT);

  let n = 0;
  for (const s of list) {
    n++;
    process.stdout.write(`\r  ${n}/${list.length}  ${s.slug.padEnd(44)}`);
    let html;
    try { html = await fetchSchool(s.slug); }
    catch (e) { failed.push({ slug: s.slug, err: e.message }); continue; }

    const t = parseCopTable(html);
    if (!t || !t.rows.PG3) { failed.push({ slug: s.slug, err: 'no PG3 table' }); continue; }

    out[s.slug] = {
      year: t.year,
      basis: t.basis,
      rows: Object.fromEntries(Object.entries(t.rows).map(([k, v]) => [k, {
        nonAff: v.nonAff, aff: v.aff,
      }])),
    };

    // 与已有数据比对：数值变了要留痕，不能静默覆盖
    const old = s.cop && s.cop.nonAffiliated && s.cop.nonAffiliated.PG3;
    const now = t.rows.PG3.nonAff;
    if (old && now && (old.min !== now.min || old.max !== now.max)) {
      drift.push({ slug: s.slug, was: `${old.min}-${old.max}`, now: `${now.min}-${now.max}`, oldYear: s.cop.year, newYear: t.year });
    }
    await sleep(DELAY);
  }

  const payload = {
    _note: 'MOE SchoolFinder 的「未招满」星号标记。star=true 表示该 Posting Group 在 S1 posting 结束后仍有学额（官方脚注原文见脚本头注释）。这是唯一有官方背书的「学校紧不紧张」信号，不是推算。',
    collectedAt: new Date().toISOString().slice(0, 10),
    copYear: out[Object.keys(out)[0]] ? out[Object.keys(out)[0]].year : null,
    schools: out,
    failed,
    drift,
  };
  fs.writeFileSync(P('data/cop-flags.json'), JSON.stringify(payload, null, 1) + '\n', 'utf8');

  // 统计
  const vals = Object.values(out);
  const cnt = k => vals.filter(v => v.rows[k] && v.rows[k].nonAff && v.rows[k].nonAff.star).length;
  console.log('\n');
  console.log(`采集 ${Object.keys(out).length} 所 · 失败 ${failed.length} 所 · 数值变动 ${drift.length} 所`);
  console.log(`星号分布：PG3 ${cnt('PG3')} ｜ PG2 ${cnt('PG2')} ｜ PG1 ${cnt('PG1')}`);
  if (drift.length) {
    console.log('\n⚠ COP 数值与本地不一致（需人工确认后再覆盖）：');
    drift.slice(0, 10).forEach(d => console.log(`  ${d.slug} ${d.was}(${d.oldYear}) → ${d.now}(${d.newYear})`));
  }
  if (failed.length) {
    console.log('\n失败清单（前 10）:');
    failed.slice(0, 10).forEach(f => console.log(`  ${f.slug} — ${f.err}`));
  }
})();
