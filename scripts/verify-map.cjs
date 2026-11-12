/**
 * 地图页端到端验证（CDP）
 *
 * 最关键的断言：**前端算出的时间必须与 Node 端同算完全一致**。
 * 如果两端不一致，说明有一份实现漂移了（docs/assets/iso.js 应始终与 lib/iso.cjs 同步）。
 */
const fs = require('fs');
const path = require('path');
const Iso = require('../lib/iso.cjs');

const BASE = path.join(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.CDP_PORT || 9232;
const SITE = process.env.SITE || 'http://127.0.0.1:8901';

// ── Node 端基准 ──
const net = JSON.parse(fs.readFileSync(path.join(BASE, 'data/network.json'), 'utf8'));
const schools = JSON.parse(fs.readFileSync(path.join(BASE, 'docs/data/schools.json'), 'utf8')).schools;
const g = Iso.buildGraph(net);

/** 与前端完全同源：同样调 OneMap 解析 570123，避免用近似坐标导致误判 */
async function nodeBaseline() {
  const url = 'https://www.onemap.gov.sg/api/common/elastic/search?searchVal=570123&returnGeom=Y&getAddrDetails=Y&pageNum=1';
  const j = await (await fetch(url)).json();
  const r = j.results[0];
  const origin = { lat: parseFloat(r.LATITUDE), lon: parseFloat(r.LONGITUDE) };
  const res = Iso.timeToSchools(g, Iso.solveFrom(g, origin).stationMin, schools.filter(s => s.lat && s.lon))
    .filter(x => x.minutes != null)
    .sort((a, b) => a.minutes - b.minutes);
  return {
    origin,
    top: res.slice(0, 5).map(x => ({ name: x.school.name, min: x.minutes })),
    counts: {
      t30: res.filter(x => x.minutes <= 30).length,
      t45: res.filter(x => x.minutes <= 45).length,
      t60: res.filter(x => x.minutes <= 60).length,
    },
  };
}

let nodeTop = [], nodeCounts = {};

(async () => {
  const base0 = await nodeBaseline();
  nodeTop = base0.top; nodeCounts = base0.counts;
  console.log('▸ Node 基准起点:', base0.origin.lat.toFixed(5), base0.origin.lon.toFixed(5));

  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find(x => x.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let seq = 0; const pend = new Map(); const errs = [];
  await new Promise(r => (ws.onopen = r));
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || '').slice(0, 140));
  };
  const send = (method, params = {}) => {
    const id = ++seq; const pr = new Promise(r => pend.set(id, r));
    ws.send(JSON.stringify({ id, method, params })); return pr;
  };
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description?.slice(0, 200));
    return r.result?.result?.value;
  };

  let pass = 0, fail = 0;
  const t = (n, ok, d = '') => {
    if (ok) { pass++; console.log('  ✅', n, d ? '— ' + d : ''); }
    else { fail++; console.log('  ❌', n, d ? '— ' + d : ''); }
  };

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });

  console.log('\n【一】加载');
  await send('Page.navigate', { url: 'about:blank' }); await sleep(500);
  await send('Page.navigate', { url: `${SITE}/map.html` }); await sleep(6000);
  const base = JSON.parse(await ev(`JSON.stringify({
    L: typeof L, Iso: typeof Iso, schools: SCHOOLS.length, graph: !!GRAPH,
    tiles: document.querySelectorAll('img.leaflet-tile').length
  })`));
  t('Leaflet 已加载', base.L === 'object');
  t('求解器已加载', base.Iso === 'object');
  t('学校数据 147 所（含坐标）', base.schools === 147, String(base.schools));
  t('MRT 图已构建', base.graph === true);
  t('地图瓦片已加载', base.tiles > 0, `${base.tiles} 张`);

  console.log('\n【二】地理编码 + 计算（邮编 570123）');
  const r1 = await ev(`(async()=>{
    const g = await geocode('570123');
    if (!g) return JSON.stringify({err:'无结果'});
    runAt(g);
    await new Promise(r=>setTimeout(r,600));
    return JSON.stringify({lat:g.lat, lon:g.lon, label:g.label,
      origin: document.getElementById('origin').innerText.replace(/\\s+/g,' '),
      hits: document.querySelectorAll('.hit').length,
      top: [...document.querySelectorAll('.hit')].slice(0,5).map(h=>({
        name: h.querySelector('.nm').textContent.trim(),
        min: parseInt(h.querySelector('.min').textContent,10)
      }))
    });
  })()`);
  const R1 = JSON.parse(r1);
  t('地理编码返回坐标', isFinite(R1.lat) && isFinite(R1.lon), `${R1.lat},${R1.lon}`);
  t('渲染 147 条结果', R1.hits === 147, String(R1.hits));
  console.log('     起点行:', (R1.origin || '').slice(0, 110));
  console.log('     前 5 所:'); R1.top.forEach(x => console.log('       ', x.min + 'min', x.name));

  console.log('\n【三】与 Node 端一致性（核心断言）');
  let match = 0, mismatch = [];
  for (let i = 0; i < Math.min(nodeTop.length, R1.top.length); i++) {
    const a = nodeTop[i], b = R1.top[i];
    if (a.name === b.name && a.min === b.min) match++;
    else mismatch.push(`Node:${a.min}min ${a.name} ≠ Web:${b.min}min ${b.name}`);
  }
  t('前 5 名学校与时间完全一致', match === nodeTop.length, mismatch.length ? mismatch[0] : `5/5 一致`);

  const webCounts = JSON.parse(await ev(`JSON.stringify({
    t30: lastResult.list.filter(h=>h.minutes<=30).length,
    t45: lastResult.list.filter(h=>h.minutes<=45).length,
    t60: lastResult.list.filter(h=>h.minutes<=60).length
  })`));
  t('30/45/60 分钟计数一致',
    webCounts.t30 === nodeCounts.t30 && webCounts.t45 === nodeCounts.t45 && webCounts.t60 === nodeCounts.t60,
    `Web ${webCounts.t30}/${webCounts.t45}/${webCounts.t60} vs Node ${nodeCounts.t30}/${nodeCounts.t45}/${nodeCounts.t60}`);

  console.log('\n【四】地图渲染');
  const mk = JSON.parse(await ev(`JSON.stringify({
    marks: document.querySelectorAll('path.leaflet-interactive').length,
    blue: lastResult.list.filter(h=>h.minutes<=30).length,
    zoom: map.getZoom(), center: map.getCenter()
  })`));
  t('标记数 = 学校 + 起点 + 最近站', mk.marks >= 147, `${mk.marks} 个矢量`);
  t('视野已聚焦（zoom ≥ 11）', mk.zoom >= 11, `zoom ${mk.zoom}`);

  console.log('\n【五】时间筛选');
  const tabTest = [];
  for (const [b, expect] of [['30', webCounts.t30], ['45', webCounts.t45], ['60', webCounts.t60], ['999', 147]]) {
    await ev(`(()=>{const c=document.querySelector('#tabs [data-b="${b}"]'); c.click();})()`);
    await sleep(280);
    const n = await ev(`document.querySelectorAll('.hit').length`);
    tabTest.push({ b, n, expect, ok: n === expect });
  }
  t('四个时间档筛选均正确', tabTest.every(x => x.ok),
    tabTest.map(x => `${x.b === '999' ? '全部' : '≤' + x.b}→${x.n}`).join(' '));

  console.log('\n【六】交互');
  await ev(`(()=>{const c=document.querySelector('#tabs [data-b="999"]'); c.click();})()`);
  await sleep(250);
  const clickTest = JSON.parse(await ev(`JSON.stringify((()=>{
    const hit=document.querySelectorAll('.hit')[2];
    const name=hit.querySelector('.nm').textContent.trim();
    hit.click();
    return {name};
  })())`));
  await sleep(700);
  const z = await ev('map.getZoom()');
  t('点击列表项放大地图', z >= 14, `zoom ${z}（${clickTest.name}）`);

  const presetTest = await ev(`(async()=>{
    document.querySelector('[data-preset="600123"]').click();
    await new Promise(r=>setTimeout(r,2500));
    return JSON.stringify({
      origin: document.getElementById('origin').innerText.replace(/\\s+/g,' ').slice(0,80),
      hits: document.querySelectorAll('.hit').length
    });
  })()`);
  const PT = JSON.parse(presetTest);
  t('快捷按钮可用（Jurong East）', PT.hits > 0 && /JURONG|Jurong/i.test(PT.origin), PT.origin.slice(0, 60));

  console.log('\n【七】错误处理');
  const badQ = await ev(`(async()=>{
    const g = await geocode('zzzzzz99999');
    return g === null ? 'null-ok' : 'unexpected:'+JSON.stringify(g);
  })()`);
  t('无效地址返回 null（不抛异常）', badQ === 'null-ok', badQ);

  const errShown = await ev(`(async()=>{
    document.getElementById('addr').value='zzzzzz99999';
    await runQuery('zzzzzz99999');
    return JSON.stringify({shown: !document.getElementById('err').hidden, msg: document.getElementById('err').textContent.slice(0,50)});
  })()`);
  const ES = JSON.parse(errShown);
  t('无效地址显示提示', ES.shown === true, ES.msg);

  console.log('\n【七之二】起点与学校的视觉区分');
  /* 用户反馈过：起点和「≤30 分钟」的学校都是 #38bdf8，地图上分不出哪个是家。
     这里锁死「起点颜色不出现在任何学校色阶里」，并且起点必须压在图层最上。 */
  const vis = JSON.parse(await ev(`JSON.stringify((() => {
    const o = { bands: [], here: null, hereType: null, legend: [], schoolColors: [] };
    [20, 40, 55, 90].forEach(m => o.bands.push(band(m).color));
    if (hereMarker) {
      // Leaflet 压缩后 constructor.name 不可靠（实测是 'e'），改判能力
      o.hereType = typeof hereMarker.bringToFront === 'function' ? 'has-bringToFront' : 'no-bringToFront';
      o.here = hereMarker.getLayers ? hereMarker.getLayers().map(l => ({
        r: l.options.radius, fill: l.options.fillColor, stroke: l.options.color,
      })) : null;
    }
    const lg = document.querySelector('.legend');
    if (lg) o.legend = [...lg.querySelectorAll('span')].map(s => s.textContent.trim());
    if (schoolLayer) {
      const set = new Set();
      schoolLayer.eachLayer(l => { if (l.options && l.options.fillColor) set.add(l.options.fillColor); });
      o.schoolColors = [...set];
    }
    return o;
  })())`));
  const HERE_YELLOW = '#fbbf24';
  t('起点标记存在', !!vis.here && vis.here.length === 2, vis.here ? vis.here.length + ' 层' : '缺');
  t('起点是琥珀黄', !!vis.here && vis.here.every(l => l.fill === HERE_YELLOW), JSON.stringify(vis.here && vis.here.map(l => l.fill)));
  t('起点支持 bringToFront（能压在学校层之上）', vis.hereType === 'has-bringToFront', vis.hereType);
  t('学校色阶不含起点的黄色', !vis.bands.includes(HERE_YELLOW) && !vis.schoolColors.includes(HERE_YELLOW),
    '学校: ' + vis.schoolColors.join(','));
  // 动态比色：不管以后把起点改成什么色，都不许和学校撞
  const hereColor = vis.here && vis.here[1] ? vis.here[1].fill : null;
  t('起点颜色与学校色阶无交集',
    !!hereColor && !vis.bands.includes(hereColor) && !vis.schoolColors.includes(hereColor),
    `起点 ${hereColor} vs 学校 ${vis.bands.join(',')}`);
  t('学校色阶是蓝色系梯度', vis.bands.length === 4 && vis.bands[0] !== vis.bands[3], vis.bands.join(' → '));
  t('图例含「起点」一行', vis.legend.length === 5 && vis.legend[0] === '起点', vis.legend.join(' | '));
  t('图例四档时间齐全', ['≤30 分钟', '31–45 分钟', '46–60 分钟', '>60 分钟'].every(x => vis.legend.includes(x)));

  console.log('\n【八】JS 异常');
  t('无未捕获异常', errs.length === 0, errs.length ? errs[0] : '');

  console.log(`\n══════ ${pass} 通过 / ${fail} 失败 ══════`);
  ws.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
