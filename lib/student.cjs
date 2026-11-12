/**
 * 学生画像加载器 —— 所有脚本的唯一输入源。
 *
 * 目的：换一个孩子不用改代码。
 *   ① 新建 data/students/<id>.json
 *   ② 跑脚本时带 STUDENT=<id>（或改 data/students/active）
 *   ③ 报告输出到 outputs.planSlug 指定的文件名
 *
 * 为什么要单独抽出来：改造前 AL 分数、邮编、通勤上限、学生 id 分散在
 * analyze-student / score-candidates / build-report-v2 等多个脚本里，
 * 换一个学生要改 6 处，且容易漏改。
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const DIR = path.join(BASE, 'data/students');
const DEFAULT_ID = 'abc1';

function listIds() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR)
    .filter(f => f.endsWith('.json') && f !== 'active.json')
    .map(f => f.replace(/\.json$/, ''))
    .sort();
}

/** 优先级：参数 > 环境变量 STUDENT > active.json 指针 > 默认 abc1 */
function resolveId(explicit) {
  if (explicit) return explicit;
  if (process.env.STUDENT) return process.env.STUDENT;
  const p = path.join(DIR, 'active.json');
  if (fs.existsSync(p)) {
    try {
      const a = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (a.active) return a.active;
    } catch (_) { /* 指针损坏则退回默认 */ }
  }
  return DEFAULT_ID;
}

function fail(msg) {
  console.error('\n✗ 学生配置有误：' + msg + '\n');
  process.exit(1);
}

/**
 * 读取并校验学生配置。校验刻意严格——配置写错时应该在第一步就炸，
 * 而不是跑完全流程产出一份数字错误的报告。
 */
function load(explicitId) {
  const id = resolveId(explicitId);
  const file = path.join(DIR, id + '.json');
  if (!fs.existsSync(file)) {
    fail(`找不到 data/students/${id}.json。已有：${listIds().join(', ') || '（无）'}`);
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    fail(`data/students/${id}.json 不是合法 JSON —— ${e.message}`);
  }

  const al = raw?.psle?.al;
  if (!Number.isInteger(al) || al < 4 || al > 30) {
    fail(`${id}.psle.al 必须是 4–30 的整数，现在是 ${JSON.stringify(al)}`);
  }

  const postal = raw?.home?.postal;
  if (!/^\d{6}$/.test(String(postal || ''))) {
    fail(`${id}.home.postal 必须是 6 位数字，现在是 ${JSON.stringify(postal)}`);
  }

  const maxCommuteMin = raw?.constraints?.maxCommuteMin;
  if (!(maxCommuteMin > 0)) {
    fail(`${id}.constraints.maxCommuteMin 必须是正数`);
  }

  const planSlug = raw?.outputs?.planSlug;
  if (!planSlug) {
    fail(`${id}.outputs.planSlug 未设置（决定报告输出文件名）`);
  }

  const c = raw.constraints || {};
  const coords = raw.home?.lat != null && raw.home?.lon != null
    ? { lat: +raw.home.lat, lon: +raw.home.lon }
    : null;

  const pgNum = al <= 20 ? 3 : al <= 24 ? 2 : 1;
  return {
    id,
    label: raw.label || id,
    file,
    al,
    year: raw.psle.year ?? null,
    // 两种写法都要：短代号给文案用，完整标签给 schools.json 的 rows.label 匹配用
    postingGroup: 'PG' + pgNum,
    postingGroupLabel: 'Posting Group ' + pgNum,
    home: {
      postal: String(postal),
      address: raw.home.address || null,
      coords,
    },
    maxCommuteMin,
    // ⚠️ 这是「通勤评分满分线」，不是 PSLE 分数。默认取上限的 40%，可在配置里覆盖。
    commuteFullMarkMin: c.commuteFullMarkMin ?? Math.round(maxCommuteMin * 0.4),
    gender: c.gender || 'any',
    hasAffiliation: !!c.hasAffiliation,
    dsaApplicant: !!c.dsaApplicant,
    interests: raw.interests || { academic: [], cca: [] },
    planSlug,
    notes: raw.notes || null,
  };
}

/** MOE SchoolFinder 邮编筛选结果（按邮编天然区分学生） */
function nearbyFile(student) {
  return path.join(BASE, `data/moe-nearby-${student.home.postal}.json`);
}

function hasNearby(student) {
  return fs.existsSync(nearbyFile(student));
}

module.exports = { BASE, DIR, DEFAULT_ID, listIds, resolveId, load, nearbyFile, hasNearby };
