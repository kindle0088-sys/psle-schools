/**
 * 步行通勤数据加载与合并（构建脚本共用）
 *
 * 数据来自 scripts/walk-dist.cjs 产出的 data/walk-<studentId>.json：
 *   - walkM / walkMin：OSRM foot profile 在真实 OSM 步行路网上算出的最短路径
 *   - valhallaM：独立引擎（Valhalla pedestrian）对**前若干所**的交叉校验
 *   - confidence：两家比值 > 1.4 判为 'low'
 *
 * 合并口径（用户 2026-11-12 拍板）
 *   1. 步行与地铁**取最快者**参与通勤评分
 *   2. 争议项不取平均，而是显示**区间**（OSRM 下限 → Valhalla 上限）
 *   3. 争议项**仍按最快值计分**，但额外输出 worstMinutes（区间上端与地铁的较小者），
 *      供报告脚注说明「若该路网实际不通，会变成多少分钟」
 *
 * 争议从哪来：OSRM 667m vs Valhalla 1631m（Yusof Ishak，2.45×）
 * 不是权重问题，而是两家对 OSM 里「私人公寓内部通道能否穿行」的 access 判定不同。
 * 这两种情况对家长都成立，所以展示区间；但排名必须有个确定值，故按最快计算。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');

/** 读 data/walk-<id>.json；没有就返回 null（地铁单源降级） */
function load(studentId) {
  const f = path.join(BASE, `data/walk-${studentId}.json`);
  if (!fs.existsSync(f)) return null;
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const bySlug = new Map();
  for (const s of j.schools || []) bySlug.set(s.slug, s);
  return {
    generatedAt: j.generatedAt,
    postal: j.postal,
    walkMetersPerMin: j.walkMetersPerMin || 80,
    source: j.source,
    method: j.method,
    bySlug,
  };
}

/**
 * 把一所学校的步行记录与地铁时间合并。
 * @param {object|null} rec  walk json 里的一条
 * @param {number|null} mrtMin 地铁模型给出的分钟数
 * @returns {object|null} 统一结构；两者都无 → null
 */
function merge(rec, mrtMin) {
  const mrt = mrtMin != null && Number.isFinite(mrtMin) ? Math.round(mrtMin) : null;
  if (!rec && mrt == null) return null;

  let walkMin = null, walkUpperMin = null, conf = null, walkM = null, valhallaM = null;
  if (rec) {
    walkM = rec.walkM ?? null;
    valhallaM = rec.valhallaM ?? null;
    walkMin = rec.walkMin ?? (walkM != null ? Math.ceil(walkM / 80) : null);
    conf = rec.confidence || 'ok';
    // 争议项的上端：有 Valhalla 交叉值就用它，没有就退回 OSRM 值（无处可升）
    walkUpperMin = conf === 'low' && valhallaM != null
      ? Math.ceil(valhallaM / 80)
      : walkMin;
  }

  /* 计分口径（用户拍板）：步行与地铁**取最快者**，争议项也按 OSRM 的最快值计分，
     争议只在展示层标注（区间 + 脚注）。
     worstMinutes 是「若争议路网其实走不通」的时间，仅用于展示与脚注，不参与排名。 */
  let best = null;   // 'walk' | 'mrt'
  if (walkMin != null && mrt != null) best = walkMin <= mrt ? 'walk' : 'mrt';
  else if (walkMin != null) best = 'walk';
  else best = 'mrt';

  const minutes = best === 'walk' ? walkMin : mrt;
  const worst = best === 'walk'
    ? Math.min(walkUpperMin, mrt != null ? mrt : Infinity)
    : minutes;

  return {
    mrtMin: mrt,
    walkMin,
    walkUpperMin,
    walkM,
    valhallaM,
    walkConf: conf,              // 'ok' | 'low' | null（无步行数据）
    walkDisputed: conf === 'low',
    walkRange: conf === 'low' && walkUpperMin != null && walkUpperMin !== walkMin
      ? [walkMin, walkUpperMin] : null,
    best,                        // 参与评分的那一档
    minutes,                     // 参与评分的分钟数（= 最快）
    worstMinutes: worst,         // 争议项的保守值，仅用于展示
  };
}

/** 展示用文本：争议项给区间，正常项给单值 */
function walkLabel(c) {
  if (!c || c.walkMin == null) return '—';
  if (c.walkRange) return `${c.walkRange[0]}–${c.walkRange[1]}`;
  return String(c.walkMin);
}

/** 一句话说明用什么方式上学（争议项给区间） */
function bestLabel(c) {
  if (!c) return '—';
  if (c.best === 'walk') {
    return c.walkRange
      ? `步行 ${c.walkRange[0]}–${c.walkRange[1]} 分钟`
      : `步行 ${c.minutes} 分钟`;
  }
  return `地铁 ${c.minutes} 分钟`;
}

module.exports = { load, merge, walkLabel, bestLabel };
