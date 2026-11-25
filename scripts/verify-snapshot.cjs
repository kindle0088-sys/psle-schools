#!/usr/bin/env node
/**
 * 数据时效声明验证器（2026-11-25 复盘新增）
 *
 * 所有「生成器产出的页面」都必须在页脚带同一行数据快照（日期来自
 * docs/data/schools.json 的 meta.generatedAt），避免页面各自写
 * 「采集于 2026-11」或干脆不写，读者无法判断 COP 是哪一年的快照。
 *
 * 手写历史存档（abc1 v1 / school-compassvale v1）不参与：它们本来就是
 * 旧快照，标成今天的数据反而是误导。
 */
const fs = require('fs');
const path = require('path');
const { PAGES } = require('../lib/nav.cjs');
const Snapshot = require('../lib/snapshot.cjs');

const BASE = path.join(__dirname, '..');
const WANT = Snapshot.line();
let pass = 0, fail = 0;
const t = (name, ok, detail = '') => {
  if (ok) { pass++; console.log('  ✅ ' + name + (detail ? ' — ' + detail : '')); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
};

console.log('\n══ 一、七个顶层页面');
for (const p of PAGES) {
  const html = fs.readFileSync(path.join(BASE, 'docs', p.href), 'utf8');
  /* index/map 是手写静态页：用 assets/snapshot.js 从 schools.json 现读，
     生成器产出的页面则直接写入同一行文本。 */
  if (p.id === 'index' || p.id === 'map') {
    t(`${p.href} 动态读取数据快照`,
      html.includes('id="dataSnapshot"') && html.includes('assets/snapshot.js'));
  } else {
    t(`${p.href} 带统一数据快照`, html.includes(WANT), Snapshot.date);
  }
}
const snapJs = fs.readFileSync(path.join(BASE, 'docs/assets/snapshot.js'), 'utf8');
t('snapshot.js 读取 schools.json 的 meta.generatedAt',
  /fetch\('data\/schools\.json'\)/.test(snapJs) && /generatedAt/.test(snapJs));

console.log('\n══ 二、生成器产出的报告');
const reportDir = path.join(BASE, 'docs/reports');
const generated = fs.readdirSync(reportDir).filter(f => f.endsWith('.html') && /name="generator" content="psle-/
  .test(fs.readFileSync(path.join(reportDir, f), 'utf8').slice(0, 4000)));
const archives = fs.readdirSync(reportDir).filter(f => f.endsWith('.html')).length - generated.length;
const missing = generated.filter(f => !fs.readFileSync(path.join(reportDir, f), 'utf8').includes(WANT));
t(`${generated.length} 份生成报告都带统一数据快照`, missing.length === 0,
  missing.slice(0, 5).join(',') || `${generated.length}/${generated.length}`);
t('手写历史存档保持原样（不冒充新快照）', archives === 2, `${archives} 份`);
t('快照日期取自 schools.json 且为 SGT', /^\d{4}-\d{2}-\d{2}$/.test(Snapshot.date), Snapshot.date);

console.log('\n' + '═'.repeat(26));
console.log(pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
