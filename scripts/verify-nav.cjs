#!/usr/bin/env node
/**
 * 全站导航一致性验证器（2026-11-25 复盘新增）
 *
 * 背景：以前每个生成器各写一份页脚，Full SBB 上线后只有首页和手册有入口，
 * map / cohort / openhouse / plans 全漏；报告页一个外链都没有。
 * 现在统一由 lib/nav.cjs 产出，这里守住「任何页面都能走到任意页面」。
 */
const fs = require('fs');
const path = require('path');
const { PAGES } = require('../lib/nav.cjs');

const BASE = path.join(__dirname, '..');
let pass = 0, fail = 0;
const t = (name, ok, detail = '') => {
  if (ok) { pass++; console.log('  ✅ ' + name + (detail ? ' — ' + detail : '')); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
};

console.log('\n══ 一、七个顶层页面互链');
for (const p of PAGES) {
  const f = path.join(BASE, 'docs', p.href);
  if (!fs.existsSync(f)) { t(`${p.href} 存在`, false); continue; }
  const html = fs.readFileSync(f, 'utf8');
  const missing = PAGES.filter(q => !html.includes(`href="${q.href}"`)).map(q => q.href);
  t(`${p.href} 含全部 7 个入口`, missing.length === 0, missing.join(',') || '7/7');
}

console.log('\n══ 二、报告页（在 docs/reports/ 下层，相对路径加 ../）');
const reportFiles = fs.readdirSync(path.join(BASE, 'docs/reports'))
  .filter(f => f.endsWith('.html'));
const badReports = [];
for (const f of reportFiles) {
  const html = fs.readFileSync(path.join(BASE, 'docs/reports', f), 'utf8');
  const missing = PAGES.filter(q => !html.includes(`href="../${q.href}"`)).map(q => q.id);
  if (missing.length) badReports.push(`${f}: ${missing.join('/')}`);
}
t(`${reportFiles.length} 份报告都有全站导航`, badReports.length === 0,
  badReports.slice(0, 5).join(' ｜ ') || `${reportFiles.length}/${reportFiles.length}`);

console.log('\n══ 三、导航由单一模块产出');
const genFiles = [
  'build-cohort-page.cjs', 'build-full-sbb.cjs', 'build-guide.cjs',
  'build-plans-index.cjs', 'build-openhouse-page.cjs',
  'build-report-plan.cjs', 'build-report-v2.cjs', 'build-school-reports.cjs',
];
const noNav = genFiles.filter(f => !fs.readFileSync(path.join(BASE, 'scripts', f), 'utf8')
  .includes("require('../lib/nav.cjs')"));
t('8 个生成器都引用 lib/nav.cjs', noNav.length === 0, noNav.join(',') || '8/8');
t('导航清单正好 7 项且 id 唯一', PAGES.length === 7 && new Set(PAGES.map(p => p.id)).size === 7);

console.log('\n' + '═'.repeat(26));
console.log(pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
