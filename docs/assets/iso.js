/**
 * MRT 等时圈求解器（Node + 浏览器共用）
 *
 * 模型
 *   - 节点 = 站点代号（如 "NS17"），代号本身隐含线路，所以换乘成本天然可表达
 *   - 乘车边：同线相邻站，权重 rideMinPerStop（默认 2 分钟）
 *   - 换乘边：同物理站不同线，权重 transferMin（默认 5 分钟）
 *   - 起点：步行可达的站，**该站所有线路代号**都给步行时间
 *     （走到站台就能坐任何一条线，不应额外付换乘成本）
 *   - 终点：某校的最短时间 = min over 站 [ min over 代号 dist + 站到学校步行时间 ]
 *
 * 已知局限（务必在 UI 上说明）
 *   - 只算 MRT，不含巴士。最近站步行 >800m 的学校实际需巴士接驳，本模型偏乐观
 *   - 站间统一 2 分钟，未区分快慢线与站间真实距离
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Iso = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const R_EARTH = 6371000;

  function haversine(a, b) {
    const rad = x => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R_EARTH * Math.asin(Math.sqrt(h));
  }

  /** 构建邻接表：code → [{to, min}]，含乘车边与换乘边 */
  function buildGraph(net) {
    const adj = new Map();
    const ensure = c => { if (!adj.has(c)) adj.set(c, []); return adj.get(c); };
    for (const s of net.stations) for (const c of s.codes) ensure(c);
    const add = (a, b, min) => {
      if (!adj.has(a) || !adj.has(b)) return;
      adj.get(a).push({ to: b, min });
      adj.get(b).push({ to: a, min });
    };
    for (const e of net.edges) add(e.a, e.b, e.min);
    for (const t of net.transfers) add(t.a, t.b, t.min);

    // station id → 其全部代号 + 坐标
    const stationByCode = new Map();
    for (const s of net.stations) for (const c of s.codes) stationByCode.set(c, s);

    return { adj, stationByCode, params: net.params, stations: net.stations };
  }

  /**
   * 从起点坐标求解到所有站的最短时间（Dijkstra）
   * @returns Map<code, minutes>
   */
  function solveFrom(graph, origin, opts = {}) {
    const walkMPerMin = graph.params.walkMPerMin || 80;
    const overhead = graph.params.accessOverheadMin ?? 4;   // 进站+刷卡+等车的固定开销
    const maxAccessStations = opts.maxAccessStations || 6;   // 只考虑步行最近的 N 个站

    // ① 找步行最近的几个站
    const withDist = graph.stations.map(s => ({
      s, d: haversine(origin, { lat: s.lat, lon: s.lon }),
    })).sort((a, b) => a.d - b.d).slice(0, maxAccessStations);

    // ② 初始化：这些站的全部代号都给「步行 + 进站开销」
    const dist = new Map();
    const pq = [];   // 简易二叉堆够用（节点 ~180）
    const push = (code, m) => {
      if (dist.has(code) && dist.get(code) <= m) return;
      dist.set(code, m);
      pq.push([m, code]);
    };
    for (const { s, d } of withDist) {
      const m = d / walkMPerMin + overhead;
      for (const c of s.codes) push(c, m);
    }

    // ③ Dijkstra（数组取最小，节点规模小无需堆优化）
    const done = new Set();
    while (pq.length) {
      let bi = 0;
      for (let i = 1; i < pq.length; i++) if (pq[i][0] < pq[bi][0]) bi = i;
      const [m, code] = pq.splice(bi, 1)[0];
      if (done.has(code)) continue;
      done.add(code);
      for (const { to, min } of graph.adj.get(code) || []) {
        const nm = m + min;
        if (!dist.has(to) || dist.get(to) > nm) push(to, nm);
      }
    }

    // ④ 汇总到「物理站」层级：一个站取各代号最小值
    const stationMin = new Map();   // station.id → { minutes, station }
    for (const [code, m] of dist) {
      const st = graph.stationByCode.get(code);
      if (!st) continue;
      const cur = stationMin.get(st.id);
      if (!cur || cur.minutes > m) stationMin.set(st.id, { minutes: m, station: st });
    }
    return { codeDist: dist, stationMin };
  }

  /**
   * 每所学校的最短到达时间
   * @returns [{ school, minutes, walkMinutes, viaStation, viaStationName, accessWalkM }]
   */
  function timeToSchools(graph, stationMin, schools) {
    const walkMPerMin = graph.params.walkMPerMin || 80;
    const out = [];
    for (const sc of schools) {
      if (!sc.lat || !sc.lon) { out.push({ school: sc, minutes: null }); continue; }
      let best = null;
      for (const { minutes, station } of stationMin.values()) {
        const d = haversine({ lat: sc.lat, lon: sc.lon }, { lat: station.lat, lon: station.lon });
        const w = d / walkMPerMin;
        const total = minutes + w;
        if (!best || total < best.total) {
          best = { total, rideMin: minutes, walkMin: w, distM: d, station };
        }
      }
      if (!best) { out.push({ school: sc, minutes: null }); continue; }
      out.push({
        school: sc,
        minutes: Math.round(best.total),
        rideMinutes: Math.round(best.rideMin),
        walkMinutes: Math.round(best.walkMin),
        accessWalkM: Math.round(best.distM),
        viaStation: best.station.codes.join('/'),
        viaStationName: best.station.name,
      });
    }
    return out;
  }

  /** 找到离某坐标最近的 N 个站（用于展示「你从哪站上车」） */
  function nearestStations(graph, origin, n = 3) {
    return graph.stations
      .map(s => ({ ...s, distM: Math.round(haversine(origin, { lat: s.lat, lon: s.lon })) }))
      .sort((a, b) => a.distM - b.distM)
      .slice(0, n);
  }

  return { haversine, buildGraph, solveFrom, timeToSchools, nearestStations };
});
