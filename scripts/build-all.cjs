#!/usr/bin/env node
/**
 * 一次跑完所有页面生成器（scripts/build-all.cjs）
 *
 * 为什么需要它：改一个色板、一份数据、一条 CTA，往往要手动跑 6–8 个生成器。
 * 少跑一个的后果不是报错，而是**页面静默停在旧内容** —— 例如漏跑
 * build-plans-index.cjs，方案看板就不会出现新生成的报告，而其他页面看起来一切正常。
 *
 * 顺序有硬依赖，不能随意调换：
 *   build-docs-data      产出 docs/data/schools.json（COP/星号/步行/历史）
 *     → score-candidates 按学生算候选池（读上面那份 schools.json）
 *       → 报告生成器     写 reports/*.html，并把方案摘要写进 students-index.json
 *         → build-plans-index  读 students-index 渲染方案看板 → **必须最后**
 *
 * 用法：
 *   node scripts/build-all.cjs              只构建
 *   node scripts/build-all.cjs --verify     构建后跑离线验证器（不需要浏览器）
 *   node scripts/build-all.cjs --verbose    逐步打印子进程输出
 *   node scripts/build-all.cjs --only=guide,plans   只跑指定步骤
 *
 * 注意：verify-board / verify-map 需要浏览器 + 静态服务器，不在此列，见文末提示。
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BASE = path.join(__dirname, '..');
const P = (...a) => path.join(BASE, ...a);

const argv = process.argv.slice(2);
const has = k => argv.includes('--' + k);
const VERBOSE = has('verbose');
const VERIFY = has('verify');
const ONLY = (argv.find(a => a.startsWith('--only=')) || '').split('=')[1]
  ? argv.find(a => a.startsWith('--only=')).split('=')[1].split(',').map(x => x.trim()).filter(Boolean)
  : null;

const startedAt = Date.now();
const c = (code, s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = s => c('2', s);
const ok = s => c('32', s);
const bad = s => c('31', s);
const warn = s => c('33', s);

/* ── 学生清单 ────────────────────────────────────────────────
   新加一个学生只需要在 data/students/ 放一份 JSON，这里自动纳入。 */
const STUDENTS = fs.readdirSync(P('data/students'))
  .filter(f => f.endsWith('.json') && f !== 'active.json')
  .map(f => {
    const j = JSON.parse(fs.readFileSync(P('data/students', f), 'utf8'));
    return { id: j.id || f.replace(/\.json$/, ''), al: j.psle?.al, planSlug: j.outputs?.planSlug };
  })
  .filter(s => s.id);

/* 报告生成器：abc1 的报告是逐句定制的（v2），其余走配置驱动的通用生成器。
   不在表里的学生默认走通用生成器 —— 这是有意为之：新学生不该要求改代码。 */
const REPORT_GEN = { abc1: 'build-report-v2.cjs' };
const DEFAULT_REPORT_GEN = 'build-report-plan.cjs';

/* ── 步骤 ─────────────────────────────────────────────────── */
const steps = [];
const add = (label, script, env = {}, note = '') => steps.push({ label, script, env, note });

add('数据层 docs/data/schools.json', 'build-docs-data.cjs');
for (const s of STUDENTS) {
  add(`候选池 ${s.id}（AL ${s.al}）`, 'score-candidates.cjs', { STUDENT: s.id });
}
for (const s of STUDENTS) {
  const gen = REPORT_GEN[s.id] || DEFAULT_REPORT_GEN;
  add(`志愿报告 ${s.id}（${gen.replace('.cjs', '')}）`, gen, { STUDENT: s.id },
    s.planSlug ? `→ reports/${s.planSlug}.html` : '');
}
add('13 份单校深度报告', 'build-school-reports.cjs');
add('考生人数与学额页', 'build-cohort-page.cjs');
add('家长学习手册', 'build-guide.cjs');
add('开放日汇总页', 'build-openhouse-page.cjs');
add('方案看板（须最后）', 'build-plans-index.cjs');

const selected = ONLY ? steps.filter(s => ONLY.some(k => s.label.includes(k) || s.script.includes(k))) : steps;
if (!selected.length) {
  console.error(bad('✗ --only 没有匹配到任何步骤'));
  process.exit(1);
}

/* ── 执行 ─────────────────────────────────────────────────── */
console.log(`\n${c('1', '▸ 构建全部页面')}  ${dim(`${selected.length} 个步骤 · 学生 ${STUDENTS.map(s => s.id).join(' / ')}`)}\n`);

const failures = [];
const width = Math.max(...selected.map(s => s.label.length));
let done = 0;

for (let i = 0; i < selected.length; i++) {
  const s = selected[i];
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [P('scripts', s.script)], {
    cwd: BASE,
    env: { ...process.env, ...s.env },
    encoding: 'utf8',
    // 输出很多（13 份报告逐行打印），默认不占屏；失败时再吐出来
    stdio: VERBOSE ? 'inherit' : 'pipe',
  });
  const ms = Date.now() - t0;
  const tag = `${String(i + 1).padStart(2)}/${selected.length}`;

  /* r.error 非空 = 子进程根本没起来（Node 路径错、脚本不存在），
     此时 r.status 是 null —— 只判 status !== 0 会把它当成功。 */
  const failed = !!r.error || r.status !== 0;
  if (failed) {
    failures.push({ step: s, r, ms });
    console.log(`  ${dim(tag)}  ${s.label.padEnd(width)}  ${bad('✗')}  ${dim(ms + 'ms')}`);
    const out = [r.error ? `spawn 失败：${r.error.message}` : '', r.stdout || '', r.stderr || '']
      .filter(Boolean).join('\n').trim().split('\n');
    /* 失败时不要整段堆栈刷屏（缺文件时 node 会打 10 行 require 栈），
       留头尾各几行，中间省略 —— 真要全量看，用 --verbose。 */
    /* 截断要有取舍：node 的堆栈开头是 loader 内部帧，真正有用的是
       「Cannot find module …」这类行。优先保留报错行，再补尾两行。 */
    const key = out.filter(l => /error|cannot|not found|✗|failed|undefined/i.test(l) && !/^\s+at /.test(l));
    const show = out.length <= 12 ? out
      : [...new Set([...out.slice(0, 2), ...key.slice(0, 4), `…（省略 ${out.length - 8} 行，加 --verbose 看全部）`, ...out.slice(-2)])];
    console.log(show.map(l => '        ' + l).join('\n'));
    break;   // 前一步失败就让后面停下：否则会用旧数据继续生成页面，越跑越乱
  }
  done++;
  console.log(`  ${dim(tag)}  ${s.label.padEnd(width)}  ${ok('✓')}  ${dim(ms + 'ms')}`);
}

if (failures.length) {
  const rest = selected.length - done - 1;
  console.log(`\n${bad('✗ 第 ' + (done + 1) + ' 步失败')}：${failures[0].step.script}`);
  if (rest > 0) console.log(dim(`  后续 ${rest} 个步骤未执行（继续跑会用旧数据覆盖页面，不如先修）`));
  process.exit(1);
}

/* ── 产物核对：文件必须被这次运行改过 ─────────────────────────
   只看「步骤退出码为 0」不够：生成器可能因为数据为空而写出一个空文件，
   或者--only 漏掉了关键步骤。用 mtime 比开始时间更硬。 */
const EXPECT = [
  'docs/data/schools.json',
  'docs/data/students-index.json',
  'docs/cohort.html',
  'docs/guide.html',
  'docs/plans.html',
  'docs/openhouse.html',
  ...STUDENTS.filter(s => s.planSlug).map(s => `docs/reports/${s.planSlug}.html`),
];
/* 只核对「由生成器产出」的报告：docs/reports 里还留着 v1 手写存档
   （school-compassvale-secondary.html，2026-11-09），它不由任何脚本生成，
   放进这里会每天报一次假警。判据用生成器标记，比维护白名单可靠。 */
const schoolReports = fs.readdirSync(P('docs/reports'))
  .filter(f => /^school-.*\.html$/.test(f))
  .filter(f => /name="generator" content="psle-school-report\//.test(
    fs.readFileSync(P('docs/reports', f), 'utf8').slice(0, 4000)));
EXPECT.push(...schoolReports.map(f => `docs/reports/${f}`));

const stale = [];
for (const rel of (ONLY ? [] : EXPECT)) {
  const p = P(rel);
  if (!fs.existsSync(p)) { stale.push([rel, '缺失']); continue; }
  const mtime = fs.statSync(p).mtimeMs;
  if (mtime < startedAt - 1000) stale.push([rel, '未被本次构建更新']);
}

const total = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`\n${ok(`✓ ${selected.length} 个步骤完成`)}  ${dim(total + 's')}  ${dim(`· ${EXPECT.length} 个产物`)}`);
if (ONLY) console.log(dim('  （--only 模式下跳过「产物是否都被更新」的核对）'));
if (stale.length) {
  console.log(warn(`⚠ ${stale.length} 个产物没被这次构建更新：`));
  stale.slice(0, 8).forEach(([f, why]) => console.log(`    ${f}  ${dim(why)}`));
  if (stale.length > 8) console.log(dim(`    …另有 ${stale.length - 8} 个`));
}

/* ── 可选：离线验证 ───────────────────────────────────────── */
if (VERIFY) {
  const offline = [
    ['主题与色板', 'verify-theme.cjs'],
    ['CCA 清单', 'verify-cca-catalog.cjs'],
    ['多学生配置', 'verify-students.cjs'],
    ['考生人数页', 'verify-cohort-page.cjs'],
    ['家长手册', 'verify-guide.cjs'],
    ['方案看板', 'verify-plans-index.cjs'],
    ['开放日页', 'verify-openhouse.cjs'],
  ];
  /* 报告验证器按「谁生成了它」选：v2 的产物用 verify-report-v2，
     通用生成器的产物用 verify-plan-report（需要文件路径 + 学生 id）。 */
  for (const s of STUDENTS) {
    if ((REPORT_GEN[s.id] || DEFAULT_REPORT_GEN) === 'build-report-v2.cjs') offline.push([`报告 ${s.id}`, 'verify-report-v2.cjs']);
    else if (s.planSlug) offline.push([`报告 ${s.id}`, 'verify-plan-report.cjs', `docs/reports/${s.planSlug}.html`, '--student', s.id]);
  }
  offline.push(['单校报告 ×' + schoolReports.length, 'verify-all-school-reports.cjs']);

  console.log(`\n${c('1', '▸ 离线验证')}\n`);
  let vfail = 0;
  for (const [label, script, ...args] of offline) {
    const scriptPath = P('scripts', script);
    if (!fs.existsSync(scriptPath)) { console.log(`  ${label.padEnd(20)} ${warn('跳过（脚本不存在）')}`); continue; }
    const r = spawnSync(process.execPath, [scriptPath, ...args], { cwd: BASE, encoding: 'utf8' });
    const failed = !!r.error || r.status !== 0;
    const last = (r.stdout || '').trim().split('\n').pop() || '';
    if (failed) {
      vfail++;
      console.log(`  ${label.padEnd(20)} ${bad('✗')}  ${last}`);
      console.log((r.stdout || '').split('\n').filter(l => l.includes('❌')).map(l => '      ' + l).join('\n'));
    } else {
      console.log(`  ${label.padEnd(20)} ${ok('✓')}  ${dim(last)}`);
    }
  }
  if (vfail) { console.log(`\n${bad(`✗ ${vfail} 组验证未通过`)}`); process.exit(1); }
  console.log(`\n${ok('✓ 离线验证全部通过')}`);
}

console.log(dim(`
需要浏览器才能跑的两组，手动执行：
  SITE=http://127.0.0.1:8901 node scripts/verify-board.cjs
  CDP_PORT=9231 node scripts/verify-map.cjs`));
