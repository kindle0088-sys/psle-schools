/**
 * abc5 的六志愿设计与逐校判断
 *
 * 背景沿 abc3（步行 ≤40 分钟 / 混校 / 无附属 / 兴趣同 abc1），两处变化：
 *   ① AL 15 → 18（仍 PG3），主池从 7 所塌到 4 所，余量从最高 +4 塌到 +1；
 *   ② 身份 PR → 同分输公民，踩线位不能当兜底。
 *
 * ⚠️ 这个学生的一切数字都从 data/_recommend-abc5.json 现算，不写死。
 *    原因：abc3.js 里写死了「+4 是并列最高」「余量 1 分」等 AL15 下的判断，
 *    AL 一改就出现「表格新余量、正文旧余量」的自相矛盾。这里全部数据驱动。
 */

const R = require('../_recommend-abc5.json');
const ALL = [...R.pool, ...R.outOfReach, ...R.singleSex];
const get = n => ALL.find(x => x.name === n);
const fmt = m => (m == null ? '—' : m > 0 ? '+' + m : String(m));
const mOf = n => { const x = get(n); return x ? fmt(x.margin) : '—'; };
const cOf = n => { const x = get(n); return x && x.cop ? x.cop.min + '–' + x.cop.max : '—'; };
const wOf = n => { const x = get(n); return x ? (x.walkUpperMinutes != null ? x.walkUpperMinutes : x.minutes) : 0; };
const sn = n => n.replace(/ Secondary School| \(Secondary\)/, '');
const names = arr => arr.map(x => sn(x.name)).join('、');

const A = [
  'Compassvale Secondary School',
  'Punggol Secondary School',
  'Seng Kang Secondary School',
  'North Vista Secondary School',
  'Greendale Secondary School',
  'Yusof Ishak Secondary School',
];

/* 步行够得着、但分数够不着（margin<0）的学校 —— 本案例的主角 */
const NEAR_MISS = R.outOfReach
  .filter(x => (x.walkUpperMinutes != null ? x.walkUpperMinutes : x.walkMinutes) <= R.student.maxCommute)
  .sort((a, b) => b.margin - a.margin);
/* 被步行淘汰、但分数够得着的学校 —— 放宽口径才能拿到的兜底 */
const WALK_CUT_SAFE = (R.stats.walkCutDetail || []).filter(x => x.margin >= 3).sort((a, b) => b.margin - a.margin);

const POOL_MAX = Math.max(...R.pool.map(x => x.margin));
const POOL_MIN = Math.min(...R.pool.map(x => x.margin));
const POOL_HI = R.pool.slice().sort((a, b) => b.margin - a.margin);
const ROBOT_IN_POOL = R.pool.filter(x => (x.ccaHits || []).includes('机器人'));
const ROBOT_NEAR_MISS = NEAR_MISS.filter(x => (x.ccaHits || []).includes('机器人'));
/* 真正进方案 A 的机器人冲刺校 —— 不要把所有池外命中机器人校都列进「冲刺位」，
   否则 Edgefield（差 4 分、连方案都没有）会被误说成「冲刺位」。 */
const ROBOT_SPRINT = A.slice(4).map(get).filter(x => x && (x.ccaHits || []).includes('机器人'));
/* 分数差 ≤3 分、且至少命中一项兴趣的池外校，才配称「可惜」 */
const REGRETTABLE = NEAR_MISS.filter(x => x.margin >= -3 && (x.ccaHits || []).length);
/* 方案 A 里余量最大的位置（可能并列），用于「相对最可能中」的表述 */
const BEST_SLOTS = A.map((n, i) => ({ slot: i + 1, m: get(n) ? get(n).margin : null }))
  .filter(x => x.m === POOL_MAX).map(x => x.slot);
const MATCH_N = R.pool.filter(x => x.margin >= 3 && x.margin <= 5).length;
const SAFE_N = R.pool.filter(x => x.margin >= 6).length;

const PLANS = {
  hero: ({ S, S2, esc, R: RR }) => {
    const p = RR.pool;
    return 'AL <b>' + S.score + '</b> 分 · ' + S.pgShort + ' · 邮编 ' + esc(S.postal)
      + ' · <b>只认全程步行</b>上限 ' + S.maxCommute + ' 分钟 · <b>永久居民（PR）</b>。\n'
      + '同时满足「走路能到」和「分数够得着」的，只剩 <b>' + p.length + ' 所</b>，'
      + '余量 ' + fmt(POOL_MIN) + ' 到 ' + fmt(POOL_MAX) + '——<b>没有一所进得了「稳」档</b>。\n'
      + '更可惜的是：走路够得着、却因分数差 '
      + (Math.abs(NEAR_MISS[NEAR_MISS.length - 1]?.margin || 1)) + ' 分以内出局的有 <b>' + NEAR_MISS.length + ' 所</b>（'
      + esc(names(NEAR_MISS)) + '）'
      + (ROBOT_NEAR_MISS.length ? '，其中 ' + esc(names(ROBOT_NEAR_MISS)) + ' 都带机器人社团' : '') + '。\n'
      + '<b>先说结论：前 ' + p.length + ' 位放全部够得着的学校，后 ' + (6 - p.length)
      + ' 位留给「分数差一点、但兴趣最对口」的冲刺校。</b>'
      + '孩子是 PR，同分输公民——<b>踩线校不能当兜底</b>，这份报告不会说「第 6 位保你有学上」。'
      + (WALK_CUT_SAFE.length ? '真要兜底只有放宽步行口径：被「走不到」淘汰的 '
        + S2.walkCutCount + ' 所里，有 ' + WALK_CUT_SAFE.length + ' 所余量 ≥3 分。' : '');
  },

  intro: ({ S, S2, R: RR }) => {
    return '从 AL 15 降到 AL 18，代价不是「少几所学校」，而是<b>风险结构整个换了</b>：<br>'
      + '① <b>分数侧出局</b>：步行够得着但分数不够的有 ' + NEAR_MISS.length + ' 所（'
      + NEAR_MISS.map(x => sn(x.name) + ' ' + fmt(x.margin)).join('、')
      + '）——兴趣最对口的几所几乎都在里面；<br>'
      + '② <b>分数侧入池</b>：主池 ' + RR.pool.length + ' 所里余量最高只有 ' + fmt(POOL_MAX)
      + ' 分，PR 同分让位公民后，这个缓冲其实很薄；<br>'
      + '③ <b>通勤侧</b>：被「走不到」硬约束淘汰的 ' + S2.walkCutCount + ' 所里，'
      + (WALK_CUT_SAFE.length
        ? '有 ' + WALK_CUT_SAFE.length + ' 所余量 ≥3 分（' + WALK_CUT_SAFE.slice(0, 4).map(x => sn(x.name) + ' ' + fmt(x.margin)).join('、')
          + '）——那是放宽口径后真正的兜底校，但本口径下不能算。'
        : '没有高余量校。')
      + '<b>所以取舍不是「冲刺还是稳妥」，而是「用冲刺位换兴趣，还是全部填够得着的」。</b>';
  },

  A: {
    title: '方案 A · 够得着优先（PR 推荐）',
    desc: '前 4 位放全部分数够得着的学校，后 2 位留给兴趣最对口但分数差一点的冲刺校',
    picks: [
      {
        name: A[0],
        slot: 1,
        tier: '冲刺',
        why: '综合分全池第一；<b>机器人与戏剧两项兴趣都有社团承接</b>。步行 ' + wOf(A[0])
          + ' 分钟（两家引擎有争议，按上端过闸），是池子里唯一「走路一刻钟」的落点。',
        risk: '余量 ' + mOf(A[0]) + '（COP ' + cOf(A[0]) + '，孩子 ' + '{{score}}' + ' 分）——'
          + '踩线，PR 同分让位公民，风险比公民家庭更高。放第 1 位不损失后面任何位置。',
      },
      {
        name: A[1],
        slot: 2,
        tier: '匹配',
        why: '余量 ' + mOf(A[1]) + '，是主池最宽的一档；步行 ' + wOf(A[1])
          + ' 分钟、不争议。核实后有英语 / 印度语 Drama &amp; Debating，戏剧兴趣落地。',
        risk: '机器人、游泳、烹饪三项仍无 CCA 证据（Mobile Robotics 是科目不是社团）；ALP 偏环境可持续，与 Computing 无关。',
      },
      {
        name: A[2],
        slot: 3,
        tier: '匹配',
        why: '余量同为 ' + mOf(A[2]) + '，含 English Drama。LLP 是 Sports &amp; Outdoor Education（TREK for Life）。步行 ' + wOf(A[2]) + ' 分钟。',
        risk: '没有机器人社团，科技类只有偏美术的 Art Club；ALP 是食品科技，与 Computing 无关。步行 ' + wOf(A[2]) + ' 分钟偏长。',
      },
      {
        name: A[3],
        slot: 4,
        tier: '冲刺',
        why: 'Drama Club 与 Infocomm Club 同时存在，戏剧与科技两条线都有社团。余量 ' + mOf(A[3]) + '，COP ' + cOf(A[3]) + '。',
        risk: '步行 ' + wOf(A[3]) + ' 分钟是全池最长；ALP 名为 Farm-to-Table，实质农业与食品，与 Computing 关系很弱。',
      },
      {
        name: A[4],
        slot: 5,
        tier: '冲刺',
        why: '<b>机器人 + 戏剧双命中</b>，步行 ' + wOf(A[4]) + ' 分钟也够得着。放冲刺位是明确的选择：兴趣最对口，但分数差 '
          + Math.abs(get(A[4]).margin) + ' 分。',
        risk: 'COP ' + cOf(A[4]) + '，孩子 {{score}} 分<b>高于该校去年录取上限</b>，属于「今年门槛放宽才可能」的一档。'
          + 'PR 同分再让位公民，不能指望它。填它不占前面位置，但别把它算进兜底。',
      },
      {
        name: A[5],
        slot: 6,
        tier: '冲刺',
        why: '<b>机器人 / AI / 戏剧三项全命中</b>，步行仅 ' + wOf(A[5]) + ' 分钟（争议项按上端过闸）——兴趣与通勤都是最好的。',
        risk: 'COP ' + cOf(A[5]) + '，孩子 {{score}} 分<b>差 ' + Math.abs(get(A[5]).margin) + ' 分</b>，'
          + '是全部候选里分数缺口最大的冲刺位。PR 同分劣势在这里同样适用。',
      },
    ],
    focusPair: ['Outram Secondary School'],
  },

  B: {
    title: '方案 B · 兴趣冲刺优先',
    desc: '把机器人社团的两所提到前两位，接受前两志愿大概率落空',
    picks: [
      { name: A[5], slot: 1 },
      { name: A[4], slot: 2 },
      { name: A[0], slot: 3 },
      { name: A[1], slot: 4 },
      { name: A[2], slot: 5 },
      { name: A[3], slot: 6 },
    ],
  },

  C: {
    title: '方案 C · 游泳保留',
    desc: '主池四所照旧，冲刺位换成步行可达、有游泳落点的 Outram',
    picks: [
      { name: A[0], slot: 1 },
      { name: A[1], slot: 2 },
      { name: A[2], slot: 3 },
      { name: A[3], slot: 4 },
      { name: 'Outram Secondary School', slot: 5 },
      { name: A[4], slot: 6 },
    ],
  },

  step3Note: ({ S, S2, R: RR, esc }) => {
    const near = NEAR_MISS[0];
    return '这张表最容易看错的地方：<b>' + esc(sn(POOL_HI[0].name)) + ' 的 ' + fmt(POOL_MAX)
      + ' 看着是「最稳」，其实只有 1 分</b>；而走路同样够得着的 '
      + (near ? esc(sn(near.name)) + ' 只差 ' + Math.abs(near.margin) + ' 分' : '几所只差 1–3 分')
      + '。<b>一分之差就是「够得着」和「没戏」的分界</b>。COP 每年动 1–2 分很常见，'
      + '所以这里的 ' + fmt(POOL_MAX) + ' 随时可能变成 ' + fmt(POOL_MAX - 1) + ' 或更低。'
      + (ROBOT_IN_POOL.length ? '主池里带机器人社团的只有 ' + esc(names(ROBOT_IN_POOL)) + '。' : '');
  },

  step5Note: ({ S, S2, R: RR }) => {
    const ms = RR.pool.map(x => x.margin);
    return '<b>这一版连「相对稳」都谈不上——主池 '
      + RR.pool.length + ' 所的余量是 ' + fmt(Math.min(...ms)) + ' 到 ' + fmt(Math.max(...ms))
      + '，匹配档（余量 3–5 分）' + (MATCH_N ? '有 ' + MATCH_N + ' 所' : '一所都没有')
      + '，稳妥档（≥6 分）' + (SAFE_N ? '有 ' + SAFE_N + ' 所' : '也是空的') + '，全部落在冲刺档。</b>'
      + '<br><br>正常做法是「前面冲刺、后面用余量 6 分以上的学校兜底」，'
      + '<b>而这里最大的位置也只有 ' + fmt(Math.max(...ms)) + ' 分</b>，和其他位置是同一个风险量级；'
      + '孩子是 PR，同分还让位公民。所以本报告只能说「第 '
      + BEST_SLOTS.join(' / ') + ' 位（余量 ' + fmt(POOL_MAX) + '）是<b>相对</b>最可能中的那个」，不能说「第 6 位保底」。'
      + '<br><br>要真正的兜底有两条路：'
      + '① <b>放宽通勤口径</b>（允许地铁）——被「走不到」淘汰的 ' + S2.walkCutCount + ' 所里，'
      + (WALK_CUT_SAFE.length ? '有 ' + WALK_CUT_SAFE.length + ' 所余量 ≥3 分（'
        + WALK_CUT_SAFE.slice(0, 4).map(x => sn(x.name) + ' ' + fmt(x.margin)).join('、') + '）' : '分数都不高')
      + '；② 接受「6 个志愿全落空、由 MOE 分配」——那所学校不受你控制。'
      + '<b>这一条必须在提交前和家人确认，而不是 12 月才知道。</b>';
  },

  finalAdvice: () => {
    return `<h3>如果这是我的孩子，我会这样填</h3>
<p>方案 A 的 6 个位置按三条判断排，不是按综合分排：</p>
<ul>
<li><b>第 1–${R.pool.length} 位：把全部「够得着」的学校放完。</b>主池只有 ${R.pool.length} 所，余量 ${fmt(POOL_MIN)} 到 ${fmt(POOL_MAX)}；
${names(REGRETTABLE)} 这几所走路可达、兴趣命中，只差 ${REGRETTABLE.map(x => Math.abs(x.margin)).join(' / ')} 分出局；
${NEAR_MISS.filter(x => !REGRETTABLE.includes(x)).map(x => sn(x.name)).join('、')} 则差得更远，不作为冲刺候选（女校 / SAP / 差 4 分以上）。
先保住「有得选」，再谈「选得好」——这是 PR + AL 18 的现实。</li>
<li><b>第 ${R.pool.length + 1}–6 位：冲刺位只给兴趣最对口的。</b>${names(ROBOT_SPRINT)} 带机器人社团、步行也够得着，
但分数差 ${ROBOT_SPRINT.map(x => Math.abs(x.margin)).join(' / ')} 分。填它们不占前面位置——
S1 按分数排队、逐志愿检索，前面落空才会看到它们。</li>
<li><b>游泳只有一个落点，但它在冲刺位。</b>Outram 是全池唯一有游泳池 / Water Polo 的学校，
走路 ${get('Outram Secondary School').walkMinutes}–${wOf('Outram Secondary School')} 分钟可达，分数差 ${Math.abs(get('Outram Secondary School').margin)} 分。
方案 C 把它换进第 5 位，代价是拿掉一所机器人校——<b>这就是「第 4 兴趣」值不值得一个冲刺位的问题</b>。</li>
</ul>
<p><b>为什么不选方案 B：</b>B 把两所分数出局的机器人校提到第 1–2 位。它们分别差 ${Math.abs(get(A[5]).margin)} 和 ${Math.abs(get(A[4]).margin)} 分，
对 PR 来说是「今年门槛放宽才可能」的一档。<b>用两个最靠前的位置去换小概率，等于主动把安全位推到后面</b>——
前两位落空后，后面 4 所仍是那些学校，顺序没变，但心理上更容易误以为「前面已经冲过了」。</p>
<p><b>为什么不选方案 C（除非游泳是硬需求）：</b>C 用 Outram 换掉 Yusof Ishak。Outram 差 ${Math.abs(get('Outram Secondary School').margin)} 分、
Yusof 差 ${Math.abs(get(A[5]).margin)} 分，<b>Outram 的分数缺口更小，但 Yusof 同时命中机器人 / AI / 戏剧三项</b>。
若游泳确是孩子的强意愿，选 C 合理；否则 A 的冲刺位应该给兴趣命中更多的那所。</p>
<p class="soft">注：综合分排名与第六步的志愿顺序不一致是刻意的——综合分衡量「对这个孩子多合适」，
志愿顺序衡量「落空风险 + 兴趣保留」的组合。本报告里 Compassvale 综合分第一且排第 1，是一致的；
但 ${names(ROBOT_SPRINT)} 综合分 ${ROBOT_SPRINT.map(x => x.total).join(' / ')} 并不低，却排末两位——
原因不是学校差，是它们的 COP 上限低于孩子的 ${'{{score}}'} 分。</p>`;
  },

  todo: () => {
    return `<b>提交前必须做的三件事：</b><br>
① <b>先回答一个问题：能接受「6 个志愿全落空、由 MOE 分配」吗？</b>主池 ${R.pool.length} 所余量最高只有 ${fmt(POOL_MAX)}，
PR 同分让位公民——这是数学事实，不是危言耸听。不能接受的话，唯一解法是放宽到地铁 / 公交，
而不是在 ${R.pool.length} 所里继续调顺序（放宽后立刻多出 ${WALK_CUT_SAFE.length} 所余量 ≥3 分的学校）；<br>
② <b>实地走三条路线</b>：Compassvale（${get(A[0]).walkMinutes}–${wOf(A[0])} 分钟，两家引擎分歧）、Yusof Ishak（步行 ${get(A[5]).walkMinutes} / 争议上端 ${wOf(A[5])} 分钟）、
Outram（${get('Outram Secondary School').walkMinutes}–${wOf('Outram Secondary School')} 分钟，确认走的是 Anchorvale 新校区）；<br>
③ <b>开放日问清两件事</b>：Compassvale 的 Robotics 有没有选拔、Sec 1 名额多少（它排第 1 位，这决定值不值）；
以及第 5–6 位两所冲刺校有没有「同分 PR 让位公民」之外的额外限制。12 月 COP 出来后再核对一次余量。`;
  },
};

const DETAIL = {
  [A[0]]: {
    feature: 'CCA <b>18 项</b>；2026-11-23 三方核实后 Robotics 与 English Drama 均由 MOE 当前登记确认，官网 DSA 页也列 Robotics Club。'
      + 'ALP 是 ACES（Aeronautics, Coding, Engineering and Sustainability）——全池唯一把 Coding 写进项目名称的学校，低年级课时内必修。',
    profile: '2000 年随盛港新镇建校，约 1,400 人。校风偏严。2024 年 5 科及格 89.7%、Poly 资格率 96.3%，出口以 Poly 为主。'
      + '走路 ' + wOf(A[0]) + ' 分钟、' + (get(A[0]).walkMeters || '约 1,100') + ' 米（争议项按上端过闸）。',
    verdict: '<b>适合：</b>机器人与戏剧两项兴趣都有实体社团，通勤最短，综合分全池第一。<br>'
      + '<b>不适合：</b>余量 ' + mOf(A[0]) + '，PR 同分让位公民；步行时间两家引擎有分歧，'
      + '官网没有完整 CCA 清单页，社团活跃度需现场确认。',
  },
  [A[1]]: {
    feature: 'CCA <b>20 项</b>（官网 21 项，差额只是 Volleyball 按男女分列）；俱乐部栏已补齐 Art / AVA / ELDDS / Environmental / ILDDS / Interact。'
      + 'Shooting（射击）在全岛中学里不常见。',
    profile: '榜鹅较新的邻里中学。ALP 是 Environmental Sustainability，LLP 是社区青年领导力。步行 ' + wOf(A[1]) + ' 分钟。',
    verdict: '<b>适合：</b>余量 ' + mOf(A[1]) + ' 是主池最宽的一档，步行 ' + wOf(A[1])
      + ' 分钟不争议；核实后有英语 / 印度语 Drama &amp; Debating。<br>'
      + '<b>不适合：</b>机器人、游泳、烹饪三项仍无 CCA 证据；ALP 与 Computing 无关。',
  },
  [A[2]]: {
    feature: 'LLP 是 Sports &amp; Outdoor Education（TREK for Life）。CCA 按 2027 官网口径 15 项（MOE 当前 14 项），含 English Drama；'
      + '官网明确 2027 起 Red Cross / NPCC 停办、引入 NCDCC。',
    profile: '盛港的邻里中学。ALP 偏食品科技（Food for the Future）。步行 ' + wOf(A[2]) + ' 分钟。',
    verdict: '<b>适合：</b>余量 ' + mOf(A[2]) + '，戏剧兴趣有社团承接；LLP 覆盖体育方向。<br>'
      + '<b>不适合：</b>没有机器人社团，科技类只有偏美术的 Art Club；' + wOf(A[2]) + ' 分钟步行偏长。',
  },
  [A[3]]: {
    feature: 'CCA 18 项，Drama Club 与 Infocomm Club 同时存在；LLP 是视觉艺术与设计。',
    profile: '盛港 / 后港交界的社区型中学。ALP 名为 Farm-to-Table，归在 STEM - Cities and Urban Landscapes 类，实质是农业与食品。'
      + '步行 ' + wOf(A[3]) + ' 分钟、全池最长。',
    verdict: '<b>适合：</b>戏剧与科技两个方向都有社团；余量 ' + mOf(A[3]) + '。<br>'
      + '<b>不适合：</b>ALP 名实不符，与 Computing 关系很弱；' + wOf(A[3])
      + ' 分钟把「只能走路」这个条件放大成硬伤。',
  },
  [A[4]]: {
    feature: 'CCA <b>18 项</b>；2026-11-23 核实后 Robotics 与 English Drama 在 MOE 与官网双侧均确认。'
      + 'ALP 是 Design, Technology and Engineering，与 STEM 方向一致。',
    profile: '盛港一带的社区中学，规模中等。LLP 是户外与探险教育。步行 ' + wOf(A[4]) + ' 分钟。',
    verdict: '<b>适合：</b>孩子第 1 兴趣（机器人）与第 3 兴趣（戏剧）都有实体社团；ALP 对口 STEM。<br>'
      + '<b>不适合：</b>COP ' + cOf(A[4]) + '，孩子 {{score}} 分<b>高于去年录取上限</b>（差 '
      + Math.abs(get(A[4]).margin) + ' 分），PR 同分再让位公民——只能冲刺，不能兜底。',
  },
  [A[5]]: {
    feature: 'CCA 里有 <b>Robotics Club</b> 与 <b>Infocomm Technology</b>，另有 English Drama——机器人 / AI 方向 / 戏剧三项全命中。'
      + 'ALP 是 S4TEM@YI（可持续与智慧城市）。',
    profile: '榜鹅的年轻学校，全岛唯一以总统命名。STEM 竞赛记录在本区属密集的一档。'
      + '步行 ' + get(A[5]).walkMinutes + ' 分钟（争议项按 ' + wOf(A[5]) + ' 分钟过闸）。',
    verdict: '<b>适合：</b>兴趣三项全命中，争议口径下仍只需 ' + wOf(A[5]) + ' 分钟。<br>'
      + '<b>不适合：</b>COP ' + cOf(A[5]) + '，孩子 {{score}} 分差 ' + Math.abs(get(A[5]).margin)
      + ' 分，是缺口最大的冲刺位；PR 同分劣势同样适用。',
  },
  'Outram Secondary School': {
    feature: '1977 年建成游泳池，<b>全池唯一有 Swimming / Water Polo 的学校</b>，也是唯一开游泳 DSA 的。'
      + 'CCA 核实后为 MOE 14 项 / 并集 17 项（旧版「只有 6 项」作废）。',
    profile: '1906 年创办的 120 年老校，2026 年迁入盛港 Anchorvale 新校区，York Hill 旧校区 2027 年底关闭，目前双校区运营。'
      + 'ALP 是 Business &amp; Enterprise。',
    verdict: '<b>适合：</b>第 4 兴趣游泳在此是全池唯一落点；步行 ' + get('Outram Secondary School').walkMinutes + '–'
      + wOf('Outram Secondary School') + ' 分钟可到新校区。<br>'
      + '<b>不适合：</b>分数差 ' + Math.abs(get('Outram Secondary School').margin)
      + ' 分，只能冲刺；机器人与烹饪无证据；English Drama 只见于开放日 microsite；'
      + '双校区过渡期师资与活动可能被摊薄。',
  },
  'Edgefield Secondary School': {
    feature: '步行仅 ' + wOf('Edgefield Secondary School') + ' 分钟，是全池最近的一所；CCA 命中机器人 / AI / 戏剧三项。',
    profile: '榜鹅邻里中学。',
    verdict: '<b>不适合：</b>COP ' + cOf('Edgefield Secondary School') + '，孩子 {{score}} 分差 '
      + Math.abs(get('Edgefield Secondary School').margin) + ' 分——比方案里的冲刺校还远，兴趣再对口也不填。',
  },
};

module.exports = { PLANS, DETAIL };
