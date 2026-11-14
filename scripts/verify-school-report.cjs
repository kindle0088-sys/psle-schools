#!/usr/bin/env node
/**
 * 单校深度报告验证器
 * 用法: node scripts/verify-school-report.cjs <html路径> [--slug <slug>]
 *
 * 一、结构完整性      任何学校都必须满足
 * 二、负向断言        不得出现已知错误表述（排除「剔除掉的错误信息」一节）
 * 三、数据一致性      从 docs/data/schools.json 取真值逐项核对，任何学校通用
 * 四、单校专属断言    仅对特定学校追加（如官网 O-Level 数字）
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const argFile = process.argv[2];
if (!argFile) { console.error('用法: node verify-school-report.cjs <html路径> [--slug xxx]'); process.exit(2); }
const slugIdx = process.argv.indexOf('--slug');
const file = path.resolve(argFile);

// slug 省略时从文件名推断：school-<slug>.html
let slug = slugIdx > -1 ? process.argv[slugIdx + 1] : null;
if (!slug) {
  const m = path.basename(file).match(/^school-(.+)\.html$/);
  if (m) slug = m[1];
}

if (!fs.existsSync(file)) { console.error('文件不存在:', file); process.exit(2); }
const html = fs.readFileSync(file, 'utf8');

let pass = 0, fail = 0;
const fails = [];
function t(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name + (detail ? ' — ' + detail : '')); }
  else { fail++; fails.push(name); console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function group(s) { console.log('\n══ ' + s); }
const stripTags = s => s.replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// ── 一、结构与模板残留 ──
group('一、结构完整性');
t('无未替换模板变量', !/\$\{|\{\{|TODO|FIXME|undefined/.test(html));
const anchors = (html.match(/id="s[1-8]"/g) || []).length;
t('含 8 个章节锚点', anchors === 8, anchors + ' 个');
t('含目录且锚点可跳转', html.includes('class="toc"') && html.includes('href="#s1"') && html.includes('href="#s8"'));
t('含数据来源章节', html.includes('数据来源与可信度'));
t('含开放日清单', (() => {
  const m = html.match(/<ol class="checklist">([\s\S]*?)<\/ol>/);
  return !!m && (m[1].match(/<li>/g) || []).length >= 8;
})(), (() => { const m = html.match(/<ol class="checklist">([\s\S]*?)<\/ol>/); return m ? (m[1].match(/<li>/g) || []).length + ' 条' : '缺失'; })());
t('有返回看板链接', html.includes('../index.html'));
t('有 noindex', html.includes('noindex'));
const dv = [(html.match(/<div/g) || []).length, (html.match(/<\/div>/g) || []).length];
t('HTML 标签闭合（div）', dv[0] === dv[1], dv[0] + ' 开 / ' + dv[1] + ' 闭');
t('table 标签闭合', (html.match(/<table/g) || []).length === (html.match(/<\/table>/g) || []).length);
t('section 标签闭合', (html.match(/<section/g) || []).length === (html.match(/<\/section>/g) || []).length);
t('样式完整（含打印规则与移动端）', html.includes('@media(max-width:600px)') && html.includes('@media print'));

// ── 二、负向断言 ──
// 「剔除掉的错误信息」一节会刻意引用错误说法作为反例，检查时须排除该节
group('二、已知错误表述（不得出现在正文）');
const negIdx = html.indexOf('我剔除掉的错误信息');
const negEndIdx = negIdx > -1 ? html.indexOf('</section>', negIdx) : -1;
const bodyOnly = negIdx > -1
  ? html.slice(0, negIdx) + html.slice(negEndIdx > -1 ? negEndIdx : html.length)
  : html;
t('「剔除错误」章节存在', negIdx > -1);

// 警示性引用（"把地址写成 Compassvale Lane"）是合法的，只抓「当事实陈述」的情况
function falseClaim(re, ctx = 60) {
  const hits = [...bodyOnly.matchAll(re)];
  return hits.some(m => {
    const around = bodyOnly.slice(Math.max(0, m.index - ctx), m.index + m[0].length + ctx);
    return !/剔除|错误|写成|写成|不是|误|错|非|实为|真实/.test(around);
  });
}
t('未把 Netball 说成网球', !falseClaim(/Netball[^。]{0,10}网球|网球[^。]{0,10}Netball/g));
t('未出现 40:1 师生比', !falseClaim(/40\s*[:：]\s*1/g, 30));
t('未把 ALP 说成环境科学', !/ALP[^。]{0,20}环境科学(?!.*可持续)/.test(bodyOnly));
t('未把概率/评分用红绿表示好坏', !/class="(gain|loss|up|down|pos|neg|num-red|num-green)"/.test(html));

// ── 三、数据一致性（任何学校通用）──
group('三、数据一致性（对照 schools.json）');
const data = JSON.parse(fs.readFileSync(path.join(BASE, 'docs/data/schools.json'), 'utf8'));
const arr = Array.isArray(data) ? data : (data.schools || []);
let s = slug ? arr.find(x => x.slug === slug) : null;
// 文件名推断可能少了 -school 后缀，兜底再找一次
if (!s && slug && arr.some(x => x.slug === slug + '-school')) {
  slug = slug + '-school';
  s = arr.find(x => x.slug === slug);
}
t('结构化数据中找到该校', !!s, slug || '(未指定 slug)');

if (s) {
  /* 通勤两列（2026-11-12 起）：步行来自 OSM 步行路网，地铁来自 MRT 模型，
     计分取最快。这里从 schools.json 的 commute 字段反查报告里的三个格子，
     防止生成器换了数据源但报告还印着旧值。 */
  /* 仅在现行模板产物上校验：靠生成器标记判断。
     v1 手写报告（如 Compassvale）结构完全不同，套新断言必然是假阳性。 */
  const isV2Template = /name="generator" content="psle-school-report\//.test(html);
  if (s.commute && isV2Template) {
    const c = s.commute;
    const walkCell = (html.match(/步行（自 \d{6}）<\/div><div class="v">([^<]*)/) || [])[1] || '';
    const mrtCell = (html.match(/<div class="k">地铁<\/div><div class="v">([^<]*)/) || [])[1] || '';
    const scoreCell = (html.match(/<div class="k">通勤计分<\/div><div class="v">([^<]*)/) || [])[1] || '';
    const wantWalk = c.walkRange ? `${c.walkRange[0]}–${c.walkRange[1]} 分钟（争议）`
      : (c.walkMin != null ? `${c.walkMin} 分钟` : '—');
    t('步行列与数据源一致', walkCell.trim() === wantWalk, `${walkCell.trim()} / 期望 ${wantWalk}`);
    t('地铁列与数据源一致', mrtCell.trim() === (c.mrtMin != null ? `${c.mrtMin} 分钟` : '—'), mrtCell.trim());
    t('通勤计分格标明采用哪一档',
      scoreCell.includes('步行') || scoreCell.includes('地铁'), scoreCell.trim());
    t('计分分钟数等于两路最快值',
      scoreCell.trim().startsWith(String(c.minutes)), `${scoreCell.trim()} / min=${c.minutes}`);
    // 争议项必须显式标注，不能只给一个数字让读者以为精确
    t('争议项显式标注「争议」', c.walkDisputed ? walkCell.includes('争议') : !walkCell.includes('争议'), walkCell.trim());
  }

  /* ── 三年走向（2026-11-14 新增）─────────────────────────
     只有当该校有 copHistory 时报告才该出现这块；没有数据的学校必须不出现，
     否则就是「看起来有趋势、其实是空的」。 */
  if (isV2Template) {
    const hasTrend = /PG3 录取区间：[0-9]{4} → [0-9]{4} 的走向/.test(html);
    const hist = s.copHistory;
    if (hist) {
      const okYears = ['2023', '2024'].filter(y => hist[y] && hist[y].status === 'ok');
      t('有历史数据时报告出现三年走向', hasTrend);
      t('走向注明来源是 Wayback 存档', /Wayback 存档的 MOE SchoolFinder/.test(html));
      /* ⚠️ 这条不要写成「匹配 <th class="mid">2023」——那是绑死了表格实现，
         一改成卡片布局就全线误报（本次踩过）。只验语义：三年都出现、两个箭头。 */
      const blk = (html.match(/PG3 录取区间：[\s\S]{0,2600}?不是「该年为 0 分」/) || [''])[0]
        || (html.match(/PG3 录取区间：[\s\S]{0,2200}?线上页面。/) || [''])[0];
      const yearsShown = ['2023', '2024', '2025'].filter(y => blk.includes(y));
      t('三年年份全部出现（缺年以 ? 占位）',
        okYears.length >= 1 && yearsShown.length === 3 && (blk.match(/→/g) || []).length >= 2,
        yearsShown.join('/') || '块未找到');
      /* 缺口必须分清「无存档」与「存档是坏值」，两者对读者的含义完全不同 */
      const miss = ['2023', '2024'].filter(y => hist[y] && hist[y].status !== 'ok');
      if (miss.length) {
        const kinds = miss.map(y => (hist[y].status === 'anomaly' ? '坏值，已弃用' : '没有可用存档'));
        t('缺口写明原因（无存档 / 坏值）', kinds.every(k => html.includes(k)), kinds.join('、'));
      }
      t('缺年不用 0 分代替', !/<td class="num mid">0–0<\/td>/.test(html));
    } else {
      t('无历史数据时不渲染三年走向', !hasTrend);
    }
  }

  // PG3 区间与余量
  const pg3 = (s.cop.rows || []).find(r => /Posting Group 3/.test(r.label))?.nonAff;
  if (pg3) {
    t(`PG3 区间与数据源一致（${pg3.min}–${pg3.max}）`,
      new RegExp(`${pg3.min}\\s*[–-]\\s*${pg3.max}`).test(html));
    // 余量可为负（17 分高于该校 PG3 上限），正数带 + 号、负数带 − 号
    const margin = pg3.max - 17;
    const mLabel = margin >= 0 ? `+${margin}` : String(margin);
    const mRe = margin >= 0 ? new RegExp(`\\+${margin}\\s*分`) : new RegExp(`−?-?${Math.abs(margin)}\\s*分`);
    t(`余量计算正确（${mLabel}）`, mRe.test(html));
  }

  // 学校性质（IP / SAP）如实标注
  t('IP / SAP 标注与数据源一致',
    html.includes('IP') && html.includes('SAP') &&
    (!s.ip || html.includes('Integrated')) &&
    (!s.sap || html.includes('SAP')));

  // 同一项目的不同官方写法（MOE 登记 vs 学校官网）
  const SYNONYM = {
    trackandfield: ['trackandfield', 'athletics'],
    athletics: ['athletics', 'trackandfield'],
    infocommtechnology: ['infocommtechnology', 'infocommclub', 'infocomm', 'mediatechclub', 'mediaresourceclub', 'mediaresource', 'mediatech'],
    stringensemble: ['stringensemble', 'strings'],
    stjohnbrigade: ['stjohnbrigade', 'stjohn'],
    concertband: ['concertband', 'symphonicband', 'windband'],
    symphonicband: ['symphonicband', 'concertband', 'windband'],
    choir: ['choir', 'voicesofjoy'],
    englishdrama: ['englishdrama', 'eldds', 'drama'],
    debating: ['debating', 'eldds', 'debate'],
    // 报告里常用缩写，catalog 用全称；两边都要能互认
    nationalcadetcorps: ['nationalcadetcorps', 'ncc'],
    nationalpolicecadetcorps: ['nationalpolicecadetcorps', 'npcc'],
    // 学校官网原文拼作 Taekwando（学校与 MOE 都这么写），不是 Taekwondo
    taekwondo: ['taekwondo', 'taekwando'],
    taekwando: ['taekwando', 'taekwondo'],
  };

  // 名称匹配：归一化（忽略大小写/空格/连字符/括号），并支持括号内缩写
  const norm = x => x.toLowerCase().replace(/[^a-z0-9]/g, '');
  const flatNorm = norm(stripTags(html));
  function hasItem(item) {
    const abbr = (item.match(/\(([A-Z]{2,})\)/) || [])[1];
    const main = item.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    const alts = SYNONYM[norm(main)] || [norm(main)];
    if (abbr && flatNorm.includes(norm(abbr))) return true;
    if (alts.some(a => flatNorm.includes(a))) return true;
    const words = main.toLowerCase().match(/[a-z]{3,}/g) || [];
    return words.length > 0 && words.every(w => flatNorm.includes(w));
  }

  // MOE 登记的 CCA 必须全部出现
  const moeCca = (s.cca || []).filter(Boolean);
  const ccaMissing = moeCca.filter(c => !hasItem(c));
  t(`MOE 登记 ${moeCca.length} 项 CCA 全部列出`, ccaMissing.length === 0,
    ccaMissing.length ? '缺: ' + ccaMissing.join(', ') : `${moeCca.length}/${moeCca.length}`);

  /* ── 双向断言：catalog 是权威完整清单，两个方向都要查 ──
     方向一（下面第一条）：catalog 里每一项都必须出现在报告中 → 防报告漏写
     方向二（第二条）：报告声称的总项数必须等于 catalog 的项数 → 防数字写错
     之所以需要方向二：过去只查方向一时，报告把「13 项」写成「14 项」、
     把「22 项」写成「约 19 项」，全部通过验证。单向断言查不出「数错」。 */
  const cat = JSON.parse(fs.readFileSync(path.join(BASE, 'data/cca-catalog.json'), 'utf8'));
  const entry = cat.schools[slug];
  if (entry) {
    const catMissing = entry.items.filter(it => {
      const names = [it.name, ...(it.aliases || [])];
      return !names.some(n => hasItem(n));
    });
    t(`目录 ${entry.items.length} 项 CCA 全部出现在报告`, catMissing.length === 0,
      catMissing.length ? '缺: ' + catMissing.map(x => x.name).join(', ') : `${entry.items.length}/${entry.items.length}`);

    // 报告「05 CCA 全解析」章节里必须出现正确的总项数
    const sec5 = (html.match(/<h2[^>]*id="s5"[\s\S]*?<h2[^>]*id="s6"/) || [''])[0];
    const total = entry.items.length;
    const claim = new RegExp(`${total}\\s*项`);
    t(`报告 CCA 总项数正确（${total} 项）`, claim.test(stripTags(sec5)),
      `章节内未见「${total} 项」`);

    // 反向：若报告写明了 MOE 登记数，必须准确（不强制每份都写，但写了不能错）
    const moeClaim = stripTags(sec5).match(/MOE\s*(?:仅)?登记\s*(\d+)\s*项/);
    t(`MOE 登记数无误（${entry.moeCount} 项）`,
      !moeClaim || Number(moeClaim[1]) === entry.moeCount,
      moeClaim ? `报告写 ${moeClaim[1]} 项，实际 ${entry.moeCount} 项` : '未提及（允许）');
  }

  // DSA 招生项目必须全部出现
  const dsa = (s.dsaAreas || []).filter(Boolean);
  const dsaMissing = dsa.filter(c => !hasItem(c));
  t(`DSA ${dsa.length} 个招生项目全部列出`, dsaMissing.length === 0,
    dsaMissing.length ? '缺: ' + dsaMissing.join(', ') : `${dsa.length}/${dsa.length}`);

  // 地址一致
  t('地址与数据源一致', html.includes(s.address.split(',')[0].trim()));

  // ALP / LLP 名称一致（官网与 MOE 登记措辞常有出入，只核关键词）
  for (const g of (s.electives || [])) {
    const isAlp = (g.type || '').includes('Applied');
    const items = g.items || [];
    if (!items.length) continue;
    // 取名称里最独特的 1–2 个英文词做锚点；按词干前缀匹配，容忍 Nurture/Nurturing 这类措辞差异
    const words = items[0].replace(/&amp;/g, '&').match(/[A-Za-z][A-Za-z-]{3,}/g) || [];
    const stems = words.slice(0, 2).map(w => w.slice(0, 5));
    const anchor = words.slice(0, 2).join(' ');
    const ok = stems.length && stems.every(st => new RegExp(st, 'i').test(html));
    t(`${isAlp ? 'ALP' : 'LLP'} 内容与数据源对应（${anchor || items[0].slice(0, 20)}）`, !!ok);
  }

  /* 通勤时间（由 build 脚本计算，允许 ±2 分钟）
     现行模板给的是「通勤计分 N 分钟」；v1 老报告写「约 N 分钟」，两种都认。 */
  const cm = (html.match(/约\s*(\d+)\s*分钟/) || html.match(/通勤计分<\/div><div class="v">(\d+)\s*分钟/) || [])[1];
  if (cm) t('通勤时间为数字且合理（≤60 分钟）', +cm <= 60, cm + ' 分钟');
  else t('通勤时间已填', false);
}

// ── 四、单校专属断言 ──
if (slug === 'compassvale-secondary-school') {
  group('四、Compassvale 官网 O-Level 数据（2024）');
  const oLevel = {
    'Sec4E 5科及格 89.7%': '89.7%',
    'Sec4E 3科及格 98.1%': '98.1%',
    'Sec5NA 5科及格 55.6%': '55.6%',
    'JC 资格 67%': '67%',
    'Poly 资格 96.3%': '96.3%',
    'Phy+Chem Distinction 52%': '52%',
    'English Distinction 19%': '19%',
    'Electronics Distinction 17%': '17%',
  };
  for (const [k, v] of Object.entries(oLevel)) t(k, html.includes(v));
  group('五、历史趋势数据');
  const trend = { '2022 JC 60.3%': '60.3%', '2016 JC 82.7%': '82.7%', '2023 5科 93%': '93%' };
  for (const [k, v] of Object.entries(trend)) t(k, html.includes(v));
}

// ── 汇总 ──
console.log('\n' + '═'.repeat(26));
console.log(pass + ' 通过 / ' + fail + ' 失败');
if (fail) { console.log('\n失败项:'); fails.forEach(f => console.log('  - ' + f)); }
process.exit(fail ? 1 : 0);
