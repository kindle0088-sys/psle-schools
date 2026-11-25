/**
 * 数据快照日期的唯一来源（2026-11-25 复盘）
 *
 * 以前只有开放日页写「数据更新于」，其他页面要么写「采集于 2026-11」，
 * 要么什么都不写。家长看到 2025 COP 却不知道这是哪一年的快照。
 * 这里从 build-docs-data.cjs 的产物读 meta.generatedAt，转成 SGT 日期。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const META = JSON.parse(fs.readFileSync(path.join(BASE, 'docs/data/schools.json'), 'utf8')).meta;

/** ISO UTC → SGT 的 YYYY-MM-DD（UTC+8，用 UTC getter 避免机器时区干扰） */
function sgtDate(iso) {
  if (!iso) return '—';
  const d = new Date(Date.parse(iso) + 8 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

const date = sgtDate(META.generatedAt);
const copYear = META.copYear;

/** 统一的页脚一行。页面可读到「主数据是哪天、COP 是哪一年」。 */
function line() {
  return `<b>数据快照</b>　学校主数据（${META.total} 所 / COP ${copYear} 年度）更新于 ${date} SGT。`;
}

module.exports = { date, copYear, sgtDate, line };
