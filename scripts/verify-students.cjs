/**
 * 多学生支持的质量闸门。
 *
 * 核心命题：「换一个学生不用改代码」。所以这里既查数据，也查代码里有没有
 * 又偷偷写死学生信息。
 *
 * 断言分四组：
 *   一、每个 students/<id>.json 合法
 *   二、每个学生的中间产物自洽（池子 + 被排除 = 通勤内够得着）
 *   三、报告存在且带有该学生的标识
 *   四、脚本与页面里没有残留的硬编码学生信息（这是最容易复发的一类）
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const Stu = require('../lib/student.cjs');

let pass = 0, fail = 0;
const t = (name, ok, extra = '') => {
  if (ok) { pass++; console.log('  ✅ ' + name + (extra ? ' — ' + extra : '')); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
};

const ids = Stu.listIds();

console.log('\n【一】学生配置合法性');
t('至少有一个学生配置', ids.length > 0, ids.join(', '));
const loaded = [];
for (const id of ids) {
  try {
    const s = Stu.load(id);
    loaded.push(s);
    t(`${id}：AL ${s.al} / ${s.home.postal} / ${s.maxCommuteMin}min → ${s.planSlug}`,
      s.al >= 4 && s.al <= 30 && /^\d{6}$/.test(s.home.postal) && !!s.planSlug);
  } catch (e) {
    t(`${id} 可加载`, false, e.message);
  }
}

console.log('\n【二】中间产物自洽');
for (const s of loaded) {
  const f = path.join(BASE, `data/_recommend-${s.id}.json`);
  if (!fs.existsSync(f)) {
    t(`${s.id} 有产物`, false, `缺 data/_recommend-${s.id}.json（先跑 score-candidates）`);
    continue;
  }
  const R = JSON.parse(fs.readFileSync(f, 'utf8'));
  const st = R.stats;
  t(`${s.id} 产物学生一致`, R.student.id === s.id, `${R.student.id}`);
  t(`${s.id} 池子口径自洽（${st.poolMixed} 混 + ${st.poolSingleSex} 单 = ${st.withinCommuteReachable}）`,
    st.poolMixed + st.poolSingleSex === st.withinCommuteReachable);
  t(`${s.id} 全国漏斗单调递减`,
    st.totalSchools >= st.withStudentPG && st.withStudentPG >= st.reachableNationwide &&
    st.reachableNationwide >= st.withinCommuteReachable,
    `${st.totalSchools}≥${st.withStudentPG}≥${st.reachableNationwide}≥${st.withinCommuteReachable}`);
  // 池子里不能出现「该校不开学生所属档位」的学校
  const badPG = R.pool.filter(x => !x.cop);
  t(`${s.id} 池内学校都有该档位区间`, badPG.length === 0, badPG.map(x => x.name).join(', '));
  // 单性别校不能重复出现在主池
  const poolNames = new Set(R.pool.map(x => x.name));
  const dup = R.singleSex.filter(x => poolNames.has(x.name));
  t(`${s.id} 单性别校不与主池重复`, dup.length === 0, dup.map(x => x.name).join(', '));
}

console.log('\n【三】报告存在且可识别');
for (const s of loaded) {
  const f = path.join(BASE, 'docs/reports', s.planSlug + '.html');
  if (!fs.existsSync(f)) {
    t(`${s.id} 报告存在`, false, `缺 ${s.planSlug}.html`);
    continue;
  }
  const html = fs.readFileSync(f, 'utf8');
  t(`${s.id} 报告存在`, true, `${Math.round(fs.statSync(f).size / 1024)}KB`);
  t(`${s.id} 报告标注了学生`, html.includes(s.id) || html.includes(s.label));
  t(`${s.id} 报告的 AL 与配置一致`, new RegExp(`AL ${s.al}(?!\\d)`).test(html), `AL ${s.al}`);
  t(`${s.id} 报告的邮编与配置一致`, html.includes(s.home.postal));
  // 非主学生必须带人工分析边界提示
  if (s.id !== Stu.DEFAULT_ID) {
    t(`${s.id} 带「人工分析未重写」提示`, html.includes('没有随配置自动改写'));
  }
}

console.log('\n【三之二】配置字段都有明确归属');
// 每个字段要么参与计算，要么明确标为「只供人读」。不允许存在第三种：
// 写了但谁都不看 —— 那才是最坑人的「看着能用」。
const ACTIVE = new Set([
  'psle.al',
  'home.postal', 'home.lat', 'home.lon',
  'constraints.maxCommuteMin', 'constraints.commuteFullMarkMin',
  'constraints.gender', 'constraints.hasAffiliation', 'constraints.weights',
  'interests.cca',
  'outputs.planSlug',
]);
const READONLY = new Set([
  'id', 'label', 'createdAt', 'notes', 'home.address',
  'interests.academic', '_note', '_生效说明',
]);
const leafPaths = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => {
  if (k.startsWith('_')) return [];
  const path = pre ? pre + '.' + k : k;
  if (v && typeof v === 'object' && !Array.isArray(v)) return leafPaths(v, path);
  return [path];
});
for (const id of ids) {
  const raw = JSON.parse(fs.readFileSync(path.join(BASE, 'data/students', id + '.json'), 'utf8'));
  const unknown = leafPaths(raw).filter(k => !ACTIVE.has(k) && !READONLY.has(k));
  t(`${id} 配置字段都有归属`, unknown.length === 0,
    unknown.length ? '未归类: ' + unknown.join(', ') : `${leafPaths(raw).length} 个字段`);
}

console.log('\n【四】代码里没有残留硬编码');
const scripts = fs.readdirSync(path.join(BASE, 'scripts'))
  .filter(f => f.endsWith('.cjs'))
  .map(f => ({ f, src: fs.readFileSync(path.join(BASE, 'scripts', f), 'utf8') }));

// 允许出现的地方：注释、示例文件、默认学生常量
const isComment = line => /^\s*(\/\/|\*|\/\*)/.test(line);

const hardPostal = [];
const hardSlug = [];
for (const { f, src } of scripts) {
  src.split('\n').forEach((line, i) => {
    if (isComment(line)) return;
    if (/['"`]828765['"`]/.test(line)) hardPostal.push(`${f}:${i + 1}`);
    // v1 归档文件名是固定的历史产物，不算硬编码
    if (/['"`]abc1-s1-choice-(?!2026\.html)/.test(line) || /['"`]abc1-s1-choice-2026-v2/.test(line)) {
      hardSlug.push(`${f}:${i + 1}`);
    }
  });
}
t('脚本里没有写死邮编 828765', hardPostal.length === 0, hardPostal.join(', '));
t('脚本里没有写死报告文件名', hardSlug.length === 0, hardSlug.join(', '));

// 页面里引用的志愿方案链接必须指向真实存在的报告
const page = fs.readFileSync(path.join(BASE, 'docs/index.html'), 'utf8');
const links = [...page.matchAll(/reports\/([a-z0-9-]+\.html)/g)].map(m => m[1]);
const brokenLinks = [...new Set(links)].filter(n => !fs.existsSync(path.join(BASE, 'docs/reports', n)));
t('看板的报告链接都指向真实文件', brokenLinks.length === 0, brokenLinks.join(', ') || `${new Set(links).size} 个链接`);

console.log(`\n══════ ${pass} 通过 / ${fail} 失败 ══════`);
process.exit(fail ? 1 : 0);
