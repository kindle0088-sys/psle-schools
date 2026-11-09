/**
 * 看板页端到端验证（CDP）
 * 用真实浏览器断言：数据加载、卡片渲染、排序、筛选、分数定位
 */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.CDP_PORT || 9231;
const SITE = process.env.SITE || 'http://127.0.0.1:8901';

(async () => {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find(x => x.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let seq = 0; const pend = new Map();
  await new Promise(r => (ws.onopen = r));
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
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
  const t = (name, ok, detail = '') => {
    if (ok) { pass++; console.log('  ✅', name, detail ? '— ' + detail : ''); }
    else { fail++; console.log('  ❌', name, detail ? '— ' + detail : ''); }
  };

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${SITE}/index.html` });
  await sleep(2500);

  console.log('\n【一】数据加载');
  const meta = await ev(`JSON.stringify({
    total: document.getElementById('totalN').textContent,
    copYear: document.getElementById('copYear').textContent,
    cards: document.querySelectorAll('.card').length,
    stat: document.getElementById('statline').innerText.replace(/\\s+/g,' '),
    areas: document.querySelectorAll('#area option').length - 1
  })`);
  const M = JSON.parse(meta);
  t('卡片渲染 147 所', M.cards === 147, `实际 ${M.cards}`);
  t('总数为 147', M.total === '147', M.total);
  t('COP 年度 2025', M.copYear === '2025', M.copYear);
  t('区域下拉已填充', M.areas > 10, `${M.areas} 个区域`);
  t('统计条正确', /IP 17/.test(M.stat) && /SAP 11/.test(M.stat) && /139/.test(M.stat), M.stat);

  console.log('\n【二】默认排序（门槛 严→松）');
  const order = await ev(`JSON.stringify([...document.querySelectorAll('.card')].slice(0,8).map(c=>({
    name: c.querySelector('.card-name').textContent.trim(),
    cop: c.querySelector('.cop-main .v').textContent.trim()
  })))`);
  const O = JSON.parse(order);
  O.forEach(x => console.log('     ', x.cop.padEnd(8), x.name));
  // 提取 max 值检查单调性
  const maxes = O.map(x => { const m = x.cop.match(/[–-](\d+)/); return m ? +m[1] : +x.cop.match(/(\d+)/)[1]; });
  const mono = maxes.every((v, i) => i === 0 || v >= maxes[i - 1]);
  t('门槛从严到松单调递增', mono, `max 序列 ${maxes.join(',')}`);

  // 回归检查：非 IP 校的卡头必须等于该校 PG3 非附属区间。
  // 历史 bug —— 曾取「所有档中 max 最大者」，实际恒为 PG1 行，门槛被低估 8–10 分。
  const pg3raw = await ev(`JSON.stringify((()=>{
    const bad=[]; let checked=0;
    for (const sc of SCHOOLS) {
      if (!sc.cop || !sc.cop.rows) continue;
      if (sc.cop.type === 'IP' || sc.cop.rows.length === 1) continue;
      const r = sc.cop.rows.find(x=>x.label==='Posting Group 3');
      if (!r || !r.nonAff) continue;
      const card=[...document.querySelectorAll('.card')].find(c=>c.dataset.slug===sc.slug);
      if(!card) continue;
      const v=card.querySelector('.cop-main .v').textContent.trim();
      const want=(r.nonAff.min===r.nonAff.max ? String(r.nonAff.min) : r.nonAff.min+'\\u2013'+r.nonAff.max)+(r.nonAff.markMax?'('+r.nonAff.markMax+')':'');
      checked++;
      if(v!==want) bad.push(sc.slug+':'+v+'\\u2260'+want);
    }
    return {checked, bad};
  })())`);
  const PG3 = JSON.parse(pg3raw);
  t('全部非 IP 校卡头取自 PG3 行（回归）', PG3.bad.length === 0,
    PG3.bad.length ? PG3.bad.slice(0, 3).join(' | ') : `${PG3.checked} 所全部正确`);

  console.log('\n【三】搜索');
  await ev(`(()=>{const i=document.getElementById('q'); i.value='Raffles'; i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(400);
  const s1 = await ev(`JSON.stringify({n:document.querySelectorAll('.card').length, names:[...document.querySelectorAll('.card-name')].map(x=>x.textContent.trim())})`);
  const S1 = JSON.parse(s1);
  t('搜索 Raffles 命中 2 所', S1.n === 2, S1.names.join(' / '));

  await ev(`(()=>{const i=document.getElementById('q'); i.value='Bishan'; i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(400);
  const s2 = await ev(`document.querySelectorAll('.card').length`);
  t('搜索区域名 Bishan 有结果', s2 > 0, `${s2} 所`);

  await ev(`(()=>{const i=document.getElementById('q'); i.value='575954'; i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(400);
  const s3 = await ev(`JSON.stringify([...document.querySelectorAll('.card-name')].map(x=>x.textContent.trim()))`);
  t('搜索邮编 575954 命中 RI', /Raffles Institution/.test(s3), s3.slice(0, 100));

  await ev(`(()=>{const i=document.getElementById('q'); i.value='zzzznothing'; i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(400);
  const s4 = await ev(`!!document.querySelector('.empty')`);
  t('无结果时显示空态', s4 === true);

  console.log('\n【四】标签筛选');
  await ev(`document.getElementById('reset').click()`);
  await sleep(300);
  await ev(`document.querySelector('[data-tag="ip"]').click()`);
  await sleep(400);
  const f1 = await ev(`JSON.stringify({n:document.querySelectorAll('.card').length, tag:document.querySelector('#statline').innerText})`);
  const F1 = JSON.parse(f1);
  t('IP 筛选 = 17 所', F1.n === 17, `${F1.n} 所`);

  await ev(`document.querySelector('[data-tag="sap"]').click()`);
  await sleep(400);
  const f2 = await ev(`document.querySelectorAll('.card').length`);
  t('IP+SAP 交集 < 17', f2 <= 17 && f2 > 0, `${f2} 所（Hwa Chong / Catholic 等既是 IP 也是 SAP）`);

  console.log('\n【五】分数定位');
  await ev(`document.getElementById('reset').click()`);
  await sleep(300);
  await ev(`(()=>{const i=document.getElementById('score'); i.value='8'; i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(500);
  const sc = await ev(`JSON.stringify({
    stat: document.getElementById('statline').innerText.replace(/\\s+/g,' '),
    fits: [...document.querySelectorAll('.fit')].slice(0,5).map(x=>x.className+' :: '+x.textContent.trim()),
    counts: {
      ok: document.querySelectorAll('.fit-ok').length,
      edge: document.querySelectorAll('.fit-edge').length,
      out: document.querySelectorAll('.fit-out').length
    }
  })`);
  const SC = JSON.parse(sc);
  console.log('     统计条:', SC.stat);
  SC.fits.forEach(f => console.log('     ', f));
  t('8 分出现可报学校', SC.counts.ok + SC.counts.edge > 0, `可报 ${SC.counts.ok} / 压线 ${SC.counts.edge} / 不足 ${SC.counts.out}`);
  t('统计条显示可报数量', /PSLE 8 分可报/.test(SC.stat), SC.stat.slice(-40));

  // 校验具体判断：8 分对 RI(4-6) 应"差分"，对 Catholic High PG3(6-8) 应"可报"
  const spot = await ev(`JSON.stringify((()=>{
    const find=n=>[...document.querySelectorAll('.card')].find(c=>c.querySelector('.card-name').textContent.trim().startsWith(n));
    const ri=find('Raffles Institution'), ch=find('Catholic High');
    const g=c=>c? (c.querySelector('.fit')?.textContent.trim()+' ['+c.querySelector('.fit')?.className.replace('fit ','')+']') : '未找到';
    return {ri:g(ri), ch:g(ch)};
  })())`);
  const SP = JSON.parse(spot);
  t('RI(4-6) 对 8 分判为分数不足', /差 \d+ 分/.test(SP.ri), SP.ri);
  t('Catholic(6-8) 对 8 分判为压线', /压线|余量/.test(SP.ch), SP.ch);

  console.log('\n【五之二】17 分口径（本项目基准）');
  await ev(`(()=>{const i=document.getElementById('score'); i.value='17'; i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(600);
  const s17raw = await ev(`JSON.stringify({
    stat: document.getElementById('statline').innerText.replace(/\\s+/g,' '),
    cv: (()=>{const c=[...document.querySelectorAll('.card')].find(x=>x.querySelector('.card-name').textContent.includes('Compassvale'));
      if(!c) return '未找到';
      return c.querySelector('.cop-main .v').textContent.trim()+' | '+(c.querySelector('.fit')?.textContent.trim()||'无徽标');})(),
    kc: (()=>{const c=[...document.querySelectorAll('.card')].find(x=>x.querySelector('.card-name').textContent.includes('Kuo Chuan'));
      if(!c) return '未找到';
      return c.querySelector('.cop-main .l').textContent.trim()+' | '+(c.querySelector('.fit')?.textContent.trim()||'无徽标');})()
  })`);
  const S17 = JSON.parse(s17raw);
  console.log('     ', S17.stat.slice(-34));
  t('17 分可报 68 所（与志愿报告口径一致）', /PSLE 17 分可报 68/.test(S17.stat), S17.stat.slice(-34));
  t('Compassvale 卡头取 PG3 行且余量 1 分', /14–18/.test(S17.cv) && /余量 1 分/.test(S17.cv), S17.cv);
  // 回归：PG3 只有附属区间的学校，无附属关系的学生不可报
  t('Kuo Chuan（PG3 仅附属）判为不招本档', /不招本档/.test(S17.kc), S17.kc);

  console.log('\n【六】展开详情');
  await ev(`document.getElementById('reset').click()`);
  await sleep(300);
  const det = await ev(`JSON.stringify((()=>{
    const c=[...document.querySelectorAll('.card')].find(x=>x.querySelector('.card-name').textContent.includes('Hwa Chong'));
    c.querySelector('[data-act="toggle"]').click();
    const d=c.querySelector('.detail');
    return {open:d.classList.contains('open'), len:d.innerText.length, first:d.innerText.replace(/\\s+/g,' ').slice(0,120)};
  })())`);
  const D = JSON.parse(det);
  t('详情可展开', D.open && D.len > 50, `${D.len} 字符`);
  console.log('     内容:', D.first);

  console.log('\n【七】排序与重置');
  await ev(`(()=>{const s=document.getElementById('sort'); s.value='name'; s.dispatchEvent(new Event('change'));})()`);
  await sleep(400);
  const byName = await ev(`JSON.stringify([...document.querySelectorAll('.card-name')].slice(0,4).map(x=>x.textContent.trim()))`);
  const BN = JSON.parse(byName);
  const sortedOk = BN.every((v, i) => i === 0 || v.localeCompare(BN[i - 1]) >= 0);
  t('按名称排序有序', sortedOk, BN.join(' / '));

  await ev(`document.getElementById('reset').click()`);
  await sleep(400);
  const resetOk = await ev(`JSON.stringify({cards:document.querySelectorAll('.card').length, sort:document.getElementById('sort').value, tags:document.querySelectorAll('#tags .chip.on').length, score:document.getElementById('score').value})`);
  const R = JSON.parse(resetOk);
  t('重置恢复初始状态', R.cards === 147 && R.sort === 'cop' && R.tags === 0 && R.score === '', JSON.stringify(R));

  console.log('\n【七之二】单校深度报告入口');
  await ev(`document.getElementById('reset').click()`);
  await sleep(400);
  const repRaw = await ev(`JSON.stringify({
    withBtn: [...document.querySelectorAll('.card')].filter(c=>c.querySelector('.deeplink')).length,
    slugs: [...document.querySelectorAll('.card')].filter(c=>c.querySelector('.deeplink')).map(c=>c.dataset.slug),
    tagDeep: document.querySelectorAll('.tag-deep').length,
    bigBtn: document.querySelectorAll('.deeplink-lg').length,
    href: document.querySelector('.deeplink')?.getAttribute('href') || '',
    hrefOk: (()=>{const a=document.querySelector('.deeplink'); return a ? !!a.href : false;})()
  })`);
  const RP = JSON.parse(repRaw);
  t('报告入口数量与索引一致', RP.withBtn === 1, `${RP.withBtn} 个 · ${RP.slugs.join(',')}`);
  t('深度报告标签出现', RP.tagDeep === 1, `${RP.tagDeep} 个`);
  t('详情区大按钮出现', RP.bigBtn === 1, `${RP.bigBtn} 个`);
  t('入口指向正确文件', /school-compassvale-secondary\.html$/.test(RP.href), RP.href);

  console.log('\n【八】JS 异常检查');
  const errs = await ev(`JSON.stringify(window.__errs || [])`);
  t('无未捕获异常', JSON.parse(errs).length === 0);

  console.log(`\n══════ ${pass} 通过 / ${fail} 失败 ══════`);
  ws.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
