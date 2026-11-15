#!/usr/bin/env node
/**
 * 批量验证 docs/reports/school-*.html（scripts/verify-all-school-reports.cjs）
 *
 * 单份报告的验证器只认一个文件，13 份要循环调用。以前是在 shell 里 for 循环，
 * 有两个毛病：① 只看退出码，失败也只会打印「失败 1」；② 放在 build-all 里没法复用。
 * 这里统一成脚本，并汇总每份的断言数。
 *
 * 用法: node scripts/verify-all-school-reports.cjs [--quiet]
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BASE = path.join(__dirname, '..');
const DIR = path.join(BASE, 'docs/reports');
const quiet = process.argv.includes('--quiet');
const one = path.join(__dirname, 'verify-school-report.cjs');

const files = fs.readdirSync(DIR).filter(f => /^school-.*\.html$/.test(f)).sort();
if (!files.length) {
  console.error('✗ docs/reports 下没有 school-*.html');
  process.exit(1);
}

let pass = 0, fail = 0, asserts = 0;
const failed = [];

for (const f of files) {
  const r = spawnSync(process.execPath, [one, path.join(DIR, f)], { cwd: BASE, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/(\d+)\s*通过\s*\/\s*(\d+)\s*失败/);
  if (m) { asserts += +m[1]; pass += +m[1]; fail += +m[2]; }
  const broke = !!r.error || r.status !== 0;
  if (broke) {
    failed.push({ f, out });
    if (!quiet) {
      console.log('  ❌ ' + f);
      out.split('\n').filter(l => l.includes('❌')).forEach(l => console.log('       ' + l.trim()));
    }
  } else if (!quiet) {
    console.log('  ✅ ' + f + (m ? `  ${m[1]} 项` : ''));
  }
}

console.log('\n' + '═'.repeat(30));
console.log(`${pass} 通过 / ${fail} 失败  · ${files.length} 份报告`);
if (failed.length) {
  console.log('失败文件：' + failed.map(x => x.f).join('、'));
  process.exit(1);
}
