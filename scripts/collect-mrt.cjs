#!/usr/bin/env node
/**
 * 采集新加坡 MRT/LRT 站点坐标与线路归属。
 *
 * 数据源：OneMap elastic/search（免 token）
 *   搜索 "MRT STATION" 共 85 页 × 10 条 = 849 条结果，
 *   其中主记录形如 "JURONG EAST MRT STATION (EW24 / NS1)"，
 *   另有 "XXX MRT STATION EXIT A"（出口）、"VALUE MAX PAWN SHOP ..."（商户）等噪声。
 *
 * 输出 data/mrt-stations.json：
 *   [{ id, name, lines: ["EW","NS"], codes: ["EW24","NS1"], lat, lon }]
 *   同一物理站的多条线路记录会按站名合并 → lines 汇总，供建图时作换乘点。
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const OUT = path.join(BASE, 'data', 'mrt-stations.json');
const CACHE = path.join(BASE, '.tmp', 'mrt-raw');
const API = 'https://www.onemap.gov.sg/api/common/elastic/search';
const PAGES = 85;
const UA = 'psle-schools/0.1 (personal school-choice research)';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 线路代号前缀 → 线路简称 */
const LINE_PREFIX = {
  NS: 'NS', EW: 'EW', NE: 'NE', CC: 'CC', DT: 'DT', TE: 'TE',
  CG: 'EW', CE: 'CC',  // 支线并入主线（CG=樟宜支线属东西线，CE=滨海支线属环线）
  BP: 'BP',            // 武吉班让 LRT
  SE: 'SE', PE: 'PE', PW: 'PW', PT: 'PT', SW: 'SW', ST: 'ST',  // Sengkang/Punggol LRT
  JS: 'JS', JW: 'JW',  // 裕廊区域线（在建）
  CR: 'CR', CP: 'CP',  // 跨岛线（在建）
};

/**
 * 运营中的线路（在建线路不参与等时圈计算）。
 * CG = 樟宜支线，运营中且 Changi Airport 站只挂 CG2，务必保留。
 */
const OPERATING = new Set(['NS', 'EW', 'NE', 'CC', 'DT', 'TE', 'CG']);

/**
 * 手工补丁：OneMap 个别站的主记录缺失或被 429 漏抓。
 * 坐标取自 OneMap 同一站的其它记录（取其带代号那条，误差 <150m）。
 */
const PATCHES = [
  // Hougang (NE14) —— 首次采集时该页 429 漏抓，主记录只剩无代号的旧条目（已被过滤）
  { name: 'HOUGANG', codes: ['NE14'], lat: 1.371292266207984, lon: 103.8923805130286 },
  // Marina Bay 的环线站台 (CC33) 未进 OneMap 主记录（该站只登记 NS27/TE20）；
  // 同一物理站，坐标复用，仅用于补全环线 Stage 6 的端到端连通。
  { name: 'MARINA BAY', codes: ['CC33'], lat: 1.28384573549039, lon: 103.859075115118, mergeInto: 'MARINA BAY' },
];

/** 带 429 退避的抓取；已缓存的页直接读盘 */
async function fetchPage(n, attempt = 1) {
  const f = path.join(CACHE, `p${n}.json`);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const url = `${API}?searchVal=${encodeURIComponent('MRT STATION')}&returnGeom=Y&getAddrDetails=Y&pageNum=${n}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.status === 429) {
    if (attempt > 4) throw new Error(`page ${n} 仍被限速（已重试 4 次）`);
    const wait = 8000 * attempt;
    console.log('     429 限速，等待 %ds 后重试 page %d（第 %d 次）', wait / 1000, n, attempt);
    await sleep(wait);
    return fetchPage(n, attempt + 1);
  }
  if (!res.ok) throw new Error(`page ${n} HTTP ${res.status}`);
  const j = await res.json();
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(f, JSON.stringify(j, null, 1));
  return j;
}

/** 从 "JURONG EAST MRT STATION (EW24 / NS1)" 解析站名与线路代号 */
function parseSearchVal(raw) {
  const s = String(raw || '').toUpperCase().trim();
  if (!/MRT STATION/.test(s)) return null;
  // 排除出口、商户、道路等噪声
  if (/EXIT|ENTRANCE|PAWN|SHOP|MALL|PLAZA\b|CAR ?PARK|BUS STOP|TAXI/.test(s)) return null;
  const m = s.match(/^(.*?)\s*MRT STATION\s*(?:\(([^)]*)\))?\s*$/);
  if (!m) return null;
  const name = m[1].trim();
  if (!name || name.length > 42) return null;
  const codes = (m[2] || '')
    .split('/')
    .map(x => x.trim().toUpperCase())
    .filter(x => /^[A-Z]{2}\d{1,2}$/.test(x));
  return { name, codes };
}

function linesOf(codes) {
  const out = new Set();
  for (const c of codes) {
    const pre = c.match(/^([A-Z]{2})/)?.[1];
    if (pre && LINE_PREFIX[pre]) out.add(LINE_PREFIX[pre]);
  }
  return [...out];
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

(async () => {
  console.log('▸ 抓取 OneMap MRT 搜索结果（%d 页）', PAGES);
  const all = [];
  for (let p = 1; p <= PAGES; p++) {
    try {
      const j = await fetchPage(p);
      const rs = j.results || [];
      all.push(...rs);
      if (p % 15 === 0 || p === PAGES) console.log('   page %d/%d  累计 %d 条', p, PAGES, all.length);
    } catch (e) {
      console.log('   ✗ page %d 失败: %s', p, e.message);
    }
    // 仅对本次真正发出请求的页做节流（缓存命中的不占用配额）
    if (!fs.existsSync(path.join(CACHE, `p${p}.json`))) void 0;
    await sleep(600);
  }
  console.log('   原始记录: %d', all.length);

  // 解析 + 按站名合并
  const byName = new Map();
  let rejected = 0;
  for (const r of all) {
    const p = parseSearchVal(r.SEARCHVAL);
    if (!p) { rejected++; continue; }
    const lat = parseFloat(r.LATITUDE), lon = parseFloat(r.LONGITUDE);
    if (!isFinite(lat) || !isFinite(lon)) { rejected++; continue; }
    const key = p.name;
    const cur = byName.get(key);
    if (!cur) {
      byName.set(key, {
        id: slug(p.name),
        name: p.name.replace(/\bMRT STATION\b/g, '').trim(),
        lines: linesOf(p.codes),
        codes: [...new Set(p.codes)],
        lat, lon,
        rawSeen: 1,
      });
    } else {
      cur.rawSeen++;
      // 合并线路（同名站多条记录 = 换乘站）
      for (const l of linesOf(p.codes)) if (!cur.lines.includes(l)) cur.lines.push(l);
      for (const c of p.codes) if (!cur.codes.includes(c)) cur.codes.push(c);
      // 坐标取首次出现的（OneMap 各记录一致）
    }
  }

  // 应用手工补丁
  const byNameLower = new Map([...byName.values()].map(s => [s.name.toUpperCase(), s]));
  for (const p of PATCHES) {
    const target = p.mergeInto ? byNameLower.get(p.mergeInto) : byName.get(p.name);
    if (target) {
      for (const c of p.codes) if (!target.codes.includes(c)) target.codes.push(c);
      for (const l of linesOf(p.codes)) if (!target.lines.includes(l)) target.lines.push(l);
      if (p.lat && !target.lat) { target.lat = p.lat; target.lon = p.lon; }
    } else {
      byName.set(p.name, {
        id: slug(p.name), name: p.name, lines: linesOf(p.codes),
        codes: [...p.codes], lat: p.lat, lon: p.lon, rawSeen: 0, patched: true,
      });
    }
  }

  // 只保留有运营线路代号的站（排除纯在建线路，如裕廊区域线 JS / 跨岛线 CR）
  const stations = [...byName.values()]
    .map(s => ({
      ...s,
      codes: s.codes.filter(c => OPERATING.has(c.match(/^([A-Z]{2})/)?.[1] || '')),
      lines: s.lines.filter(l => OPERATING.has(l)),
    }))
    .filter(s => s.lines.length > 0 && isFinite(s.lat) && isFinite(s.lon))
    .sort((a, b) => a.name.localeCompare(b.name));

  // 线路统计
  const byLine = {};
  for (const s of stations) for (const l of s.lines) byLine[l] = (byLine[l] || 0) + 1;

  fs.writeFileSync(OUT, JSON.stringify(stations, null, 1));
  console.log('\n▸ 结果');
  console.log('   有效站点: %d  （丢弃噪声 %d 条）', stations.length, rejected);
  console.log('   线路分布: %s', Object.entries(byLine).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  '));
  const inter = stations.filter(s => s.lines.length > 1);
  console.log('   换乘站: %d', inter.length);
  console.log('   输出: %s', OUT);

  // 抽查
  console.log('\n▸ 抽查');
  for (const n of ['JURONG EAST', 'BISHAN', 'DHOBY GHAUT', 'Paya Lebar'.toUpperCase(), 'WOODLANDS', 'TAMPINES']) {
    const s = stations.find(x => x.name === n);
    console.log('   %s → %s', n.padEnd(16), s ? `${s.codes.join('/')}  ${s.lat.toFixed(5)},${s.lon.toFixed(5)}` : '✗ 未找到');
  }
})().catch(e => { console.error('✗', e); process.exit(1); });
