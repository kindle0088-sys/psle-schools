#!/usr/bin/env node
/**
 * 公交可达矩阵采集 —— 供 commuteMode="bus" 的学生使用
 *
 * 口径（abcd1，2026-11-24 用户拍板）：
 *   从画像 constraints.boardingStop.code 指定的公交站上车，只坐不换乘公交，
 *   下车后步行到校；或与纯步行取快者。地铁完全不参与。
 *
 * 数据源：
 *   - Buslah 站点页 /stop/<code>/：站点坐标（JSON-LD geo）+ 停靠线路
 *   - Buslah 线路页 /bus/<service>/：双向站点序列（含站码与站序）
 *   - FOSSGIS OSRM foot table：站点 → 学校的真实步行距离
 *
 * 模型参数（写在产物 params 字段，报告会逐条披露，不是实时到站）：
 *   家→站步行 80 m/min；候车 5 分；车内 2 分/站；下车后步行 ≤18 分才算可达。
 *
 * 用法：STUDENT=abcd1 node scripts/collect-bus.cjs
 * 产出：data/bus-<id>.json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Stu = require('../lib/student.cjs');
const Iso = require('../lib/iso.cjs');

const BASE = path.join(__dirname, '..');
const STU = Stu.load();
const BOARD = STU.boardingStop;
if (!BOARD || !BOARD.code) {
  console.error('\n✗ 学生配置缺 constraints.boardingStop.code（公交站代码）\n');
  process.exit(1);
}
if (!STU.home.coords) {
  console.error('\n✗ 学生配置缺 home.lat / home.lon\n');
  process.exit(1);
}

const UA = 'psle-schools-bus-commute/1.0 (personal school-commute analysis; +https://kindle0088-sys.github.io/psle-schools/)';
const CACHE = path.join(BASE, '.tmp', 'bus-cache');
fs.mkdirSync(CACHE, { recursive: true });

const WALK_MPM = 80;
const WAIT_MIN = 5;
const RIDE_MIN_PER_STOP = 2;
const MAX_WALK_FROM_STOP_MIN = 18;

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/json' } });
      if (r.status === 429) { await sleep(9000); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } catch (e) { if (i === tries - 1) throw e; await sleep(2500 * (i + 1)); }
  }
}
async function cached(name, fn) {
  const f = path.join(CACHE, name);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const v = await fn();
  fs.writeFileSync(f, JSON.stringify(v));
  return v;
}
async function getJSON(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (r.status === 429) { await sleep(9000); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const t = await r.text();
      if (t.trim().startsWith('<')) throw new Error('HTML response');
      return JSON.parse(t);
    } catch (e) { last = e; await sleep(2500 * (i + 1)); }
  }
  throw last;
}
/** OSRM table：多个起点 → 全部目标。destinations 必须逐名列全，写成 "a;b" 只返回两列。 */
async function table(sources, targets) {
  const coords = [...sources, ...targets].map(p => `${p.lon},${p.lat}`).join(';');
  const src = sources.map((_, i) => i).join(';');
  const dst = targets.map((_, i) => sources.length + i).join(';');
  const url = `https://routing.openstreetmap.de/routed-foot/table/v1/foot/${coords}?annotations=distance&sources=${src}&destinations=${dst}`;
  const j = await getJSON(url);
  if (j.code !== 'Ok') throw new Error('OSRM ' + j.code + ' ' + (j.message || ''));
  return j.distances;
}

(async () => {
  const schools = JSON.parse(fs.readFileSync(path.join(BASE, 'docs/data/schools.json'), 'utf8'))
    .schools.filter(s => s.lat != null && s.lon != null);

  // 1) 起点站页 → 停靠线路 + 坐标
  const stopHtml = await get(`https://buslah.com/stop/${BOARD.code}/`);
  const boardMatch = stopHtml.match(/"geo":\{"@type":"GeoCoordinates","latitude":([\d.]+),"longitude":([\d.]+)\}/);
  if (!boardMatch) throw new Error('起点站页没有坐标');
  const boardCoord = { lat: +boardMatch[1], lon: +boardMatch[2] };
  const services = [...new Set([...stopHtml.matchAll(/href="\/bus\/([^/]+)\/"/g)].map(m => m[1]))]
    .sort((a, b) => (Number.isFinite(+a) ? +a : 999) - (Number.isFinite(+b) ? +b : 999) || a.localeCompare(b));
  console.log(`▸ 起点站 ${BOARD.code} ${BOARD.name}：${services.length} 条线路`);

  // 2) 各线路的下游站序（只取包含起点站的方向）
  const legs = [];
  for (const svc of services) {
    const html = await get(`https://buslah.com/bus/${svc}/`);
    const parts = html.split(/<h2>Direction\s+(\d+):\s*([^<]+)<\/h2>/);
    for (let i = 1; i < parts.length; i += 3) {
      const dir = +parts[i];
      const body = parts[i + 2];
      const stops = [...body.matchAll(/<li><a href="\/stop\/(\d+)\/"><span class="n">\d+ · stop (\d+)<\/span>([^<]+)<\/a><\/li>/g)]
        .map(m => ({ code: m[1], seq: +m[2], name: m[3].trim() }));
      const at = stops.findIndex(s => s.code === BOARD.code);
      if (at < 0) continue;
      for (let k = 1; k < stops.length - at; k++) {
        legs.push({ svc, dir, code: stops[at + k].code, name: stops[at + k].name,
          hops: k, rideMin: k * RIDE_MIN_PER_STOP });
      }
    }
    await sleep(300);
  }
  const codes = [...new Set(legs.map(l => l.code))];
  console.log(`▸ 下游站点 ${codes.length} 个 / 站段 ${legs.length} 条`);

  // 3) 站点坐标（缓存）
  const stopCoord = { [BOARD.code]: boardCoord };
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    const v = await cached(`stop-${c}.json`, async () => {
      const h = await get(`https://buslah.com/stop/${c}/`);
      const m = h.match(/"geo":\{"@type":"GeoCoordinates","latitude":([\d.]+),"longitude":([\d.]+)\}/);
      return m ? { lat: +m[1], lon: +m[2] } : { lat: null, lon: null };
    });
    stopCoord[c] = v;
    if ((i + 1) % 50 === 0) console.log(`  坐标 ${i + 1}/${codes.length}`);
    await sleep(220);
  }
  const usable = codes.filter(c => stopCoord[c] && stopCoord[c].lat != null);

  // 4) OSRM 站点 → 学校 步行矩阵（URL 过长时每 25 站一批）
  let matrix = null;
  const points = usable.map(c => stopCoord[c]);
  const targets = schools.map(s => ({ lat: s.lat, lon: s.lon }));
  try {
    matrix = await table(points, targets);
    console.log('▸ OSRM table 单次完成');
  } catch (e) {
    console.log('▸ OSRM 单次失败，改每 25 站一批：' + e.message);
    matrix = [];
    for (let a = 0; a < points.length; a += 25) {
      matrix.push(...await table(points.slice(a, a + 25), targets));
      console.log(`  batch ${a / 25 + 1}/${Math.ceil(points.length / 25)}`);
      await sleep(1100);
    }
  }

  // 5) 家 → 起点站 步行
  const homeWalkM = (await table([STU.home.coords], [boardCoord]))[0][0];
  const homeWalkMin = Math.ceil(homeWalkM / WALK_MPM);
  console.log(`▸ 家→站步行 ${Math.round(homeWalkM)} m / ${homeWalkMin} 分`);

  const idx = new Map(usable.map((c, i) => [c, i]));
  const rows = schools.map((s, si) => {
    let best = null;
    for (const leg of legs) {
      const mi = idx.get(leg.code); if (mi == null) continue;
      const d = matrix[mi]?.[si]; if (d == null) continue;
      const walkFromStopMin = Math.ceil(d / WALK_MPM);
      if (walkFromStopMin > MAX_WALK_FROM_STOP_MIN) continue;
      const total = homeWalkMin + WAIT_MIN + leg.rideMin + walkFromStopMin;
      if (!best || total < best.total) {
        best = { total, svc: leg.svc, dir: leg.dir, stop: leg.code, stopName: leg.name,
          hops: leg.hops, rideMin: leg.rideMin, walkFromStopM: Math.round(d), walkFromStopMin,
          straightM: Math.round(Iso.haversine(stopCoord[leg.code], { lat: s.lat, lon: s.lon })) };
      }
    }
    return { slug: s.slug, name: s.name, bus: best };
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    studentId: STU.id,
    boardingStop: { code: BOARD.code, name: BOARD.name, road: BOARD.road || null,
      lat: boardCoord.lat, lon: boardCoord.lon },
    homeWalkMeters: Math.round(homeWalkM),
    homeWalkMin,
    params: { walkMetersPerMin: WALK_MPM, waitMin: WAIT_MIN, rideMinPerStop: RIDE_MIN_PER_STOP,
      maxWalkFromStopMin: MAX_WALK_FROM_STOP_MIN, transferAllowed: false },
    source: { routes: 'buslah.com/bus/<service>/', stopCoordinates: 'buslah.com/stop/<code>/',
      walking: 'FOSSGIS OSRM routed-foot table',
      note: `不换乘；仅从 ${BOARD.code} 单一站上车及其下游方向` },
    rows,
  };
  const out = path.join(BASE, `data/bus-${STU.id}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 1));
  const ok = rows.filter(r => r.bus);
  console.log(`\n▸ 已写 ${path.relative(BASE, out)}：公交可达 ${ok.length}/${schools.length} 所，` +
    `≤${STU.maxCommuteMin} 分钟 ${ok.filter(r => r.bus.total <= STU.maxCommuteMin).length} 所`);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
