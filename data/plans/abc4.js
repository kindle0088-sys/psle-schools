/**
 * abc4 的六志愿设计与逐校判断
 *
 * 背景完全沿用 abc3（AL15 / 828765 / 混校 / 无附属 / 无 DSA / 兴趣同 abc1），
 * 只有两处变化：
 *   ① 通勤从「只认全程步行 ≤40 分钟」放开为「步行/地铁取最快 ≤60 分钟」
 *      → 候选池从 7 所暴涨到 54 所（数据见 data/_recommend-abc4.json）
 *   ② 学生是 PR → tie-breaker 同分输给公民，安全边际要比公民留得更厚
 *
 * 所以本报告的判断与 abc3 完全反过来：
 *    abc3 问「7 所里没有兜底校，6 个位置怎么排」；
 *    abc4 问「54 所里一大把余量 +7 的学校，怎么用足这个安全池、又不丢掉机器人兴趣」。
 *
 * ⚠️ 口径边界：家长表述是「公交/地铁加步行不超过 60 分钟」，
 *    但项目通勤数据只有步行路网 + MRT 地铁模型，没有独立公交数据。
 *    本报告按「步行/地铁取最快」实现，不假装算进了公交 —— 这点在正文与 hero 都写明。
 */

const PLANS = {
  hero: ({ S, S2, esc, R }) => {
    const safe = R.pool.filter(x => x.margin >= 6).length;
    const robot = R.pool.filter(x => (x.ccaHits || []).includes('机器人'));
    const maxMargin = Math.max(...R.pool.map(x => x.margin));
    return 'AL <b>' + S.score + '</b> 分 · ' + S.pgShort + ' · 邮编 ' + esc(S.postal)
      + ' · <b>步行 / 地铁取最快 ≤ ' + S.maxCommute + ' 分钟</b> · <b>永久居民（PR）</b>。\n'
      + '放开通勤后，够得着的混校从 abc3 的 7 所变成 <b>' + R.pool.length + ' 所</b>，'
      + '其中 <b>' + safe + ' 所余量 ≥6 分</b>（最高 +' + maxMargin + '）——'
      + '<b>这是一个“有充足兜底”的池子</b>，和上一版“没有一所稳妥校”是完全不同的局面。\n'
      + '但孩子是 <b>PR</b>：同分时排在公民之后。<b>先说结论：Using 余量 ≥3 的学校做主体、'
      + '把两所“真有机器人社团”的踩线校放在冲刺位</b>，既不浪费安全池，也不丢掉第 1 兴趣。'
      + (robot.length ? '全池机器人社团只有 ' + robot.length + ' 所（' + robot.map(x => esc(shortName(x.name))).join('、') + '），这是“过了这村没这店”的东西。' : '');
  },

  intro: ({ S, S2, R }) => {
    const safe = R.pool.filter(x => x.margin >= 6).length;
    const robot = R.pool.filter(x => (x.ccaHits || []).includes('机器人'))
      .map(x => shortName(x.name) + ' +' + x.margin).join('、');
    return '通勤口径一放开，最该警惕的不是“选不到”，而是<b>被 54 所的数量淹没</b>。'
      + '这里把取舍拆成两句话：<br>'
      + '① <b>安全池很厚</b>——余量 ≥6 分的有 ' + safe + ' 所，PR 同分劣势完全可以靠“多留 3–4 分”对冲；'
      + '② <b>兴趣很稀缺</b>——机器人社团全池只有 ' + (robot || '0 所') + '，而且余量都极低。'
      + '<b>所以正确策略是“主体用厚的、冲刺给稀缺的”</b>，不是把 6 个位置全押在踩线校上。';
  },

  step2Note: ({ S, S2, R }) => {
    return '孩子 ' + S.score + ' 分属 PG3（4–20，越小越好）：全国 ' + S2.withStudentPG
      + ' 所有 PG3 档的学校里，区间右端 ≥ ' + S.score + '、也就是够得着的有 <b>' + S2.reachableNationwide
      + ' 所</b>（约 ' + Math.round(S2.reachableNationwide / S2.withStudentPG * 100) + '%）。'
      + '再叠加通勤 ≤' + S.maxCommute + ' 分钟这一条，落到 <b>' + S2.withinCommuteReachable + ' 所</b>；'
      + '其中混校 <b>' + S2.poolMixed + ' 所</b>进入主池。'
      + '<br><br>值得注意的是：<b>这 ' + S2.poolMixed + ' 所里余量 ≥6 的就有 '
      + R.pool.filter(x => x.margin >= 6).length + ' 所</b>——安全边际不是稀缺资源，'
      + '真正稀缺的是“同时满足兴趣 + 短通勤 + 高余量”的交叉项。这才是这份报告要解决的问题。';
  },

  step3Note: ({ S2, R, esc }) => {
    const safest = R.pool.slice().sort((a, b) => b.margin - a.margin)[0];
    const robot = R.pool.filter(x => (x.ccaHits || []).includes('机器人'));
    return '54 所里余量最高的是 <b>' + esc(shortName(safest.name)) + '</b>（+' + safest.margin
      + ' 分，' + safest.minutes + ' 分钟通勤）。但“余量最大”不等于“最该填”——'
      + '很多 +7 的学校在 50 分钟开外，且兴趣零命中。<br>'
      + '本报告把候选按三条线看：<b>① 余量 ≥4 且通勤 ≤35 分钟</b>（PR 视角的真安全档）；'
      + '<b>② 有机器人 / 戏剧社团的</b>（兴趣承接）；'
      + '<b>③ 踩线但通勤极短的</b>（冲刺位）。'
      + (robot.length ? '机器人社团全池只有 ' + robot.length + ' 所，且余量分别是 '
        + robot.map(x => '+' + x.margin).join(' / ') + '——都属冲刺级。' : '');
  },

  A: {
    title: '方案 A · 安全优先（PR 推荐）',
    desc: '主体用余量 ≥4 且通勤 ≤35 分钟的“厚安全档”，前两位留给唯一有机器人社团的踩线校',
    picks: [
      {
        name: 'Greendale Secondary School',
        slot: 1,
        tier: '冲刺',
        why: '全池<b>机器人社团两所之一</b>（另一所是 Yusof Ishak），且有戏剧社团 Theatricks!——孩子的第 1 与第 3 兴趣都能落到实体社团。27 分钟步行可达，通勤也轻。放第 1 位：冲刺不占后面位置。',
        risk: '<b>余量只有 +1 分</b>（PG3 11–16，孩子 15）。COP 右端若从 16 收紧到 15 就落空；<b>孩子是 PR，同分还输给公民</b>——这是全方案里风险最高的一位，所以它只占冲刺位，不承担兜底功能。',
      },
      {
        name: 'Yusof Ishak Secondary School',
        slot: 2,
        tier: '冲刺',
        why: '<b>兴趣匹配全池第一：机器人 + 信息科技（AI 近似）+ 戏剧三项同时对上</b>，步行仅 8 分钟（争议上限 21 分钟），是“最短通勤 + 最全兴趣”的组合。',
        risk: '<b>余量 0 分</b>（PG3 7–15，去年末位就是 15 分）。踩线中的踩线，PR 同分再让位公民，实质是“抽签级”风险。第 2 位用它，代价是这一位基本不兜底。',
      },
      {
        name: 'Seng Kang Secondary School',
        slot: 3,
        tier: '稳妥',
        why: '<b>余量 +4，通勤仅 22 分钟</b>（地铁）——是“高余量 + 短通勤”的交叉点，且有 English Drama 承接戏剧兴趣。LLP 是 Sports &amp; Outdoor Education。PR 视角下，+4 的缓冲足以吸收同分让位。',
        risk: '没有机器人社团，科技类只有偏美术的 Art Club；ALP 是食品科技，与 Computing 关系弱。但作为承接位，它的“稳”比“兴趣全”更值钱。',
      },
      {
        name: 'North Vista Secondary School',
        slot: 4,
        tier: '稳妥',
        why: '<b>余量 +3，通勤 25 分钟</b>，且 <b>AI（信息科技）与戏剧两项兴趣同时命中</b>——是“有社团承接”的学校里余量最厚的一所。放第 4 位是安全与兴趣的最佳平衡。',
        risk: 'ALP 名为 Farm-to-Table，实质是农业食品，与 Computing 关系很弱（别被 STEM 类别名骗）。余量 +3 比 Seng Kang 薄 1 分，但换来了两项兴趣命中。',
      },
      {
        name: 'Bendemeer Secondary School',
        slot: 5,
        tier: '稳妥',
        why: '<b>全池总分第 1、余量 +7，通勤 34 分钟</b>——是“极厚安全边际”的代表。有戏剧社团（Modern Dance / Choir 一类表演艺术），ALP 是 STEM - Emerging Technologies。PR 家长要的“兜底”就是这种 +7 的学校。',
        risk: '通勤 34 分钟靠地铁（步行要 140 分钟，不现实），比前面几所长；机器人社团没有。但作为第 5 位的保险，+7 的余量是全场最厚的之一。',
      },
      {
        name: 'Yuying Secondary School',
        slot: 6,
        tier: '稳妥',
        why: '<b>余量 +7，通勤仅 28 分钟</b>（地铁）——是 +7 俱乐部里通勤最短的几所之一，信息科技社团命中 AI 兴趣近似。放第 6 位，给“前面全落空”买最后一层保险：既安全又不算远。',
        risk: 'ALP 是 Business &amp; Entrepreneurship（商科），与 STEM 方向不符；政府辅助学校，学费区间与政府校一致（PR 同费率）。没有机器人或戏剧社团。',
      },
    ],
    focusPair: ['Compassvale Secondary School'],
  },

  B: {
    title: '方案 B · 兴趣最大化',
    desc: '把有社团承接的踩线校全提到前面，接受更高的滑档概率——只适合“非机器人不读”的极端偏好',
    picks: [
      { name: 'Yusof Ishak Secondary School', slot: 1 },
      { name: 'Greendale Secondary School', slot: 2 },
      { name: 'North Vista Secondary School', slot: 3 },
      { name: 'Seng Kang Secondary School', slot: 4 },
      { name: 'Hougang Secondary School', slot: 5 },
      { name: 'Bendemeer Secondary School', slot: 6 },
    ],
  },

  C: {
    title: '方案 C · 通勤最短',
    desc: '优先 30 分钟内可达的学校，适合“每天通勤时间比社团更重要”的家庭',
    picks: [
      { name: 'Yusof Ishak Secondary School', slot: 1 },
      { name: 'Compassvale Secondary School', slot: 2 },
      { name: 'Seng Kang Secondary School', slot: 3 },
      { name: 'North Vista Secondary School', slot: 4 },
      { name: 'Yuying Secondary School', slot: 5 },
      { name: 'Punggol Secondary School', slot: 6 },
    ],
  },

  step5Note: ({ S2, R }) => {
    const safe6 = R.pool.filter(x => x.margin >= 6).length;
    const minM = Math.min(...R.pool.map(x => x.margin));
    const maxM = Math.max(...R.pool.map(x => x.margin));
    return '<b>这一版和 abc3 的最大不同：这里不缺“稳”。</b>'
      + S2.poolMixed + ' 所候选中余量从 +' + minM + ' 到 +' + maxM + '，'
      + '其中余量 ≥6 的有 <b>' + safe6 + ' 所</b>——PR 同分输公民的风险，'
      + '完全可以用“选余量 ≥3 的学校”来对冲。<br><br>'
      + '所以本报告的志愿策略回到常规做法：<b>前面 1–2 位冲刺（给稀缺的机器人社团）、'
      + '中间 2 位用“高余量 + 短通勤”承接、最后 2 位用 +7 的学校兜底</b>。'
      + '唯一要克制的是：<b>别把 6 个位置全填成 +7 的“安全校”</b>——那样机器人兴趣四年都没有落点，'
      + '而“安全”在 6 个位置里其实只要 2 个就够。';
  },

  finalAdvice: () => {
    return `<h3>如果这是我的孩子，我会这样填</h3>
<p>方案 A 的顺序是三条判断叠出来的：</p>
<ul>
<li><b>第 1–2 位给两所“真有机器人社团”的踩线校。</b>全池 54 所里，Robotics 只存在于 Greendale（+1）与 Yusof Ishak（0）。孩子第 1 兴趣是这个，不用前两位去争，四年就真的没有机器人社团可进。代价明确：这两所都是冲刺级，<b>而且孩子是 PR，同分输给公民，风险比公民家庭更高</b>——所以它们只占两位，不占后面。</li>
<li><b>第 3–4 位用“高余量 + 短通勤 + 有社团”的交叉项。</b>Seng Kang（+4 / 22 分钟 / 戏剧）和 North Vista（+3 / 25 分钟 / AI+戏剧）是全池最符合“PR 安全 + 兴趣承接”的两所。这两位是真正的承接位，必须选它们，不能选兴趣更搭但更险的。</li>
<li><b>第 5–6 位用两所 +7 的学校兜底。</b>Bendemeer（+7 / 34 分钟）和 Yuying（+7 / 28 分钟）是全池安全边际最厚的，Yuying 通勤还更短。落到这里说明前面都落空，此时“几乎肯定中”比“社团对口”更值钱。</li>
</ul>
<p><b>为什么不选方案 B：</b>B 把两所踩线校放前两位是对的，但把 Hougang 提到第 5 位、用 Bendemeer 兜第 6，等于把“+7 的保险”只留了 1 个。PR 家庭在同分段本来就让位公民，<b>只留 1 个 +7 太激进</b>；而且 Hougang 的余量只有 +5，谈不上比 A 的第 5–6 位更安全。</p>
<p><b>为什么不选方案 C：</b>C 把 Compassvale 提到第 2 位——它通勤最短（14 分钟），<b>2026-11-23 核实后已知有 Robotics 与 English Drama（18 项），兴趣并非零命中</b>；它没进方案 A 的唯一原因是步行 14 vs 25 分钟的分歧未实地验证，而不是社团不匹配。把 Punggol 放第 6 的问题是：余量 +4、戏剧命中，但机器人仍缺位，不如 Yuying 的 +7。</p>`;
  },

  todo: () => {
    return `<b>提交前必须做的三件事：</b><br>
① <b>确认 PR 身份的学费预算</b>：政府/政府辅助中学 PR 约 S$580–700/月（公民约 S$25/月），四年是笔实质开支；本池全是政府/政府辅助校，费率一致，不会因选校拉大差距，但要先和家人说清这个数；<br>
② <b>实走两条短通勤路线</b>：Yusof Ishak（步行 8 vs 21 分钟有争议，来自能否穿私人公寓）、Compassvale（14 vs 25 分钟），这两所的“短通勤”卖点都依赖争议项，实地走一次再定要不要放前面；<br>
③ <b>开放日问清两件事</b>：Greendale 的 Robotics 有没有选拔、Sec 1 名额多少（决定第 1 志愿值不值）；Yusof Ishak 的信息科技社团是否真涉及编程/AI，而不只是媒体制作。`;
  },
};

const DETAIL = {
  'Greendale Secondary School': {
    feature: 'CCA <b>21 项，主池最多</b>；2026-11-23 三方核实后 MOE 当前登记 18 项，<b>Robotics 与 Theatricks! 两处均确认</b>，对口第 1 与第 3 兴趣。旧版「19 项、MOE 漏登」口径已作废。',
    profile: '盛港一带的社区中学，ALP 走设计、技术与工程，LLP 是户外与探险教育，整体偏动手与实践。步行 27 分钟可达。',
    verdict: '<b>适合：</b>机器人社团对口第 1 兴趣，戏剧对口第 3 兴趣，通勤也轻。<br><b>不适合：</b>余量 +1，踩线；PR 同分输公民，风险进一步放大——只能冲刺，不能兜底。',
  },
  'Yusof Ishak Secondary School': {
    feature: '<b>Robotics + 信息科技（AI 近似）+ 戏剧三项兴趣全命中</b>，是全池兴趣匹配度最高的；步行 8 分钟（争议上限 21）。',
    profile: '榜鹅的年轻学校，全岛唯一以总统命名。STEM 竞赛记录在本区属密集一档。',
    verdict: '<b>适合：</b>兴趣最全、通勤最短，两项都全池第一。<br><b>不适合：</b>余量 0（去年末位就是 15 分），PR 同分再让位公民，实质抽签级风险。第 2 位用它，但别指望兜底。',
  },
  'Seng Kang Secondary School': {
    feature: '<b>余量 +4、通勤 22 分钟，是高余量与短通勤的交叉点</b>；有 English Drama 承接戏剧兴趣，LLP 覆盖体育方向。',
    profile: '盛港邻里中学，ALP 偏食品科技。地铁 22 分钟，步行争议项 33 分钟。',
    verdict: '<b>适合：</b>+4 的缓冲足以对冲 PR 同分劣势，通勤又短——这是全方案最该保的承接位。<br><b>不适合：</b>没有机器人社团，科技类只有偏美术的 Art Club。',
  },
  'North Vista Secondary School': {
    feature: '<b>AI（信息科技）与戏剧两项兴趣同时命中，且余量 +3、通勤 25 分钟</b>——是“有社团承接”里最稳的一所。',
    profile: '盛港/后港交界的社区型中学，LLP 是视觉艺术与设计。',
    verdict: '<b>适合：</b>两项兴趣落地 + 余量够用 + 通勤短，是安全与兴趣的最佳平衡点。<br><b>不适合：</b>ALP 名实不符——类别写城市与景观，实质是农业食品，与 Computing 关系很弱。',
  },
  'Bendemeer Secondary School': {
    feature: '<b>全池总分第 1、余量 +7</b>，STEM - Emerging Technologies 方向，有表演艺术类社团。',
    profile: '加冷一带的政府中学，通勤 34 分钟靠地铁（步行 140 分钟不现实）。',
    verdict: '<b>适合：</b>+7 是全池最厚的安全边际，PR 家庭的兜底首选。<br><b>不适合：</b>通勤偏长，且没有机器人社团——它是“保险”，不是“兴趣落点”。',
  },
  'Yuying Secondary School': {
    feature: '<b>余量 +7、通勤仅 28 分钟</b>，是 +7 俱乐部里通勤最短的；信息科技社团命中 AI 兴趣近似。',
    profile: '后港一带的政府辅助学校，ALP 是商科方向。',
    verdict: '<b>适合：</b>又稳又近，作为最后一位的保险最合适。<br><b>不适合：</b>商科 ALP 与 STEM 方向不符，没有机器人或戏剧社团。',
  },
  'Compassvale Secondary School': {
    feature: 'ACES 项目（航空、编程、工程、可持续）把物理、D&amp;T、数学串成实体项目，<b>Coding 写进 ALP 名称且低年级必修</b>。',
    profile: '2000 年随盛港新镇建校，约 1,400 人。步行 14 分钟（争议上限 25），通勤全池最短。',
    verdict: '<b>适合：</b>走路最近，Coding 在课时内必修不是选拔班；<b>CCA 核实后为 18 项，Robotics 与 English Drama 均由 MOE 当前登记确认</b>。<br><b>不适合：</b>官网没有完整 CCA 清单页，且步行 14 vs 25 分钟分歧未实地验证；余量 +3，用前位换“走路近”不划算——放方案 C 而非 A。<b>旧版「8 项、无科技/戏剧、零命中」已作废</b>。',
  },
};

/** 短名工具（模板没暴露 short 给配置，这里自带一份） */
function shortName(n) { return String(n).replace(/ Secondary School| \(Secondary\)/, ''); }

module.exports = { PLANS, DETAIL };
