#!/usr/bin/env node
/**
 * 步行距离 / 时间计算 —— 基于 OpenStreetMap 真实步行路网
 *
 * 数据源（均免费、无需注册、无需 API key）
 *   主源 FOSSGIS OSRM foot   https://routing.openstreetmap.de/routed-foot
 *        · openstreetmap.org 官网用的就是这套（foot profile worldwide）
 *        · 官方使用条款：无需 key，**1 请求/秒上限**，禁止抓取与重负载
 *        · 有 table 服务：一次请求可返回 1×N 的距离矩阵 —— 148 个点约 2 秒
 *   校验 Valhalla pedestrian  https://valhalla1.openstreetmap.de/route
 *        · 第三方独立实现，用来交叉验证，只对少数几所发起请求
 *
 * ⚠️ 不要用 router.project-osrm.org —— 它的 /route/v1/foot/ 会**静默返回驾车路线**
 *    （实测 foot 与 driving 返回完全相同的 2223.9m / 265s），极其容易误用。
 *
 * ⚠️ OneMap 的 routing/route 需要 access token，不符合「免费免注册」的要求。
 *
 * 用法
 *   node scripts/walk-dist.cjs            # 用当前学生，算全部学校
 *   STUDENT=xxx node scripts/walk-dist.cjs
 *
 * 产出 data/walk-<studentId>.json
 */
'use strict';

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const Stu = require('../lib/student.cjs');
const Iso = require('../lib/iso.cjs');
const STU = Stu.load();

const UA = 'psle-schools-commute/1.0 (personal school-commute analysis; +https://kindle0088-sys.github.io/psle-schools/)';
const OUT = path.join(BASE, `data/walk-${STU.id}.json`);

/** 学生步行速度（米/分钟）。中学生背包步行，比成人标准 83 m/min 慢一点 */
const WALK_M_PER_MIN = STU.walkMetersPerMin || 80;

/** 两家引擎分歧超过这个比例，就标成「需核实」 */
const DISAGREE_RATIO = 1.4;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (r.status === 429) { await sleep(8000); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const text = await r.text();
      if (text.trim().startsWith('<')) throw new Error('返回 HTML（服务异常或被限流）');
      return JSON.parse(text);
    } catch (e) {
      lastErr = e;
      await sleep(2000 * (i + 1));
    }
  }
  throw lastErr;
}

/** OSRM table：一次拿到「起点 → 全部学校」的步行距离 */
async function osrmTable(origin, targets) {
  const coords = [origin, ...targets].map(p => `${p.lon},${p.lat}`).join(';');
  const url = `https://routing.openstreetmap.de/routed-foot/table/v1/foot/${coords}?annotations=distance&sources=0`;
  const j = await getJSON(url);
  if (j.code !== 'Ok') throw new Error('OSRM table 失败: ' + (j.message || j.code));
  const row = j.distances[0];
  if (!row || row.length !== targets.length + 1) {
    throw new Error(`OSRM table 返回列数异常：${row ? row.length : 'null'} / 期望 ${targets.length + 1}`);
  }
  return row.slice(1);
}

/** Valhalla 单点步行（用于交叉验证） */
async function valhallaDist(origin, target) {
  const body = {
    locations: [{ lat: origin.lat, lon: origin.lon }, { lat: target.lat, lon: target.lon }],
    costing: 'pedestrian',
  };
  const j = await getJSON('https://valhalla1.openstreetmap.de/route?json=' + encodeURIComponent(JSON.stringify(body)));
  if (!j.trip) return null;
  return j.trip.summary.length * 1000;
}

(async () => {
  const origin = STU.home.coords;
  if (!origin) {
    console.error(`\n✗ data/students/${STU.id}.json 缺少 home.lat / home.lon\n`);
    process.exit(1);
  }

  const schools = JSON.parse(fs.readFileSync(path.join(BASE, 'docs/data/schools.json'), 'utf8')).schools
    .filter(s => s.lat != null && s.lon != null);
  console.log(`▸ 起点 ${STU.home.postal}（${origin.lat.toFixed(6)}, ${origin.lon.toFixed(6)}）`);
  console.log(`▸ 目标 ${schools.length} 所学校，步行速度 ${WALK_M_PER_MIN} m/min`);

  const t0 = Date.now();
  const dist = await osrmTable(origin, schools.map(s => ({ lat: s.lat, lon: s.lon })));
  console.log(`▸ OSRM table 完成：${((Date.now() - t0) / 1000).toFixed(1)}s（1 次请求）`);

  const rows = schools.map((s, i) => {
    const straight = Iso.haversine(origin, { lat: s.lat, lon: s.lon });
    const walk = dist[i];
    return {
      slug: s.slug,
      name: s.name,
      straightM: Math.round(straight),
      walkM: walk == null ? null : Math.round(walk),
      walkMin: walk == null ? null : Math.round(walk / WALK_M_PER_MIN),
      detour: walk == null ? null : +(walk / straight).toFixed(2),
    };
  }).filter(r => r.walkM != null).sort((a, b) => a.walkM - b.walkM);

  // 交叉验证：只查靠前的若干所（遵守 1 请求/秒）
  const VERIFY_N = Math.min(12, rows.length);
  console.log(`▸ 交叉验证前 ${VERIFY_N} 所（Valhalla，逐点 1.1s 间隔）`);
  for (let i = 0; i < VERIFY_N; i++) {
    const r = rows[i];
    const s = schools.find(x => x.slug === r.slug);
    try {
      const alt = await valhallaDist(origin, { lat: s.lat, lon: s.lon });
      r.valhallaM = alt == null ? null : Math.round(alt);
      r.ratio = alt ? +(alt / r.walkM).toFixed(2) : null;
      r.confidence = r.ratio != null && r.ratio > DISAGREE_RATIO ? 'low' : 'ok';
    } catch (e) {
      r.valhallaM = null;
      r.confidence = 'unknown';
    }
    await sleep(1100);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    studentId: STU.id,
    postal: STU.home.postal,
    origin,
    walkMetersPerMin: WALK_M_PER_MIN,
    source: {
      primary: 'FOSSGIS OSRM foot (routing.openstreetmap.de/routed-foot), OSM 步行路网',
      crossCheck: 'Valhalla pedestrian (valhalla1.openstreetmap.de)',
      policy: '无需 API key；FOSSGIS 条款限 1 请求/秒、禁止抓取',
      attribution: '© OpenStreetMap contributors, ODbL',
    },
    method: {
      distance: '真实步行路网最短路（非直线距离估算）',
      minutes: `walkM / ${WALK_M_PER_MIN} m/min，向上取整到分钟`,
      confidence: `两引擎比值 > ${DISAGREE_RATIO} 标记 low —— 说明 OSM 路网可通行性存在争议，建议实地核实`,
    },
    summary: {
      total: rows.length,
      within500m: rows.filter(r => r.walkM <= 500).length,
      within1000m: rows.filter(r => r.walkM <= 1000).length,
      within2000m: rows.filter(r => r.walkM <= 2000).length,
      within15min: rows.filter(r => r.walkMin <= 15).length,
      lowConfidence: rows.filter(r => r.confidence === 'low').length,
    },
    schools: rows,
  };

  fs.writeFileSync(OUT, JSON.stringify(payload, null, 1));

  console.log(`\n▸ 已存 ${path.relative(BASE, OUT)}`);
  console.log('\n最近 10 所（按步行距离）');
  console.log('排名  步行    时间   直线   绕行  校验   学校');
  rows.slice(0, 10).forEach((r, i) => {
    console.log(
      String(i + 1).padStart(3),
      String(r.walkM).padStart(6) + 'm',
      String(r.walkMin).padStart(4) + 'min',
      String(r.straightM).padStart(6) + 'm',
      String(r.detour).padStart(5) + 'x',
      (r.valhallaM ? String(r.valhallaM) + 'm' : '—').padStart(6),
      ' ' + r.name.replace(/ Secondary School| \(Secondary\)/, ''),
      r.confidence === 'low' ? ' ⚠需核实' : ''
    );
  });
  const s = payload.summary;
  console.log(`\n500m 内 ${s.within500m} 所 · 1km 内 ${s.within1000m} 所 · 2km 内 ${s.within2000m} 所`);
  console.log(`15 分钟内 ${s.within15min} 所 · 两引擎分歧超阈值 ${s.lowConfidence} 所`);
})();
