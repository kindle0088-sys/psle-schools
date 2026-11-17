#!/usr/bin/env node
/**
 * PSLE 志愿规划报告（通用版）—— 按学生画像出整份 6 志愿方案
 *
 * 与 build-report-v2.cjs 的区别：
 *   v2 是 AL 17 那一个案例的定制报告（校名、文案都写死）。
 *   本脚本把「选哪 6 所」交给数据 + 少量人工判断（REACH/MATCH/SAFE 三档），
 *   换学生只改 data/students/<id>.json，不动代码。
 *
 * 六步结构（对应用户要求的分析框架）：
 *   ① 录取规则（2026 S1 Posting）　② 候选池　③ COP 与录取风险
 *   ④ 逐校适配度　⑤ 梯度设计　⑥ 最终建议（评分表 + 三方案 + 家长视角）
 *
 * 用法
 *   node scripts/build-report-plan.cjs            # 用当前活跃学生
 *   STUDENT=abc2 node scripts/build-report-plan.cjs
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const P = (...a) => path.join(BASE, ...a);
const Stu = require('../lib/student.cjs');
const STU = Stu.load();
const PLAN_CSS = fs.readFileSync(P('scripts/tpl/tokens.css'), 'utf8') + fs.readFileSync(P('scripts/tpl/plan.css'), 'utf8');

const recFile = P(`data/_recommend-${STU.id}.json`);
if (!fs.existsSync(recFile)) {
  console.error(`✗ 缺 ${recFile}\n  先跑：STUDENT=${STU.id} node scripts/score-candidates.cjs`);
  process.exit(1);
}
const R = JSON.parse(fs.readFileSync(recFile, 'utf8'));
const SC = JSON.parse(fs.readFileSync(P('docs/data/schools.json'), 'utf8'));

/* MOE 的 * 标记：某档在 S1 posting 结束后仍有学额（官方脚注）。
   实测 139 所里只有 PG1 档出现，PG3 一所都没有 —— 这点必须讲清楚，
   否则「未招满」会被误读成「PG3 门槛会降」。 */
const starAll = SC.schools.filter(s => s.copFlags && s.copFlags.PG1);
const STAR_TOTAL = starAll.length;
const STAR_IN_POOL = R.pool.filter(x => x.copFlags && x.copFlags.PG1)
  .map(x => x.name.replace(/ Secondary School| \(Secondary\)/, ''));
const BY = new Map(SC.schools.map(s => [s.slug, s]));
const REPORTS = (() => {
  try { return JSON.parse(fs.readFileSync(P('docs/data/school-reports.json'), 'utf8')).reports || {}; }
  catch { return {}; }
})();

const S = R.student, S2 = R.stats;
/* 通勤口径来自数据文件，不由模板猜。
   fastest = 「步行 / 地铁取最快」（abc1、abc2）；walk = 「只认全程步行」（abc3）。
   这个字段决定的不是措辞，而是「候选池为什么是这个大小」——
   曾经模板里写死「步行 / 地铁取最快」，于是 walk 口径的配置会印出一份
   自相矛盾的报告：门槛说 40 分钟步行，表里全是地铁 33/34 分钟。 */
const MODE = S.commuteMode || S2.commuteMode || 'fastest';
const WALK_ONLY = MODE === 'walk';
const COMMUTE_SHORT = WALK_ONLY ? '全程步行' : '步行 / 地铁取最快';
const COMMUTE_RULE = WALK_ONLY
  ? '只认<b>全程步行</b>：地铁再快也不算达标；争议项按区间上端过闸'
  : '按「<b>步行 / 地铁取最快</b>」计算：只要有一种方式够快就算达标';
const LIMIT_LABEL = WALK_ONLY ? `全程步行 ≤ ${S.maxCommute} 分钟` : `${S.maxCommute} 分钟内`;

/* 配置里的文案可以写成函数，拿到 S / S2 / R，便于算「与某个对照版本相比」这类话。
   必须定义在第一个模板字符串之前 —— STEP2 的 intro 会用到它。 */
const cfgText = v => (typeof v === 'function' ? v({ S, S2, esc, STU, R }) : v);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = n => n.replace(/ Secondary School| \(Secondary\)/, '');
const fmtCop = x => (x.cop ? `${x.cop.min}–${x.cop.max}${x.cop.markMax ? '(' + x.cop.markMax + ')' : ''}` : '—');
const fmtM = v => (v == null ? '—' : String(v));

/** 通勤两列：步行来自 OSM 路网，地铁来自 MRT 模型。
 *  哪一列是「过闸口径」由 MODE 决定 —— walk 口径下加粗的永远是步行列。 */
const walkCol = x => {
  if (x.walkMinutes == null) return '—';
  if (x.walkRange) return `${x.walkRange[0]}–${x.walkRange[1]}<sup class="soft">争议</sup>`;
  // >60 分钟已不构成通勤选项，给精确值（如 140）反而误导
  if (x.walkMinutes > 60) return '&gt;60';
  return String(x.walkMinutes);
};
const mrtCol = x => (x.mrtMinutes == null ? '—' : String(x.mrtMinutes));
/* 「这一档是否参与门槛判定」：fastest 口径看谁更快，walk 口径恒为步行。 */
const countedByWalk = x => WALK_ONLY || x.commuteMode === 'walk';
const cellWalk = x => `<td class="num">${countedByWalk(x) ? '<b>' + walkCol(x) + '</b>' : walkCol(x)}</td>`;
const cellMrt = x => `<td class="num">${countedByWalk(x) ? mrtCol(x) : '<b>' + mrtCol(x) + '</b>'}</td>`;
/* 一句话通勤描述。walk 口径下必须说清「按哪一端过闸」，
   否则争议项写「步行 14–25 分」读者会以为门槛也按 14 分算。 */
const fastTxt = x => {
  if (WALK_ONLY) {
    if (x.walkMinutes == null) return '无步行数据';
    const hi = x.walkUpperMinutes != null ? x.walkUpperMinutes : x.walkMinutes;
    return x.walkRange
      ? `步行 ${x.walkRange[0]}–${x.walkRange[1]} 分<sup class="soft">争议·按 ${hi} 分过闸</sup>`
      : `步行 ${hi} 分`;
  }
  return countedByWalk(x)
    ? (x.walkRange
      ? `步行 ${x.walkRange[0]}–${x.walkRange[1]} 分<sup class="soft">争议</sup>`
      : `步行 ${x.minutes} 分`)
    : `地铁 ${x.minutes} 分`;
};
/* 该校在学生实际口径下「过闸用的分钟数」——报告里凡是要说「多少分钟」都该用它 */
const gateMin = x => (WALK_ONLY
  ? (x.walkUpperMinutes != null ? x.walkUpperMinutes : x.walkMinutes)
  : x.minutes);

/* ── 由数据现算的几句话 ────────────────────────────────────────
   下面这些句子以前是写死的（「45 分钟内能到的 4 所 SAP 校：Nan Chiau…」、
   「稳妥档通勤 33–44 分钟」）。同一份模板服务多个学生时，写死就等于
   换个人立刻印出错误事实。全部改成从 R 算。 */
const sapInRange = R.outOfReach.filter(x => (x.sap || x.ip) && x.cop);
const sapSpan = sapInRange.length
  ? [Math.min(...sapInRange.map(x => Math.abs(x.margin))), Math.max(...sapInRange.map(x => Math.abs(x.margin)))]
  : null;
const SAP_TXT = sapInRange.length
  ? `${LIMIT_LABEL} 能到的 ${sapInRange.length} 所 SAP / IP 校（${sapInRange.map(x => short(x.name) + ' ' + fmtCop(x)).join('、')}）<b>全部差 ${sapSpan[0]}${sapSpan[0] === sapSpan[1] ? '' : '–' + sapSpan[1]} 分</b>，不是「有风险」而是「基本没可能」`
  : `${LIMIT_LABEL}<b>一所 SAP / IP 校都够不着</b>`;

/* 主池里通勤最优 / 安全边际最大的两所 —— 判断段里用来做对比，不写校名 */
const fastestInPool = [...R.pool].sort((a, b) => gateMin(a) - gateMin(b))[0] || null;
const safestInPool = [...R.pool].sort((a, b) => b.margin - a.margin)[0] || null;
const poolGateRange = R.pool.length
  ? [Math.min(...R.pool.map(gateMin)), Math.max(...R.pool.map(gateMin))]
  : null;

/* 余量 vs 通勤的相关系数。
   旧模板写死「余量 7 分的学校通勤普遍 34–44 分钟……两者负相关」，
   这是 abc2 那 22 所的经验，套到 7 所上就是编的。改成真算一遍，
   再按符号给一句定性描述 —— 数据变了，话跟着变。 */
const COMMUTE_MARGIN_CORR = (() => {
  if (R.pool.length < 3) return null;
  const xs = R.pool.map(gateMin), ys = R.pool.map(x => x.margin);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  return (dx && dy) ? num / Math.sqrt(dx * dy) : null;
})();
const CORR_TXT = COMMUTE_MARGIN_CORR == null ? ''
  : COMMUTE_MARGIN_CORR > 0.35
    ? '<b>余量与通勤在池子里是正相关的</b>——通勤越长的那几所，安全边际反而越大；家门口的学校都被抢光了。'
    : COMMUTE_MARGIN_CORR < -0.35
      ? '<b>余量与通勤在池子里是负相关的</b>——通勤越短的那几所余量越大，这条街上「近」和「稳」是同一件事。'
      : '<b>余量与通勤在池子里没有明显关系</b>——不必用通勤长度去换安全边际，这两件事可以分开挑。';

/** 学校的完整 CCA 清单（官网核实 / MOE 登记）与各维度提取 */
function ccaOf(x) {
  const s = BY.get(x.slug);
  const cf = s && s.ccaFull;
  const list = cf ? Object.values(cf.categories).flat().map(i => i.name) : (x.cca || []);
  const clean = list.map(n => n.replace(/\s*\((Girls and Boys|Girls|Boys)\)$/, ''));
  return {
    total: cf ? cf.total : (x.cca || []).length,
    moe: (x.cca || []).length,
    source: cf ? cf.source : 'moe-only',
    gaps: cf ? cf.gaps : null,
    list: clean,
    note: cf ? cf.note : null,
  };
}
const has = (arr, re) => arr.filter(n => re.test(n));
const ALP_OF = x => (x.alpCats || []).join(' / ');
const LLP_OF = x => (x.llpCats || []).join(' / ');

/* ── 6 志愿设计：从 data/plans/<id>.js 读取 ────────────────────────
   判断（排哪 6 所、每所为什么、逐校适配）与渲染分离。
   第三、第四个孩子各需要一套不同判断，塞进生成器就会变成「改一个人、动全部」。
   规范见 data/plans/abc2.js 顶部注释；文案里的 {{score}} 会替换成孩子分数。 */
const planFile = P('data/plans', STU.id + '.js');
if (!fs.existsSync(planFile)) {
  console.error(`\n✗ 缺少 ${planFile}\n  每份志愿报告都需要自己的六志愿设计（PLANS + DETAIL），参考 data/plans/abc2.js。`);
  process.exit(1);
}
const fillScore = t => String(t == null ? '' : t).replace(/\{\{score\}\}/g, S.score);
const { PLANS, DETAIL: DETAIL_RAW } = require(planFile);
const DETAIL = Object.fromEntries(Object.entries(DETAIL_RAW).map(([k, v]) => [k,
  Object.fromEntries(Object.entries(v).map(([kk, vv]) => [kk, fillScore(vv)]))]));

const byName = new Map(R.pool.map(x => [x.name, x]));
const byNameAll = new Map([...R.pool, ...R.singleSex, ...R.outOfReach].map(x => [x.name, x]));

/* ── 渲染工具 ─────────────────────────────────────────────── */
const tierCls = t => (t === '冲刺' ? 'reach' : t === '匹配' ? 'match' : 'safe');
const riskOf = x => {
  if (x.margin == null) return { label: '未知', cls: 'soft', note: '无 COP 数据' };
  if (x.margin <= 1) return { label: '高', cls: 'warn', note: '踩线，COP 一动就落空' };
  if (x.margin <= 3) return { label: '中', cls: '', note: '有余量但不大' };
  if (x.margin <= 5) return { label: '较低', cls: 'ok', note: '相对从容' };
  return { label: '低', cls: 'ok', note: '明显优于往年 COP' };
};

const scoreRow = x => [['安全性', x.scores.safety, '30%'], ['通勤', x.scores.commute, '25%'], ['学术', x.scores.academic, '15%'], ['CCA', x.scores.cca, '15%'], ['特色', x.scores.feature, '15%']];
const totalOf = x => x.total;

/* ── 六步内容 ─────────────────────────────────────────────── */

const STEP1 = `
<section>
<h2 id="s1"><span class="n">01</span>录取规则：先把「怎么分」搞清楚</h2>
<p class="lead">这一节只讲事实（MOE 官方口径），判断放在每节末尾的灰框里。</p>

<h3>① 孩子的 Posting Group 是锁定的</h3>
<p>2026 年 PSLE 仍按 <b>AL 总分（4–30，越小越好）</b>划分三个 Posting Group。孩子 <b>AL ${S.score}</b> 落在 <b>4–20 区间 → Posting Group 3</b>，而且这是<b>唯一</b>可选的档位（只有当分数是 21/22 或 25 时才有两档可选）。</p>
<table>
<thead><tr><th>PSLE 总分</th><th>Posting Group</th><th>S1 开始时多数科目的层级</th><th>本案</th></tr></thead>
<tbody>
<tr><td class="num">4 – 20</td><td class="num">3</td><td>G3</td><td><b>✅ AL ${S.score} 在这里</b></td></tr>
<tr><td class="num">21 – 22</td><td class="num">2 或 3（自选）</td><td>G2 或 G3</td><td>—</td></tr>
<tr><td class="num">23 – 24</td><td class="num">2</td><td>G2</td><td>—</td></tr>
<tr><td class="num">25</td><td class="num">1 或 2（自选）</td><td>G1 或 G2</td><td>—</td></tr>
<tr><td class="num">26 – 30</td><td class="num">1</td><td>G1</td><td>—</td></tr>
</tbody>
</table>
<p><b>实务含义：</b>孩子只和<b>同样被分到 PG3</b> 的学生竞争同一批学额。所以查 COP 时只看各校的 <b>Posting Group 3 那一行</b>，PG2/PG1 的区间与他无关——这也是很多二手资料最容易搞错的地方（把三行混在一起看，会把门槛估低 8–10 分）。</p>

<h3>② 录取的排序逻辑：分数优先，志愿顺序只在同分时起作用</h3>
<p>MOE 的处理顺序是：<b>按 PSLE 分数从高到低</b>依次处理每个学生，每个学生投到他填的<b>第一个还有空位</b>的志愿。所以「志愿顺序」不是加分项，它只在两个学生<b>同分</b>抢最后一个位子时才成为 tie-breaker。</p>
<table>
<thead><tr><th style="width:12%">顺序</th><th style="width:30%">tie-breaker</th><th>含义与对本案例的影响</th></tr></thead>
<tbody>
<tr><td class="num">1</td><td>公民身份</td><td>新加坡公民 &gt; 永久居民 &gt; 国际学生。若孩子是公民，在同分段里排最前</td></tr>
<tr><td class="num">2</td><td><b>志愿顺序</b></td><td>同分 + 同身份时，把该校填得更靠前的学生优先。<b>这就是「最想去的必须往前放」的机制原因</b></td></tr>
<tr><td class="num">3</td><td>电脑抽签</td><td>只有分数、身份、志愿顺序都相同才抽签。MOE 口径：约每 10 名学生有 1 名会经历抽签</td></tr>
</tbody>
</table>

<h3>③ SAP 学校：孩子<b>用不上</b>那个优势（这条最容易误解）</h3>
<div class="warnbox">
<b>事实：</b>高级华文（HCL）的 posting advantage 有<b>两个前置条件同时成立</b>——① HCL 考到 Pass / Merit / Distinction；② <b>PSLE 总分 ≤ 14</b>。
孩子是 <b>AL ${S.score}</b>，比 14 高 1 分，<b>即使高华考了 Distinction 也拿不到这个优先权</b>，只能按普通 COP 竞争。
<br><br>
<b>判断：</b>所以「可以考虑 SAP 学校」这一条，在 ${S.score} 分这个位置实际上是不成立的。SAP 校的 COP 普遍在 4–12，本案例 ${SAP_TXT}。详见第三步。
</div>

<h3>④ 附属学校（affiliation）：本案例不适用</h3>
<p>孩子没有附属中学，所以：不会占用「附属优先」的学额池，也不需要把它填第一志愿来激活优先权。<b>反过来是好事</b>——每所学校每个 Posting Group 至少有 20% 学额是保留给非附属生的，孩子竞争的正是这部分。</p>

<h3>⑤ 时间线（2026 届）</h3>
<table>
<thead><tr><th style="width:26%">节点</th><th>时间</th></tr></thead>
<tbody>
<tr><td>PSLE 成绩公布</td><td>2026-11-24 或 11-25（暂定，11:00）—— 成绩单、S1 Option Form、Eligibility Letter 一起发</td></tr>
<tr><td>提交 6 个志愿</td><td>成绩日 11:30 起 <b>7 个日历日</b>内，通过 S1 Portal（Singpass）或回小学填；期内可随时修改</td></tr>
<tr><td><b>本届 COP 公布</b></td><td><b>2026 年 12 月</b>——所以现在能拿到的<b>最新 COP 是 2025 年度</b>的，这正是本报告用的口径</td></tr>
<tr><td>S1 Posting 结果</td><td>2026-12-18（暂定），S1 Portal + SMS + 小学</td></tr>
</tbody>
</table>

<div class="note">
<b>我的判断：</b>这套规则里最容易被家长忽略的是第 ② 条——「志愿顺序只在同分时起作用」。它的反直觉后果是：<b>把一所明显够不着的学校放第一志愿，不会伤害任何后续志愿</b>（因为分数不够时根本轮不到你，直接看下一个）。所以「冲刺校」真正的成本只有一个：占掉一个志愿位。6 个位置里用 1–2 个去冲，是合理的。
</div>
</section>`;

const STEP2 = `
<section>
<h2 id="s2"><span class="n">02</span>候选池：以家为圆心，先划范围再看质量</h2>
<p class="lead">起点：<b>${esc(S.postal)}</b>（${esc(STU.home.address || '')}）。单程上限 <b>${S.maxCommute} 分钟</b>，${COMMUTE_RULE}。${WALK_ONLY
  ? '<br><b>这一条是硬约束，不是偏好</b>：本报告不收录任何「坐地铁能到、但走不到」的学校——哪怕它综合分更高。因为家长要的是「孩子自己能走去上学」，而不是「通勤时间够短」。'
  : ''}</p>

<div class="profile" style="margin-top:16px">
  <div><div class="k">全岛中学</div><div class="v">${S2.totalSchools}</div></div>
  <div><div class="k">有 PG3 档</div><div class="v">${S2.withStudentPG}</div></div>
  <div><div class="k">全国够得着</div><div class="v">${S2.reachableNationwide}</div></div>
  <div><div class="k">${LIMIT_LABEL}</div><div class="v">${S2.withinCommute}</div></div>
  <div><div class="k">可及（${WALK_ONLY ? '步行内' : '通勤内'} + 够得着）</div><div class="v">${S2.withinCommuteReachable}</div></div>
  <div><div class="k">主池（混校）</div><div class="v"><b>${S2.poolMixed}</b></div></div>
</div>${PLANS.intro ? `\n<div class="note">${fillScore(cfgText(PLANS.intro))}</div>` : ''}

<h3>漏斗怎么收到 ${S2.poolMixed} 所</h3>
<table>
<thead><tr><th style="width:44%">筛选步骤</th><th style="width:14%">剩余</th><th>说明</th></tr></thead>
<tbody>
<tr><td>全岛中学</td><td class="num">${S2.totalSchools}</td><td>含专科校（不参与 S1 Posting）</td></tr>
<tr><td>有 Posting Group 3 档</td><td class="num">${S2.withStudentPG}</td><td>纯 IP 校没有 PG3 行，报不了</td></tr>
<tr><td>全国分数够得着（区间右端 ≥ ${S.score}）</td><td class="num">${S2.reachableNationwide}</td><td>不限通勤</td></tr>
<tr><td>${LIMIT_LABEL}可达</td><td class="num">${S2.withinCommute}</td><td>${COMMUTE_SHORT}</td></tr>
<tr><td>${WALK_ONLY ? '步行内' : '通勤内'} + 够得着</td><td class="num">${S2.withinCommuteReachable}</td><td>= 主池 + 单性别校</td></tr>
<tr><td><b>其中混校</b></td><td class="num"><b>${S2.poolMixed}</b></td><td>家长要求「混校优先」→ 单性别校另列</td></tr>
</tbody>
</table>
${WALK_ONLY ? `
<h3>被「走不到」这条硬约束淘汰的 ${S2.walkCutCount} 所</h3>
<p>这 ${S2.walkCutCount} 所<b>分数都够得着、坐地铁也都在 ${S.maxCommute} 分钟内</b>，唯一的落选原因就是<b>全程步行超过 ${S.maxCommute} 分钟</b>。列出来是为了让取舍看得见：收紧口径砍掉的不是差学校，是「必须换乘」的学校。</p>
<div style="overflow-x:auto">
<table>
<thead><tr><th>学校</th><th class="mid">PG3 区间</th><th class="mid">余量</th><th class="mid">全程步行</th><th class="mid">地铁参考</th><th>为什么出局</th></tr></thead>
<tbody>
${S2.walkCutDetail.map(x => `<tr>
  <td>${esc(x.name)}</td>
  <td class="num mid">${fmtCop(x)}</td>
  <td class="num mid">+${x.margin}</td>
  <td class="num mid"><b>${x.walkUpperMinutes != null ? x.walkUpperMinutes : x.walkMinutes} 分</b></td>
  <td class="num mid">${x.mrtMinutes != null ? x.mrtMinutes + ' 分' : '—'}</td>
  <td class="soft" style="font-size:12.4px">步行比上限多 ${(x.walkUpperMinutes != null ? x.walkUpperMinutes : x.walkMinutes) - S.maxCommute} 分钟；地铁 ${x.mrtMinutes} 分钟虽达标，但本口径不认</td>
</tr>`).join('\n')}
</tbody>
</table>
</div>` : ''}

<h3>因为性别偏好被单独列出的 ${S2.poolSingleSex} 所</h3>
${R.singleSex.length ? `<p>孩子性别保密，报告按「混校优先」处理。这 ${R.singleSex.length} 所如果性别符合，是值得考虑的（都在 ${LIMIT_LABEL}、分数够得着）：</p>
<table>
<thead><tr><th>学校</th><th class="mid">类型</th><th class="mid">PG3 区间</th><th class="mid">余量</th><th class="mid">通勤</th></tr></thead>
<tbody>
${R.singleSex.map(x => `<tr><td>${esc(short(x.name))}</td><td class="mid">${x.nature === 'Boys School' ? '男校' : '女校'}</td><td class="num mid">${fmtCop(x)}</td><td class="num mid">${x.margin > 0 ? '+' : ''}${x.margin}</td><td class="num mid">${fastTxt(x)}</td></tr>`).join('\n')}
</tbody>
</table>` : `<p class="soft">本口径下没有「单性别 + 分数够得着 + ${COMMUTE_SHORT}达标」的学校，所以这一栏是空的——不是被筛掉了，是本来就没有。</p>`}

<h3>够不着但值得知道的 ${R.outOfReach.length} 所</h3>
<p>${LIMIT_LABEL}、分数差一点的学校。列出来是为了说明「差多少」，不是建议填。完整名单见附录。</p>
<table>
<thead><tr><th>学校</th><th class="mid">PG3 区间</th><th class="mid">差</th><th class="mid">通勤</th><th>性质</th></tr></thead>
<tbody>
${R.outOfReach.slice(0, 10).map(x => `<tr><td>${esc(short(x.name))}</td><td class="num mid">${fmtCop(x)}</td><td class="num mid">${x.margin}</td><td class="num mid">${fastTxt(x)}</td><td class="soft">${x.ip ? 'IP' : ''}${x.ip && x.sap ? ' · ' : ''}${x.sap ? 'SAP' : ''}${!x.ip && !x.sap ? (x.autonomous ? '自主' : '政府') : ''}</td></tr>`).join('\n')}
</tbody>
</table>

<div class="note">
<b>我的判断：</b>${PLANS.step2Note ? fillScore(cfgText(PLANS.step2Note)) : `孩子 ${S.score} 分属 PG3（4–20，越小越好）：全国 ${S2.withStudentPG} 所有 PG3 档的学校里，区间右端 ≥ ${S.score}、也就是够得着的有 <b>${S2.reachableNationwide} 所</b>（约 ${Math.round(S2.reachableNationwide / S2.withStudentPG * 100)}%）。${WALK_ONLY
  ? `把「步行 ≤ ${S.maxCommute} 分钟」当硬约束之后，真正可及的只剩 <b>${S2.poolMixed} 所</b>——而这 ${S2.poolMixed} 所的通勤跨度是 ${poolGateRange[0]}–${poolGateRange[1]} 分钟，余量 ${Math.min(...R.pool.map(x => x.margin))}–${Math.max(...R.pool.map(x => x.margin))} 分。<b>也就是说：可及的学校数量少到「几乎不用挑」，但质量分布并不差</b>——它们全部落在这一个通勤半径里；半径一收紧，可选面就成比例地缩小，不是「少了几所」，而是「少了一整档」。`
  : `可及学校 ${S2.withinCommuteReachable} 所、主池 ${S2.poolMixed} 所。通勤 ${poolGateRange[0]}–${poolGateRange[1]} 分钟，余量 ${Math.min(...R.pool.map(x => x.margin))}–${Math.max(...R.pool.map(x => x.margin))} 分。`}`}
</div>
</section>`;

const STEP3 = `
<section>
<h2 id="s3"><span class="n">03</span>COP：最新的只有 2025 年度，别当门槛用</h2>
<p class="lead">口径先说清：<b>2026 届的 COP 要到 2026 年 12 月才公布</b>。现在能拿到的最新数据是 <b>2025 年度 S1 Posting 的实际录取区间</b>——也就是「去年最后一名被录取的学生考了多少分」。它不是今年的门槛。</p>

<div class="warnbox">
<b>三条必须记住的波动事实（MOE 口径）：</b><br>
① COP 每年<b>动 1 分是常态，动 2–3 分也可能</b>；<br>
② 它反映的是<b>去年那批学生怎么填志愿</b>，不是学校的教学质量；<br>
③ <b>踩线 ≠ 稳</b>：区间右端等于孩子的分数，只代表「去年最后一名和他同分」，今年同分还要过 tie-breaker，<b>必须按高风险处理</b>。
</div>

<h3>主池 ${S2.poolMixed} 所的 COP 与余量</h3>
<p>余量 = 该校 PG3 非附属区间右端 − 孩子分数（${S.score}）。<b>余量为 0 = 踩线；负数是已经够不着</b>（不在此表）。</p>
<div style="overflow-x:auto">
<table>
<thead><tr><th>学校</th><th class="mid">PG3 区间<br><span class="soft">2025 年度</span></th><th class="mid">余量</th><th class="mid">风险</th><th class="mid">步行${WALK_ONLY ? '<br><span class="soft">过闸口径</span>' : ''}</th><th class="mid">地铁${WALK_ONLY ? '<br><span class="soft">仅供参考</span>' : ''}</th><th>风险说明</th></tr></thead>
<tbody>
${[...R.pool].sort((a, b) => a.margin - b.margin).map(x => {
  const rk = riskOf(x);
  return `<tr>
    <td${x.rank && x.rank <= 6 ? ' style="font-weight:600"' : ''}>${esc(short(x.name))}</td>
    <td class="num mid">${fmtCop(x)}</td>
    <td class="num mid"><b>${x.margin > 0 ? '+' : ''}${x.margin}</b></td>
    <td class="mid ${rk.cls === 'warn' ? '' : 'soft'}">${rk.cls === 'warn' ? '<b>' + rk.label + '</b>' : rk.label}</td>
    ${cellWalk(x)}${cellMrt(x)}
    <td class="soft" style="font-size:12.4px">${rk.note}</td>
  </tr>`;
}).join('\n')}
</tbody>
</table>
</div>

<h3>另一个官方信号：低位段有没有招满</h3>
<p>MOE 在 SchoolFinder 里用星号 <code>*</code> 标注一个事实：<b>该档在 S1 posting 结束后仍有学额</b>。
官方脚注的定义是「最后一名被录取者的分数优于 30，但学校仍有余位，所以记为 30」。
这是唯一一个有官方背书的「学校紧不紧张」指标——不是估算，不用猜。</p>
<p>我全量查了 ${S2.totalSchools} 所（另 8 所专科/特殊校不参与 PG 分配）：星号<b>只出现在 PG1 档，共 ${STAR_TOTAL} 所</b>，
<b>PG3 和 PG2 一所都没有</b>。含义很明确：没有学校在 PG3 段没招满，但有一批学校连最低档都没填满。</p>
${STAR_IN_POOL.length ? `<p>落到这份候选池（${S2.poolMixed} 所）里，有 <b>${STAR_IN_POOL.length} 所</b>被标记：<b>${STAR_IN_POOL.join('、')}</b>。
${(() => {
  /* 以前这里写死「Bartley 是方案 A 的第 6 志愿」，换学生后指向的学校根本不在方案里。
     改成从方案 A 反查：命中就说清它是第几志愿，没命中就如实说没进方案。 */
  const inPlan = PLANS.A.picks.filter(p => STAR_IN_POOL.includes(short(p.name)));
  if (!inPlan.length) return '它们都不在方案 A 的 6 个位置里——官方标记只是旁证，不构成加分的理由。';
  return inPlan.map(p => {
    const xx = byNameAll.get(p.name);
    return `<b>${esc(short(p.name))} 是方案 A 的第 ${p.slot} 志愿</b>——它的「稳妥」不只是余量 +${xx ? xx.margin : '?'} 分算出来的，还被官方标记印证了：这所学校连 PG1 都没招满。`;
  }).join(' ');
})()}</p>` : ''}
<p class="soft" style="font-size:12.6px">⚠️ 别过度解读：PG1 有余额 ≠ PG3 门槛会降。它是「学校整体不紧张」的旁证，不是「你更可能进」的保证。</p>

<h3>够不着的那些：差多少才算「没戏」</h3>
<p>把 SAP 与 IP 单独拎出来，因为家长明确说了「可以考虑」——但分数差得太远，这个「可以」在 ${S.score} 分这个位置不成立。</p>
<table>
<thead><tr><th>学校</th><th class="mid">类型</th><th class="mid">PG3 / IP 区间</th><th class="mid">差</th><th>为什么够不着</th></tr></thead>
<tbody>
${R.outOfReach.filter(x => x.sap || x.ip).map(x => `<tr>
  <td>${esc(short(x.name))}</td>
  <td class="mid">${x.ip && x.sap ? 'IP + SAP' : x.ip ? 'IP' : 'SAP'}</td>
  <td class="num mid">${fmtCop(x)}</td>
  <td class="num mid">${x.margin}</td>
  <td class="soft">${x.ip ? 'IP 校走单行区间，门槛远高于 ' + S.score : 'SAP 校区间上端 ' + x.cop.max + '，差 ' + Math.abs(x.margin) + ' 分；且高华优先需 PSLE ≤ 14'}</td>
</tr>`).join('\n')}
</tbody>
</table>

<div class="note">
<b>我的判断：</b>${PLANS.step3Note ? fillScore(cfgText(PLANS.step3Note)) : `这份 COP 表最该看的不是「余量最大的是谁」，而是<b>余量和通勤的组合</b>。余量最高的是 <b>${esc(short(safestInPool.name))}</b>（+${safestInPool.margin} 分，${fastTxt(safestInPool)}），通勤最短的是 <b>${esc(short(fastestInPool.name))}</b>（${fastTxt(fastestInPool)}，余量 +${fastestInPool.margin}）。${CORR_TXT}所以真正的取舍不是「要不要冒险」，而是「愿意用多少分钟换多少安全边际」。`}
</div>
</section>`;

/* ── 第四步：逐校适配度 ─────────────────────────────────── */
/* 展开哪几所：默认方案 A 的 6 所；「关键对照」默认取池内未入选的分数最高的两所。
   以前这两组校名是硬编码的（Greendale…Bartley / Yusof Ishak、Punggol），
   walk 口径下其中四所连候选池都不在，卡片直接渲染成空白。 */
const DETAIL_PICKS = PLANS.detailPicks || PLANS.A.picks.map(p => p.name);
const FOCUS_PAIR = PLANS.focusPair
  || R.pool.filter(x => !PLANS.A.picks.some(p => p.name === x.name))
    .sort((a, b) => b.total - a.total).slice(0, 2).map(x => x.name);

function schoolCard(x, extra) {
  const c = ccaOf(x);
  const rob = has(c.list, /robot/i);
  const dra = has(c.list, /drama|theatr|eldds|debating/i);
  const swim = has(c.list, /swim|water polo|lifesaving/i);
  const cook = has(c.list, /cook|culinary|food|nutrition/i);
  const tech = has(c.list, /infocomm|comput|media|robotic|maker|stem/i);
  const rk = riskOf(x);
  const rep = REPORTS[x.slug];
  const hitList = [
    rob.length ? `<b>机器人</b>：${rob.map(esc).join('、')}` : '',
    dra.length ? `<b>戏剧</b>：${dra.map(esc).join('、')}` : '',
    swim.length ? `<b>水上</b>：${swim.map(esc).join('、')}` : '',
    cook.length ? `<b>食品</b>：${cook.map(esc).join('、')}` : '',
    tech.length && !rob.length ? `<b>科技类</b>：${tech.slice(0, 3).map(esc).join('、')}` : '',
  ].filter(Boolean);

  return `
<article class="school">
  <header>
    <div class="sname">${esc(short(x.name))}</div>
    <div class="sbadges">
      ${extra.slot ? `<span class="tier t-${tierCls(extra.tier)}">第 ${extra.slot} 志愿 · ${extra.tier}</span>` : ''}
      <span class="badge">PG3 ${fmtCop(x)}</span>
      <span class="badge${x.margin <= 1 ? ' badge-risk' : ''}">余量 ${x.margin > 0 ? '+' : ''}${x.margin}</span>
      <span class="badge">风险 ${rk.label}</span>
      <span class="badge">${fastTxt(x)}</span>
      <span class="badge">综合 ${x.total}</span>
    </div>
  </header>

  <table style="margin:12px 0 0">
  <thead><tr><th style="width:20%">评估项</th><th>内容</th></tr></thead>
  <tbody>
  <tr><td>① COP 与风险</td><td>PG3 非附属区间 <b>${fmtCop(x)}</b>（2025 年度），孩子 ${S.score} 分，余量 <b>${x.margin > 0 ? '+' : ''}${x.margin}</b>。${rk.note}。</td></tr>
  <tr><td>② 通勤</td><td>${WALK_ONLY
    ? `全程步行 <b>${x.walkRange ? x.walkRange[0] + '–' + x.walkRange[1] : x.walkMinutes} 分钟</b>（${x.walkMeters} 米${x.walkDisputed ? '，两家引擎有分歧，按区间上端 <b>' + gateMin(x) + ' 分钟</b>过闸' : ''}）。${S.maxCommute - gateMin(x) >= 0 ? `距上限还剩 <b>${S.maxCommute - gateMin(x)} 分钟</b>余量` : `已超上限 ${gateMin(x) - S.maxCommute} 分钟`}；地铁 ${fmtM(x.mrtMinutes)} 分钟<b>不计入本口径</b>，仅作参考。`
    : countedByWalk(x)
      ? `步行 <b>${x.walkRange ? x.walkRange[0] + '–' + x.walkRange[1] : x.walkMinutes} 分钟</b>（${x.walkMeters} 米${x.walkDisputed ? '，两家引擎有分歧' : ''}）；地铁方案 ${fmtM(x.mrtMinutes)} 分钟。<b>计分取 ${fastTxt(x)}</b>。`
      : `地铁 <b>${x.mrtMinutes} 分钟</b>（途经 ${esc(x.via || '—')}，最近站步行 ${fmtM(x.accessWalkM)} 米）；步行 ${x.walkMinutes != null ? x.walkMinutes + ' 分钟' : '不现实'}。`}</td></tr>
  <tr><td>③ 主要 CCA</td><td>共 <b>${c.total} 项</b>（MOE 登记 ${c.moe} 项${c.total > c.moe ? '，另 ' + (c.total - c.moe) + ' 项来自学校官网' : ''}）。${c.gaps ? `<span class="soft">清单缺口：${esc(c.gaps)}</span>` : ''}</td></tr>
  <tr><td>④ 兴趣匹配</td><td>${hitList.length ? hitList.join('；') : '<span class="soft">没有与孩子五项 CCA 兴趣直接对应的社团</span>'}${swim.length === 0 ? '<br><span class="soft">注：本校无游泳 / 水上项目 CCA</span>' : ''}</td></tr>
  <tr><td>⑤ ALP</td><td>${esc(ALP_OF(x) || '未列出')}</td></tr>
  <tr><td>⑥ LLP</td><td>${esc(LLP_OF(x) || '未列出')}</td></tr>
  <tr><td>⑦ 其他特色</td><td>${extra.feature || '<span class="soft">未查到独立于 ALP/LLP 的特色项目</span>'}</td></tr>
  <tr><td>⑧ 整体特点</td><td>${extra.profile || '<span class="soft">—</span>'}</td></tr>
  <tr><td>⑨ 适合 / 不适合</td><td>${extra.verdict || '<span class="soft">这份报告没有为该校写逐项判断（它只在对照表里出现）。</span>'}</td></tr>
  </tbody>
  </table>
  ${rep ? `<a class="deeplink" href="${esc(rep.file)}"><span>阅读《${esc(short(x.name))}》单校深度报告</span><em>校史 · 升学 · CCA 解析 · 真实声音 · 开放日必问 →</em></a>` : ''}
</article>`;
}

/* 主池里真有 Robotics 社团的学校 —— 判断段要用，且必须现算：
   abc2 池里是 2 所（Greendale / Yusof Ishak），abc3 池里只剩 1 所。 */
const ROB_IN_POOL = R.pool.filter(x => has(ccaOf(x).list, /robot/i).length);

const STEP4 = `
<section>
<h2 id="s4"><span class="n">04</span>逐校适配度：把「好学校」换成「适合他的学校」</h2>
<p class="lead">下面按九项逐所评估。先看方案 A 的 ${DETAIL_PICKS.length} 所${FOCUS_PAIR.length ? `，再看 ${FOCUS_PAIR.length} 所关键对照（${FOCUS_PAIR.map(n => short(n)).join('、')}）` : ''}。其余学校的结论汇总在第五步的表里。</p>

${DETAIL_PICKS.map(n => {
  const x = byName.get(n);
  if (!x) return '';                       // 不在主池 → 不渲染空卡片
  const p = PLANS.A.picks.find(z => z.name === n) || {};
  const d = DETAIL[n] || {};
  return schoolCard(x, {
    slot: p.slot, tier: p.tier, ...d,
    verdict: (d.verdict || '<span class="soft">—</span>') +
      /* p.why / p.risk 也要过 fillScore：配置里写 {{score}} 时才会被替换。
         旧版只替换 DETAIL，picks 里的 {{score}} 会原样漏进 HTML（abc3 踩过）。 */
      (p.why ? `<br><br><b>放进方案 A 的理由：</b>${fillScore(p.why)}<br><b>风险：</b>${fillScore(p.risk || '—')}` : ''),
  });
}).join('\n')}

${FOCUS_PAIR.length ? `<h3>关键对照：${FOCUS_PAIR.map(n => esc(short(n))).join(' / ')}</h3>
<p>这 ${FOCUS_PAIR.length} 所不在方案 A 的 6 个位置里，但值得看懂——这样才能理解「为什么不选」和「什么时候该选」。</p>
${FOCUS_PAIR.map(n => {
  const x = byName.get(n);
  return x ? schoolCard(x, { ...(DETAIL[n] || {}) }) : '';
}).join('\n')}` : ''}

<div class="note">
<b>我的判断：把 CCA 权重放高的三个理由</b><br>
① ALP 是<b>课时内全体学生</b>都上的，孩子逃不掉也深化不了——它是「底座」，不是「特长」；<br>
② CCA 是每周固定时段、可以连续做四年的东西，<b>真正的技能与人际关系从这里长出来</b>；<br>
③ 孩子的第 1 兴趣是机器人。全部 ${S2.poolMixed} 所主池里，<b>真的有 Robotics 社团的只有 ${ROB_IN_POOL.length} 所${ROB_IN_POOL.length ? '（' + ROB_IN_POOL.map(x => esc(short(x.name))).join('、') + '）' : ''}</b>——${ROB_IN_POOL.length === 1
  ? '稀缺到只有一所，所以「要不要为它冒踩线的险」就成了这份报告的核心矛盾。'
  : ROB_IN_POOL.length
    ? '这个稀缺度本身就说明该往这一两所倾斜。'
    : '一所都没有，所以「机器人」这个兴趣只能靠 ALP 课程承接，进不了社团——这一点必须提前告诉家长。'}
</div>
</section>`;

/* ── 第五步：梯度 ─────────────────────────────────────── */
const REACH = R.pool.filter(x => x.margin <= 2).sort((a, b) => b.total - a.total);
const MATCH = R.pool.filter(x => x.margin >= 3 && x.margin <= 5).sort((a, b) => b.total - a.total);
const SAFE = R.pool.filter(x => x.margin >= 6).sort((a, b) => b.total - a.total);

/* 空档不渲染表格 —— 只剩一行表头的空表看起来像渲染失败，
   而这里的「空」本身就是重要结论，用一句说明更清楚。 */
const tierTable = (title, arr, note) => `
<h3>${title}（${arr.length} 所）</h3>
<p class="soft" style="font-size:13px">${note}</p>
${arr.length ? `<table>
<thead><tr><th>学校</th><th class="mid">余量</th><th class="mid">通勤</th><th class="mid">综合</th><th>一句话</th></tr></thead>
<tbody>
${arr.map(x => {
  /* 「一句话」用数据层给出的兴趣命中名单（x.ccaHits）。
     旧版只判机器人 / 戏剧两项，于是 Outram（有水球和泳池，命中「游泳」）
     被印成「两项主要兴趣都没有」——事实错误。 */
  const hits = x.ccaHits || [];
  const tag = hits.length ? '命中：' + hits.join(' + ') : '五项兴趣零命中';
  return `<tr><td>${esc(short(x.name))}</td><td class="num mid">+${x.margin}</td><td class="num mid">${fastTxt(x)}</td><td class="num mid">${x.total}</td><td class="soft">${tag}</td></tr>`;
}).join('\n')}
</tbody>
</table>` : ''}`;

/* 档位说明里的数字全部现算：池子从 22 所变 7 所时，
   「这 8 所的余量都在 0–2 分」这种句子必须跟着变，否则整段都在编。 */
const tierNote = (arr, andThen) => {
  if (!arr.length) return '这一档在本池里是空的——说明本口径下没有这个风险级别的学校，志愿设计要在别的档里凑。';
  const ms = [...new Set(arr.map(x => x.margin))].sort((a, b) => a - b);
  const gs = [Math.min(...arr.map(gateMin)), Math.max(...arr.map(gateMin))];
  const zero = arr.filter(x => x.margin === 0);
  return `余量 ${ms.join('、')} 分，${COMMUTE_SHORT} ${gs[0]}–${gs[1]} 分钟。${zero.length
    ? `其中 <b>${zero.map(x => esc(short(x.name))).join('、')}</b> 余量 0——那是「抽签级」风险，不是「有希望」。`
    : ''}${andThen || ''}`;
};

const STEP5 = `
<section>
<h2 id="s5"><span class="n">05</span>梯度设计：为什么这样分三档</h2>
<p class="lead">分档只看一件事：<b>余量</b>（区间右端 − 孩子分数）。它决定了「今年大概会不会落空」，而兴趣匹配决定「落空后值不值得」。两者都满足才算「匹配」。</p>

<div class="grid2">
  <div class="panel">
    <h4>A · 冲刺（Reach）：余量 0–2 分</h4>
    <ul>
      <li>孩子有机会，但 COP 一动就落空</li>
      <li>放前面的<b>唯一成本是占掉一个志愿位</b>（分数不够时 MOE 直接看下一志愿）</li>
      <li>建议占 1–2 个位置</li>
    </ul>
  </div>
  <div class="panel">
    <h4>B · 匹配（Match）：余量 3–5 分</h4>
    <ul>
      <li>竞争力合理，但仍有 1–2 分的浮动风险</li>
      <li>这是志愿表的主体，<b>应该占 2–3 个位置</b></li>
      <li>优先选兴趣或通勤有明显优势的</li>
    </ul>
  </div>
  <div class="panel">
    <h4>C · 稳妥（Safe）：余量 ≥6 分</h4>
    <ul>
      <li>分数明显优于往年 COP，录取安全边际较大</li>
      <li>MOE 建议至少放 2–3 所</li>
      <li><b>不要因为「稳妥」就随便选</b>——它仍要能承接兴趣</li>
    </ul>
  </div>
</div>

${tierTable('冲刺档', REACH, tierNote(REACH))}
${tierTable('匹配档', MATCH, tierNote(MATCH))}
${tierTable('稳妥档', SAFE, tierNote(SAFE, SAFE.length ? '共同代价是通勤偏长——这是「安全边际」的价格。' : ''))}

<div class="note">
${PLANS.step5Note ? fillScore(cfgText(PLANS.step5Note)) : (() => {
  const weak = REACH.filter(x => x.scores.cca <= 45);
  const reachSlots = PLANS.A.picks.filter(p => p.tier === '冲刺').length;
  return `<b>为什么不机械套「1 冲刺 / 2 冲刺或高匹配 / 3 匹配 / 4 匹配 / 5 稳妥 / 6 稳妥」：</b>
本案例的分布是「冲刺 ${REACH.length} 所、匹配 ${MATCH.length} 所、稳妥 ${SAFE.length} 所」${weak.length
    ? `，而<b>冲刺档里有 ${weak.length} 所与孩子兴趣完全不相关</b>（${weak.slice(0, 4).map(x => esc(short(x.name))).join('、')}${weak.length > 4 ? ' 等' : ''}）。把志愿位花在这些学校上是纯浪费——冲一个自己不喜欢的学校，即使录了也要转学。`
    : '。冲刺档的每一所都至少对上了孩子的一项兴趣，所以冲它们不算浪费位置。'}
所以方案 A 用了 ${reachSlots} 个冲刺位，把省下来的位置给了匹配档里有实体社团的学校。这就是「按实际分布调整」的意思。`;
})()}
</div>
</section>`;

/* ── 第六步：最终建议 ─────────────────────────────────── */
const planRow = (p, idx) => {
  const x = byNameAll.get(p.name);
  if (!x) return '';
  const c = ccaOf(x);
  const rob = has(c.list, /robot/i);
  const dra = has(c.list, /drama|theatr|eldds/i);
  const rk = riskOf(x);
  /* CCA 匹配列也用数据层的命中名单，避免和第五步的「一句话」两处口径打架 */
  const ccaMatch = (x.ccaHits || []).length ? x.ccaHits.join(' + ') : '零命中';
  const alp = ALP_OF(x) || '—';
  const reason = p.why || (x.margin >= 6 ? `余量 ${x.margin} 分兜底，${ALP_OF(x)}` : `${ALP_OF(x)}，${fastTxt(x)}`);
  return `<tr>
    <td class="num mid"><b>${p.slot || idx + 1}</b></td>
    <td><b>${esc(short(x.name))}</b>${p.tier ? `<br><span class="tier t-${tierCls(p.tier)}" style="font-size:10px;margin-top:3px">${p.tier}</span>` : ''}</td>
    <td class="num mid">${fmtCop(x)}</td>
    <td class="mid" style="white-space:nowrap">${rk.label}</td>
    <td class="num mid" style="white-space:nowrap">${fastTxt(x)}</td>
    <td class="mid" style="white-space:nowrap">${ccaMatch}</td>
    <td style="font-size:12.4px">${esc(alp).replace(/ - /g, '<br>')}</td>
    <td class="soft" style="font-size:12.4px">${reason}</td>
  </tr>`;
};

const planTable = (key) => {
  const pl = PLANS[key];
  return `
<h3>${pl.title}</h3>
<p class="soft" style="font-size:13px;margin:0 0 8px">${pl.desc}</p>
<div style="overflow-x:auto">
<table>
<thead><tr><th class="mid" style="width:5%">志愿</th><th style="width:19%">学校</th><th class="mid" style="width:9%">PG3 区间</th><th class="mid" style="width:8%">风险</th><th class="mid" style="width:11%">通勤</th><th class="mid" style="width:9%">CCA</th><th style="width:13%">ALP / LLP</th><th>推荐理由</th></tr></thead>
<tbody>
${pl.picks.map((p, i) => planRow(p, i)).join('\n')}
</tbody>
</table>
</div>`;
};

const pickA = PLANS.A.picks.map(p => byNameAll.get(p.name)).filter(Boolean);

const STEP6 = `
<section>
<h2 id="s6"><span class="n">06</span>最终建议：评分表 + 三套方案</h2>
<p class="lead">综合评分沿用五维加权：<b>录取安全性 30% ｜ 距离/通勤 25% ｜ 学术课程匹配 15% ｜ CCA 匹配 15% ｜ ALP/LLP 特色 15%</b>。分数衡量的是「对这个孩子」，不是学校办学水平。</p>

<h3>方案 A ${PLANS.A.picks.length} 所的五维得分</h3>
<div style="overflow-x:auto">
<table>
<thead><tr><th>志愿</th><th>学校</th>${['录取安全性<br><span class="soft">×30%</span>', '通勤<br><span class="soft">×25%</span>', '学术<br><span class="soft">×15%</span>', 'CCA<br><span class="soft">×15%</span>', 'ALP/LLP<br><span class="soft">×15%</span>'].map(h => `<th class="mid">${h}</th>`).join('')}<th class="mid">合计</th></tr></thead>
<tbody>
${PLANS.A.picks.map(p => {
  const x = byNameAll.get(p.name);
  if (!x) return '';
  return `<tr>
    <td class="num mid">${p.slot}</td>
    <td><b>${esc(short(x.name))}</b></td>
    ${scoreRow(x).map(([k, v]) => `<td class="num mid${k === 'CCA' ? '' : ''}">${v}</td>`).join('')}
    <td class="num mid"><b>${totalOf(x)}</b></td>
  </tr>`;
}).join('\n')}
</tbody>
</table>
</div>
<p class="soft" style="font-size:12.6px">权重：安全性 30% / 通勤 25% / 学术 15% / CCA 15% / ALP·LLP 15%。CCA 那一维按孩子的五项兴趣加权：命中第 1 兴趣给 95 分以上，一项都不命中给 45 分。<b>45 分不代表学校差</b>，只代表社团对不上这个孩子。</p>

${planTable('A')}
${planTable('B')}
${planTable('C')}

<div class="verdict">
${PLANS.finalAdvice ? fillScore(cfgText(PLANS.finalAdvice)) : (() => {
  /* 默认版：逐条理由从数据拼出来，不写校名、不写死分数。
     改过三次的坑：写死「第 1 志愿还是给 Greendale」「全池 22 所」，
     换学生就变成一份在替别的孩子做决定的报告。 */
  const items = PLANS.A.picks.map(p => {
    const x = byNameAll.get(p.name);
    if (!x) return '';
    const c = ccaOf(x);
    const tags = [
      has(c.list, /robot/i).length ? '机器人' : '',
      has(c.list, /drama|theatr|eldds/i).length ? '戏剧' : '',
      has(c.list, /infocomm|comput|media|maker|stem/i).length ? '科技' : '',
    ].filter(Boolean);
    const base = `余量 ${x.margin > 0 ? '+' : ''}${x.margin} 分、${fastTxt(x)}${tags.length
      ? '，有 ' + tags.join(' / ') + ' 社团'
      : '，<b>五项兴趣一项都没社团承接</b>'}`;
    return `<li><b>第 ${p.slot} 志愿 · ${esc(short(x.name))}${p.tier ? '（' + p.tier + '）' : ''}</b>：${base}。${p.why || ''}</li>`;
  }).filter(Boolean);
  const short6 = PLANS.A.picks.length < 6;
  return `<h3>如果这是我的孩子，我会这样填</h3>
<p>方案 A 的 ${PLANS.A.picks.length} 个位置，逐条理由是：</p>
<ul>
${items.join('\n')}
</ul>
${short6 ? `<p><b>填不满 6 个，是这份方案的结论，不是遗漏。</b>本次口径下真正可及的只有 ${S2.poolMixed} 所，硬凑第 ${PLANS.A.picks.length + 1}–6 志愿就得接受「走不到」或「分数够不着」。<b>空着比乱填好</b>——S1 只按填了的志愿派位，多填一所不合适的学校，唯一效果是把孩子可能送进去。</p>` : ''}`;
})()}
</div>

<div class="warnbox">
${PLANS.todo ? fillScore(cfgText(PLANS.todo)) : (() => {
  const tight = [...R.pool].sort((a, b) => a.margin - b.margin)[0];
  const far = [...R.pool].sort((a, b) => gateMin(b) - gateMin(a))[0];
  const disputed = R.pool.filter(x => x.walkDisputed);
  return `<b>提交前必须做的三件事：</b><br>
① <b>实地走一次通勤路线</b>${far ? `——最远的一所是 ${esc(short(far.name))}（${fastTxt(far)}）` : ''}${disputed.length
    ? `；${disputed.map(x => esc(short(x.name))).join('、')} 的步行时间两家引擎有分歧（区间 ${disputed.map(x => (x.walkRange || []).join('–')).join(' / ')} 分钟），走一次就知道按哪端算` : ''}；<br>
② <b>开放日问清 CCA 分配规则</b>：Sec 1 是按志愿优先还是学校指定？目标社团有没有选拔、名额多少？这直接决定 ${PLANS.A.picks[0] ? '第 1 志愿' : '前面的志愿'}值不值；<br>
③ <b>12 月 COP 公布后再核对一次</b>：本报告的余量基于 2025 年度区间，本届 COP 出来后才算数${tight ? `。余量最薄的 ${esc(short(tight.name))} 只有 +${tight.margin} 分，区间一动就要重新掂量` : ''}。`;
})()}
</div>
</section>

<section>
<h2 id="s7"><span class="n">07</span>附录：全池 ${S2.poolMixed} 所速览</h2>
<p class="lead">按余量从紧到松排列。这张表用于核对有没有漏掉值得考虑的学校。</p>
<div style="overflow-x:auto">
<table>
<thead><tr><th>学校</th><th class="mid">PG3 区间</th><th class="mid">余量</th><th class="mid">步行</th><th class="mid">地铁</th><th class="mid">CCA 项数</th><th>ALP 类别</th><th class="mid">综合</th></tr></thead>
<tbody>
${[...R.pool].sort((a, b) => a.margin - b.margin).map(x => {
  const c = ccaOf(x);
  return `<tr>
    <td>${esc(short(x.name))}</td>
    <td class="num mid">${fmtCop(x)}</td>
    <td class="num mid">${x.margin > 0 ? '+' : ''}${x.margin}</td>
    ${cellWalk(x)}${cellMrt(x)}
    <td class="num mid">${c.total}${c.total > c.moe ? `<span class="soft">/${c.moe}</span>` : ''}</td>
    <td class="soft" style="font-size:12.4px">${esc(ALP_OF(x) || '—')}</td>
    <td class="num mid">${x.total}</td>
  </tr>`;
}).join('\n')}
</tbody>
</table>
</div>
<p class="soft" style="font-size:12.4px">CCA 列格式「总数/MOE 登记数」——斜杠后的数字是 MOE SchoolFinder 的登记数，比总数小说明学校官网列得更多（官网是更完整的口径）。</p>

<h3>${LIMIT_LABEL}但够不着的完整名单（${R.outOfReach.length} 所）</h3>
<table>
<thead><tr><th>学校</th><th class="mid">PG3 区间</th><th class="mid">差</th><th class="mid">通勤</th></tr></thead>
<tbody>
${R.outOfReach.sort((a, b) => b.margin - a.margin).map(x => `<tr><td>${esc(short(x.name))}</td><td class="num mid">${fmtCop(x)}</td><td class="num mid">${x.margin}</td><td class="num mid">${fastTxt(x)}</td></tr>`).join('\n')}
</tbody>
</table>
</section>

<section>
<h2 id="s8"><span class="n">08</span>数据来源与口径</h2>
<table>
<thead><tr><th style="width:22%">内容</th><th>来源</th><th class="mid">可信度</th></tr></thead>
<tbody>
<tr><td>2026 S1 Posting 规则、Posting Group 映射、tie-breaker、SAP 高华条件、附属优先、时间线</td><td>MOE 官网 <code>moe.gov.sg/secondary/s1-posting</code>（2026-11 核对）</td><td class="mid"><span class="tag a">A</span></td></tr>
<tr><td>各校 PG3 非附属录取区间（2025 年度）</td><td>MOE SchoolFinder</td><td class="mid"><span class="tag a">A</span></td></tr>
<tr><td>学校类型 / IP / SAP / CCA 登记 / DSA / ALP / LLP / 地址</td><td>MOE SchoolFinder（2026-11 采集）</td><td class="mid"><span class="tag a">A</span></td></tr>
<tr><td>完整 CCA 清单（含 MOE 未登记项）</td><td>13 所学校官网逐页核实，合并进 <code>data/cca-catalog.json</code></td><td class="mid"><span class="tag a">A</span></td></tr>
<tr><td>步行时间与距离</td><td>FOSSGIS OSRM foot（OSM 步行路网），Valhalla 交叉校验</td><td class="mid"><span class="tag a">A</span></td></tr>
<tr><td>本报告的<b>通勤口径</b></td><td>${WALK_ONLY
  ? `只认<b>全程步行</b>（学生配置 <code>commuteMode: "walk"</code>）：地铁时间仅作参考，不参与门槛判定与评分；步行争议项按<b>区间上端</b>过闸`
  : `按「<b>步行 / 地铁取最快</b>」参与门槛判定与评分（学生配置 <code>commuteMode: "fastest"</code>）`}</td><td class="mid"><span class="tag a">A</span></td></tr>
<tr><td>地铁时间</td><td>自建 MRT 模型（站间 2 分 / 换乘 5 分 / 进站 4 分 + 站到校步行）</td><td class="mid"><span class="tag b">B</span></td></tr>
<tr><td>五维加权分数</td><td>本项目评分模型，权重 30/25/15/15/15，CCA 按孩子兴趣加权</td><td class="mid"><span class="tag b">B</span></td></tr>
</tbody>
</table>

<div class="note">
<b>事实 vs 判断的分界：</b>第一至三步（规则、候选池、COP）是可复核的事实，全部来自 MOE 口径与官方数据；第四至六步（适配度、梯度、推荐）是判断，标注了理由与风险。<b>每所学校的「为什么适合/不适合」都是我的判断，你可以不同意</b>——但只要事实部分没错，换个权重重排一遍就能得到你自己的答案。
</div>

<div class="warnbox">
<b>三条必须知道的数据局限：</b><br>
① <b>COP 是 2025 年度的</b>，2026 届的 12 月才出；区间每年动 1–3 分；<br>
② <b>CCA 清单永远可能不全</b>：本报告引用 ${S2.poolMixed} 所主池，其中 MOE 登记数与官网实际项数不一致的学校已逐所标在第四步卡片里——「报告里没写某个社团」不等于「学校没有」，开放日必须问；<br>
③ <b>步行时间有分歧</b>：两家引擎对「能否穿私人公寓通道」判定不同${(() => {
  const d = R.pool.filter(x => x.walkDisputed && x.walkRange);
  return d.length
    ? `，本池有 ${d.length} 所（${d.map(x => esc(short(x.name)) + ' ' + x.walkRange.join(' vs ')).join('、')}，单位分钟）${WALK_ONLY ? '，已按<b>上端</b>过闸——即使按乐观端算也不会多收进一所，只是排名会小动' : ''}`
    : '，本池内没有争议项';
})()}。
</div>
</section>`;

/* ── 页面渲染 ─────────────────────────────────────────── */
const TOC = ['录取规则', '候选池', 'COP 与风险', '逐校适配度', '梯度设计', '最终建议', '附录', '数据来源'];

/* hero 文案可以由配置覆盖：默认版只讲本学生自己的数字，
   不跨学生比较 —— 否则换一个分数/通勤上限就会印出「多 -2 所」这种话。 */
const heroSub = typeof PLANS.hero === 'function'
  ? cfgText(PLANS.hero)
  : `AL <b>${S.score}</b> 分 · ${S.pgShort} · 邮编 ${esc(S.postal)} · ${WALK_ONLY ? '<b>全程步行</b>上限' : '单程上限'} ${S.maxCommute} 分钟。
主池（混校）<b>${S2.poolMixed} 所</b>，可及总数 ${S2.withinCommuteReachable} 所。
这份报告要回答的不是「哪所学校最好」，而是「这 ${PLANS.A.picks.length} 个位置怎么排，才在保住录取的同时不浪费孩子的兴趣」。`;

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="generator" content="psle-plan-report/v1">
<title>PSLE 2026 志愿规划 · AL ${S.score} 分 · 6 个志愿方案</title>
<style>
${PLAN_CSS}
</style>
</head>
<body>

<div class="hero">
  <div class="wrap">
    <a class="backlink" href="../index.html">← 返回学校看板</a>
    <div class="eyebrow">PSLE 2026 · Secondary 1 Posting · ${esc(STU.label)}</div>
    <h1>AL ${S.score} 分，6 个志愿怎么排<small>新加坡中学 S1 Posting 完整分析 · 邮编 ${esc(S.postal)}</small></h1>
    <div class="sub">${heroSub}</div>
    <div class="profile">
      <div><div class="k">PSLE 总分</div><div class="v">AL ${S.score}</div></div>
      <div><div class="k">Posting Group</div><div class="v">${S.pgShort}</div></div>
      <div><div class="k">邮编</div><div class="v">${esc(S.postal)}</div></div>
      <div><div class="k">${WALK_ONLY ? '步行上限' : '通勤上限'}</div><div class="v">${S.maxCommute} 分钟</div></div>
      <div><div class="k">主池（混校）</div><div class="v">${S2.poolMixed} 所</div></div>
      <div><div class="k">可及总数</div><div class="v">${S2.withinCommuteReachable} 所</div></div>
    </div>
  </div>
</div>

<div class="wrap">

<div class="toc">
  <b>目录</b>
${TOC.map((t, i) => `  <a href="#s${i + 1}">${'①②③④⑤⑥⑦⑧'[i]} ${esc(t)}</a>`).join('\n')}
</div>

<div class="note" style="margin-top:20px">
<b>这份报告怎么读。</b>主体六步（规则 → 候选池 → COP → 逐校适配 → 梯度 → 建议）+ 两节参考（附录速览、数据来源与口径）。${STU.id !== 'abc1' ? `
<br><br><b>⚠️ 人工分析边界：</b>候选池、COP、通勤、五维分数都是按这份配置算出来的；但<b>选校理由、逐校「适合/不适合」结论、方案 A/B/C 的取舍</b>是人工判断，<b>没有随配置自动改写</b>——换一个分数、兴趣或邮编，这几节的文字需要重新核对，不能直接沿用。` : ''}
每一节末尾的灰框是<b>我的判断</b>，其余是可复核的事实。<b>数据口径</b>：COP 取各校 <b>${S.pgLabel} 行的非附属区间</b>（${SC.meta.copYear} 年度），
孩子 AL ${S.score} 属 ${S.pgShort}，只与同档学生竞争；通勤${WALK_ONLY
  ? `按<b>全程步行</b>计算（地铁时间仅列出、不参与判定），步行争议项按区间上端过闸`
  : '按「步行 / 地铁取最快」计算'}，争议项已标注。
</div>

${STEP1}
${STEP2}
${STEP3}
${STEP4}
${STEP5}
${STEP6}

<div class="foot">
<b>生成信息</b>　本报告由 <code>scripts/build-report-plan.cjs</code> 基于学生画像 <code>data/students/${esc(STU.id)}.json</code> 生成，
数据采集 2026-11，生成于 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Singapore' })} SGT。<br>
<b>口径</b>　COP = ${SC.meta.copYear} 年度 S1 Posting 实际录取区间 · 学生 AL ${S.score} / ${S.pgShort} / 邮编 ${esc(S.postal)} / ${WALK_ONLY ? '步行上限' : '通勤上限'} ${S.maxCommute} 分钟（${COMMUTE_SHORT}）·
步行 = OSM 步行路网 · 地铁 = 自建 MRT 模型${WALK_ONLY ? '（仅参考，不参与判定）' : ''}。<br>
<b>免责</b>　个人研究工具输出，非 MOE 官方建议。COP 每年浮动，录取结果受志愿策略、同届竞争与 tie-breaker 影响，本报告不构成录取保证。
开放日实地确认永远优先于任何二手资料。<br><br>
<a href="../index.html">← 学校看板</a> ｜ <a href="../map.html">通勤地图</a>
</div>

</div>
</body>
</html>
`;

/* 登记到学生索引（与 build-report-v2 共用同一份 activeId 规则）。
   注意：给老二出报告不应把老大在看板上的入口顶掉 —— activeId 由
   data/students/active.json 决定，不在这里。 */
const idxList = require('../lib/students-index.cjs').upsert(STU, {
  pgShort: S.pgShort,
  plan: {
    picks: PLANS.A.picks.map(p => ({ slot: p.slot, name: p.name, tier: p.tier })),
    poolMixed: S2.poolMixed,
    withinCommuteReachable: S2.withinCommuteReachable,
    kinds: ['plan'],
    report: 'reports/' + STU.planSlug + '.html',
  },
});

const out = P('docs/reports', STU.planSlug + '.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html, 'utf8');
console.log(`▸ 输出 ${out}`);
console.log(`  大小 ${(html.length / 1024).toFixed(0)}KB`);
console.log(`  学生 ${STU.id} · AL ${S.score} · ${S.pgShort} · 主池 ${S2.poolMixed} 所`);
console.log(`  方案 A：${PLANS.A.picks.map(p => short(p.name) + '(' + p.tier + ')').join(' → ')}`);
console.log(`  索引：docs/data/students-index.json（%d 个学生，当前 %s）`, idxList.length, STU.id);
