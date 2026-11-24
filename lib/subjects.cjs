/**
 * 科目高亮判定（单校深度报告用）
 *
 * 设计原则：不主观给科目贴「好/坏」，只给两个**可复核的客观维度**：
 *   1) 特色项 = 全岛开设校数少（<= RARE_MAX），说明它是这校能提供的稀缺选项；
 *   2) 强项项 = 校方在 ALP / LLP / Electives 栏目里**自己点名**的学科领域，
 *      用保守关键词匹配（只认明确学科词，不认 "technology/innovation" 这类泛词）。
 * 两项都用中性强调色高亮，判定口径写进报告，家长自行判断是否需要。
 *
 * 数据源：data/schools.json（MOE SchoolFinder 官方采集，2026-11）。
 * 注意 docs/data/schools.json 为了体积刻意剥离 subjects，必须从源数据取。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const RAW = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'schools.json'), 'utf8'));
const BY_SLUG = new Map(RAW.map(s => [s.slug, s]));
const NOTE_RE = /offered to the current student cohort|Tamil Language will have to attend/i;
const SPECIAL_SCHOOLS = new Set(['School of the Arts, Singapore', 'Singapore Sports School']);
const RARE_MAX = 40;   // 全岛 <=40/145 校提供 → 判为「特色项」，阈值写进报告便于复核
/* 共同课程与写法变体不能算「特色」：CCE / 完整名两种写法会让只有 6 校用缩写，
   归一后仍被误判稀缺；Humanities / 组合科学 / 级别模块同理。这与 abcd2 的口径一致。 */
const RARE_IGNORE = new Set([
  'cce', 'character and citizenship education', 'social studies', 'physical education',
  'humanities', 'combined science', 'elective module', 'applied learning programme',
  'food and consumer education', 'character and citizenship education (cce)',
]);

const norm = s => String(s).toLowerCase().replace(/&/g, ' and ').replace(/\s+/g, ' ').trim();
const clean = arr => (arr || []).filter(v => !NOTE_RE.test(v));
function canon(v) {
  const s = norm(v);
  if (/^design (and|&) technology$/.test(s)) return 'design and technology';
  if (/^humanities/.test(s)) return 'humanities';
  if (/^science \(/.test(s)) return 'combined science';
  if (/^cce/.test(s)) return 'cce';
  if (/^d\d /.test(s)) return 'elective module';
  return s;
}

/* 全岛科目校数（排除专门课程校，分母写进报告） */
const COUNTS = new Map();
const DENOM = RAW.filter(s => !SPECIAL_SCHOOLS.has(s.name) && (s.subjects || []).length).length;
for (const s of RAW) {
  if (SPECIAL_SCHOOLS.has(s.name)) continue;
  for (const k of new Set(clean(s.subjects).map(canon))) COUNTS.set(k, (COUNTS.get(k) || 0) + 1);
}

/* 强项关键词：subject 判定式 → 只在 ALP/LLP/Electives 文本出现明确学科词时命中。
   「泛词」（technology / innovation / future / stem 单独出现）刻意不纳入，避免全校皆中失去区分度。 */
const STRONG_RULES = [
  { key: /^nutrition and food science$/, kw: /food science|food for the future|culinary|baking|hospitality|catering/i },
  { key: /^computing$/, kw: /comput(ing|er)|coding|programming|infocomm|\bict\b|robot/i },
  { key: /^design and technology$/, kw: /design.*technology|design, technology|engineering|robotic/i },
  { key: /^art$|^higher art$/, kw: /art elective|aesthetics|\bart\b.*programme|visual arts/i },
  { key: /^music$|^higher music$/, kw: /music|concert band|ensemble/i },
  { key: /^elements of business skills$|^principles of accounts$/, kw: /business and enterprise|business skills|entrepreneur|\benterprise\b/i },
  { key: /^exercise and sports science$/, kw: /sports science|sports for life|character.*sports/i },
  { key: /^higher chinese language$/, kw: /chinese language elective|clep/i },
  { key: /^drama$/, kw: /drama|theatre/i },
  { key: /^electronics$/, kw: /electronics/i },
];

/**
 * @returns {{items: Array<{name, rare, strong, count}>, rareCount, strongCount,
 *            denom, rareMax, programmes: string[], subjectsFound: boolean}}
 */
function subjectProfile(slug) {
  const s = BY_SLUG.get(slug);
  if (!s) return { items: [], rareCount: 0, strongCount: 0, denom: DENOM, rareMax: RARE_MAX, programmes: [], subjectsFound: false };
  const subjects = clean(s.subjects);
  const programmes = (s.electives || [])
    .filter(e => /ALP|LLP|Electives|Programmes/i.test(e.type || ''))
    .flatMap(e => (e.items || []).map(i => String(i).trim())).filter(Boolean);
  const progText = programmes.join(' | ');

  const seen = new Set();
  const items = [];
  for (const name of subjects) {
    const k = canon(name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const count = COUNTS.get(k) ?? DENOM;
    const rare = count <= RARE_MAX && !RARE_IGNORE.has(k);
    const strong = STRONG_RULES.some(r => r.key.test(k) && r.kw.test(progText));
    items.push({ name, rare, strong, count });
  }
  items.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return {
    items,
    rareCount: items.filter(i => i.rare).length,
    strongCount: items.filter(i => i.strong).length,
    denom: DENOM,
    rareMax: RARE_MAX,
    programmes,
    subjectsFound: items.length > 0,
  };
}

module.exports = { subjectProfile, RARE_MAX, DENOM, clean, canon };
