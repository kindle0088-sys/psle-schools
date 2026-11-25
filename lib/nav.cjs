/**
 * 全站导航的唯一来源（2026-11-25 复盘）
 *
 * 为什么需要它：以前每个生成器各写一份页脚，结果 Full SBB 页上线后
 * 只有首页和手册有入口，map / cohort / openhouse / plans 全都漏了；
 * 报告页则一个外链都没有。改一处漏三处，属于典型框架缺陷。
 *
 * 用法：
 *   const Nav = require('../lib/nav.cjs');
 *   Nav.nav('cohort')            → 顶部导航（当前页带 class="on"）
 *   Nav.foot('cohort')           → 页脚一行链接（当前页加粗，不重复链接自己）
 *   Nav.foot(null, '../')        → 报告页脚链接（在 docs/reports/ 下层）
 */
'use strict';

const PAGES = [
  { id: 'index', href: 'index.html', label: '学校看板' },
  { id: 'map', href: 'map.html', label: '通勤地图' },
  { id: 'guide', href: 'guide.html', label: '填报手册' },
  { id: 'full-sbb', href: 'full-sbb.html', label: 'Full SBB' },
  { id: 'openhouse', href: 'openhouse.html', label: '开放日' },
  { id: 'cohort', href: 'cohort.html', label: '考生数据' },
  { id: 'plans', href: 'plans.html', label: '志愿方案' },
];

/** 顶部导航：current 命中的项加 class="on"。prefix 用于报告页的下级目录。 */
function nav(current, prefix = '') {
  return PAGES.map(p =>
    `<a href="${prefix}${p.href}"${p.id === current ? ' class="on"' : ''}>${p.label}</a>`
  ).join('\n      ');
}

/** 页脚链接：7 个入口一律可点（当前页带 class="on"），
    这样每个页面都能互达，verify-nav 也能做硬断言。 */
function foot(current, prefix = '') {
  return PAGES.map(p => `<a href="${prefix}${p.href}"${p.id === current ? ' class="on"' : ''}>${p.label}</a>`)
    .join(' ｜ ');
}

module.exports = { PAGES, nav, foot };
