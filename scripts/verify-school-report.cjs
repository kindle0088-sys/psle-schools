#!/usr/bin/env node
/**
 * 单校深度报告验证器
 * 用法: node scripts/verify-school-report.cjs <html路径> [--slug compassvale-secondary-school]
 *
 * 通用断言（任何学校都查）：结构完整性、无模板残留、无常见错误表述
 * 单校断言（按 slug 查）：关键数字与 MOE / 官网口径一致
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const argFile = process.argv[2];
if (!argFile) { console.error('用法: node verify-school-report.cjs <html路径> [--slug xxx]'); process.exit(2); }
const slugIdx = process.argv.indexOf('--slug');
const slug = slugIdx > -1 ? process.argv[slugIdx + 1] : null;

const file = path.resolve(argFile);
if (!fs.existsSync(file)) { console.error('文件不存在:', file); process.exit(2); }
const html = fs.readFileSync(file, 'utf8');

let pass = 0, fail = 0;
const fails = [];
function t(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name + (detail ? ' — ' + detail : '')); }
  else { fail++; fails.push(name); console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function group(s) { console.log('\n══ ' + s); }

// ── 一、结构与模板残留 ──
group('一、结构完整性');
t('无未替换模板变量', !/\$\{|\{\{|TODO|FIXME/.test(html));
t('含 8 个章节锚点', (html.match(/id="s[1-8]"/g) || []).length === 8, (html.match(/id="s[1-8]"/g) || []).length + ' 个');
t('含目录且锚点可跳转', html.includes('class="toc"') && html.includes('href="#s1"'));
t('含数据来源章节', html.includes('数据来源与可信度'));
t('含开放日清单（≥10 条）', (html.match(/<li><b>/g) || []).length >= 10, (html.match(/<li><b>/g) || []).length + ' 条');
t('有返回看板链接', html.includes('../index.html'));
t('有 noindex', html.includes('noindex'));
t('HTML 标签闭合（div 计数）',
  (html.match(/<div/g) || []).length === (html.match(/<\/div>/g) || []).length,
  (html.match(/<div/g) || []).length + ' 开 / ' + (html.match(/<\/div>/g) || []).length + ' 闭');
t('table 标签闭合',
  (html.match(/<table/g) || []).length === (html.match(/<\/table>/g) || []).length);

// ── 二、必须避免的错误表述 ──
// 注意：「剔除掉的错误信息」一节会刻意引用错误表述作为反例，检查时须排除该节
group('二、已知错误表述（不得出现在正文）');
const negIdx = html.indexOf('我剔除掉的错误信息');
const negEndIdx = negIdx > -1 ? html.indexOf('<div class="note">', negIdx) : -1;
const bodyOnly = negIdx > -1
  ? html.slice(0, negIdx) + html.slice(negEndIdx > -1 ? negEndIdx : html.length)
  : html;
t('剔除错误章节存在', negIdx > -1);
t('未把 Netball 译成网球', !/Netball\s*[（(]?\s*网球|网球\s*[（(]\s*女/.test(bodyOnly));
t('未出现 40:1 师生比', !/40\s*[:：]\s*1/.test(bodyOnly));
t('未使用错误地址', !/11\s+Compassvale\s+Lane|Compassvale\s+Lane[,\s]*S?797123/.test(bodyOnly));
t('未声称「20+ 个 CCA」为事实', !/20\s*\+\s*个?\s*CCA(?!）|\))/.test(html) || html.includes('无法核实'));
t('未把 ALP 写成环境科学', !/ALP[^。]{0,20}环境科学(?!.*可持续)/.test(html));

// ── 三、单校数字断言 ──
if (slug === 'compassvale-secondary-school') {
  group('三、Compassvale 数据核对');

  // 从结构化数据取真值
  const data = JSON.parse(fs.readFileSync(path.join(BASE, 'docs/data/schools.json'), 'utf8'));
  const arr = Array.isArray(data) ? data : (data.schools || []);
  const s = arr.find(x => x.slug === slug);
  t('结构化数据中找到该校', !!s);

  if (s) {
    const pg3 = (s.cop.rows || []).find(r => /Posting Group 3/.test(r.label));
    const lo = pg3.nonAff.min, hi = pg3.nonAff.max;
    t('PG3 区间与数据源一致（' + lo + '–' + hi + '）',
      new RegExp(lo + '\\s*[–-]\\s*' + hi).test(html));
    t('余量计算正确（' + (hi - 17) + '）',
      html.includes('+' + (hi - 17) + ' 分') || html.includes('+' + (hi - 17) + '分'));
    t('写明无附属小学', s.affiliations.primary.length === 0 && html.includes('无'));
    t('写明非 IP、非 SAP', s.ip === false && s.sap === false && html.includes('IP') && html.includes('SAP'));

    // MOE 登记的 8 项 CCA 必须全部出现
    const ccaNames = ['Badminton', 'Basketball', 'Choir', 'Concert Band', 'Girl Guides', 'Modern Dance', 'NPCC', 'Netball'];
    const missing = ccaNames.filter(c => !html.includes(c));
    t('MOE 登记 8 项 CCA 全部列出', missing.length === 0, missing.length ? '缺: ' + missing.join(', ') : '8/8');

    // DSA 项目必须全部出现
    const dsa = ['Badminton', 'Environmental Science', 'Floorball', 'Netball', 'Robotics', 'Softball', 'STEM-Aeronautics'];
    const dsaMissing = dsa.filter(d => !html.includes(d));
    t('DSA 招生项目全部列出', dsaMissing.length === 0, dsaMissing.length ? '缺: ' + dsaMissing.join(', ') : '7/7');

    t('地址与数据源一致', html.includes(s.address.split(',')[0]));
  }

  // 官网 O-Level 2024 数据
  group('四、官网 O-Level 数据核对（2024）');
  const oLevel = {
    'Sec4E 5科及格 89.7%': '89.7%',
    'Sec4E 3科及格 98.1%': '98.1%',
    'Sec5NA 5科及格 55.6%': '55.6%',
    'JC 资格 67%': '67%',
    'Poly 资格 96.3%': '96.3%',
    'Phy+Chem Distinction 52%': '52%',
    'English Distinction 19%': '19%',
    'Electronics Distinction 17%': '17%'
  };
  for (const [k, v] of Object.entries(oLevel)) t(k, html.includes(v));

  const trend = { '2022 JC 60.3%': '60.3%', '2016 JC 82.7%': '82.7%', '2023 5科 93%': '93%' };
  group('五、历史趋势数据核对');
  for (const [k, v] of Object.entries(trend)) t(k, html.includes(v));
}

// ── 汇总 ──
console.log('\n' + '═'.repeat(26));
console.log(pass + ' 通过 / ' + fail + ' 失败');
if (fail) { console.log('\n失败项:'); fails.forEach(f => console.log('  - ' + f)); }
process.exit(fail ? 1 : 0);
