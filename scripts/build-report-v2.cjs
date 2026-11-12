#!/usr/bin/env node
/**
 * PSLE 志愿规划报告 v2 —— 按 PG3 口径计算
 *
 * v1 的错误：取「所有 Posting Group 档里 max 最大的那个」作为门槛，
 *   实际取到了 PG1 行（PG1 区间 25–30，永远最大），把门槛系统性低估 8–10 分。
 *   正确做法：PG3 学生只竞争该校 PG3 档的名额，必须只看 PG3 行的区间。
 *
 * 本版还接入 MOE SchoolFinder 的「输入邮编 → 附近学校」官方口径。
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const Stu = require('../lib/student.cjs');
const STU = Stu.load();
const REC_FILE = path.join(BASE, `data/_recommend-${STU.id}.json`);
const R = JSON.parse(fs.readFileSync(
  fs.existsSync(REC_FILE) ? REC_FILE : path.join(BASE, 'data/_recommend.json'), 'utf8'));
const S2 = R.stats;                     // 全国口径统计，报告里所有「N 所」都从这里取

// MOE 邮编筛选结果按邮编天然区分学生；缺失时整节降级，不阻断出报告
const NEARBY_PATH = Stu.nearbyFile(STU);
const NEARBY = fs.existsSync(NEARBY_PATH)
  ? JSON.parse(fs.readFileSync(NEARBY_PATH, 'utf8'))
  : null;
// 单校深度报告索引（存在则在校卡片里加跳转入口）
const REPORT_IDX = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(BASE, 'docs/data/school-reports.json'), 'utf8')).reports || {};
  } catch (_) { return {}; }
})();
const byName = new Map(R.pool.map(x => [x.name, x]));
const byNameAll = new Map([...R.pool, ...R.singleSex, ...R.outOfReach].map(x => [x.name, x]));

const S = R.student;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ── 主选 6 所（方案 A） ─────────────────────────────────── */
const PICK = [
  {
    name: 'Compassvale Secondary School', slot: 1, tier: '冲刺',
    why: `全部 ${S2.withinCommuteReachable} 所可及学校里，ALP 与 Computing 最对口的一所——「Aeronautics, Coding, Engineering and Sustainability (ACES)」，Coding 直接写在项目名称里。22 分钟通勤、最近站步行 693m，也是最短档。`,
    caveat: '余量只有 1 分（PG3 14–18，你 17 分），是本次推荐里最紧的一所。若今年报的人多导致下限上移，有落空风险——但它在第 1 志愿，落空不影响后续。MOE 登记的 8 项里没有科技类社团，而且它官网的 CCA 页面是空的（抓过完整 HTML 确认不是渲染问题），真实社团数无法核实——所以编程兴趣主要还是靠 ALP 课程承接。',
  },
  {
    name: 'North Vista Secondary School', slot: 2, tier: '冲刺',
    why: '余量同样是 1 分，但学校侧重点不同：官网核实 CCA 共 18 项，其中 Infocomm Club 与 Service Learning Club 是科技/服务出口，社团数量在候选里排前列，25 分钟、步行 740m。LLP 是视觉艺术与设计，如果孩子转向设计方向有承接。',
    caveat: 'ALP 项目是「Farm-to-Table（农场到餐桌）」，虽归在 STEM - Cities and Urban Landscapes 类，实质是农业与食品，与 Computing 关系很弱。这是它与 Compassvale 最大的差别。',
  },
  {
    name: 'Punggol Secondary School', slot: 3, tier: '匹配',
    why: '余量 2 分，22 分钟到家门口。CCA 多达 12 项，其中「Shooting（射击）」在全岛中学里不常见。ALP 是环境可持续方向，LLP 是社区青年领袖。',
    caveat: 'ALP 的「Environmental Sustainability」与孩子的 Computing 兴趣基本不相干。最近站 841m，日常要走 10 分钟。',
  },
  {
    name: 'Seng Kang Secondary School', slot: 4, tier: '匹配',
    why: '余量 2 分，22 分钟、步行 658m（是几所里步行最短的）。ALP 是「Food for the Future」，LLP 是体育与户外教育。',
    caveat: 'ALP 偏食品科技，不是编程。官网核实 CCA 17 项（MOE 只登记 10 项），但确实没有 Infocomm；科技类只有 Art Club，且偏美术。',
  },
  {
    name: 'Hougang Secondary School', slot: 5, tier: '匹配',
    why: '余量 3 分，32 分钟。ALP 是「HS Innovates, For Life!」（STEM 综合创新），CCA 有 Infocomm Technology，是「余量稍大 + 有科技社团」这两个条件同时满足的少数几所。',
    caveat: '最近站步行 1349m，实际需要巴士接驳，32 分钟的估算偏乐观。官网核实 CCA 16 项（MOE 只登记 10 项）。',
  },
  {
    name: 'Bendemeer Secondary School', slot: 6, tier: '稳妥',
    why: `余量 5 分，是 ${S2.withinCommuteReachable} 所可及学校里余量最大的一档，录取安全边际最好。ALP 归在「Emerging Technologies（新兴科技）」类别，CCA 有 Infocomm Technology，34 分钟、步行 533m。`,
    caveat: '⚠️ 它不在 MOE 邮编筛选的 17 所「附近学校」列表里（属于扩展范围）。ALP 具体项目是「EcoGen 环保生态」，技术含量不如类别名称听起来硬。',
  },
];

/* ── 备选 ── */
const ALT = [
  {
    name: 'Serangoon Secondary School', tag: 'MOE 附近 + 余量 3 分 + ALP 是 ICT',
    note: 'ALP「Real-world Explorations in ICT」直接指向信息通信技术，32 分钟。但最近站步行 1198m 需接驳，CCA 8 项无 Infocomm。若你更看重 ALP 的科技属性，可以把它和 Hougang 互换位置。',
  },
  {
    name: 'Outram Secondary School', tag: '唯一「压线」的学校，24 分钟',
    note: 'PG3 只有 9–17，你的 17 分正好卡在上限，**没有任何余量**——这是真正意义上的「冲」。ALP 是商业与创业，与孩子兴趣不符，CCA 只有 6 项。放第 1 志愿可以，但要知道风险。',
  },
  {
    name: 'Montfort Secondary School', tag: '⚠️ 男校 · ALP 是「Design, Code, Make」',
    note: '如果孩子是男孩，这所应该进前 3：余量 5 分（最安全）、24 分钟、步行 548m、ALP 项目就叫「Made In Montfort – Design, Code, Make」，是全部候选里编程匹配度最高的之一。**它是男校，女孩不可报**——你的资料里性别保密，所以单独列在这里，请按实际性别决定是否启用。',
  },
  {
    name: 'Serangoon Garden Secondary School', tag: 'MOE 附近唯一余量 5 分的混校，但通勤被低估',
    note: '44 分钟、步行 1991m，模型没算巴士接驳，实际单程很可能超过 45 分钟。ALP 是人文媒体素养，与 STEM 兴趣不符。列出来是为了说明：MOE 附近 8 所混校里余量最大的就是它，但代价太大。',
  },
];

/* STEP 4c：PG3 上限低于 17 分的三所，兴趣匹配极高但不可报 */
const UNREACHABLE = [
  {
    name: 'Greendale Secondary School',
    tag: '差 1 分 · Robotics 技术最深 + 戏剧社连续三届 SYF',
    note: 'Robotics Club 是全部候选里技术描述最深的一个：<b>4 年进阶课程，SolidWorks／Fusion 360 建模 → 3D 打印与激光切割 → Arduino 与 AI → 手机 App 控制</b>。戏剧社 <b>Theatricks!</b> 教灯光、音效与舞台调度，<b>2021／2023／2025 连续三届</b> SYF 获认可。ODAC 还拿过 2025 年 NORS 定向越野 B 组男子冠军。',
    gap: '<b>为什么它值得赌一次：</b>PG3 上限 16，你 17 分<b>只差 1 分</b>。COP 年际浮动通常 1–2 分，若今年报考降温或整体分数偏低，上限有上移到 17 的可能。<b>放第 1 志愿，落空不影响后续志愿。</b>',
  },
  {
    name: 'Yusof Ishak Secondary School',
    tag: '差 2 分 · STEM 战绩最密集 + Robotics 写明 Python 与无人机',
    note: '2024 年拿了 <b>IDE 机器人全国第 1 与第 2 名</b>、<b>Drone Odyssey 最佳策略 + 最佳知识</b>、氢能赛车全国前五、World Robot Olympiad 参赛。社团分两条线：<b>Robotics Club（机器人 + 无人机 + Python）</b>与<b>Infocomm Club（AI + AR + 视频新闻）</b>。它是全岛唯一以总统命名的学校。',
    gap: '<b>差距评估：</b>PG3 上限 15，差 2 分。浮动覆盖 2 分的可能性较小——<b>不建议占用志愿位置</b>，但如果你判断今年报考会明显降温，可以把它作为第 1 志愿的备选思路。',
  },
  {
    name: 'Edgefield Secondary School',
    tag: '差 3 分 · 通勤 17 分钟最快 · ALP 是整套未来情景模拟',
    note: 'ALP 的第一个情景就是<b>「用编程部署无人机，在 8 分钟内搜完 8,000 平方米找地震受困者」</b>，另有都市农业、漂浮城市、FPSP 国际赛。学生自己办 <b>ARTasFEST——一场 5,000 人的嘉年华</b>。注意：<b>中一中二跆拳道全员必修，每周 1 小时</b>。',
    gap: '<b>差距评估：</b>PG3 上限 14，差 3 分——<b>基本没有可能</b>。它的通勤 17 分钟是十三所里最快的，但这一点无法弥补 3 分的差距。列出来主要是作为参照：知道 14 分能买到什么，才知道 17 分买到的值不值。',
  },
];

const PLANS = {
  A: {
    title: '方案 A · 平衡型', desc: '前 5 所全在 MOE「附近学校」列表内且 ≤32 分钟，第 6 所出圈换余量',
    list: ['Compassvale Secondary School', 'North Vista Secondary School', 'Punggol Secondary School',
      'Seng Kang Secondary School', 'Hougang Secondary School', 'Bendemeer Secondary School'],
  },
  B: {
    title: '方案 B · 进取型', desc: '愿意承担压线风险，优先 ALP 科技属性最强的那几所',
    list: ['Outram Secondary School', 'Compassvale Secondary School', 'North Vista Secondary School',
      'Serangoon Secondary School', 'Hougang Secondary School', 'Bendemeer Secondary School'],
  },
  C: {
    title: '方案 C · 稳健型', desc: '按余量从大到小排，录取确定性最高，但兴趣匹配要打折扣',
    list: ['Bendemeer Secondary School', 'Serangoon Garden Secondary School', 'Hougang Secondary School',
      'Serangoon Secondary School', 'Punggol Secondary School', 'Seng Kang Secondary School'],
  },
};

/* ── 渲染工具 ─────────────────────────────────────────── */
const fmtCop = x => x.cop ? `${x.cop.min}–${x.cop.max}` : '—';
const walkTag = m => m == null ? '' : m > 1200 ? `<span class="warn">步行 ${m}m·需巴士</span>`
  : m > 800 ? `<span class="soft">步行 ${m}m</span>` : `<span class="ok">步行 ${m}m</span>`;

const ccaMatchOf = x => (x.cca || []).filter(c =>
  /infocomm|comput|program|robotic|maker|science|swim|water polo|drama|theatre|cook|culinary|food|nutrition/i.test(c));

function card(x, opts = {}) {
  const m = ccaMatchOf(x);
  const rep = REPORT_IDX[x.slug];
  return `
  <article class="school">
    <header>
      <div class="sname">${esc(x.name)}</div>
      <div class="sbadges">
        ${opts.tier ? `<span class="tier t-${opts.tier === '冲刺' ? 'reach' : opts.tier === '匹配' ? 'match' : 'safe'}">${opts.tier}</span>` : ''}
        ${x.moeNearby ? '<span class="badge badge-moe">MOE 附近</span>' : '<span class="badge">扩展范围</span>'}
        <span class="badge">${esc(x.area || '')}</span>
      </div>
    </header>

    <div class="kv">
      <div><span class="k">PG3 非附属区间（2025）</span><span class="v">${fmtCop(x)}</span></div>
      <div><span class="k">你的余量</span><span class="v ${x.margin <= 1 ? 'tight' : ''}">${x.margin > 0 ? '+' : ''}${x.margin} 分</span></div>
      <div><span class="k">通勤估算</span><span class="v">${x.minutes} 分钟 ${walkTag(x.accessWalkM)}</span></div>
      <div><span class="k">途经</span><span class="v">${esc(x.via || '—')}</span></div>
    </div>

    ${opts.why ? `<p class="why"><b>为什么考虑它</b>${esc(opts.why)}</p>` : ''}
    <dl class="detail">
      <dt>ALP 应用学习项目</dt><dd>${x.alpCats.length ? `<b>${esc(x.alpCats.join('、'))}</b><br>${esc(x.alpItems.join('；') || '—')}` : '未在 SchoolFinder 列出'}</dd>
      <dt>LLP 生活教育项目</dt><dd>${x.llpCats.length ? `${esc(x.llpCats.join('、'))}<br><span class="soft">${esc((x.llpItems.join('；') || '').slice(0, 110))}</span>` : '未列出'}</dd>
      <dt>CCA（${(x.cca || []).length} 项）</dt><dd>${(x.cca || []).map(c => `<span class="chip">${esc(c.replace(/ \((Girls and Boys|Girls|Boys)\)$/, ''))}</span>`).join('')}</dd>
      <dt>与你兴趣重合</dt><dd>${m.length ? m.map(c => `<span class="chip hit">${esc(c.replace(/ \((Girls and Boys|Girls|Boys)\)$/, ''))}</span>`).join('') : '<span class="soft">无直接对应社团（见 Step 3 末尾关于 MOE 只列四类核心 CCA 的说明）</span>'}</dd>
      <dt>地址</dt><dd class="soft">${esc(x.address)}</dd>
    </dl>
    ${opts.caveat ? `<p class="caveat"><b>需要注意</b>${esc(opts.caveat)}</p>` : ''}
    ${rep ? `<a class="deeplink" href="${esc(rep.file)}"><span>阅读《${esc(x.name)}》单校深度报告</span><em>校史 · 升学 · CCA 解析 · 真实声音 · 开放日必问 →</em></a>` : ''}
  </article>`;
}

/* ── 统计 ─────────────────────────────────────────────── */
const tiers = { reach: 0, match: 0, safe: 0 };
R.pool.forEach(x => { if (x.margin >= 4) tiers.safe++; else if (x.margin >= 2) tiers.match++; else tiers.reach++; });

/* ── HTML ─────────────────────────────────────────────── */
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>PSLE 志愿规划 v2 · AL ${S.score} 分 · 6 个志愿排序</title>
<style>
:root{
  --bg:#fbfbf9; --card:#fff; --line:#e4e4e0; --line2:#efefec;
  --tx:#1a1a1a; --tx2:#555; --tx3:#8a8a8a;
  --accent:#0f5c4e; --accent-bg:#eef6f3;
  --warm:#8a5a00; --warm-bg:#fdf6e7;
  --risk:#8c2f2f; --risk-bg:#fbf0ef;
  --ok:#1f5c3a; --ok-bg:#eef7f1;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
  --font:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.75 var(--font);-webkit-font-smoothing:antialiased}
.wrap{max-width:960px;margin:0 auto;padding:0 22px}
a{color:var(--accent)}
.backlink{display:inline-flex;align-items:center;gap:5px;font-size:13px;color:rgba(238,246,243,.7);text-decoration:none;margin-bottom:14px}
.backlink:hover{color:#fff}
.hero{background:linear-gradient(160deg,#0f3d33,#124b3e 55%,#1a5c4c);color:#eef6f3;padding:40px 0 36px}
.hero .eyebrow{font-size:12.5px;letter-spacing:1.6px;text-transform:uppercase;opacity:.72}
.hero h1{margin:10px 0 6px;font-size:26px;font-weight:650;letter-spacing:-.4px;line-height:1.35}
.hero .sub{opacity:.82;font-size:14px;max-width:660px}
.profile{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1px;background:rgba(255,255,255,.14);margin-top:24px;border-radius:10px;overflow:hidden}
.profile div{background:rgba(255,255,255,.05);padding:12px 15px}
.profile .k{font-size:11.5px;opacity:.68;letter-spacing:.4px}
.profile .v{font-size:15px;font-weight:600;margin-top:3px}

section{margin:0 0 38px}
h2{font-size:18px;font-weight:640;margin:42px 0 6px;letter-spacing:-.2px;display:flex;align-items:baseline;gap:10px}
h2 .n{font-size:12px;font-weight:600;color:#fff;background:var(--accent);border-radius:5px;padding:2px 7px;letter-spacing:.6px}
h2+.lead{color:var(--tx2);font-size:14px;margin:0 0 16px}
h3{font-size:15.5px;font-weight:620;margin:26px 0 8px}
h4{font-size:14px;font-weight:620;margin:18px 0 6px;color:var(--tx2)}
p{margin:11px 0}

.fixbox{background:var(--risk-bg);border:1px solid #efd6d4;border-left:4px solid var(--risk);border-radius:0 10px 10px 0;padding:18px 20px;margin:26px 0}
.fixbox h3{margin:0 0 8px;font-size:15.5px;color:var(--risk)}
.fixbox p{margin:8px 0;font-size:14.3px}

.verdict{background:var(--accent-bg);border:1px solid #cfe4dc;border-left:4px solid var(--accent);border-radius:0 10px 10px 0;padding:18px 20px;margin:26px 0}
.verdict h3{margin:0 0 8px;font-size:15.5px;color:var(--accent)}
.verdict p{margin:8px 0;font-size:14.3px}
.verdict ul{margin:8px 0 0;padding-left:20px;font-size:14.3px}
.verdict li{margin:5px 0}

table{width:100%;border-collapse:collapse;font-size:13.4px;margin:14px 0}
th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line2);vertical-align:top}
th{font-size:12px;font-weight:600;color:var(--tx3);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--line);white-space:nowrap}
td.num{font-family:var(--mono);font-variant-numeric:tabular-nums;white-space:nowrap}
td.soft,.soft{color:var(--tx3)}
tbody tr:hover{background:#f6f6f3}
.tight{color:var(--warm)}

.school{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 19px;margin:16px 0}
.school header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.sname{font-size:16px;font-weight:640;letter-spacing:-.2px;line-height:1.35}
.sbadges{display:flex;gap:6px;flex-wrap:wrap}
.badge{font-size:11px;padding:2px 8px;border-radius:5px;background:#f1f1ee;color:var(--tx2);border:1px solid var(--line)}
.badge-moe{background:var(--accent-bg);color:var(--accent);border-color:#cfe4dc;font-weight:600}
.badge-over{background:var(--risk-bg);color:var(--risk);border-color:#e6c9c6;font-weight:600}
.gap-line{font-size:13px;color:var(--tx2);margin:10px 0 0;padding-left:12px;border-left:2px solid var(--risk);line-height:1.7}
.tier{font-size:11px;padding:2px 8px;border-radius:5px;font-weight:600}
.t-reach{background:var(--warm-bg);color:var(--warm);border:1px solid #ecd9b0}
.t-match{background:var(--accent-bg);color:var(--accent);border:1px solid #cfe4dc}
.t-safe{background:var(--ok-bg);color:var(--ok);border:1px solid #cfe6d8}

.kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1px;background:var(--line2);border:1px solid var(--line2);border-radius:8px;overflow:hidden;margin-bottom:13px}
.kv div{background:var(--card);padding:9px 12px}
.kv .k{display:block;font-size:11px;color:var(--tx3);letter-spacing:.3px}
.kv .v{display:block;font-size:14px;font-weight:600;margin-top:2px;font-variant-numeric:tabular-nums}

.why,.caveat{font-size:13.7px;margin:10px 0;padding:10px 13px;border-radius:8px}
/* 只有段落首个 <b> 当小标题用；正文内的 <b> 保持内联加粗，
   否则每个加粗词都会变成独立的大写块（曾导致 STEP 4c 排版炸裂） */
.why>b:first-child,.caveat>b:first-child{display:block;font-size:11.5px;letter-spacing:.5px;text-transform:uppercase;margin-bottom:4px}
.why b,.caveat b{font-weight:600}
.why{background:var(--accent-bg);color:#1c4a3f}
.why b{color:var(--accent)}
.caveat{background:var(--warm-bg);color:#6b4a0e}
.deeplink{display:block;margin:14px 0 2px;padding:11px 15px;background:var(--accent-bg);border:1px solid #cfe4dc;border-radius:9px;text-decoration:none;transition:background .15s,border-color .15s}
.deeplink span{display:block;font-size:13.6px;font-weight:600;color:var(--accent)}
.deeplink em{display:block;font-style:normal;font-size:11.6px;color:#5c7a71;margin-top:3px}
.deeplink:hover{background:#e2f0ea;border-color:#a9cfc2}
.caveat b{color:var(--warm)}

dl.detail{margin:12px 0 0;font-size:13.2px}
dl.detail dt{font-size:11.5px;color:var(--tx3);letter-spacing:.4px;margin-top:11px;text-transform:uppercase}
dl.detail dd{margin:3px 0 0;color:var(--tx2)}
.chip{display:inline-block;font-size:11.5px;padding:2px 8px;border-radius:5px;background:#f4f4f1;border:1px solid var(--line2);color:var(--tx2);margin:2px 3px 2px 0}
.chip.hit{background:var(--accent-bg);border-color:#cfe4dc;color:var(--accent);font-weight:500}

.ok{color:var(--ok);font-size:12px}
.warn{color:var(--warm);font-size:12px;font-weight:500}

.plans{display:grid;gap:14px;margin:18px 0}
.plan{background:var(--card);border:1px solid var(--line);border-radius:11px;padding:16px 18px}
.plan.rec{border-color:#bfd9d0;box-shadow:0 0 0 3px var(--accent-bg)}
.plan h3{margin:0 0 3px;font-size:15px;display:flex;align-items:center;gap:8px}
.plan .pdesc{font-size:12.8px;color:var(--tx3);margin:0 0 11px}
.plan ol{margin:0;padding-left:22px;font-size:13.7px}
.plan li{margin:5px 0}
.pill{font-size:10.5px;padding:2px 7px;border-radius:4px;background:var(--accent);color:#fff;font-weight:600}

.note{background:#f7f7f4;border:1px solid var(--line);border-radius:9px;padding:14px 16px;font-size:13.4px;color:var(--tx2);margin:16px 0}
.note b{color:var(--tx)}
.foot{border-top:1px solid var(--line);margin-top:48px;padding:22px 0 50px;font-size:12.3px;color:var(--tx3);line-height:1.85}
.foot code{font-family:var(--mono);font-size:11.4px;background:#f0f0ec;padding:1px 5px;border-radius:3px}
@media print{.hero{background:#124b3e!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.school,.plan,.note{break-inside:avoid}}
@media(max-width:600px){.hero h1{font-size:21px}.kv{grid-template-columns:1fr 1fr}table{font-size:12.4px}th,td{padding:7px 6px}}
</style>
</head>
<body>

<div class="hero">
  <div class="wrap">
    <a class="backlink" href="../index.html">← 返回学校看板</a>
    <div class="eyebrow">2026 S1 Posting · 志愿规划 v2 · ${esc(S.label || STU.id)}</div>
    <h1>AL ${S.score} 分，6 个志愿怎么排</h1>
    <div class="sub">用 <b>${S.pgLabel} 档</b>的正确口径重算${NEARBY ? `，并以 MOE SchoolFinder 输入邮编 ${esc(S.postal)} 的「附近学校」列表为候选池` : `。本邮编未做 MOE SchoolFinder 筛选，候选池为全岛自算通勤（${S.maxCommute} 分钟上限）`}。</div>
    ${STU.id !== 'abc1' ? `<div class="note" style="margin-top:14px">
      <b>关于本报告</b>　数据层（候选池、漏斗统计、五维评分、录取口径）已按 <b>${esc(S.label || STU.id)}</b> 的配置完全重算。
      但 STEP 4–5 的志愿排序与方案对比属于人工分析，撰写时依据的是 abc1 的画像，<b>没有随配置自动改写</b>——请以数据层为准，排序结论需重新评估。
    </div>` : ''}
    <div class="profile">
      <div><div class="k">PSLE 总分</div><div class="v">AL ${S.score}</div></div>
      <div><div class="k">Posting Group</div><div class="v">${S.pgShort}</div></div>
      <div><div class="k">适用 COP 档</div><div class="v">${S.pgShort} 行</div></div>
      ${NEARBY
        ? `<div><div class="k">MOE 附近学校</div><div class="v">${S2.nearbyCount} 所</div></div>`
        : `<div><div class="k">通勤上限</div><div class="v">${S.maxCommute} 分钟</div></div>`}
      <div><div class="k">够得着</div><div class="v">${R.pool.length + R.singleSex.length} 所</div></div>
    </div>
  </div>
</div>

<div class="wrap">

<div class="note">
<b>数据口径</b>　所有 COP 数字取自各校 <b>${S.pgLabel} 行的非附属区间</b>。AL ${S.score} 属 ${S.pgShort}，只与同档学生竞争同一批名额，其他档位的区间不适用。
</div>

<div class="verdict">
  <h3>三个关键结论</h3>
  <ul>
    <li><b>AL ${S.score} 不是「很安全」，而是「刚好够得着」。</b>全国 ${S2.withStudentPG} 所有 ${S.pgShort} 档的学校里，够得着的只有 ${S2.reachableNationwide} 所${NEARBY ? `；在 MOE 邮编筛出的 ${S2.nearbyCount} 所附近学校中，只有 <b>${S2.nearbyReachable} 所</b>（${S2.nearbyReachableMixed} 混校 + ${S2.nearbyReachableSingle} ${S2.nearbySingleSexType === 'girls' ? '女' : '男'}校）` : ''}。</li>
    <li><b>没有真正的「稳妥」档。</b>MOE 附近余量最大的混校是 Serangoon Garden（+5），但它 44 分钟 + 步行 1991m，实际通勤很可能超 45 分钟。要真保底，只能接受 1 所「不在 MOE 附近列表、但通勤可接受」的学校。</li>
    <li><b>兴趣与门槛在这个分数段是冲突的。</b>ALP 与 Computing 最对口的 Compassvale 余量只有 1 分；余量 5 分的那几所，ALP 多是环保/食品/人文方向。</li>
  </ul>
</div>

<section>
<h2><span class="n">STEP 1</span>录取规则：PG 与 COP 的对应关系</h2>
<p class="lead">这一节是整份报告的地基。</p>

<h3>你的孩子是 PG3，只能看 PG3 那一行</h3>
<p>MOE SchoolFinder 每所学校的「PSLE score range」表都是按 <b>Posting Group 分行</b>的，每行有「附属 / 非附属」两列。以 Punggol Secondary 为例：</p>
<table>
<thead><tr><th>该校 2025 年实际录取区间</th><th>附属</th><th><b>非附属</b></th><th>你该看哪一行</th></tr></thead>
<tbody>
<tr><td>Posting Group 3</td><td class="num">—</td><td class="num"><b>13 – 19</b></td><td><b>✅ 看这一行</b>（AL ${S.score} 在 4–20，属 PG3）</td></tr>
<tr><td>Posting Group 2</td><td class="num">—</td><td class="num">21 – 24</td><td>❌ 不适用</td></tr>
<tr><td>Posting Group 1</td><td class="num">—</td><td class="num">25 – 27</td><td>❌ 不适用</td></tr>
</tbody>
</table>
<p><b>为什么不能混着看</b>：PG 决定你的孩子进入哪一档名额池。PG3 学生与 PG3 学生竞争，不与 PG1 学生抢同一批座位。所以判断「够不够得着」，只能用 PG3 行。</p>
<p><b>余量怎么算</b>：余量 = PG3 区间右端（最低录取分）− 你的分数。<br>
Punggol：19 − 17 = <b>+2</b>。Compassvale：18 − 17 = <b>+1</b>。Outram：17 − 17 = <b>0（压线）</b>。</p>

<h3>录取顺序与 tie-breaker</h3>
<table>
<thead><tr><th>顺位</th><th>判定依据</th><th>说明</th></tr></thead>
<tbody>
<tr><td class="num">1</td><td><b>PSLE 分数</b></td><td>分数更优者优先，逐个处理</td></tr>
<tr><td class="num">2</td><td><b>公民身份</b></td><td>新加坡公民 → 永久居民 → 国际学生</td></tr>
<tr><td class="num">3</td><td><b>志愿顺序</b></td><td>把该校排第 2 的，优先于排第 4 的</td></tr>
<tr><td class="num">4</td><td><b>电脑抽签</b></td><td>纯随机</td></tr>
</tbody>
</table>
<div class="note">
<b>两点澄清：</b><br>
① 高级华文<b>不是</b>通用 tie-breaker（旧攻略常见错误）。它只在 SAP 学校、且 PSLE ≤14 时才产生同分优先——你 ${S.score} 分用不上。<br>
② <b>志愿顺序是你唯一能主动掌控的杠杆。</b>分数改不了，但同分时排第 2 优先于排第 4，这是实打实的。
</div>
</section>

<section>
<h2><span class="n">STEP 2</span>候选池：先用 MOE 邮编筛选，再算分数</h2>
${NEARBY ? `<p class="lead">按你的要求，先以 MOE SchoolFinder 输入邮编 ${esc(S.postal)} 的结果为池子。</p>

<p>SchoolFinder 的邮编筛选是前端交互（URL 参数无效），我在浏览器里操作「Enter your postal code」输入框触发的，返回 <b>${S2.nearbyCount} 所</b>附近中学：</p>
<p style="font-size:13px;color:var(--tx2);line-height:2">
${NEARBY.schools.map(n => esc(n.replace(/ Secondary School| \(Secondary\)/, ''))).join(' · ')}
</p>

<h3>这 ${S2.nearbyCount} 所里，分数够得着几所？</h3>
<table>
<thead><tr><th>筛法</th><th>剩余</th><th>说明</th></tr></thead>
<tbody>
<tr><td>MOE 邮编 ${esc(S.postal)} 筛选</td><td class="num">${S2.nearbyCount}</td><td>官方「附近学校」口径</td></tr>
<tr><td>其中 ${S.pgShort} 够得着（区间右端 ≥ ${S.score}）</td><td class="num"><b>${S2.nearbyReachable}</b></td><td>${S2.nearbyReachableMixed} 所混校 + ${S2.nearbyReachableSingle} 所${S2.nearbySingleSexType === 'girls' ? '女' : '男'}校（${esc(S2.nearbySingleSexName || '—')}）</td></tr>
<tr><td>其中 ${S.pgShort} 够不着</td><td class="num">${S2.nearbyOutOfReachNames.length}</td><td>${S2.nearbyOutOfReachNames.map(esc).join('、')}</td></tr>
</tbody>
</table>

<h4>够不着的 ${S2.nearbyOutOfReachNames.length} 所，差多少</h4>
<table>
<thead><tr><th>学校</th><th>${S.pgShort} 区间</th><th>与你相差</th><th>通勤</th></tr></thead>
<tbody>
${R.outOfReach.filter(x => NEARBY.schools.includes(x.name)).sort((a, b) => b.margin - a.margin)
  .map(x => `<tr><td>${esc(x.name.replace(/ Secondary School| \(Secondary\)/, ''))}</td><td class="num">${fmtCop(x)}</td><td class="num">${x.margin} 分</td><td class="num">${x.minutes} 分钟</td></tr>`).join('')}
</tbody>
</table>` : `<p class="lead">这个邮编还没有跑过 MOE SchoolFinder 的「附近学校」筛选，所以候选池直接按通勤上限在全岛计算，没有「官方附近」这一层。</p>
<p class="soft">要补上这一层：运行 <code>scripts/sf-filter.cjs</code>（会在浏览器里操作 SchoolFinder），生成 <code>data/moe-nearby-${S.postal}.json</code> 后重跑本脚本即可，报告会自动切换成「先附近、再扩展」的结构。</p>`}

<h3>为什么要用「扩展范围」补充</h3>
<p>MOE 的邮编筛选给的是「附近」，但「附近」不等于「${S2.withinCommute > 0 ? S.maxCommute : S.maxCommute} 分钟内」。通勤完全可接受、却不在那 ${S2.nearbyCount} 所里，这种情况很常见。</p>
<p>所以我按你原本的 ${S.maxCommute} 分钟上限，另算了一遍全岛：<b>${S.maxCommute} 分钟内可达 ${S2.withinCommute} 所</b>，其中 ${S.pgShort} 够得着 <b>${S2.withinCommuteReachable} 所</b>（${S2.poolMixed} 所混校 + ${S2.poolSingleSex} 所单性别校）。这 ${S2.withinCommuteReachable} 所里，${S2.nearbyReachable} 所在 MOE 附近列表内，${S2.withinCommuteReachable - S2.nearbyReachable} 所在列表外。</p>

<table>
<thead><tr><th>层级</th><th>数量</th></tr></thead>
<tbody>
<tr><td>全岛中学</td><td class="num">${S2.totalSchools}</td></tr>
<tr><td>有 ${S.pgShort} 招生档</td><td class="num">${S2.withStudentPG}</td></tr>
<tr><td>全国范围内分数够得着</td><td class="num">${S2.reachableNationwide}</td></tr>
<tr><td>其中 ${S.maxCommute} 分钟通勤可达</td><td class="num"><b>${S2.withinCommuteReachable}</b>（${S2.poolMixed} 混校 + ${S2.poolSingleSex} 单性别）</td></tr>
${NEARBY ? `<tr><td>其中同时在 MOE 邮编「附近」列表内</td><td class="num"><b>${S2.nearbyReachable}</b>（${S2.nearbyReachableMixed} 混校 + ${S2.nearbyReachableSingle} 单性别）</td></tr>` : ''}
</tbody>
</table>
</section>

<section>
<h2><span class="n">STEP 3</span>19 所可及混校的 PG3 区间与余量</h2>
<p class="lead">★ = 同时在 MOE 邮编 ${esc(S.postal)} 的「附近学校」列表内。下表为 19 所混校；另有 1 所男校 Montfort 见脚注。</p>
<div style="overflow-x:auto">
<table>
<thead><tr><th>通勤</th><th>学校</th><th>PG3 非附属</th><th>余量</th><th>性别</th><th>ALP 方向</th><th>MOE 附近</th></tr></thead>
<tbody>
${R.pool.map(x => {
  const gd = x.nature === 'Boys School' ? '男' : x.nature === 'Girls School' ? '女' : '混';
  return `<tr>
    <td class="num">${x.minutes} 分钟</td>
    <td><b>${esc(x.name.replace(/ Secondary School| \(Secondary\)/, ''))}</b></td>
    <td class="num">${fmtCop(x)}</td>
    <td class="num ${x.margin <= 1 ? 'tight' : ''}"><b>${x.margin > 0 ? '+' : ''}${x.margin}</b></td>
    <td>${gd}</td>
    <td style="font-size:12.4px">${esc((x.alpCats[0] || '—').replace('STEM - ', ''))}</td>
    <td>${x.moeNearby ? '★' : '<span class="soft">—</span>'}</td>
  </tr>`;
}).join('')}
</tbody>
</table>
</div>
<p class="soft">另：Montfort Secondary（男校）24 分钟、PG3 14–22、余量 +5，也在 MOE 附近列表内。若孩子是男孩，它的位置见 Step 4b。</p>

<div class="note">
<b>关于 CCA 匹配度的说明仍然成立：</b>MOE SchoolFinder 只列四类核心 CCA（体育、表演艺术、制服团体、Infocomm 技术）。全岛 147 所中学里，含 "Robotics" 的 <b>0 所</b>、含 "Cooking" 的 <b>0 所</b>、含 "Drama" 的 10 所（全是 RGS/RI/Hwa Chong 这类够不着的）。所以孩子列的兴趣里，只有「Computing 类」能通过 <b>Infocomm Technology</b> 这个 CCA 对上，其余只能靠 ALP 项目承接。
</div>
</section>

<section>
<h2><span class="n">STEP 4</span>逐校分析：6 个主选</h2>
<p class="lead">顺序即推荐志愿顺序。</p>
${PICK.map(p => {
  const x = byName.get(p.name);
  return x ? card(x, p) : `<p class="soft">（${esc(p.name)} 数据缺失）</p>`;
}).join('')}
</section>

<section>
<h2><span class="n">STEP 4b</span>另外 4 所值得知道</h2>
<p class="lead">各有明显理由，也各有明显代价。</p>
${ALT.map(a => {
  const x = byNameAll.get(a.name);
  if (!x) return '';
  const gd = x.nature === 'Boys School' ? ' · 男校' : x.nature === 'Girls School' ? ' · 女校' : '';
  return `<div class="school">
    <header><div class="sname">${esc(x.name)}</div>
      <div class="sbadges">
        <span class="badge">${esc(x.area || '')}${gd}</span>
        <span class="badge">PG3 ${fmtCop(x)}</span>
        <span class="badge">余量 ${x.margin > 0 ? '+' : ''}${x.margin}</span>
        <span class="badge">${x.minutes} 分钟</span>
        ${x.moeNearby ? '<span class="badge badge-moe">MOE 附近</span>' : ''}
      </div></header>
    <p class="why"><b>${esc(a.tag)}</b>${a.note.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</p>
    ${REPORT_IDX[x.slug] ? `<a class="deeplink" href="${esc(REPORT_IDX[x.slug].file)}"><span>阅读《${esc(x.name)}》单校深度报告</span><em>校史 · 升学 · CCA 解析 · 真实声音 · 开放日必问 →</em></a>` : ''}
  </div>`;
}).join('')}
</section>

<section>
<h2><span class="n">STEP 4c</span>够不着的三所（供参照）</h2>
<p class="lead">这三所的 PG3 上限都在你之上，<b>不能填进志愿</b>。但它们值得知道——因为它们的兴趣匹配度是全部候选里最高的一批，正好用来回答一个问题：<b>17 分买不到的东西，长什么样。</b></p>

<div class="warnbox">
<b>三所都超出录取范围，但差得不一样。</b>
<span style="display:block;margin-top:6px">
· <b>Greendale</b>：差 <b>1 分</b>——COP 年际浮动通常 1–2 分，理论上存在上移可能，<b>可作为第 1 志愿尝试</b>（落空不影响后续）<br>
· <b>Yusof Ishak</b>：差 2 分——浮动覆盖的可能性较小<br>
· <b>Edgefield</b>：差 3 分——基本没有可能
</span>
</div>

${UNREACHABLE.map(u => {
  const x = byNameAll.get(u.name);
  if (!x) return '';
  const rep = REPORT_IDX[x.slug];
  return `<article class="school">
    <header>
      <div class="sname">${esc(x.name)}</div>
      <div class="sbadges">
        <span class="badge badge-over">PG3 上限 ${x.cop.max} · 超出 ${Math.abs(x.margin)} 分</span>
        <span class="badge">PG3 ${fmtCop(x)}</span>
        <span class="badge">${x.minutes} 分钟</span>
        <span class="badge">${esc(x.area || '')}</span>
      </div>
    </header>
    <p class="why"><b>${esc(u.tag)}</b>${u.note}</p>
    <p class="gap-line">${u.gap}</p>
    ${rep ? `<a class="deeplink" href="${esc(rep.file)}"><span>阅读《${esc(x.name)}》单校深度报告</span><em>校史 · 升学 · CCA 全解析 · 真实声音 · 开放日必问 →</em></a>` : ''}
  </article>`;
}).join('')}

<div class="note">
<b>把这三所和前面六所放在一起看，结论会清楚很多。</b>你 17 分能买到的学校（Compassvale、North Vista、Punggol、Seng Kang、Hougang、Bendemeer），<b>社团数量、科技资源、项目深度整体比这三所低一档</b>。这不是说前面六所不好——而是说明<b>分数在 15–17 这一档，边际收益特别陡</b>：差 1–2 分，可能就是「有 18 个社团」与「有 8 个社团」的差别。
<br><br>
所以如果你现在的排序里，<b>把「科技与编程」放在第一位</b>，那么 Greendale 值得占用第 1 志愿的位置赌一次；如果不是，就按 Step 5 的梯度设计走常规方案。
</div>
</section>

<section>
<h2><span class="n">STEP 5</span>梯度设计：为什么这题没有「稳妥」</h2>
<p class="lead">候选学校余量最大只有 5 分，分档标准按实际余量分布标定。</p>

<table>
<thead><tr><th>档位</th><th>本报告的定义</th><th>数量（19 所混校中）</th></tr></thead>
<tbody>
<tr><td><b>冲刺</b></td><td>余量 0–1 分。压线或勉强够到，年度波动就可能失手</td><td class="num">${tiers.reach} 所</td></tr>
<tr><td><b>匹配</b></td><td>余量 2–3 分。有一定缓冲，但仍不是保险</td><td class="num">${tiers.match} 所</td></tr>
<tr><td><b>稳妥</b></td><td>余量 4–5 分。是本分数段能拿到的最好安全边际</td><td class="num">${tiers.safe} 所</td></tr>
</tbody>
</table>

<p><b>为什么只留 1 个真正的保底位：</b>MOE 附近的 8 所混校里，余量最大的是 Serangoon Garden（+5），但 44 分钟 + 步行 1991m，实际通勤超 45 分钟。所以第 6 志愿放 Bendemeer（+5、34 分钟、步行 533m），它<b>不在 MOE 附近列表内</b>，是唯一的取舍点——我选择用「出圈」换一个真实的保底。</p>

<div class="note">
<b>志愿顺序的两个技术要点：</b><br>
① <b>志愿顺序就是偏好顺序，不存在「浪费第一志愿」。</b>系统按分数处理，被第 1 志愿录取后不再往下看。所以第 1 志愿应该是你真正最想去的——哪怕它也是稳进的。<br>
② <b>但不要把「肯定进」的堆在前面。</b>一旦被录取，后面全部作废。所以顺序要按真实偏好排，而真实偏好里必须包含「学校本身合不合适」。
</div>
</section>

<section>
<h2><span class="n">STEP 6</span>最终建议</h2>

<h3>完整对比表</h3>
<div style="overflow-x:auto">
<table>
<thead><tr>
<th>志愿</th><th>学校</th><th>PG3 区间</th><th>余量</th><th>风险</th><th>通勤</th><th>CCA 匹配</th><th>ALP</th><th>总分</th>
</tr></thead>
<tbody>
${PICK.map(p => {
  const x = byName.get(p.name);
  if (!x) return '';
  const m = ccaMatchOf(x);
  return `<tr>
    <td class="num"><b>${p.slot}</b></td>
    <td><b>${esc(x.name.replace(/ Secondary School/, ''))}</b>${x.moeNearby ? ' <span class="soft">★</span>' : ''}</td>
    <td class="num">${fmtCop(x)}</td>
    <td class="num ${x.margin <= 1 ? 'tight' : ''}">${x.margin > 0 ? '+' : ''}${x.margin}</td>
    <td><span class="tier t-${p.tier === '冲刺' ? 'reach' : p.tier === '匹配' ? 'match' : 'safe'}">${p.tier}</span></td>
    <td class="num">${x.minutes}min<span class="soft"> ${x.accessWalkM}m</span></td>
    <td>${m.length ? m.length + ' 项' : '<span class="soft">无</span>'}</td>
    <td class="num">${x.scores.academic}</td>
    <td class="num"><b>${x.total}</b></td>
  </tr>`;
}).join('')}
</tbody>
</table>
</div>

<h3>五维得分明细</h3>
<div style="overflow-x:auto">
<table>
<thead><tr><th>学校</th><th>安全性<br><span class="soft">×30%</span></th><th>通勤<br><span class="soft">×25%</span></th><th>学术<br><span class="soft">×15%</span></th><th>CCA<br><span class="soft">×15%</span></th><th>特色<br><span class="soft">×15%</span></th><th>合计</th></tr></thead>
<tbody>
${PICK.map(p => {
  const x = byName.get(p.name);
  if (!x) return '';
  const s = x.scores;
  return `<tr>
    <td>${esc(x.name.replace(/ Secondary School/, ''))}</td>
    <td class="num">${s.safety} <span class="soft">(${Math.round(s.safety * .30)})</span></td>
    <td class="num">${s.commute} <span class="soft">(${Math.round(s.commute * .25)})</span></td>
    <td class="num">${s.academic} <span class="soft">(${Math.round(s.academic * .15)})</span></td>
    <td class="num">${s.cca} <span class="soft">(${Math.round(s.cca * .15)})</span></td>
    <td class="num">${s.feature} <span class="soft">(${Math.round(s.feature * .15)})</span></td>
    <td class="num"><b>${x.total}</b></td>
  </tr>`;
}).join('')}
</tbody>
</table>
</div>
<p class="soft">安全性评分已按实际分布重标定：余量 0 分 → 40 分，1 分 → 50，2 分 → 58，3 分 → 66，4 分 → 74，5 分 → 82。旧的「6 分才起步」标定会让所有候选挤在最低档，失去区分度。</p>

<h3>三个方案</h3>
<div class="plans">
${['A', 'B', 'C'].map(k => {
  const pl = PLANS[k];
  return `<div class="plan ${k === 'A' ? 'rec' : ''}">
    <h3>${pl.title}${k === 'A' ? '<span class="pill">推荐</span>' : ''}</h3>
    <p class="pdesc">${pl.desc}</p>
    <ol>${pl.list.map(n => {
      const x = byNameAll.get(n);
      return x ? `<li><b>${esc(n.replace(/ Secondary School| \(Secondary\)/, ''))}</b> <span class="soft">· ${x.minutes} 分钟 · PG3 ${fmtCop(x)} · 余量 ${x.margin > 0 ? '+' : ''}${x.margin}${x.moeNearby ? ' · ★' : ''}</span></li>` : `<li>${esc(n)}</li>`;
    }).join('')}</ol>
  </div>`;
}).join('')}
</div>

<h3>如果这是我的孩子，我会这样提交</h3>
<div class="verdict">
<p><b>我会交方案 A，但如果孩子是男孩，我会把 Montfort 插到第 3 位。</b></p>
<p>理由：<b>在 AL ${S.score} 这个分数段，「余量」比「名校」值钱得多。</b>你的分数在 PG3 里属于中下段（PG3 覆盖 4–20，17 已经很靠近上限），所以能选的学校全部集中在余量 0–5 分之间。这种情况下把宝贵的志愿位置浪费在 +0 的压线学校上，风险收益并不划算。</p>
<p>方案 A 的结构是：<b>第 1–2 志愿交给「ALP 最对口」的两所</b>（Compassvale 的 ACES Coding、North Vista 的 Infocomm 社团），它们的余量都只有 1 分，本质上就是「冲」；<b>第 3–5 志愿放余量 2–3 分、通勤 22–32 分钟的学校</b>；<b>第 6 志愿 Bendemeer 余量 5 分兜底</b>。</p>
<p><b>关于 Montfort：</b>它的 ALP 项目叫「Made In Montfort – Design, Code, Make」，是全部候选中编程匹配度最高的之一，余量 5 分（最安全）、24 分钟、步行 548m。唯一的门槛是「男校」。你的资料里性别保密，所以我把它单列在 Step 4b——如果孩子是男孩，它比 North Vista 更值得放前面；如果是女孩，直接忽略。</p>
<p><b>我不会选的：</b>Outram。它是 19 所里唯一「压线」的（PG3 9–17，你正好 17），零余量；同时 ALP 是商业与创业、CCA 只有 6 项且无科技类社团，与孩子的兴趣方向完全不符。用零余量去换一个不匹配的学校，不值。</p>
<p><b>我也不选 Serangoon Garden：</b>虽然它是 MOE 附近余量最大的混校（+5），但 44 分钟 + 步行 1991m，模型没算巴士接驳，实际单程很可能超过 45 分钟。每天往返一个多小时，四年下来是真实的消耗。</p>
</div>

<h3>四条提醒</h3>
<div class="note">
<b>① 余量 1 分不是「稳进」。</b>COP 是上一年度的实际录取结果，年度之间会波动 1–2 分。余量 1 分意味着「今年如果报的人多一点，就可能进不去」。本报告把它标为「冲刺」而不是「匹配」，就是这个原因。<br><br>
<b>② 正式成绩公布后要重算。</b>现在是 11 月 8 日，官方 PSLE 放榜约 11 月 24–25 日。如果你手上是校内预估分，正式成绩出来后余量数字会变——逻辑不变，但每所学校的 +/- 要重算一遍。<br><br>
<b>③ 提交窗口只有 7 天。</b>成绩公布当天下午起开放 S1 Portal，最后一天 16:30 关闭。6 个志愿要提前定好顺序，别在系统里现想。<br><br>
<b>④ 去开放日。</b>本报告所有判断基于 MOE 公开数据：PG3 区间、ALP 名称、CCA 清单、通勤时间。但校风、老师风格、孩子走进校门时的直觉——这些数据里没有，而它们往往比 COP 更能决定这四年过得好不好。上面 6 所里至少看 2–3 所。
</div>
</section>

<div class="foot">
<div style="margin-bottom:14px;font-size:13.5px"><a href="../index.html">← 学校看板</a> ｜ <a href="../map.html">通勤地图</a></div>
<b>数据来源</b><br>
· 学校名单 / 类型 / CCA / ALP / LLP / DSA / COP：MOE SchoolFinder，采集于 2026-11；COP 为 <b>2025 年度</b>各 Posting Group 的实际录取区间<br>
${NEARBY ? `· <b>MOE 附近学校列表</b>：SchoolFinder 页面输入邮编 ${esc(S.postal)} 后前端筛选所得（${S2.nearbyCount} 所），采集时间 ${esc(String(NEARBY.collectedAt || '').slice(0, 10))}<br>` : `· <b>MOE 附近学校列表</b>：本邮编未采集（候选池为全岛自算通勤）<br>`}
· 录取规则 / Posting Group / tie-breaker / HCL 规则：MOE 官方 S1 Posting 与 PSLE 计分页面<br>
· 学校坐标：OneMap 地理编码｜MRT 网络：官方线路代号重建（151 站 / 6 线 + 樟宜支线）<br>
· 通勤时间：自建模型（步行 80m/min + 进站 4 分钟 + 站间 2 分钟 + 换乘 5 分钟），经 4 组 OD 对照校准，偏差 ≤2 分钟<br><br>
<b>口径说明</b><br>
· COP：各校 <b>PG3 行非附属区间</b>（2025 年度实际录取区间）<br>
· 候选池：MOE 邮编 ${esc(S.postal)} 筛选 + 45 分钟通勤双口径，逐所标注是否在 MOE 附近列表内<br>
· 安全性评分：按实际余量分布（0–5 分）标定<br><br>
<b>免责</b>：个人研究工具输出，非 MOE 官方建议。COP 仅供参考，不构成录取保证。通勤时间为模型估算，未含巴士接驳与等车波动。<br><br>
<span class="soft">生成于 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Singapore' })} SGT · 基于 AL ${S.score} / ${S.pgShort} / 邮编 ${esc(S.postal)} / 通勤上限 ${S.maxCommute} 分钟</span>
</div>

</div>
</body>
</html>`;

const out = path.join(BASE, 'docs/reports', STU.planSlug + '.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('▸ 输出', out);
console.log('  大小', Math.round(html.length / 1024) + 'KB');

/* 登记到学生索引，供看板导航读取。
   多学生共存时，看板按 activeId 决定「我的志愿方案」指向哪一份。 */
const IDX_FILE = path.join(BASE, 'docs/data/students-index.json');
let idx = { students: [] };
try { idx = JSON.parse(fs.readFileSync(IDX_FILE, 'utf8')); } catch (_) { /* 首次生成 */ }
// 只保留配置文件仍存在的学生 —— 索引是派生结果，删掉 students/<id>.json 就该消失
const alive = (idx.students || []).filter(x => fs.existsSync(path.join(Stu.DIR, x.id + '.json')));
const list = alive.filter(x => x.id !== STU.id);
list.push({
  id: STU.id,
  label: STU.label,
  al: STU.al,
  pgShort: S.pgShort,
  postal: STU.home.postal,
  maxCommuteMin: STU.maxCommuteMin,
  planSlug: STU.planSlug,
  updatedAt: new Date().toISOString(),
});
list.sort((a, b) => (a.id === Stu.DEFAULT_ID ? -1 : b.id === Stu.DEFAULT_ID ? 1 : a.id.localeCompare(b.id)));
fs.mkdirSync(path.dirname(IDX_FILE), { recursive: true });
fs.writeFileSync(IDX_FILE, JSON.stringify({
  generatedAt: new Date().toISOString(),
  defaultId: Stu.DEFAULT_ID,
  // activeId 不是「最后生成的那个」，而是显式指针：
  // 优先 data/students/active.json，其次默认学生。否则给另一个学生出报告
  // 会把看板入口悄悄抢走。
  activeId: (() => {
    try {
      const a = JSON.parse(fs.readFileSync(path.join(Stu.DIR, 'active.json'), 'utf8'));
      if (a.active && list.some(x => x.id === a.active)) return a.active;
    } catch (_) { /* 无指针 */ }
    return list.some(x => x.id === Stu.DEFAULT_ID) ? Stu.DEFAULT_ID : list[0].id;
  })(),
  students: list,
}, null, 1));
console.log('  索引：docs/data/students-index.json（%d 个学生，当前 %s）', list.length, STU.id);
