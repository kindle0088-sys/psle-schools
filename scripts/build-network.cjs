#!/usr/bin/env node
/**
 * 用站点的线路代号构建 MRT 乘车图，并校验连通性。
 *
 * 建图规则（不依赖任何外部线路拓扑数据）：
 *   1. 按代号前缀分组（NS/EW/NE/CC/DT/TE/CG），组内按号码排序
 *   2. 相邻号码 → 连边（权重 = RIDE_MIN_PER_STOP）
 *   3. 同物理站的多条线路 → 换乘边（权重 = TRANSFER_MIN）
 *   4. 手工补 1 条支线接入边：CG1(Expo) ↔ EW4(Tanah Merah)
 *
 * 输出：
 *   data/network.json  —— 供前端使用（站表 + 邻接 + 参数）
 *   docs/data/network.json —— 同上（Pages 部署位置）
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const SRC = path.join(BASE, 'data', 'mrt-stations.json');

// ── 可调参数（分钟） ───────────────────────────────────────────
const RIDE_MIN_PER_STOP = 2.0;   // 站间平均 2 分钟（含停站）
const TRANSFER_MIN = 5.0;        // 同站换线 5 分钟（含步行）
const WALK_M_PER_MIN = 80;       // 步行 4.8 km/h
const ACCESS_OVERHEAD_MIN = 4.0; // 进站+刷卡+等车（实测校准值，见 test-iso 的 OD 对照）

/** 支线接入点：支线端点 ↔ 主线站（代号 → 代号） */
const SPUR_LINKS = [
  ['CG1', 'EW4'],   // Expo（樟宜支线）↔ Tanah Merah（东西线）
];

/** 环线端到端闭合：CC34(Bayfront) 与 CC4(Promenade) 由环线本身相连 */
const LOOP_CLOSE = [['CC34', 'CC4']];

const R_EARTH = 6371000;
function haversine(a, b) {
  const rad = x => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}

(function main() {
  const stations = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  console.log('▸ 站点: %d', stations.length);

  // code → station
  const byCode = new Map();
  for (const s of stations) for (const c of s.codes) byCode.set(c, s);

  // 按前缀分组并排序
  const groups = {};
  for (const s of stations) {
    for (const c of s.codes) {
      const pre = c.match(/^([A-Z]{2})/)[1];
      (groups[pre] = groups[pre] || []).push(c);
    }
  }

  const edges = [];   // { a, b, min, line }
  const seen = new Set();
  const addEdge = (a, b, min, line) => {
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(k)) return false;
    seen.add(k);
    edges.push({ a, b, min, line });
    return true;
  };

  // 组内相邻连边
  for (const [pre, codes] of Object.entries(groups)) {
    const uniq = [...new Set(codes)].sort((x, y) => +x.slice(2) - +y.slice(2));
    let linked = 0;
    for (let i = 0; i < uniq.length - 1; i++) {
      if (addEdge(uniq[i], uniq[i + 1], RIDE_MIN_PER_STOP, pre)) linked++;
    }
    const nums = uniq.map(c => +c.slice(2));
    const gaps = [];
    for (let i = 1; i < nums.length; i++) if (nums[i] - nums[i - 1] > 1) gaps.push(`${nums[i - 1]}→${nums[i]}`);
    console.log('   %s: %d 站, %d 边%s', pre.padEnd(3), uniq.length, linked,
      gaps.length ? `  (号码断点 ${gaps.join(' ')})` : '');
  }

  // 支线接入
  for (const [a, b] of SPUR_LINKS) {
    if (addEdge(a, b, RIDE_MIN_PER_STOP, 'SPUR')) console.log('   支线接入 %s ↔ %s', a, b);
    else console.log('   ⚠ 支线接入 %s ↔ %s 未生效（编号已相邻或被去重）', a, b);
  }
  for (const [a, b] of LOOP_CLOSE) {
    if (addEdge(a, b, RIDE_MIN_PER_STOP, 'LOOP')) console.log('   环线闭合 %s ↔ %s', a, b);
  }

  // 标记同站换乘（不进 edges，单独返回给前端）
  const transfers = [];
  for (const s of stations) {
    if (s.codes.length < 2) continue;
    for (let i = 0; i < s.codes.length; i++)
      for (let j = i + 1; j < s.codes.length; j++)
        transfers.push({ a: s.codes[i], b: s.codes[j], min: TRANSFER_MIN, line: 'XFER' });
  }

  // ── 连通性校验：乘车边 + 换乘边一起走，否则只能走通单条线 ──
  const adj = new Map();
  for (const c of byCode.keys()) adj.set(c, []);
  for (const e of edges) { adj.get(e.a).push(e.b); adj.get(e.b).push(e.a); }
  for (const t of transfers) { adj.get(t.a).push(t.b); adj.get(t.b).push(t.a); }

  // BFS 从 NS1 出发
  const start = 'NS1';
  const vis = new Set([start]);
  const q = [start];
  while (q.length) {
    const c = q.shift();
    for (const n of adj.get(c) || []) if (!vis.has(n)) { vis.add(n); q.push(n); }
  }
  const unreached = [...byCode.keys()].filter(c => !vis.has(c));
  console.log('\n▸ 连通性');
  console.log('   可达 %d / %d 个代号', vis.size, byCode.size);
  if (unreached.length) {
    console.log('   ⚠ 不可达: %s', unreached.join(', '));
    console.log('     对应站点: %s', [...new Set(unreached.map(c => byCode.get(c).name))].join(', '));
  } else {
    console.log('   ✅ 全网络连通');
  }

  // 边长时间合理性（相邻站间距）
  const dists = edges.map(e => haversine(byCode.get(e.a), byCode.get(e.b)));
  dists.sort((a, b) => a - b);
  const med = dists[Math.floor(dists.length / 2)];
  const suspicious = edges.filter((e, i) => {
    const d = haversine(byCode.get(e.a), byCode.get(e.b));
    return d > 2500;
  });
  console.log('\n▸ 站间距');
  console.log('   中位 %dm ｜ 最短 %dm ｜ 最长 %dm', Math.round(med), Math.round(dists[0]), Math.round(dists[dists.length - 1]));
  if (suspicious.length) {
    console.log('   ⚠ 间距 >2.5km 的边 %d 条（可能是断点被误连）:', suspicious.length);
    suspicious.forEach(e => {
      const d = haversine(byCode.get(e.a), byCode.get(e.b));
      console.log('      %s—%s %s—%s %dm', e.a, e.b, byCode.get(e.a).name, byCode.get(e.b).name, Math.round(d));
    });
  }

  // ── 输出 ──
  const out = {
    generatedAt: new Date().toISOString(),
    params: { rideMinPerStop: RIDE_MIN_PER_STOP, transferMin: TRANSFER_MIN, walkMPerMin: WALK_M_PER_MIN, accessOverheadMin: ACCESS_OVERHEAD_MIN },
    lines: Object.fromEntries(Object.entries(groups).map(([p, cs]) => [p, [...new Set(cs)].sort((x, y) => +x.slice(2) - +y.slice(2))])),
    stations: stations.map(s => ({ id: s.id, name: s.name, codes: s.codes, lines: s.lines, lat: s.lat, lon: s.lon })),
    edges,
    transfers,
  };
  for (const dir of ['data', 'docs/data']) {
    const f = path.join(BASE, dir, 'network.json');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(out, null, 1));
  }
  console.log('\n▸ 输出 %d 边 + %d 换乘边 → data/network.json & docs/data/network.json', edges.length, transfers.length);
})();
