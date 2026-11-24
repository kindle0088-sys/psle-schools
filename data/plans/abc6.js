/**
 * abc6 的六志愿设计与逐校判断
 *
 * 与 abc5 同为 AL 18 + PR + 同址 + 同兴趣，唯一变化：通勤从
 *   commuteMode=walk（只认全程步行 ≤40）→ fastest（步行 / 地铁取最快 ≤40）。
 * 后果：主池 4 所 → 12 所，其中 11 所靠地铁入池；但分数没变，
 * 出局校仍有 17 所（Greendale −2 / Yusof −3 / Outram −1 都在其中）。
 *
 * ⚠️ 一切数字从 data/_recommend-abc6.json 现算，不写死。
 * ⚠️ 家长说的是「走路 + 公交和地铁」；项目只有步行路网 + 自建 MRT 模型，
 *    没有公交路网，报告必须显式标注「公交未计入」，不能假装算过。
 */

const R = require('../_recommend-abc6.json');
const ALL = [...R.pool, ...R.outOfReach, ...R.singleSex];
const get = n => ALL.find(x => x.name === n);
const fmt = m => (m == null ? '—' : m > 0 ? '+' + m : String(m));
const mOf = n => { const x = get(n); return x ? fmt(x.margin) : '—'; };
const cOf = n => { const x = get(n); return x && x.cop ? x.cop.min + '–' + x.cop.max : '—'; };
const gate = n => { const x = get(n); return x ? x.minutes : '—'; };
/** 过闸口径的可读文本：fastest 下地铁校要写地铁，不能拿「全程步行 140 分钟」冒充通勤 */
const how = n => {
  const x = get(n);
  if (!x) return '—';
  return x.commuteMode === 'mrt'
    ? `地铁 ${x.minutes} 分钟`
    : `步行 ${x.walkRange ? x.walkRange.join('–') : x.walkMinutes} 分钟`;
};
const sn = n => n.replace(/ Secondary School| \(Secondary\)/, '');
const names = arr => arr.map(x => sn(x.name)).join('、');

const A = [
  'Compassvale Secondary School',
  'Yuying Secondary School',
  'Bendemeer Secondary School',
  'Bartley Secondary School',
  'Hougang Secondary School',
  'Punggol Secondary School',
];

const POOL_MAX = Math.max(...R.pool.map(x => x.margin));
const POOL_MIN = Math.min(...R.pool.map(x => x.margin));
const POOL_HI = R.pool.slice().sort((a, b) => b.margin - a.margin);
const MATCH_N = R.pool.filter(x => x.margin >= 3 && x.margin <= 5).length;
const SAFE_N = R.pool.filter(x => x.margin >= 6).length;
const REACH_N = R.pool.filter(x => x.margin <= 2).length;
const ROBOT_IN_POOL = R.pool.filter(x => (x.ccaHits || []).includes('机器人'));
const ROBOT_NEAR = R.outOfReach
  .filter(x => (x.ccaHits || []).includes('机器人') && x.minutes <= R.student.maxCommute)
  .sort((a, b) => b.margin - a.margin);
const SWIM_NEAR = R.outOfReach
  .filter(x => (x.ccaHits || []).includes('游泳') && x.minutes <= R.student.maxCommute);
const MRT_IN_POOL = R.pool.filter(x => x.commuteMode === 'mrt');
const AT_CAP = R.pool.filter(x => x.minutes >= R.student.maxCommute).sort((a, b) => b.margin - a.margin);
const BEST_SLOTS = A.map((n, i) => ({ slot: i + 1, m: get(n) ? get(n).margin : null }))
  .filter(x => x.m === POOL_MAX).map(x => x.slot);
/* 与第 2 位并列最高、但通勤更长的对照校（不能拿自己跟自己比） */
const PEER_MAX = POOL_HI.find(x => x.name !== A[1] && x.margin === POOL_MAX);
/* 方案 B / C 里真正「出局」和「被换掉」的学校，从方案配置反查，不手写校名 */
const B_OUT = ['Greendale Secondary School', 'Yusof Ishak Secondary School']
  .filter(n => get(n) && get(n).margin < 0);
const C_PICK_NAMES = ['Compassvale Secondary School', 'Outram Secondary School', A[1], A[2],
  'Broadrick Secondary School', 'Guangyang Secondary School'];
const C_DROPPED = A.filter(n => !C_PICK_NAMES.includes(n));
const C_CAP_ADDED = C_PICK_NAMES.filter(n => AT_CAP.some(x => x.name === n));

const PLANS = {
  hero: ({ S, S2, esc }) => {
    return 'AL <b>' + S.score + '</b> 分 · ' + S.pgShort + ' · 邮编 ' + esc(S.postal)
      + ' · <b>步行 / 地铁取最快</b>上限 ' + S.maxCommute + ' 分钟 · <b>永久居民（PR）</b>。\n'
      + '同时满足「通勤能到」和「分数够得着」的有 <b>' + R.pool.length + ' 所</b>，余量 '
      + fmt(POOL_MIN) + ' 到 ' + fmt(POOL_MAX) + '：其中 <b>' + MATCH_N + ' 所</b>进得了余量 3–5 分的「相对稳」档，'
      + REACH_N + ' 所仍是 0–2 分的冲刺档，≥6 分的「明显稳」档<b>一所都没有</b>。\n'
      + '通勤放宽的收益很实在：主池 ' + R.pool.length + ' 所里有 <b>' + MRT_IN_POOL.length
      + ' 所靠地铁入池</b>，只认步行时根本进不来。但分数没变——通勤可达却分数出局的仍有 <b>'
      + R.outOfReach.length + ' 所</b>，机器人社团最对口的 '
      + (ROBOT_NEAR.length ? esc(names(ROBOT_NEAR)) + '（' + ROBOT_NEAR.map(x => fmt(x.margin)).join(' / ') + '）' : '几所')
      + '全在里面。\n'
      + '<b>先说结论：第 1 位放唯一「机器人 + 戏剧」双命中的 Compassvale（踩线，放首位不损失后面）；'
      + '第 ' + BEST_SLOTS.join(' / ') + ' 位放余量 ' + fmt(POOL_MAX) + ' 的学校；'
      + '其余位置按「戏剧 / AI 命中 + 通勤不压上限」挑。</b>'
      + '孩子是 PR，同分输公民——<b>踩线校仍然不能当兜底</b>。\n'
      + '<b>口径边界：</b>家长表述含公交，但本项目只有 OSM 步行路网 + 自建 MRT 模型，<b>公交未计入</b>，'
      + '所有「能到」都只代表步行或地铁能到；靠公交才成立的路线需自行实测。';
  },

  intro: ({ S, S2, esc }) => {
    return '把通勤从「只认全程步行」放宽到「步行 / 地铁取最快 ≤' + S.maxCommute + ' 分钟」，'
      + '改变的是<b>可选面</b>，不是<b>分数现实</b>：<br>'
      + '① <b>通勤侧放开</b>：主池扩到 ' + R.pool.length + ' 所，其中 ' + MRT_IN_POOL.length
      + ' 所靠地铁（' + esc(names(MRT_IN_POOL.slice(0, 4))) + ' 等）；本口径下没有任何学校因「走不到」被单独淘汰；<br>'
      + '② <b>分数侧没变</b>：通勤可达但分数出局的仍有 ' + R.outOfReach.length + ' 所，'
      + (ROBOT_NEAR.length ? esc(names(ROBOT_NEAR)) + ' 分别差 '
        + ROBOT_NEAR.map(x => Math.abs(x.margin)).join(' / ') + ' 分' : '机器人校仍够不着')
      + '；游泳唯一落点 ' + esc(sn(SWIM_NEAR[0].name)) + ' 差 '
      + Math.abs(SWIM_NEAR[0].margin) + ' 分；<br>'
      + '③ <b>新出现的取舍</b>：余量 ' + fmt(POOL_MAX) + ' 的 '
      + esc(names(AT_CAP)) + ' 通勤正好压在 ' + S.maxCommute + ' 分钟上限，'
      + '比 ' + esc(sn(POOL_HI[0].name)) + ' 更稳，但没有延误缓冲。<br>'
      + '<b>所以这一版不是「没得挑」，而是「挑法变了」：用通勤长度换安全边际，还是留在家门口守住余量。</b>';
  },

  A: {
    title: '方案 A · 稳档 + 兴趣平衡（PR 推荐）',
    desc: '第 1 位冲刺唯一机器人校，第 2–4 位取高余量且通勤不压线，第 5–6 位补近距离戏剧校',
    picks: [
      {
        name: A[0],
        slot: 1,
        tier: '冲刺',
        why: '<b>主池唯一同时命中机器人与戏剧的学校</b>，综合分 ' + get(A[0]).total + ' 全池第一；'
          + how(A[0]) + '（争议项按最快端过闸），是全池最短通勤。'
          + '余量 ' + mOf(A[0]) + '，放第 1 位不损失后面任何位置。',
        risk: 'COP ' + cOf(A[0]) + '，孩子 {{score}} 分<b>正好压在上限</b>，PR 同分让位公民；'
          + '步行 ' + (get(A[0]).walkRange ? get(A[0]).walkRange.join(' vs ') : get(A[0]).walkMinutes)
          + ' 分钟两家引擎分歧，实地没走过之前不能当「14 分钟到校」。',
      },
      {
        name: A[1],
        slot: 2,
        tier: '匹配',
        why: '余量 <b>' + mOf(A[1]) + '</b>（与 ' + escName(PEER_MAX) + ' 并列最高，且通勤更短）；'
          + how(A[1]) + '，是余量 ' + fmt(POOL_MAX) + ' 档里最近的。'
          + 'CCA 有 Infocomm Technology (Media Production)，AI 兴趣有社团承接。',
        risk: 'CCA 共 11 项、没有戏剧与游泳；ALP 是 Business &amp; Entrepreneurship（Design Thinking），'
          + '不是 Computing 方向。地铁 28 分钟需换乘，早高峰实际时长要实测。',
      },
      {
        name: A[2],
        slot: 3,
        tier: '匹配',
        why: '余量同为 <b>' + mOf(A[2]) + '</b>；' + how(A[2])
          + '。CCA 13 项含 English Drama，戏剧兴趣落地；ALP 是 STEM - Emerging Technologies。',
        risk: '机器人、游泳、烹饪无社团证据；步行全程约 ' + get(A[2]).walkMinutes
          + ' 分钟不现实，地铁是唯一可用方式——公交未计入本模型。',
      },
      {
        name: A[3],
        slot: 4,
        tier: '匹配',
        why: '余量 <b>' + mOf(A[3]) + '</b>；' + how(A[3])
          + '。CCA 有 Infocomm Technology (Media Production)，AI 方向有落点；'
          + 'ALP 是 Chemical and Applied Sciences (Fragrance)，属 STEM Health &amp; Food Science。',
        risk: '没有戏剧 / 机器人社团；COP 下限 ' + cOf(A[3]).split('–')[0]
          + ' 在主池里偏高，若今年下限上移，余量 3 分会被吃掉一部分。',
      },
      {
        name: A[4],
        slot: 5,
        tier: '冲刺',
        why: '余量 ' + mOf(A[4]) + '；' + how(A[4])
          + '。CCA 16 项含 ELDDS（英语戏剧辩论），戏剧兴趣可落地；ALP 是 STEM（HS Innovates）。',
        risk: '余量只有 ' + mOf(A[4]) + '，属中低档；机器人与游泳无社团证据；'
          + '全程步行 ' + get(A[4]).walkMinutes + ' 分钟，同样必须坐车。',
      },
      {
        name: A[5],
        slot: 6,
        tier: '冲刺',
        why: '全程 <b>' + how(A[5]) + '</b>，是主池里第二短通勤；余量 ' + mOf(A[5])
          + '。CCA 20 项，英语 / 印度语 Drama &amp; Debating 双线，戏剧落点最扎实。',
        risk: '余量只有 ' + mOf(A[5]) + '，PR 同分劣势下不能视为兜底；'
          + '机器人、游泳、烹饪无证据。<b>它排末位不是因为差，是因为更稳的位置已经占满。</b>',
      },
    ],
    focusPair: ['Greendale Secondary School', 'Yusof Ishak Secondary School'],
  },

  B: {
    title: '方案 B · 兴趣冲刺优先',
    desc: '前四位全给兴趣最对口的学校（含两所分数出局的机器人校），后两位用余量 ' + fmt(POOL_MAX) + ' 兜底',
    picks: [
      { name: A[0], slot: 1 },
      { name: 'North Vista Secondary School', slot: 2 },
      { name: 'Greendale Secondary School', slot: 3 },
      { name: 'Yusof Ishak Secondary School', slot: 4 },
      { name: A[1], slot: 5 },
      { name: A[2], slot: 6 },
    ],
  },

  C: {
    title: '方案 C · 游泳 + 高余量',
    desc: '保留游泳唯一落点 Outram，并把两所通勤压线但余量 ' + fmt(POOL_MAX) + ' 的学校填进后位',
    picks: [
      { name: A[0], slot: 1 },
      { name: 'Outram Secondary School', slot: 2 },
      { name: A[1], slot: 3 },
      { name: A[2], slot: 4 },
      { name: 'Broadrick Secondary School', slot: 5 },
      { name: 'Guangyang Secondary School', slot: 6 },
    ],
  },

  step3Note: ({ S, S2, R: RR, esc }) => {
    const top = RR.pool.slice().sort((a, b) => b.margin - a.margin)[0];
    return '这张表最容易被误读的是「余量最大 = 录取稳」：<b>' + esc(sn(top.name)) + ' 的 '
      + fmt(top.margin) + ' 也只是相对宽</b>——PR 同分让位公民，≥6 分的明显稳档本案例是空的。'
      + 'COP 每年浮动 1–2 分很常见，' + fmt(top.margin) + ' 随时可能缩到 ' + fmt(top.margin - 1)
      + '。反过来，' + (ROBOT_NEAR.length ? esc(names(ROBOT_NEAR)) + ' 差 '
        + ROBOT_NEAR.map(x => Math.abs(x.margin)).join(' / ') + ' 分，'
        + '不是「再努力一点」，是今年的区间上限就低于孩子的 ' + S.score + ' 分' : '机器人校分数仍不够') + '。';
  },

  step5Note: ({ S, S2, R: RR }) => {
    return '<b>这一版的池子 ' + RR.pool.length + ' 所，档位分布是：冲刺（余量 0–2）' + REACH_N
      + ' 所、匹配（3–5）' + MATCH_N + ' 所、稳妥（≥6）' + SAFE_N + ' 所。</b>'
      + '<br><br>也就是说，<b>「有得挑」不等于「挑得到稳的」</b>：'
      + '相对最可能中的是第 ' + BEST_SLOTS.join(' / ') + ' 位（余量 ' + fmt(POOL_MAX)
      + '），但它们仍不是 6 分以上的安全位。孩子是 PR，同分让位公民，'
      + '这个缓冲要比公民家庭看得更保守。'
      + (AT_CAP.length ? '<br><br>另外 <b>' + escNames(AT_CAP) + ' 余量 ' + fmt(POOL_MAX)
        + ' 却正好压在 ' + S.maxCommute + ' 分钟上限</b>：稳是真的稳，通勤也是真的贴线，'
        + '一旦公交 / 换乘不如模型顺畅，实际时长会超出本报告口径。' : '')
      + '<br><br>通勤放宽后已经<b>没有因「走不到」被淘汰的学校</b>，所以'
      + '「再放宽就能兜底」这条路在本案例不成立——真正的兜底只有两条：'
      + '① 接受 6 个志愿全落空后由 MOE 分配；② 等 12 月本届 COP 出来再核对余量。'
      + '<b>这两条必须在提交前和家人确认。</b>';
  },

  finalAdvice: () => {
    return `<h3>如果这是我的孩子，我会这样填</h3>
<p>方案 A 的 6 个位置按四条判断排，不是按综合分排：</p>
<ul>
<li><b>第 1 位给唯一的机器人落点。</b>${sn(A[0])} 是主池里唯一同时有 Robotics 与 English Drama 的学校，综合分 ${get(A[0]).total} 第一、${how(A[0])}。余量 ${mOf(A[0])} 是踩线，但 S1 按分数排队、逐志愿检索——放第 1 位不会伤害后续任何志愿。</li>
<li><b>第 2–4 位优先拿「高余量 + 通勤不压上限」。</b>${names([get(A[1]), get(A[2]), get(A[3])])} 余量 ${mOf(A[1])} / ${mOf(A[2])} / ${mOf(A[3])}，通勤 ${gate(A[1])} / ${gate(A[2])} / ${gate(A[3])} 分钟，都离 ${R.student.maxCommute} 分钟上限还有空间。对 PR 来说，这比「兴趣全中但踩线」更值钱。</li>
<li><b>第 5–6 位放戏剧校（一近一中距）。</b>${sn(A[5])} ${how(A[5])}、${sn(A[4])} ${how(A[4])}，都有戏剧社团；余量 ${mOf(A[5])} / ${mOf(A[4])} 不大，所以放后面。它们不是兜底，只是「如果前面都落空、至少还有选择」。</li>
<li><b>游泳和两所「压线高余量校」放在方案 C 里谈。</b>${sn(SWIM_NEAR[0].name)} 是全池唯一游泳落点（差 ${Math.abs(SWIM_NEAR[0].margin)} 分）；${names(AT_CAP)} 余量 ${fmt(POOL_MAX)} 但通勤正好 ${gate(AT_CAP[0].name)} 分钟。选 C 就是拿「通勤贴线」换「多两个稳位 + 一个游泳冲刺」。</li>
</ul>
<p><b>为什么不选方案 B：</b>B 把 ${B_OUT.length} 所分数出局的机器人校 ${names(B_OUT.map(get))} 提到第 3–4 位。对 PR 来说，它们分别差 ${B_OUT.map(n => Math.abs(get(n).margin)).join(' / ')} 分，属于「今年门槛下移才可能」的一档。B 的后两位仍有 ${fmt(POOL_MAX)} 兜底，所以不是高风险；<b>但它把两个前位押在小概率上，换来的是已经能在第 1 位拿到的机器人兴趣</b>——性价比不高。（另有 ${names(ROBOT_NEAR.filter(x => !B_OUT.includes(x.name)))} 命中机器人，但差 ${ROBOT_NEAR.filter(x => !B_OUT.includes(x.name)).map(x => Math.abs(x.margin)).join(' / ')} 分，连冲刺位都不值得给。）</p>
<p><b>为什么不默认选方案 C：</b>C 用 ${names(AT_CAP)} 换掉 ${names(C_DROPPED.map(get))}，余量更高，通勤却压到 ${R.student.maxCommute} 分钟；同时把游泳冲刺放到第 2 位，PR 差 ${Math.abs(SWIM_NEAR[0].margin)} 分也不是稳。<b>除非游泳是孩子的强意愿、且家里确认 40 分钟贴线通勤可持续，否则 A 更平衡。</b></p>
<p class="soft">注：综合分排名与第六步志愿顺序并不完全一致，这是刻意的——综合分衡量「对这个孩子多合适」，志愿顺序衡量「落空风险 + 兴趣保留」。本案例综合分第一的 ${sn(A[0])} 正好排第 1；但余量 ${fmt(POOL_MAX)} 的 ${sn(A[1])} 综合分 ${get(A[1]).total} 排第 2，是因为它同时满足「稳 + 通勤有余量 + AI 命中」。</p>`;
  },

  todo: () => {
    return `<b>提交前必须做的三件事：</b><br>
① <b>先确认通勤口径的边界。</b>本报告按「步行 / 地铁取最快 ≤${R.student.maxCommute} 分钟」算，<b>没有计入公交</b>——家长说的「公交 + 地铁 + 步行」里，凡是靠公交才成立的路线，请自己用 Google Maps / 实物车票实测一次；尤其 ${names(AT_CAP)} 正好 ${gate(AT_CAP[0].name)} 分钟，没有缓冲；<br>
② <b>实地走一次 ${sn(A[0])} 的争议路段</b>（${(get(A[0]).walkRange || []).join(' vs ')} 分钟，本报告按最快端过闸），并确认 ${sn(SWIM_NEAR[0].name)} 的 Anchorvale 新校区位置；<br>
③ <b>开放日问清两件事</b>：${sn(A[0])} 的 Robotics 有没有选拔、Sec 1 名额多少（它排第 1 位）；以及余量 ${fmt(POOL_MAX)} 的几所，CCA 里的 Infocomm / Drama 是否真的向 Sec 1 开放。12 月本届 COP 出来后再核对一次余量。`;
  },
};

/** 供 step5Note 用的纯文本校名列表（不依赖外部 esc） */
function escNames(arr) { return arr.map(x => sn(x.name)).join('、'); }
/** picks[1] 里的对照校名 */
function escName(x) { return x ? sn(x.name) : '另一所'; }

const DETAIL = {
  [A[0]]: {
    feature: 'CCA <b>18 项</b>；2026-11-23 三方核实后 Robotics 与 English Drama 均由 MOE 当前登记确认，官网 DSA 页也列 Robotics Club。'
      + 'ALP 是 STEM - Future of Transportation（Aeronautics, Coding, Engineering and Sustainability），全池唯一把 Coding 写进项目名。',
    profile: '2000 年随盛港新镇建校，约 1,400 人。' + how(A[0])
      + '（' + (get(A[0]).walkMeters || '约 1,100') + ' 米，两家引擎争议 ' + (get(A[0]).walkRange || []).join('–') + ' 分钟，最快口径按 '
      + gate(A[0]) + ' 分钟过闸）。',
    verdict: '<b>适合：</b>机器人与戏剧两项兴趣都有实体社团，通勤最短，综合分全池第一。<br>'
      + '<b>不适合：</b>余量 ' + mOf(A[0]) + '，PR 同分让位公民；争议路段未实地走过；官网没有完整 CCA 清单页，社团活跃度需现场确认。',
  },
  [A[1]]: {
    feature: 'CCA 11 项，含 Infocomm Technology (Media Production)，AI 方向有社团承接。'
      + 'ALP 是 Business &amp; Entrepreneurship（Fostering Innovation through Design Thinking），LLP 是 YUYING C.A.R.E.S。',
    profile: '榜鹅邻里中学。' + how(A[1]) + '，是余量 ' + fmt(POOL_MAX) + ' 的四所里通勤最短的一所。全程步行约 ' + get(A[1]).walkMinutes + ' 分钟不现实。',
    verdict: '<b>适合：</b>余量 ' + mOf(A[1]) + ' 属主池最高档，通勤 ' + gate(A[1])
      + ' 分钟仍有缓冲；Infocomm 命中 AI 兴趣。<br>'
      + '<b>不适合：</b>没有戏剧 / 游泳 / 烹饪社团；ALP 偏设计与商业，不是 Computing；地铁需换乘，高峰期要实测。',
  },
  [A[2]]: {
    feature: 'CCA 13 项（官网口径，MOE 登记 8 项），含 English Drama；ALP 是 STEM - Emerging Technologies，LLP 是 Community Youth Leadership。',
    profile: '较大型邻里中学。' + how(A[2]) + '；全程步行约 ' + get(A[2]).walkMinutes + ' 分钟，只能坐车。',
    verdict: '<b>适合：</b>余量 ' + mOf(A[2]) + ' 属最高档，戏剧有社团承接。<br>'
      + '<b>不适合：</b>机器人、游泳、烹饪无证据；CCA 官网与 MOE 登记数不一致，完整清单需现场问。',
  },
  [A[3]]: {
    feature: 'CCA 11 项，含 Infocomm Technology (Media Production)；ALP 是 STEM - Health and Food Science（Chemical and Applied Sciences / Fragrance）。',
    profile: '后港一带社区中学。' + how(A[3]) + '；LLP 是 i-LEAD @ Bartley。',
    verdict: '<b>适合：</b>余量 ' + mOf(A[3]) + ' 属匹配档，AI 方向有社团。<br>'
      + '<b>不适合：</b>没有戏剧 / 机器人 / 游泳社团；ALP 是香料化学，与 Computing 关系弱。',
  },
  [A[4]]: {
    feature: 'CCA 16 项（官网 16 / MOE 10），含 ELDDS（English Language Drama and Debating）；ALP 是 STEM（HS Innovates, For Life!）。',
    profile: '后港邻里中学。' + how(A[4]) + '；全程步行约 ' + get(A[4]).walkMinutes + ' 分钟。',
    verdict: '<b>适合：</b>余量 ' + mOf(A[4]) + '，戏剧有落点，通勤 ' + gate(A[4]) + ' 分钟。<br>'
      + '<b>不适合：</b>机器人与游泳无社团证据；余量不大，不能当兜底。',
  },
  [A[5]]: {
    feature: 'CCA <b>20 项</b>（官网 21 项，差额只是 Volleyball 按男女分列），英语 / 印度语 Drama &amp; Debating 双线；'
      + 'Shooting（射击）在中学里不常见。',
    profile: '榜鹅较新邻里中学，ALP 是 STEM - Sustainability，LLP 是社区青年领导力。' + how(A[5]) + '。',
    verdict: '<b>适合：</b>通勤 ' + gate(A[5]) + ' 分钟在主池里第二短，戏剧落点最扎实。<br>'
      + '<b>不适合：</b>余量只有 ' + mOf(A[5]) + '；机器人 / 游泳 / 烹饪无证据；地铁需换乘。',
  },
  'Greendale Secondary School': {
    feature: 'CCA <b>21 项</b>；Robotics 与 English Drama 由 MOE 当前登记与官网双侧确认。ALP 是 STEM - Sustainability，LLP 是 Sports &amp; Outdoor Education。',
    profile: '盛港邻里中学。' + how('Greendale Secondary School') + '；孩子 {{score}} 分差 ' + Math.abs(get('Greendale Secondary School').margin) + ' 分。',
    verdict: '<b>适合：</b>机器人 + 戏剧双命中，通勤 ' + gate('Greendale Secondary School') + ' 分钟也够快，兴趣是全池最对的之一。<br>'
      + '<b>不适合：</b>COP ' + cOf('Greendale Secondary School') + '，孩子 {{score}} 分高于去年上限 '
      + Math.abs(get('Greendale Secondary School').margin) + ' 分；PR 同分劣势叠加，只能冲刺不能兜底。',
  },
  'Yusof Ishak Secondary School': {
    feature: 'CCA <b>20 项</b>；Robotics、Infocomm Technology、English Language Drama and Debating 三项全命中。ALP 是 STEM - Sustainability。',
    profile: '榜鹅年轻学校，全岛唯一以总统命名。' + how('Yusof Ishak Secondary School')
      + '（争议 ' + (get('Yusof Ishak Secondary School').walkRange || []).join('–') + ' 分钟，最快端过闸）。',
    verdict: '<b>适合：</b>兴趣三项全命中，通勤全省最短（' + gate('Yusof Ishak Secondary School') + ' 分钟）。<br>'
      + '<b>不适合：</b>COP ' + cOf('Yusof Ishak Secondary School') + '，差 '
      + Math.abs(get('Yusof Ishak Secondary School').margin) + ' 分；PR 同分再让位公民。',
  },
  'Outram Secondary School': {
    feature: '1977 年建成游泳池，<b>全池唯一 Swimming / Water Polo 落点</b>。CCA 核实后 MOE 14 项 / 并集 17 项（旧版「只有 6 项」作废）。',
    profile: '1906 年创办的老校，2026 年迁入盛港 Anchorvale 新校区，York Hill 旧校区 2027 年底关闭，双校区过渡期。'
      + how('Outram Secondary School') + '。',
    verdict: '<b>适合：</b>第 4 兴趣游泳唯一落点，通勤 ' + gate('Outram Secondary School') + ' 分钟。<br>'
      + '<b>不适合：</b>分数差 ' + Math.abs(get('Outram Secondary School').margin)
      + ' 分只能冲刺；机器人 / 烹饪无证据；English Drama 只见于开放日 microsite；双校区过渡期活动可能摊薄。',
  },
  'Broadrick Secondary School': {
    feature: 'CCA 10 项，含 Infocomm Technology (Media Production) 与 Shooting；ALP 是 STEM - Sustainability（Sustainability in Broadrick）。',
    profile: '大巴窑一带邻里中学。' + how('Broadrick Secondary School') + '，正好压在上限。',
    verdict: '<b>适合：</b>余量 ' + mOf('Broadrick Secondary School') + ' 属最高档，AI 方向有社团。<br>'
      + '<b>不适合：</b>通勤 ' + gate('Broadrick Secondary School') + ' 分钟没有任何缓冲，且公交未计入模型；没有戏剧 / 机器人社团。',
  },
  'Guangyang Secondary School': {
    feature: 'CCA 8 项，含 Infocomm Technology (Media Production)；ALP 是 STEM - Sustainability。',
    profile: '大巴窑 / 后港一带邻里中学。' + how('Guangyang Secondary School') + '，正好压在上限。',
    verdict: '<b>适合：</b>余量 ' + mOf('Guangyang Secondary School') + ' 属最高档，AI 方向有社团。<br>'
      + '<b>不适合：</b>通勤 ' + gate('Guangyang Secondary School') + ' 分钟贴线、无缓冲；CCA 项数全池偏少，戏剧 / 机器人无证据。',
  },
  'North Vista Secondary School': {
    feature: 'CCA 18 项，Drama Club 与 Infocomm Technology (Media Production) 同时存在；LLP 是 Visual Arts &amp; Design。',
    profile: '盛港 / 后港交界社区型中学。' + how('North Vista Secondary School') + '。',
    verdict: '<b>适合：</b>余量 ' + mOf('North Vista Secondary School') + '，戏剧与 AI 两条线都有社团。<br>'
      + '<b>不适合：</b>踩线，PR 同分劣势下不能当稳位；ALP 名为 Farm-to-Table，实质农业与食品，与 Computing 关系弱。',
  },
};

module.exports = { PLANS, DETAIL };
