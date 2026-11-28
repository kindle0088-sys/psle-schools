#!/usr/bin/env node
/**
 * 全量口径守门：55 份单校深度报告必须全部绑定 abcd2 且无旧画像残留，
 * 并逐份核对首页索引 docs/data/school-reports.json。
 * 单份验证器（verify-school-report.cjs）只验单校；这里防的是「某一校
 * profile 被回退成 abc4 / 少生成一份 / 旧 AL 15·17 从别处混回来 /
 * 报告生成了但漏登记到首页索引（2026-11-28 Junyuan 踩过）」。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
const DIR = path.join(BASE, 'data/school-profiles');
const OUT = path.join(BASE, 'docs/reports');

let pass = 0, fail = 0;
const t = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ✅ ' + name + (detail ? ' — ' + detail : '')); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
};

const profiles = fs.readdirSync(DIR).filter(f => f.endsWith('.json')).sort();
t('55 份学校档案齐全', profiles.length === 55, profiles.length + ' 份');
const wrongBind = profiles.filter(f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')).student !== 'abcd2');
t('全部档案绑定 abcd2', wrongBind.length === 0, wrongBind.length ? wrongBind.join('、') : '55/55');

let generated = 0, stale = [], noFit = [], noMeta = [];
for (const f of profiles) {
  const slug = f.replace(/\.json$/, '');
  const p = path.join(OUT, `school-${slug}.html`);
  if (!fs.existsSync(p)) continue;
  generated++;
  const h = fs.readFileSync(p, 'utf8');
  if (!/name="student" content="abcd2"/.test(h)) noMeta.push(slug);
  if (!h.includes('id="fit-abcd2"')) noFit.push(slug);
  if (/AL\s*1[57]\b/.test(h) || /(?<!\d)(?:15|17)\s*分(?!钟|之)/.test(h)) stale.push(slug);
}
t('55 份报告已生成', generated === 55, generated + ' 份');
t('全部报告声明 abcd2', noMeta.length === 0, noMeta.length ? noMeta.slice(0, 5).join('、') : '55/55');
t('全部报告含画像匹配卡', noFit.length === 0, noFit.length ? noFit.slice(0, 5).join('、') : '55/55');
t('无 AL 15 / AL 17 旧口径残留', stale.length === 0, stale.length ? stale.slice(0, 5).join('、') : '0 份');

// 首页看板只认 docs/data/school-reports.json：报告生成了却漏登记，
// 角标、筛选、卡片入口都会少一份，而 verify-board 拿同一份索引当期望值，抓不到。
const idxPath = path.join(BASE, 'docs/data/school-reports.json');
const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8')).reports || {};
const slugs = new Set(profiles.map(f => f.replace(/\.json$/, '')));
const missingInIndex = [...slugs].filter(s => !idx[s]);
const extraInIndex = Object.keys(idx).filter(s => !slugs.has(s));
const badIndexFile = Object.entries(idx)
  .filter(([slug, r]) => r.file !== `reports/school-${slug}.html` || !fs.existsSync(path.join(BASE, 'docs', r.file)))
  .map(([slug]) => slug);
t('每份校报都在首页索引登记', missingInIndex.length === 0,
  missingInIndex.length ? missingInIndex.join('、') : `${slugs.size}/${slugs.size}`);
t('首页索引无多余条目', extraInIndex.length === 0,
  extraInIndex.length ? extraInIndex.join('、') : '0 条');
t('首页索引 file 均指向存在的报告', badIndexFile.length === 0,
  badIndexFile.length ? badIndexFile.slice(0, 5).join('、') : `${Object.keys(idx).length}/${Object.keys(idx).length}`);

console.log('\n' + '═'.repeat(26));
console.log(pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
