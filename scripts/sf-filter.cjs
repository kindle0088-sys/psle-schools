/**
 * 用 MOE SchoolFinder 的官方筛选器验证候选池
 *
 * SchoolFinder 的筛选控件（前端，非 URL 参数）：
 *   input[placeholder="Enter your postal code"]        邮编
 *   input[name="aggregated-score-input-from"]          分数下限
 *   input[name="aggregated-score-input-to"]            分数上限
 *
 * React 受控组件必须用原生 setter + input/change 事件才能生效。
 */
const POSTAL = process.env.POSTAL || '828765';
const SCORE = process.env.SCORE || '17';
const CDP = process.env.CDP_PORT || 9235;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
  const p = list.find(x => x.type === 'page');
  const ws = new WebSocket(p.webSocketDebuggerUrl);
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

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'https://www.moe.gov.sg/schoolfinder/secondary%20school' });
  await sleep(9000);

  // 记录筛前数量
  const before = await ev(`document.querySelectorAll('a[href*="schooldetail"]').length`);
  console.log('▸ 筛选前列表链接数:', before);

  /** 往 React 受控 input 里填值 */
  const fill = async (selector, value) => {
    const ok = await ev(`(()=>{
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return 'NOT_FOUND';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      return 'OK:' + el.value;
    })()`);
    return ok;
  };

  console.log('\n▸ 输入邮编', POSTAL, '→', await fill('input[placeholder="Enter your postal code"]', POSTAL));
  await sleep(3500);

  const afterPostal = await ev(`JSON.stringify({
    links: document.querySelectorAll('a[href*="schooldetail"]').length,
    body: document.body.innerText.replace(/\\s+/g,' ').slice(0, 300)
  })`);
  console.log('  筛选后:', afterPostal);

  // 尝试加分数筛选
  console.log('\n▸ 输入分数下限', SCORE, '→', await fill('input[name="aggregated-score-input-from"]', SCORE));
  console.log('▸ 输入分数上限', SCORE, '→', await fill('input[name="aggregated-score-input-to"]', SCORE));
  await sleep(3500);

  const afterScore = await ev(`JSON.stringify({
    links: document.querySelectorAll('a[href*="schooldetail"]').length,
    names: [...document.querySelectorAll('a[href*="schooldetail"]')].slice(0,60).map(a=>a.textContent.trim().replace(/\\s+/g,' ')).filter(Boolean)
  })`);
  console.log('  加分数筛选后:', afterScore);

  // 也试不带分数、只带邮编的完整列表
  console.log('\n▸ 清空分数，只看邮编');
  await fill('input[name="aggregated-score-input-from"]', '');
  await fill('input[name="aggregated-score-input-to"]', '');
  await sleep(3000);
  const postalOnly = await ev(`JSON.stringify({
    links: document.querySelectorAll('a[href*="schooldetail"]').length,
    names: [...document.querySelectorAll('a[href*="schooldetail"]')].slice(0,80).map(a=>a.textContent.trim().replace(/\\s+/g,' ')).filter(Boolean)
  })`);
  console.log('  结果:', postalOnly);

  ws.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
