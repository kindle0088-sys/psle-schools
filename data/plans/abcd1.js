/**
 * abcd1 的六志愿设计与逐校判断
 *
 * 画像：AL 18 / PR / 828765 / 不换乘公交+步行 或 纯步行 ≤60 / 混校 / 无附属
 * 与 abc6 同为 AL 18 + 同址 + 同兴趣，但通勤口径完全不同：
 *   abc6 = 步行/地铁取最快 ≤40；abcd1 = Twin Waterfalls 站 65431 上车、不换乘公交+步行 或 纯步行 ≤60。
 * 后果：主池 18 所，其中 18 所靠公交入池、0 所靠纯步行；地铁不认，
 *      因此 abc6 里的 Bendemeer / Bartley 这批「地铁可达」学校在本版被淘汰。
 *
 * ⚠️ 所有数字从 data/_recommend-abcd1.json 现算，不写死校名与分数以外的判断。
 */
const R = require('../_recommend-abcd1.json');
const ALL = [...R.pool, ...R.outOfReach, ...R.singleSex];
const get = n => ALL.find(x => x.name === n);
const sn = n => n.replace(/ Secondary School| \(Secondary\)/, '');
const fmt = m => (m == null ? '—' : m > 0 ? '+' + m : String(m));
const mOf = n => { const x = get(n); return x ? fmt(x.margin) : '—'; };
const cOf = n => { const x = get(n); return x && x.cop ? x.cop.min + '–' + x.cop.max : '—'; };
const gate = n => { const x = get(n); return x ? x.minutes : '—'; };
const hit = (x, k) => !!x && (x.ccaHits || []).includes(k);
const names = arr => arr.map(x => sn(x.name)).join('、');
const escNames = arr => names(arr);
/** 本口径下的通勤文案：公交校写线路与站序，纯步行校写分钟 */
const how = n => {
  const x = get(n);
  if (!x) return '—';
  return x.commuteMode === 'bus'
    ? `公交 ${x.busMinutes} 分（${x.busService}，${x.busHops} 站，下车走 ${x.busWalkMinutes} 分）`
    : `步行 ${x.walkUpperMinutes != null ? x.walkUpperMinutes : x.walkMinutes} 分`;
};

const A = [
  'Compassvale Secondary School',   // 主池唯一机器人 + 戏剧双命中
  'North Vista Secondary School',   // 唯一 AI + 戏剧双命中
  'Junyuan Secondary School',       // 余量最高档中最短通勤
  'Hougang Secondary School',       // 戏剧命中，32 分通勤
  'Punggol Secondary School',       // 21 分钟，戏剧命中
  'Seng Kang Secondary School',     // 26 分钟，戏剧命中
];

const POOL_MAX = Math.max(...R.pool.map(x => x.margin));
const POOL_MIN = Math.max(...R.pool.map(x => x.margin).filter(m => m <= 0));
const MAX_POOL = R.pool.filter(x => x.margin === POOL_MAX).sort((a, b) => a.busMinutes - b.busMinutes);
const REACH_N = R.pool.filter(x => x.margin <= 2).length;
const MATCH_N = R.pool.filter(x => x.margin >= 3 && x.margin <= 5).length;
const SAFE_N = R.pool.filter(x => x.margin >= 6).length;
const ROBOT_POOL = R.pool.filter(x => hit(x, '机器人'));
const DRAMA_POOL = R.pool.filter(x => hit(x, '戏剧'));
const AI_POOL = R.pool.filter(x => hit(x, 'AI'));
const NEAR_POOL = R.pool.filter(x => x.busMinutes <= 35).sort((a, b) => a.busMinutes - b.busMinutes);
const FAR_SAFE = MAX_POOL.filter(x => x.busMinutes >= 45).sort((a, b) => a.busMinutes - b.busMinutes);
const ROBOT_NEAR = R.outOfReach
  .filter(x => hit(x, '机器人') && x.busMinutes <= R.student.maxCommute)
  .sort((a, b) => b.margin - a.margin);
const SWIM_NEAR = R.outOfReach.filter(x => hit(x, '游泳') && x.busMinutes <= R.student.maxCommute);
const DRAMA_CUT = R.outOfReach.filter(x => hit(x, '戏剧') && x.busMinutes <= R.student.maxCommute);
const BUS_IN_POOL = R.pool.filter(x => x.commuteMode === 'bus');
const WALK_IN_POOL = R.pool.filter(x => x.commuteMode === 'walk');
const C_PICK_NAMES = [A[0], 'Outram Secondary School', 'Greendale Secondary School', A[1], A[2], A[4]];
const C_DROPPED = A.filter(n => !C_PICK_NAMES.includes(n));
const B_PICK_NAMES = [A[0], A[2], 'Springfield Secondary School', 'Serangoon Garden Secondary School',
  'Changkat Changi Secondary School', 'Northbrooks Secondary School'];
const B_DROPPED = A.filter(n => !B_PICK_NAMES.includes(n));

const PLANS = {
  hero: ({ S, esc }) => {
    return 'AL <b>' + S.score + '</b> 分 · ' + S.pgShort + ' · 邮编 ' + esc(S.postal)
      + ' · <b>不换乘公交 / 纯步行</b>上限 ' + S.maxCommute + ' 分钟 · <b>永久居民（PR）</b>。\n'
      + '从 <b>Twin Waterfalls 公交站（65431）</b>出发，同时满足「能到」和「分数够得着」的有 <b>' + R.pool.length
      + ' 所</b>，余量 ' + fmt(POOL_MIN) + ' 到 ' + fmt(POOL_MAX) + '：' + REACH_N + ' 所在 0–2 分冲刺档，'
      + MATCH_N + ' 所在 3–5 分相对稳档，≥6 分<b>一所都没有</b>。\n'
      + '口径很关键：这 ' + R.pool.length + ' 所里 <b>' + BUS_IN_POOL.length + ' 所靠不换乘公交入池，'
      + WALK_IN_POOL.length + ' 所靠纯步行</b>；地铁再快也不认，所以 abc6 靠地铁进来的 Bendemeer、Bartley 这批在本版被砍掉。\n'
      + '<b>先说结论：第 1 位放唯一「机器人 + 戏剧」双命中的 ' + esc(sn(A[0])) + '（余量 '
      + mOf(A[0]) + '，' + how(A[0]) + '）；第 2 位放唯一「AI + 戏剧」双命中的 '
      + esc(sn(A[1])) + '；第 3 位放余量 ' + fmt(POOL_MAX) + ' 档里通勤最短的 '
      + esc(sn(MAX_POOL[0].name)) + '。孩子是 PR，同分输公民——踩线校不能当兜底。</b>\n'
      + '<b>边界：</b>公交时间按「候车 ' + R.stats.busParams.waitMin + ' 分 + 车内 '
      + R.stats.busParams.rideMinPerStop + ' 分/站 + 下车步行」估算，不是实时到站；只从 65431 单一站上车，'
      + '马路对面反向站不纳入，全程不换乘。';
  },

  intro: ({ S, esc }) => {
    return '这份画像和 abc6 同为 AL 18、同址、同兴趣，但通勤口径换了，池子不是一个量级：<br>'
      + '① <b>入口换了</b>：起点是 Twin Waterfalls 站（65431），只认不换乘公交 + 步行或纯步行。'
      + R.pool.length + ' 所主池里 ' + BUS_IN_POOL.length + ' 所靠公交，' + WALK_IN_POOL.length
      + ' 所靠步行；<b>没有一所是靠地铁入池的</b>。<br>'
      + '② <b>地铁口径被砍掉 ' + R.stats.busCutCount + ' 所</b>：'
      + esc(names(R.stats.busCutDetail.slice(0, 4).map(x => ({ name: x.name }))))
      + ' 这些地铁 30 多分钟能到的学校，在本报告里全部不算可达。<br>'
      + '③ <b>分数现实没变</b>：通勤可达却分数出局的仍有 ' + R.outOfReach.length + ' 所，'
      + (ROBOT_NEAR.length ? esc(names(ROBOT_NEAR)) + ' 分别差 '
        + ROBOT_NEAR.map(x => Math.abs(x.margin)).join(' / ') + ' 分' : '机器人校仍够不着')
      + '；游泳唯一落点 ' + (SWIM_NEAR.length ? esc(sn(SWIM_NEAR[0].name)) + ' 差 '
        + Math.abs(SWIM_NEAR[0].margin) + ' 分' : '本口径下不可达') + '。<br>'
      + '④ <b>真正的取舍</b>：余量 ' + fmt(POOL_MAX) + ' 的 ' + MAX_POOL.length + ' 所通勤都在 '
      + FAR_SAFE[0].busMinutes + ' 分钟以上，而 ' + NEAR_POOL.length + ' 所 35 分钟内的学校余量多在 0–2 分。'
      + '<b>这是「近但踩线」与「远一点但相对稳」之间的选择，不是「好学校 vs 差学校」。</b>';
  },

  step2Note: ({ S, S2 }) => {
    return '孩子 ' + S.score + ' 分属 PG3，全国够得着 ' + S2.reachableNationwide + ' 所；'
      + '把「不换乘公交 / 纯步行 ≤' + S.maxCommute + ' 分钟」当硬约束后，主池只剩 <b>' + R.pool.length
      + ' 所</b>，通勤跨度 ' + Math.min(...R.pool.map(x => x.minutes)) + '–'
      + Math.max(...R.pool.map(x => x.minutes)) + ' 分钟、余量 ' + fmt(POOL_MIN) + ' 到 ' + fmt(POOL_MAX)
      + '。注意这不是「少了几所」，而是<b>整条地铁可达线被切掉了</b>——'
      + S2.busCutCount + ' 所分数够得着、地铁也够快的学校因此出局。'
      + '反过来说，留下的 ' + R.pool.length + ' 所是真正符合家长口径的，不需要再打折。';
  },

  step3Note: ({ S }) => {
    const top = MAX_POOL[0];
    return '这张表最容易被误读的是「余量最大 = 录取稳」：<b>' + sn(top.name) + ' 的 ' + fmt(top.margin)
      + ' 也只是相对宽</b>——PR 同分让位公民，≥6 分的明显稳档本案例是空的。'
      + 'COP 每年浮动 1–2 分很常见，' + fmt(top.margin) + ' 随时可能缩到 ' + fmt(top.margin - 1)
      + '。而且它的通勤是 ' + how(top.name) + '，几乎贴着 ' + S.maxCommute + ' 分钟上限；'
      + '真正近的学校余量反而薄。'
      + (ROBOT_NEAR.length ? '<br><br>' + escNames(ROBOT_NEAR) + ' 差 '
        + ROBOT_NEAR.map(x => Math.abs(x.margin)).join(' / ') + ' 分，'
        + '不是「再努力一点」，是今年的区间上限就低于孩子的 ' + S.score + ' 分。' : '');
  },

  step5Note: ({ S }) => {
    return '<b>这一版的池子 ' + R.pool.length + ' 所，档位分布是：冲刺（0–2）' + REACH_N
      + ' 所、匹配（3–5）' + MATCH_N + ' 所、稳妥（≥6）' + SAFE_N + ' 所。</b><br><br>'
      + '也就是说，<b>「有得挑」不等于「挑得到稳的」</b>：相对最可能中的是余量 ' + fmt(POOL_MAX)
      + ' 的 ' + MAX_POOL.length + ' 所，但它们通勤都在 ' + FAR_SAFE[0].busMinutes + ' 分钟以上；'
      + '35 分钟内的 ' + NEAR_POOL.length + ' 所里，余量最高也只有 '
      + fmt(Math.max(...NEAR_POOL.map(x => x.margin))) + ' 分。'
      + '<br><br>孩子是 PR，同分让位公民，这个缓冲要比公民家庭看得更保守。'
      + '<b>没有任何一所可以当真正的兜底。</b>提交前必须和家人确认两件事：'
      + '① 六个都落空就接受 MOE 分配；② 12 月本届 COP 出来后再核对余量。';
  },

  A: {
    title: '方案 A · 近距离 + 兴趣优先（PR 推荐）',
    desc: '前两位拿唯一的双命中社团，后四位取 21–32 分钟的近校，用通勤余量对冲分数余量不足',
    picks: [
      {
        name: A[0], slot: 1, tier: '冲刺',
        why: '<b>主池唯一同时命中机器人与戏剧的学校</b>，综合分 ' + get(A[0]).total + ' 全池第一；'
          + how(A[0]) + '，是主池最短通勤之一。余量 ' + mOf(A[0]) + '，放第 1 位不损失后面任何志愿。',
        risk: 'COP ' + cOf(A[0]) + '，孩子 {{score}} 分<b>正好压在上限</b>，PR 同分让位公民；'
          + '全程步行 ' + get(A[0]).walkMinutes + ' 分钟（争议项 ' + (get(A[0]).walkRange || []).join('–')
          + '），本方案按公交 21 分钟过闸，实际班次要实测。',
      },
      {
        name: A[1], slot: 2, tier: '冲刺',
        why: '<b>主池唯一同时命中 AI 与戏剧的学校</b>；' + how(A[1])
          + '，下车步行仅 ' + get(A[1]).busWalkMinutes + ' 分钟。余量 ' + mOf(A[1]) + '，兴趣匹配度最高。',
        risk: '余量为 0，PR 同分劣势下不能视为稳位；机器人、游泳、烹饪没有社团证据；'
          + '公交 ' + get(A[1]).busService + ' 坐 ' + get(A[1]).busHops + ' 站，高峰期车内时间会拉长。',
      },
      {
        name: A[2], slot: 3, tier: '匹配',
        why: '余量 <b>' + mOf(A[2]) + '</b>（' + fmt(POOL_MAX) + ' 为全池最高档），' + how(A[2])
          + '，是这一档里通勤最短的；CCA 命中 AI，ALP 是 ' + (get(A[2]).alpCats || []).join(' / ') + '。',
        risk: '没有戏剧 / 机器人 / 游泳社团；公交 ' + get(A[2]).busService + ' 坐 ' + get(A[2]).busHops
          + ' 站、下车再走 ' + get(A[2]).busWalkMinutes + ' 分钟，总时长接近半小时。',
      },
      {
        name: A[3], slot: 4, tier: '冲刺',
        why: '余量 ' + mOf(A[3]) + '；' + how(A[3]) + '。CCA 命中戏剧，ALP 是 '
          + (get(A[3]).alpCats || []).join(' / ') + '。通勤与兴趣兼顾。',
        risk: '余量只有 ' + mOf(A[3]) + '，不能当兜底；机器人、AI、游泳无社团证据；'
          + '全程步行 ' + get(A[3]).walkMinutes + ' 分钟不现实，靠公交才成立。',
      },
      {
        name: A[4], slot: 5, tier: '冲刺',
        why: '全程 <b>' + how(A[4]) + '</b>，是主池第二短通勤；余量 ' + mOf(A[4])
          + '，CCA 命中戏剧。放后位是因为可选学校里更对口的已占满前位。',
        risk: '余量 ' + mOf(A[4]) + '，PR 同分劣势下不是稳位；机器人 / AI / 游泳无证据。',
      },
      {
        name: A[5], slot: 6, tier: '冲刺',
        why: how(A[5]) + '、余量 ' + mOf(A[5]) + '，戏剧有落点；' + (get(A[5]).alpCats || []).join(' / ')
          + ' 与孩子 Science / Computing 兴趣方向相近。',
        risk: '余量只有 ' + mOf(A[5]) + '；AI、机器人、游泳无社团证据。'
          + '它排末位不是因为差，是因为前五位已把更对口的名额占完。',
      },
    ],
  },

  B: {
    title: '方案 B · 余量优先（接受长通勤）',
    desc: '把 ' + '余量 ' + fmt(POOL_MAX) + ' 的远距离学校集中到第 3–6 位，用时间换安全边际',
    picks: B_PICK_NAMES.map((name, i) => ({ name, slot: i + 1 })),
  },

  C: {
    title: '方案 C · 机器人 / 游泳冲刺',
    desc: '保留游泳唯一落点与两所机器人出局校做冲刺位，后三位仍用主池学校承接',
    picks: C_PICK_NAMES.map((name, i) => ({ name, slot: i + 1 })),
  },

  focusPair: ROBOT_NEAR.length ? [ROBOT_NEAR[0].name, ...SWIM_NEAR.map(x => x.name)].slice(0, 2)
    : R.pool.slice().sort((a, b) => b.total - a.total).slice(0, 2).map(x => x.name),

  finalAdvice: () => {
    return `<h3>如果这是我的孩子，我会这样填</h3>
<p>方案 A 的 6 个位置按四条判断排，不是按综合分排：</p>
<ul>
<li><b>第 1 位给唯一的机器人 + 戏剧落点。</b>${sn(A[0])} 综合分 ${get(A[0]).total} 全池第一，${how(A[0])}；余量 ${mOf(A[0])} 是踩线，但 S1 按志愿顺序检索——放第 1 位不会伤害后面任何志愿。</li>
<li><b>第 2 位给唯一的 AI + 戏剧落点。</b>${sn(A[1])} 余量 ${mOf(A[1])}，${how(A[1])}，下车步行只有 ${get(A[1]).busWalkMinutes} 分钟。孩子五项兴趣里前四项有两项在这里落地。</li>
<li><b>第 3 位放「余量最高档里最短通勤」。</b>${sn(A[2])} 余量 ${mOf(A[2])}、${how(A[2])}。对 PR 来说，这比「兴趣全中但踩线」更值钱。</li>
<li><b>第 4–6 位放 21–32 分钟的戏剧校。</b>${names([get(A[3]), get(A[4]), get(A[5])])} 通勤 ${gate(A[3])} / ${gate(A[4])} / ${gate(A[5])} 分钟，余量 ${mOf(A[3])} / ${mOf(A[4])} / ${mOf(A[5])}。它们不是兜底，只是「前面都落空时至少还有选择」。</li>
<li><b>游泳和机器人冲刺校放在方案 C 里谈。</b>${SWIM_NEAR.length ? sn(SWIM_NEAR[0].name) + ' 是唯一游泳落点（差 ' + Math.abs(SWIM_NEAR[0].margin) + ' 分）；' : ''}${ROBOT_NEAR.length ? names(ROBOT_NEAR) + ' 差 ' + ROBOT_NEAR.map(x => Math.abs(x.margin)).join(' / ') + ' 分' : '机器人校分数仍不够'}。选 C 是拿前位押小概率，换兴趣全覆盖。</li>
</ul>
<p><b>为什么不默认选方案 B：</b>B 把 ${B_PICK_NAMES.length - 2} 所余量 ${fmt(POOL_MAX)} 的学校放进第 3–6 位，代价是通勤拉到 ${FAR_SAFE[0].busMinutes}–${FAR_SAFE[FAR_SAFE.length - 1].busMinutes} 分钟，几乎贴着 ${R.student.maxCommute} 分钟上限；而且其中 ${FAR_SAFE.filter(x => !(x.ccaHits || []).length).length} 所对这五项 CCA 兴趣零命中。<b>安全边际是真的，但每天往返多花的时间也是真的。</b></p>
<p><b>为什么不默认选方案 C：</b>C 用 ${names(C_DROPPED.map(get))} 换进 ${ROBOT_NEAR.length ? names(ROBOT_NEAR.slice(0, 1)) : '分数出局的机器人校'}${SWIM_NEAR.length ? '与 ' + sn(SWIM_NEAR[0].name) : ''}，兴趣更完整，但前四位里有 ${C_PICK_NAMES.filter(n => get(n) && get(n).margin < 0).length} 所分数不够，PR 同分劣势叠加，命中率明显下降。<b>除非机器人 / 游泳是孩子的强意愿，否则 A 更平衡。</b></p>
<p class="soft">注：综合分排名与志愿顺序并不完全一致，这是刻意的——综合分衡量「对这个孩子多合适」，志愿顺序衡量「落空风险 + 兴趣保留」。</p>`;
  },

  todo: () => {
    const cap = R.pool.filter(x => x.busMinutes >= R.student.maxCommute - 5).sort((a, b) => b.margin - a.margin);
    return `<b>提交前必须做的三件事：</b><br>
① <b>先实测公交，不是查地图。</b>本报告按候车 ${R.stats.busParams.waitMin} 分 + 车内 ${R.stats.busParams.rideMinPerStop} 分/站估算，只从 Twin Waterfalls（65431）单向、不换乘。请用实际车票在早高峰走一次 ${sn(A[0])} 与 ${sn(A[2])} 的路线；${cap.length ? '尤其 ' + escNames(cap.slice(0, 2)) + ' 已贴到 ' + R.student.maxCommute + ' 分钟上限，没有缓冲。' : ''}<br>
② <b>确认反向站是否可用。</b>马路对面的 Blk 220C（65439）按家长口径不纳入；如果每天其实会走到那一侧上车，候选池会变大，这份报告的池子就不适用，需要重算。<br>
③ <b>开放日问清社团分配</b>：${sn(A[0])} 的 Robotics、${sn(A[1])} 的戏剧与 Infocomm 是否向 Sec 1 开放、有没有选拔与名额；12 月本届 COP 公布后再核对一次余量——本池没有 ≥6 分的稳位，这一步不能省。`;
  },
};

/** 逐校卡片补充：只用已核实的 CCA 命中与 ALP 字段，不臆造数字 */
const DETAIL = {};
for (const n of [...A, ...C_PICK_NAMES, ...B_PICK_NAMES]) {
  const x = get(n);
  if (!x) continue;
  const hits = (x.ccaHits || []);
  DETAIL[n] = {
    feature: (hits.length ? '兴趣命中：<b>' + hits.join(' / ') + '</b>。' : '五项 CCA 兴趣没有直接命中。')
      + ((x.alpCats || []).length ? 'ALP 类别：' + (x.alpCats || []).join(' / ') + '。' : ''),
    profile: sn(n) + '，PG3 区间 ' + cOf(n) + '，' + how(n)
      + '；全程纯步行 ' + (x.walkMinutes != null ? x.walkMinutes + ' 分钟' : '无数据') + '。',
    verdict: '<b>适合：</b>余量 ' + mOf(n) + '，通勤 ' + gate(n) + ' 分钟'
      + (hits.length ? '，' + hits.join(' / ') + ' 有社团承接' : '') + '。<br>'
      + '<b>不适合：</b>' + (x.margin <= 0
        ? '踩线，PR 同分让位公民，不能当兜底'
        : '余量仍不到 6 分，COP 浮动 1–2 分就会缩窄')
      + (x.busMinutes >= 50 ? '；通勤超过 50 分钟，往返时间长' : '')
      + (hits.length < 2 ? '；兴趣命中有限' : '') + '。',
  };
}

module.exports = { PLANS, DETAIL };
