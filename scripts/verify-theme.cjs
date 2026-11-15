#!/usr/bin/env node
/**
 * 主题一致性验证器
 * 用法: node scripts/verify-theme.cjs
 *
 * 换主题最容易出两类问题，而且都是「看起来没事、实际很糟」：
 *   ① 某个页面漏改，混进浅色块 —— 靠人工翻页面很难全覆盖
 *   ② 颜色换了但对比度不够，小字在深底上看不清 —— 截图缩放下几乎发现不了
 * 所以这里做三件事：
 *   A. 两份色板（tokens.css 与看板的 assets/style.css）必须逐值相同
 *   B. plan.css / school.css 里不许出现色值字面量（打印块除外）
 *   C. 用 WCAG 公式算对比度，按正文 4.5:1 逐对检查
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(BASE, p), 'utf8');

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => {
  if (ok) { pass++; console.log('  ✅ ' + name + (detail ? ' — ' + detail : '')); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
};

/* ── 颜色工具 ───────────────────────────────────────── */
const parse = v => {
  v = String(v).trim();
  let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    return { rgb: [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)), a: 1 };
  }
  m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/);
  if (m) return { rgb: [+m[1], +m[2], +m[3]], a: m[4] == null ? 1 : +m[4] };
  return null;
};
const over = (fg, bg) => fg.rgb.map((c, i) => Math.round(c * fg.a + bg.rgb[i] * (1 - fg.a)));
const lum = rgb => {
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const [r, g, b] = rgb.map(f);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** 直接吃两个 {rgb,a}，a<1 时先叠到下一层 */
const cr = (fg, bg) => {
  const f = fg.a < 1 ? over(fg, bg) : fg.rgb;
  const b = bg.a < 1 ? over(bg, { rgb: [0, 0, 0], a: 1 }) : bg.rgb;
  const [x, y] = [lum(f), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/* ── A. 抽取两份色板 ────────────────────────────────── */
const grab = css => {
  const out = {};
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) out[m[1]] = m[2].trim();
  return out;
};
const TOK = grab(read('scripts/tpl/tokens.css'));
const BOARD = grab(read('docs/assets/style.css'));
const SHARED = ['--bg', '--card', '--line', '--tx', '--tx2', '--tx3', '--accent', '--accent-dim', '--warm'];
/* 两份文件对同一个颜色用了不同名字：模板叫 --warm，看板叫 --amber。
   验证要认语义，不要去改其中一边的命名。 */
const RENAME = { '--warm': '--amber' };

console.log('\n══ 一、两份色板必须一致（tokens.css ⇄ 看板 style.css）');
for (const k of SHARED) {
  const a = (TOK[k] || '').toLowerCase().replace(/\s/g, '');
  const b = (BOARD[RENAME[k] || k] || '').toLowerCase().replace(/\s/g, '');
  t(`${k} ${RENAME[k] ? '= 看板 ' + RENAME[k] : '一致'}`, a === b && a !== '', `${a || '缺失'} / ${b || '缺失'}`);
}

console.log('\n══ 二、模板里不许出现色值字面量');
for (const f of ['scripts/tpl/plan.css', 'scripts/tpl/school.css']) {
  const css = read(f);
  const cut = css.indexOf('@media print');
  const head = cut > 0 ? css.slice(0, cut) : css;
  const lits = [...head.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d+/g)].map(m => m[0]);
  t(`${f.split('/').pop()} 无非变量色值`, lits.length === 0,
    lits.slice(0, 6).join(',') || '全部走 var()');
  t(`${f.split('/').pop()} 有打印用的浅色回退`, cut > 0 && /--bg:#fff/.test(css.slice(cut)));
}

console.log('\n══ 三、对比度（WCAG AA：正文 4.5:1）');
{
  const bg = parse(TOK['--bg']);
  const card = parse(TOK['--card']);
  const pairs = [
    ['正文 --tx on --bg', parse(TOK['--tx']), bg, 4.5],
    ['次级 --tx2 on --bg', parse(TOK['--tx2']), bg, 4.5],
    ['弱化 --tx3 on --bg', parse(TOK['--tx3']), bg, 4.5],
    ['弱化 --tx3 on --card', parse(TOK['--tx3']), card, 4.5],
    ['正文 --tx on --card', parse(TOK['--tx']), card, 4.5],
    ['链接 --accent on --bg', parse(TOK['--accent']), bg, 4.5],
    ['强调块文字 on --accent', parse(TOK['--accent-ink']), parse(TOK['--accent']), 4.5],
    ['警告 --warm on --warm-bg', parse(TOK['--warm']), parse(TOK['--warm-bg']), 4.5],
    ['风险 --risk on --risk-bg', parse(TOK['--risk']), parse(TOK['--risk-bg']), 4.5],
    ['达成 --ok on --ok-bg', parse(TOK['--ok']), parse(TOK['--ok-bg']), 4.5],
  ];
  for (const [name, fg, bgn, min] of pairs) {
    const v = cr(fg, bgn);
    t(name, v >= min, `${v.toFixed(2)} : 1（≥ ${min}）`);
  }
}

console.log('\n══ 四、生成物里不能残留旧浅色主题');
{
  const LIGHT = ['#fbfbf9', '#e4e4e0', '#efefec', '#f7f7f4', '#eef6f3', '#0f5c4e'];
  const pages = [
    'docs/cohort.html', 'docs/guide.html', 'docs/plans.html',
    'docs/reports/abc2-s1-choice-2026.html',
    'docs/reports/abc1-s1-choice-2026-v2.html',
    'docs/reports/school-greendale-secondary-school.html',
    'docs/reports/school-yusof-ishak-secondary-school.html',
  ];
  for (const p of pages) {
    if (!fs.existsSync(path.join(BASE, p))) { t(`${p} 存在`, false); continue; }
    const html = read(p);
    const head = html.slice(0, html.indexOf('@media print') + 1 || html.length);
    const hits = LIGHT.filter(h => head.includes(h));
    t(`${p.split('/').pop()} 用深色底且无浅色残留`,
      html.includes('--bg:#0a0f1a') && hits.length === 0, hits.join(',') || '干净');
  }
}

/* ── 跨页共享的类名必须真的有规则 ─────────────────────────────
   .grid2 / .panel 曾只定义在 school.css，而手册与考生页只引 plan.css，
   于是「有结构、没样式」，两栏块静默堆成普通段落；
   .mid 同样只在 school.css 里，866 个单元格的居中全部空转。
   这类问题肉眼很难发现，所以把「用到的类名 ⇄ 存在的规则」做成断言。 */
{
  const CSS_ALL = fs.readFileSync(path.join(BASE, 'scripts/tpl/tokens.css'), 'utf8')
    + fs.readFileSync(path.join(BASE, 'scripts/tpl/plan.css'), 'utf8');
  const pages = ['docs/guide.html', 'docs/cohort.html', 'docs/plans.html', 'docs/reports/abc2-s1-choice-2026.html'];
  const used = new Set();
  for (const p of pages) {
    if (!fs.existsSync(path.join(BASE, p))) continue;
    const h = fs.readFileSync(path.join(BASE, p), 'utf8');
    for (const m of h.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).forEach(c => c && used.add(c));
  }
  /* 只查「模板里会用到、且必须靠 CSS 才有意义」的类；纯 JS 钩子（如 data-*）、
     工具类（soft 等）也一并纳入，因为漏了它们同样会静默失效。 */
  const must = ['mid', 'grid2', 'panel', 'num', 'soft', 'note', 'warnbox', 'verdict', 'tag', 'toc', 'profile', 'badge', 'tier'];
  const missing = must.filter(c => used.has(c) && !new RegExp(`\\.${c}(?![\\w-])`).test(CSS_ALL));
  t('页面用到的关键类名在 plan.css 里都有规则', missing.length === 0,
    missing.length ? missing.join(',') : must.filter(c => used.has(c)).join(','));
  t('.mid 在 plan.css 里是居中（而不是空转）',
    /th\.mid,\s*td\.mid\{text-align:center\}/.test(CSS_ALL.replace(/\n/g, '')));

  /* 两个样式表里都有定义的组件分两类，要求不同：
     SAME   = 逐字复制的（toc / warnbox / tag / note），必须一模一样，否则改一处另一处悄悄旧掉；
     EXISTS = 按各自版面调过的（verdict / panel / grid2），只要求两边都存在 ——
              单校报告的卡片本来就比手册宽，强行统一反而会破坏版面。 */
  const SCHOOL_CSS = fs.readFileSync(path.join(BASE, 'scripts/tpl/school.css'), 'utf8');
  const PLAN_CSS = fs.readFileSync(path.join(BASE, 'scripts/tpl/plan.css'), 'utf8');
  const ruleOf = (css, sel) => {
    const i = css.indexOf(sel);
    if (i < 0) return null;
    const j = css.indexOf('}', i);
    return css.slice(i, j + 1).replace(/\s+/g, '');
  };
  const SAME = ['.toc{', '.warnbox{', '.tag{', '.note{'];
  const EXISTS = ['.verdict{', '.panel{', '.grid2{', 'th.mid,td.mid{'];
  const drift = SAME.filter(sel => {
    const a = ruleOf(SCHOOL_CSS, sel), b = ruleOf(PLAN_CSS, sel);
    return a && b && a !== b;
  });
  t('逐字复制的组件两份完全一致', drift.length === 0, drift.join(',') || `${SAME.length} 组一致`);
  const absent = EXISTS.filter(sel => !ruleOf(SCHOOL_CSS, sel) || !ruleOf(PLAN_CSS, sel));
  t('两侧都定义了各自的版面组件', absent.length === 0, absent.join(',') || `${EXISTS.length} 组齐全`);
}

console.log('\n' + '═'.repeat(26));
console.log(pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
