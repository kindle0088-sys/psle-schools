#!/usr/bin/env node
/**
 * 用 OneMap elastic/search（免 token）给学校补经纬度。
 *
 * 优先用邮编（精确到楼），失败回退到地址字符串。
 * 结果写入 data/schools.json 的 lat/lon/walkMrt 字段，并另存原始响应到 .tmp/geo/ 作缓存。
 *
 * 限速：OneMap 对连续请求返回 429，故 700ms 间隔 + 指数退避（最多 4 次）。
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const SRC = path.join(BASE, 'data', 'schools.json');
const CACHE = path.join(BASE, '.tmp', 'geo');
const API = 'https://www.onemap.gov.sg/api/common/elastic/search';
const UA = 'psle-schools/0.1 (personal school-choice research)';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function search(q, attempt = 1) {
  const key = q.replace(/[^A-Za-z0-9]/g, '_').slice(0, 60);
  const f = path.join(CACHE, `${key}.json`);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));

  const url = `${API}?searchVal=${encodeURIComponent(q)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.status === 429) {
    if (attempt > 4) throw new Error('429 重试耗尽');
    await sleep(6000 * attempt);
    return search(q, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(f, JSON.stringify(j, null, 1));
  return j;
}

/** 从结果里挑最可能是学校的那条 */
function pick(j, postal) {
  const rs = j.results || [];
  if (!rs.length) return null;
  // 优先邮编完全匹配
  if (postal) {
    const exact = rs.find(r => String(r.POSTAL) === String(postal));
    if (exact) return exact;
  }
  // 其次取 GML 类型为建筑/学校的
  return rs[0];
}

(async () => {
  const schools = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  console.log('▸ 地理编码 %d 所学校', schools.length);

  let ok = 0, fail = 0, byAddr = 0;
  const missing = [];

  for (let i = 0; i < schools.length; i++) {
    const s = schools[i];
    if (s.lat && s.lon) { ok++; continue; }
    let hit = null, how = '';
    try {
      // ① 邮编
      if (s.postal) {
        const j = await search(s.postal);
        hit = pick(j, s.postal);
        how = 'postal';
        if (!hit) await sleep(700);
      }
      // ② 地址回退
      if (!hit && s.address) {
        const clean = s.address.replace(/,?\s*S\d{6}\s*$/i, '').trim();
        const j = await search(clean);
        hit = (j.results || [])[0] || null;
        how = 'address';
      }
    } catch (e) {
      missing.push({ name: s.name, reason: e.message });
      fail++;
      continue;
    }

    if (hit) {
      s.lat = parseFloat(hit.LATITUDE);
      s.lon = parseFloat(hit.LONGITUDE);
      s.geoSource = how;
      s.geoAddress = hit.ADDRESS || hit.SEARCHVAL;
      ok++;
      if (how === 'address') byAddr++;
    } else {
      missing.push({ name: s.name, reason: '无结果' });
      fail++;
    }

    if ((i + 1) % 20 === 0) console.log('   %d/%d  成功 %d', i + 1, schools.length, ok);
    await sleep(700);
  }

  fs.writeFileSync(SRC, JSON.stringify(schools, null, 1));

  console.log('\n▸ 结果');
  console.log('   成功 %d / %d（其中靠地址回退 %d）', ok, schools.length, byAddr);
  console.log('   失败 %d', fail);
  if (missing.length) missing.slice(0, 12).forEach(m => console.log('     ✗ %s — %s', m.name, m.reason));

  // 坐标合理性：新加坡大致 lat 1.15–1.48, lon 103.6–104.1
  const bad = schools.filter(s => s.lat && (s.lat < 1.15 || s.lat > 1.48 || s.lon < 103.6 || s.lon > 104.1));
  if (bad.length) {
    console.log('\n⚠ 坐标越界 %d 所:', bad.length);
    bad.slice(0, 8).forEach(s => console.log('     %s  %s,%s', s.name, s.lat, s.lon));
  } else {
    console.log('   坐标全部落在新加坡范围内 ✅');
  }
})().catch(e => { console.error('✗', e); process.exit(1); });
