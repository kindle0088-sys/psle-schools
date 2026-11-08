/**
 * collect-details.cjs — 抓取中学详情页并解析成结构化 JSON
 *
 * 用法：
 *   node scripts/collect-details.cjs --test              # 只跑 3 所代表作
 *   node scripts/collect-details.cjs --limit 20          # 前 20 所
 *   node scripts/collect-details.cjs                     # 全量 147 所
 *
 * 数据源：https://www.moe.gov.sg/schoolfinder/schooldetail/{slug}
 * 页面是服务端渲染，curl 即可拿到完整 HTML（含折叠区内容）。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'data/schools-index.json');
const OUT = path.join(ROOT, 'data/schools.json');
const CACHE = path.join(ROOT, '.tmp/detail');

const BASE = 'https://www.moe.gov.sg/schoolfinder/schooldetail/';
const DELAY = 400; // 礼貌间隔 ms

const TEST_SLUGS = [
  'anglo-chinese-school-barker-road',   // 政府辅助 + 男校 + 有附属
  'raffles-institution-secondary',      // IP 直通车
  'hwa-chong-institution-secondary',    // IP + SAP
];

/* ── 工具 ── */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

/** 截取某个 collapsible section 的内容（到下一个 section 之前） */
function section(html, heading) {
  const i = html.indexOf(`>${heading}</span>`);
  if (i < 0) return '';
  const start = html.indexOf('moe-collapsible__content', i);
  if (start < 0) return '';
  const next = html.indexOf('moe-collapsible__heading', start);
  return html.slice(start, next > 0 ? next : start + 6000);
}

/** 提取 <li> 列表 */
function listItems(seg) {
  return [...seg.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim())
    .filter(Boolean);
}

/**
 * 解析分数线单元格。
 * 普通：  "8 - 21" / "21"
 * SAP ：  "5(D) - 10(M)"  ← 括号是高级华文等级 D=Distinction / M=Merit
 * 统一返回 { min, max, markMin, markMax }，无字母时 mark 为 null。
 */
function parseRange(s) {
  if (!s) return null;
  const t = s.replace(/<[^>]+>/g, '').replace(/\s/g, '');
  let m = t.match(/^(\d+)(?:\(([A-Z])\))?-(\d+)(?:\(([A-Z])\))?$/);
  if (m) return { min: +m[1], max: +m[3], markMin: m[2] || null, markMax: m[4] || null };
  m = t.match(/^(\d+)(?:\(([A-Z])\))?$/);
  if (m) return { min: +m[1], max: +m[1], markMin: m[2] || null, markMax: m[2] || null };
  return null;
}

/* ── 解析单页 ── */
function parse(html, meta) {
  const out = {
    slug: meta.slug,
    name: meta.name,
    code: meta.code,
    area: meta.area,
    address: null,
    postal: null,
    cop: null,
    dsa: null,
    cca: [],
    subjects: [],
    electives: [],
    affiliations: { primary: [], jc: [] },
    schoolMode: null,
    schoolNature: null,
    schoolType: null,
    contact: { phone: null, email: null, website: null },
    collectedAt: new Date().toISOString(),
  };

  // 地址 / 邮编
  const addr = html.match(/>([^<]*\bS\d{6})</);
  if (addr) {
    out.address = addr[1].trim();
    const pm = out.address.match(/S(\d{6})/);
    if (pm) out.postal = pm[1];
  }

  // ── PSLE score range（PG1/2/3 × Affiliated/Non-affiliated）──
  const copSeg = section(html, 'PSLE score range of 2025') || section(html, 'PSLE score range');
  const yearM = html.match(/PSLE score range of (\d{4})/);
  if (copSeg) {
    const rows = [...copSeg.matchAll(/<tr>([\s\S]*?)<\/tr>/g)];
    const cop = { year: yearM ? +yearM[1] : null, type: null, ip: {}, affiliated: {}, nonAffiliated: {} };
    for (const r of rows) {
      const cells = [...r[1].matchAll(/<(th|td)[^>]*>([\s\S]*?)<\/\1>/g)].map((c) => c[2].replace(/<[^>]+>/g, '').trim());
      if (!cells.length) continue;
      if (/Integrated Programme/i.test(cells[0])) {
        cop.type = 'IP';
        cop.ip.affiliated = parseRange(cells[1]);
        cop.ip.nonAffiliated = parseRange(cells[2]);
        continue;
      }
      const pg = cells[0].match(/Posting Group (\d)/i);
      if (!pg) continue;
      if (!cop.type) cop.type = 'PG';
      const k = 'PG' + pg[1];
      const a = parseRange(cells[1]), n = parseRange(cells[2]);
      if (a) cop.affiliated[k] = a;
      if (n) cop.nonAffiliated[k] = n;
    }
    if (Object.keys(cop.affiliated).length || Object.keys(cop.nonAffiliated).length || Object.keys(cop.ip || {}).length) out.cop = cop;
  }

  // ── DSA ──
  const dsaSeg = section(html, 'DSA talent areas offered for 2026') || section(html, 'DSA talent areas');
  const dsaYear = html.match(/DSA talent areas offered for (\d{4})/);
  if (dsaSeg) {
    const items = listItems(dsaSeg);
    if (items.length) out.dsa = { year: dsaYear ? +dsaYear[1] : null, areas: items };
  }

  // ── CCA ──
  const ccaSeg = section(html, 'Co-Curricular Activities (CCAs)');
  if (ccaSeg) out.cca = listItems(ccaSeg);

  // ── Subjects ──
  const subSeg = section(html, 'Subjects offered');
  if (subSeg) out.subjects = listItems(subSeg);

  // ── Electives and programmes（ALP / LLP / IP 等）──
  const elSeg = section(html, 'Electives and programmes');
  if (elSeg) {
    const blocks = [...elSeg.matchAll(/<span class="d:b ff:heading[^"]*">([^<]+)<\/span>/g)];
    for (let i = 0; i < blocks.length; i++) {
      const type = blocks[i][1].trim();
      const from = blocks[i].index;
      const to = i + 1 < blocks.length ? blocks[i + 1].index : elSeg.length;
      const body = elSeg.slice(from, to);
      const cat = body.match(/<span class="d:b ts:m m-b:m fw:7 c:grey-2">([^<]+)<\/span>/);
      out.electives.push({
        type,
        category: cat ? cat[1].replace(/&amp;/g, '&').trim() : null,
        items: listItems(body),
      });
    }
  }

  // ── Affiliations ──
  const affI = html.indexOf('>Affiliations</span>');
  if (affI > 0) {
    const affSeg = html.slice(affI, affI + 1800);
    const primary = affSeg.match(/Primary schools<\/span>([\s\S]*?)(?:Junior colleges|<\/div><\/div>)/);
    const jc = affSeg.match(/Junior colleges<\/span>([\s\S]*?)(?:<\/div><\/div>|<div class="m-b:m">)/);
    const grab = (s) => s ? [...s[1].matchAll(/<span class="d:b m-b:s">([^<]+)<\/span>/g)].map((m) => m[1].trim()) : [];
    out.affiliations.primary = grab(primary);
    out.affiliations.jc = grab(jc);
  }

  // ── About：mode / nature / type ──
  const aboutI = html.indexOf('>About</span>');
  if (aboutI > 0) {
    const seg = html.slice(aboutI, aboutI + 2000);
    const pick = (label) => {
      const m = seg.match(new RegExp(label + '[\\s\\S]{0,200}?<span class="d:b[^"]*">([^<]+)</span>'));
      return m ? m[1].trim() : null;
    };
    out.schoolMode = pick('School mode:');
    out.schoolNature = pick('School nature:');
    out.schoolType = pick('School type:');
  }

  // ── 联系方式 ──
  const phone = html.match(/Phone:<\/[^>]*>?\s*<[^>]*>([0-9 ]{8,12})/i) || html.match(/Phone:<\/span>\s*<span[^>]*>([0-9 ]{8,12})/i);
  if (phone) out.contact.phone = phone[1].trim();
  const mail = html.match(/([a-z0-9._%+-]+@[a-z0-9.-]*moe\.edu\.sg)/i);
  if (mail) out.contact.email = mail[1];
  const web = html.match(/href="(https?:\/\/www\.[a-z0-9-]+\.moe\.edu\.sg[^"]*)"/i);
  if (web) out.contact.website = web[1];

  return out;
}

/* ── 抓取 ── */
async function fetchOne(slug) {
  const f = path.join(CACHE, slug + '.html');
  if (fs.existsSync(f) && fs.statSync(f).size > 50000) {
    return fs.readFileSync(f, 'utf8');
  }
  const res = await fetch(BASE + encodeURIComponent(slug), {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; psle-schools-research/0.1)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(f, html);
  return html;
}

/* ── 主流程 ── */
(async () => {
  const index = JSON.parse(fs.readFileSync(INDEX, 'utf8')).filter((x) => x.name);
  let targets = index;

  if (arg('test')) targets = index.filter((x) => TEST_SLUGS.includes(x.slug));
  else if (arg('limit')) targets = index.slice(0, Number(arg('limit')));

  console.log(`目标：${targets.length} 所（索引共 ${index.length} 所）\n`);

  const results = [];
  const failed = [];
  for (let i = 0; i < targets.length; i++) {
    const m = targets[i];
    const tag = `[${String(i + 1).padStart(3)}/${targets.length}]`;
    try {
      const html = await fetchOne(m.slug);
      const rec = parse(html, m);
      results.push(rec);
      const copStr = rec.cop
        ? 'COP ' + rec.cop.year + ' ' + (rec.cop.type || '?') + ' ' + [
            ...(rec.cop.type === 'IP' ? [['IP', rec.cop.ip.nonAffiliated]] : []),
            ...Object.entries(rec.cop.nonAffiliated || {}),
          ].filter(([, v]) => v).map(([k, v]) => `${k}:${v.min}-${v.max}${v.markMax ? "(" + v.markMax + ")" : ""}`).join(' ')
        : 'COP —';
      console.log(`${tag} ${m.name.slice(0, 38).padEnd(38)} CCA ${String(rec.cca.length).padStart(2)} | DSA ${String(rec.dsa ? rec.dsa.areas.length : 0).padStart(2)} | ${copStr}`);
    } catch (e) {
      failed.push({ slug: m.slug, err: e.message });
      console.log(`${tag} ✗ ${m.slug} — ${e.message}`);
    }
    if (i < targets.length - 1) await sleep(DELAY);
  }

  // 全量模式才覆盖；测试/限量模式写单独文件避免污染
  const full = !arg('test') && !arg('limit');
  const outFile = full ? OUT : path.join(ROOT, 'data/_sample.json');
  fs.writeFileSync(outFile, JSON.stringify(results, null, 1), 'utf8');

  console.log('\n=== 汇总 ===');
  console.log('成功:', results.length, '| 失败:', failed.length);
  console.log('有 COP:', results.filter((r) => r.cop).length);
  console.log('有 CCA:', results.filter((r) => r.cca.length).length);
  console.log('有 DSA:', results.filter((r) => r.dsa).length);
  console.log('有 Affiliated COP:', results.filter((r) => r.cop && Object.keys(r.cop.affiliated).length).length);
  console.log('有 Electives:', results.filter((r) => r.electives.length).length);
  console.log('写入:', outFile);
  if (failed.length) failed.forEach((f) => console.log('  ✗', f.slug, f.err));
})();
