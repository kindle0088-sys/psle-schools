#!/usr/bin/env node
/**
 * 把采集到的原始数据整理成前端可直接消费的 docs/data/schools.json。
 *
 * 关键处理：
 *   1. COP 扁平化为统一 rows（IP 校 / 普通 PG 校 / SAP 带等级 / 混合型）
 *   2. IP / SAP / 自主 / 独立 从 electives 文本与 schoolType 判定
 *   3. 预算「最近 MRT 站 + 步行距离」写进每条记录，避免前端重复算 151×147
 *
 * 口径提醒（会写进页面）：
 *   COP 是**上一年度实际录取区间**，不是今年的门槛；每年会随报考热度浮动。
 */
const fs = require('fs');
const path = require('path');
const Iso = require('../lib/iso.cjs');

const BASE = path.join(__dirname, '..');
const schools = JSON.parse(fs.readFileSync(path.join(BASE, 'data/schools.json'), 'utf8'));
const net = JSON.parse(fs.readFileSync(path.join(BASE, 'data/network.json'), 'utf8'));

const hasItem = (s, kw) => (s.electives || []).some(g => (g.items || []).some(i => i.includes(kw)));

/** COP → 统一 rows */
function flattenCop(cop) {
  if (!cop) return null;
  const rows = [];
  const mk = (label, a, n, kind) => {
    if (!a && !n) return;
    rows.push({ label, aff: a || null, nonAff: n || null, kind });
  };
  if (cop.type === 'IP' && cop.ip) {
    mk('Integrated Programme', cop.ip.affiliated, cop.ip.nonAffiliated, 'IP');
  }
  for (const k of ['PG3', 'PG2', 'PG1']) {
    const a = cop.affiliated?.[k], n = cop.nonAffiliated?.[k];
    if (a || n) mk(k.replace('PG', 'Posting Group '), a, n, 'PG');
  }
  if (!rows.length) return null;
  return { year: cop.year, type: cop.type || 'PG', rows };
}

/** 最近 MRT 站 */
function nearestStation(sc) {
  if (!sc.lat) return null;
  let best = null;
  for (const st of net.stations) {
    const d = Iso.haversine({ lat: sc.lat, lon: sc.lon }, st);
    if (!best || d < best.d) best = { d, st };
  }
  return { name: best.st.name, codes: best.st.codes, lines: best.st.lines, distM: Math.round(best.d) };
}

const out = [];
let ipCount = 0, sapCount = 0, noCop = [];

for (const s of schools) {
  const ip = hasItem(s, 'Integrated Programme');
  const sap = hasItem(s, 'Special Assistance Plan');
  const autonomous = /Autonomous/i.test(s.schoolType || '');
  const independent = /Independent/i.test(s.schoolType || '');
  const specialised = /Specialised|Crest and Spectra/i.test(s.schoolType || '');
  if (ip) ipCount++;
  if (sap) sapCount++;

  const cop = flattenCop(s.cop);
  if (!cop) noCop.push(s.name);

  out.push({
    slug: s.slug,
    name: s.name,
    area: s.area || null,
    address: s.address || null,
    postal: s.postal || null,
    lat: s.lat ?? null,
    lon: s.lon ?? null,
    type: s.schoolType || null,
    nature: s.schoolNature || null,
    mode: s.schoolMode || null,
    ip, sap, autonomous, independent, specialised,
    cop,
    cca: s.cca || [],
    dsaYear: s.dsa?.year || null,
    dsaAreas: s.dsa?.areas || [],
    subjects: (s.subjects || []).length,
    affiliations: s.affiliations || null,
    contact: s.contact || null,
    nearStation: nearestStation(s),
  });
}

const payload = {
  meta: {
    generatedAt: new Date().toISOString(),
    total: out.length,
    copYear: [...new Set(out.map(x => x.cop?.year).filter(Boolean))].sort().pop() || null,
    ipCount, sapCount,
    noCopCount: noCop.length,
    noCopList: noCop,
    sources: {
      schools: 'MOE SchoolFinder (https://www.moe.gov.sg/schoolfinder)',
      cop: 'MOE SchoolFinder — PSLE score range（上一年度实际录取区间）',
      coords: 'OneMap elastic/search（邮编地理编码）',
      mrt: 'OneMap elastic/search + 官方线路代号',
    },
    params: net.params,
    disclaimer: 'COP 为上一年度实际录取区间，仅供参考，非本年度录取门槛。等时圈仅计 MRT，不含巴士。',
  },
  schools: out.sort((a, b) => a.name.localeCompare(b.name)),
};

const f = path.join(BASE, 'docs/data/schools.json');
fs.mkdirSync(path.dirname(f), { recursive: true });
fs.writeFileSync(f, JSON.stringify(payload, null, 1));

console.log('▸ 输出 docs/data/schools.json');
console.log('   学校 %d 所 ｜ IP %d ｜ SAP %d ｜ 有 COP %d ｜ 无 COP %d',
  out.length, ipCount, sapCount, out.length - noCop.length, noCop.length);
console.log('   COP 年度: %s', payload.meta.copYear);
console.log('   文件大小: %s KB', Math.round(fs.statSync(f).size / 1024));

// 抽查
console.log('\n▸ 抽查');
for (const n of ['Raffles Institution (Secondary)', 'Hwa Chong Institution (Secondary)',
  'Anglo-Chinese School (Barker Road)', 'Chung Cheng High School (Main)']) {
  const x = out.find(y => y.name === n);
  if (!x) { console.log('   ✗ %s 未找到', n); continue; }
  console.log('   %s', n);
  console.log('     IP=%s SAP=%s 自主=%s | %s', x.ip, x.sap, x.autonomous, x.type);
  console.log('     COP %s: %s', x.cop?.year, (x.cop?.rows || []).map(r =>
    `${r.label} 非附属${r.nonAff ? r.nonAff.min + '-' + r.nonAff.max + (r.nonAff.markMax ? '(' + r.nonAff.markMax + ')' : '') : '—'}`).join(' ｜ '));
  console.log('     最近站 %s %s %dm | CCA %d 项 | DSA %d 项',
    x.nearStation.codes.join('/'), x.nearStation.name, x.nearStation.distM, x.cca.length, x.dsaAreas.length);
}
