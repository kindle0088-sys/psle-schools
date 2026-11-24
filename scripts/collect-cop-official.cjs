#!/usr/bin/env node
/**
 * 从 MOE SchoolFinder 线上页采集「上一届 + 上上届」PG3 COP（官方 A 级）
 *
 * 背景（2026-11-24）：SchoolFinder 改版后，详情页直接给出
 *   「PSLE score ranges of 2024 and 2025」双年表（2025/2024 × 附属/非附属 × PG1/2/3）。
 *   这意味着 2024 COP 不必再依赖 Wayback 存档（后者已被网络策略拦截），
 *   可从官方线上页补齐全部深度报告校。
 *
 * 口径：
 *   · 只取 Non-affiliated 的 PG3（本项目全部画像均无附属关系）。
 *   · 0–0 + 页面写明「no S1 students posted」→ status=anomaly（占位，不是 0 分）。
 *   · SAP 的 5(D)-10(M) 括号是华文等级，min/max 仍取数字。
 *   · 单年旧版页面（PSLE score range of 2025）走 fallback，只填 2025。
 *
 * 输出 data/cop-official.json：{ schools: { <slug>: { 2024:{...}, 2025:{...} } } }
 * 用法 node scripts/collect-cop-official.cjs [--test] [--slug xxx]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const P = (...a) => path.join(ROOT, ...a);
const BASE = 'https://www.moe.gov.sg/schoolfinder/schooldetail/';
const OUT = P('data/cop-official.json');
const REPORTS = JSON.parse(fs.readFileSync(P('docs/data/school-reports.json'), 'utf8'));
const ALL_SLUGS = Object.keys(REPORTS.reports);
const args = process.argv.slice(2);
const TEST = args.includes('--test');
const si = args.indexOf('--slug');
const slugArg = si >= 0 ? args[si + 1] : null;
const SLUGS = slugArg ? [slugArg] : (TEST ? ALL_SLUGS.slice(0, 3) : ALL_SLUGS);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const strip = s => String(s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
function parseCell(td) {
  const t = strip(td);
  if (!t || t === '-') return null;
  const m = t.match(/(\d+)\s*(?:\([^)]*\))?\s*[–-]\s*(\d+)/) || t.match(/^(\d+)$/);
  if (!m) return null;
  return { min: +m[1], max: m[2] != null ? +m[2] : +m[1] };
}
function rowsOf(table) {
  return [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m =>
    [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(c => c[1]));
}
function pg3Of(cells, idx) {
  const label = strip(cells[0]);
  if (!/^Posting Group 3/i.test(label)) return null;
  return parseCell(cells[idx]);
}

/** 解析双年表：返回 { 2025:{min,max}, 2024:{min,max} }（均 PG3 非附属） */
function parseDual(html) {
  const pos = html.indexOf('score ranges of 20');
  if (pos < 0) return null;
  const seg = html.slice(pos, pos + 7000);
  const tables = [...seg.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)].map(m => m[1]);
  if (!tables.length) return null;
  const rows = rowsOf(tables[0]);
  // 表头第二行：空 / Affiliated / Non-affiliated / Affiliated / Non-affiliated → 2024 非附属在 index 4
  // 若年份顺序颠倒（少见），以表头里 2024/2025 的列序判定。
  const head = rows.find(r => r.some(c => /2024/.test(strip(c))) || r.some(c => /2025/.test(strip(c))));
  let idx24 = 4, idx25 = 2;
  if (head) {
    const years = head.map(c => strip(c)).map(t => (/^20\d\d$/.test(t) ? +t : null));
    // colSpan 的年份单元格只出现一次，展开成两列： aff, nonaff
    // years[0] 是空 th（null），年份所在下标 p 对应 aff 列 = 2p-1、nonaff 列 = 2p
    const y24 = years.indexOf(2024), y25 = years.indexOf(2025);
    if (y24 > 0) idx24 = y24 * 2;
    if (y25 > 0) idx25 = y25 * 2;
  }
  const out = {};
  for (const r of rows) {
    const v25 = pg3Of(r, idx25), v24 = pg3Of(r, idx24);
    if (v25) out[2025] = v25;
    if (v24) out[2024] = v24;
  }
  return Object.keys(out).length ? out : null;
}

/** 单年旧版 fallback：只填 2025 */
function parseSingle(html) {
  const pos = html.indexOf('score range of');
  if (pos < 0) return null;
  const seg = html.slice(pos, pos + 5000);
  const rows = rowsOf(seg);
  const ym = html.match(/score range of (\d{4})/);
  const year = ym ? +ym[1] : null;
  if (!year) return null;
  for (const r of rows) {
    const v = pg3Of(r, 2);   // 旧表：空 / aff / nonaff
    if (v) return { [year]: v };
  }
  return null;
}

async function fetchOne(slug, attempt = 1) {
  try {
    const r = await fetch(BASE + slug, { headers: { 'User-Agent': 'Mozilla/5.0 (PSLE research; contact: local)' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } catch (e) {
    if (attempt < 3) { await sleep(1800 * attempt); return fetchOne(slug, attempt + 1); }
    throw e;
  }
}

(async () => {
  const out = {
    _note: 'MOE SchoolFinder 线上详情页直接公开的 PG3 COP（Non-affiliated）。2026-11-24 采集：改版后页面同时给出 2024 与 2025 两个年度，故 2024 由官方线上补齐，不再依赖 Wayback。0–0 且页面注明当年无 S1 派位者标 anomaly。',
    checkedAt: new Date().toISOString().slice(0, 10),
    columns: [2024, 2025],
    schools: {},
  };
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
  let ok24 = 0, ok25 = 0, anomaly = 0, fail = 0;

  for (const slug of SLUGS) {
    let rec = { ...(prev && prev.schools && prev.schools[slug] ? prev.schools[slug] : {}) };
    try {
      const html = await fetchOne(slug);
      const vals = parseDual(html) || parseSingle(html);
      if (!vals) { rec._err = 'no-parse'; fail++; }
      else {
        delete rec._err;
        for (const [y, v] of Object.entries(vals)) {
          if (v.min === 0 && v.max === 0) {
            const plain = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
            const noIntake = /no cut-off points available/i.test(plain) && /no Secondary 1 \(S1\) students posted/i.test(plain);
            rec[y] = {
              status: 'anomaly', raw: v,
              note: noIntake
                ? 'MOE 页面原文：当年无 Secondary 1 学生派位到该校，故无 COP；0–0 为占位，不是 0 分。'
                : '页面显示 0–0，坏值，已弃用。',
              source: 'moe-live',
            };
            anomaly++;
          } else {
            rec[y] = { status: 'ok', pg3: v, source: 'moe-live' };
            if (+y === 2024) ok24++; else if (+y === 2025) ok25++;
          }
        }
      }
    } catch (e) {
      rec._err = e.message; fail++;
    }
    out.schools[slug] = rec;
    const brief = [2024, 2025].map(y => rec[y] ? `${y}:${rec[y].status}${rec[y].pg3 ? '(' + rec[y].pg3.min + '-' + rec[y].pg3.max + ')' : ''}` : `${y}:-`).join(' ');
    console.log(`  ${slug.padEnd(36)} ${brief}${rec._err ? ' ERR=' + rec._err : ''}`);
    await sleep(450);
  }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n', 'utf8');
  console.log(`\n采集完成：2024 ok ${ok24}/${SLUGS.length}，2025 ok ${ok25}/${SLUGS.length}，anomaly ${anomaly}，fail ${fail}`);
  console.log('写入 ' + OUT);
})();
