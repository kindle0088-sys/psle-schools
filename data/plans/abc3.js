/**
 * abc3 的六志愿设计与逐校判断
 *
 * ⚠️ 这一版与 abc2 的差别**不是「通勤上限从 45 压到 40」**，而是**换了通勤口径**：
 *    abc2 用「步行 / 地铁取最快」，只要有一种方式 45 分钟内到校就算合格；
 *    abc3 用「只认全程步行」（students/abc3.json 里 commuteMode: "walk"），
 *    走不到就淘汰，哪怕地铁 20 分钟。
 *
 * 后果（数据见 data/_recommend-abc3.json）：
 *    可及学校 16 所 → 7 所，被淘汰的 9 所全部是「必须坐车」的学校，
 *    其中 5 所余量 ≥6 分 —— 它们正是上一版里的稳妥档。
 *
 * 所以本份报告的核心判断也变了：
 *    上一版问「怎么在保住录取的同时不浪费兴趣」；
 *    这一版要问「7 所里没有一所稳妥校，6 个位置怎么排才不至于滑档」。
 */

const PLANS = {
  /* 本学生专属 hero：讲清口径变化带来的真实差别，不与 45 分钟版做「少几所」的误导性比较 */
  hero: ({ S, S2, esc, R }) => {
    const maxMargin = Math.max(...R.pool.map(x => x.margin));
    const minWalk = S2.poolMixed ? Math.min(...R.pool.map(x => (x.walkUpperMinutes != null ? x.walkUpperMinutes : x.walkMinutes))) : 0;
    const maxWalk = S2.poolMixed ? Math.max(...R.pool.map(x => (x.walkUpperMinutes != null ? x.walkUpperMinutes : x.walkMinutes))) : 0;
    const safeCut = S2.walkCutDetail.filter(x => x.margin >= 6);
    return 'AL <b>' + S.score + '</b> 分 · ' + S.pgShort + ' · 邮编 ' + esc(S.postal)
      + ' · <b>全程步行</b>上限 ' + S.maxCommute + ' 分钟。\n'
      + '按「走路能到」筛完，真正可及的只有 <b>' + R.pool.length + ' 所</b>，全部在盛港 / 榜鹅 / 后港一带，'
      + '步行 ' + minWalk + '–' + maxWalk + ' 分钟。\n'
      + '<b>先说结论：这 ' + R.pool.length + ' 所里最大余量只有 +' + maxMargin + ' 分，没有一所落在「稳妥」档。</b>'
      + (safeCut.length ? '被步行淘汰的学校里，反而有 ' + safeCut.length + ' 所的余量 ≥6 分——'
        + '换句话说，<b>收紧到「只能走」付出的代价不是「少了好学校」，是「没了兜底校」</b>。' : '')
      + '这份报告真正要回答的，是「在一个没有兜底校的池子里，6 个位置怎么排」。';
  },

  /* 第二步的注解：把「代价」说清楚，而不是把 9 所砍掉的学校罗列一遍（表格里已有） */
  intro: ({ S, S2, R }) => {
    const safeCut = S2.walkCutDetail.filter(x => x.margin >= 6).sort((a, b) => b.margin - a.margin);
    const near5 = S2.walkCutDetail.filter(x => x.margin === 5).length;
    if (!safeCut.length) {
      return '<b>被步行淘汰的 ' + S2.walkCutCount + ' 所里没有余量 ≥6 分的学校</b>——收紧口径没有伤到安全边际，'
        + '真正要担心的只是「选择变少」。';
    }
    const list = safeCut.map(x => x.name + ' +' + x.margin).join('、');
    const maxM = Math.max(...R.pool.map(x => x.margin));
    const minM = Math.min(...R.pool.map(x => x.margin));
    return '<b>收紧口径的真正代价：被淘汰的 ' + S2.walkCutCount + ' 所里，有 ' + safeCut.length + ' 所余量 ≥6 分</b>（'
      + list + '）——它们在「步行 / 地铁取最快」的口径下正是稳妥档，'
      + (near5 ? '另有 ' + near5 + ' 所余量 +5。' : '')
      + '<br>这不是说该放宽口径。步行上学是家长定的硬条件，代价该付。但要看得见代价长什么样：'
      + '<b>本池 ' + S2.poolMixed + ' 所的余量最高只有 +' + maxM + ' 分（最低 +' + minM + '）</b>，'
      + '意味着 6 个志愿里没有任何一个位置是「几乎肯定中」的——'
      + '这和「稳妥档还在、只是远一点」是完全不同的风险结构。';
  },

  A: {
    title: '方案 A · 平衡型',
    desc: '两个冲刺放前面（兴趣最对口），后面四个全部按「余量优先、兴趣不完全放弃」排',
    picks: [
      {
        name: 'Greendale Secondary School',
        slot: 1,
        tier: '冲刺',
        why: 'CCA <b>21 项仍是全池最多</b>，<b>Robotics 与戏剧（Theatricks! / English Drama）在 MOE 当前登记与官网双侧均确认</b>——孩子的第 1 兴趣（机器人）和第 3 兴趣（戏剧）都能落到实体社团。ALP 是 Design, Technology and Engineering，与 STEM 方向一致。步行 27 分钟，2,143 米。',
        risk: '余量只有 <b>1 分</b>（PG3 11–16，孩子 15）。COP 每年动 1–2 分很常见，一旦区间右端从 16 <b>收紧到 15 或更低</b>就落空（去年最后一名是 16 分，孩子 15 分只领先 1 分；反之上限升到 17 是门槛放宽，更安全）。但它放第 1 志愿，落空不损失任何后续位置。',
      },
      {
        name: 'Yusof Ishak Secondary School',
        slot: 2,
        tier: '冲刺',
        why: '兴趣匹配度全池第一：<b>Robotics Club + Infocomm Technology + English Drama 三项兴趣同时对上</b>，而且步行只要 8 分钟（667 米）。ALP 是 S4TEM@YI，走智慧城市方向。',
        risk: '<b>余量 0 分</b>——PG3 区间 7–15，去年最后一名就是 {{score}} 分。今年同分还要过 tie-breaker，实质是「抽签级」风险。第 2 志愿用它，代价是这一位基本不具备「兜住」功能。',
      },
      {
        name: 'Seng Kang Secondary School',
        slot: 3,
        tier: '匹配',
        why: '<b>余量 +4 分是并列最高，同时有 English Drama</b>（戏剧兴趣有社团落地）。CCA 按 <b>2027 官网口径 15 项</b>（MOE 当前 14 项）——官网明确 2027 起 Red Cross 与 NPCC 停办、引入 NCDCC。LLP 是 Sports &amp; Outdoor Education（TREK for Life），孩子喜欢 Sports 的话这条线是全校性的。步行 33 分钟。',
        risk: '没有机器人社团，科技类只有偏美术的 Art Club；ALP 是 Food for the Future（食品科技），与 Computing 无关。33 分钟步行在当前池子里已属偏长。',
      },
      {
        name: 'North Vista Secondary School',
        slot: 4,
        tier: '匹配',
        why: '余量 3 分，<b>Drama Club 与 Infocomm Club 同时存在</b>——戏剧与科技两个方向都有实体社团，CCA 18 项。LLP 是视觉艺术与设计。',
        risk: 'ALP 是 Farm-to-Table（农场到餐桌），课程类别写着「城市与景观」，<b>实质是农业与食品，与 Computing 关系很弱</b>——别被类别名称骗。步行 38 分钟，是全池最远的一所。',
      },
      {
        name: 'Outram Secondary School',
        slot: 5,
        tier: '匹配',
        why: '<b>全池唯一有游泳池与 Water Polo 的学校</b>（1977 年建成），对应孩子的第 4 兴趣游泳。2026 年刚搬进盛港 Anchorvale 新校区，所以走路 15–25 分钟就到，设施是新的。余量 +2 分。',
        risk: 'CCA 核实后是 <b>MOE 当前 14 项、三方并集 17 项</b>——旧版「只有 6 项」已作废；但 <b>English Drama 只见于开放日 microsite，官网主站与 MOE 均未列</b>，2027 是否开必须现场问，机器人与烹饪仍无证据。ALP 是 Business &amp; Enterprise，与 STEM 方向不符。而且 <b>2027 年底前是双校区运营</b>（York Hill + Anchorvale），师资与活动会被摊薄，孩子 2027 年入学正好卡在这个转折点上。',
      },
      {
        name: 'Compassvale Secondary School',
        slot: 6,
        tier: '匹配',
        why: '<b>步行 14 分钟、1,114 米，是全池唯一「走路一刻钟」的学校</b>。ALP 是 ACES（Aeronautics, Coding, Engineering and Sustainability）——<b>全池唯一把 Coding 写进项目名称的学校</b>，且低年级课时内必修，不是选拔班。放第 6 位，是给「前面全落空」买的最后一层保险：落到这里至少通勤最轻。',
        risk: '两位引擎的步行结果有分歧（14 vs 25 分钟），需实地走一次——这是它仍排第 6 而非提前的主因。<b>CCA 核实后已从 8 项更正为 18 项，Robotics 与 English Drama 均由 MOE 当前登记确认，官网 DSA 页也列 Robotics Club</b>；旧版「无科技/戏剧」结论作废。若实地确认步行 14 分钟属实、且 Robotics 的 Sec 1 名额可进，应把它上调到第 3–4 位。',
      },
    ],
    /* 第四步单独特判的对照校（7 所里唯一没进方案 A 的） */
    focusPair: ['Punggol Secondary School'],
  },

  B: {
    title: '方案 B · 兴趣最大化',
    desc: '把四所「有对口社团」的全部提前，只留两所在后面兜底——接受更高的滑档概率',
    picks: [
      { name: 'Greendale Secondary School', slot: 1 },
      { name: 'Yusof Ishak Secondary School', slot: 2 },
      { name: 'North Vista Secondary School', slot: 3 },
      { name: 'Seng Kang Secondary School', slot: 4 },
      { name: 'Outram Secondary School', slot: 5 },
      { name: 'Punggol Secondary School', slot: 6 },
    ],
  },

  C: {
    title: '方案 C · 稳健型',
    desc: '前 5 位严格按余量从大到小，第 6 位留给「唯一有机器人社团」的学校作为兴趣保留位',
    picks: [
      { name: 'Punggol Secondary School', slot: 1 },
      { name: 'Seng Kang Secondary School', slot: 2 },
      { name: 'Compassvale Secondary School', slot: 3 },
      { name: 'North Vista Secondary School', slot: 4 },
      { name: 'Outram Secondary School', slot: 5 },
      { name: 'Greendale Secondary School', slot: 6 },
    ],
  },

  /* 第五步的判断：本池没有稳妥档，这是本次口径的直接后果，必须点明 */
  step5Note: ({ S2, R }) => {
    const ms = R.pool.map(x => x.margin);
    const minM = Math.min(...ms), maxM = Math.max(...ms);
    return '<b>这一版没有「稳妥档」——不是分档标准变严了，是池子里真的一所都没有。</b>'
      + S2.poolMixed + ' 所的余量从 +' + minM + ' 到 +' + maxM + '，全在「冲刺」与「匹配」两档。'
      + '<br><br>这直接改变了志愿策略的含义：正常做法是「前面冲刺、后面用余量 6 分以上的学校兜底」，'
      + '<b>而这里没有兜底可用</b>——连余量<b>最高</b>的位置也只有 +' + maxM + ' 分，和其他位置是同一个风险量级。'
      + '所以本报告不再说「第 6 位保你有学上」，只能说「第 6 位是<b>相对</b>最可能中的那个」。'
      + '<br><br>要真正的兜底，只有两条路：① 放宽到「坐车也行」（那就回到「步行 / 地铁取最快」的口径，可及池会明显变大）；'
      + '② 接受「可能滑档到没填的学校」——S1 若 6 个志愿全部落空，MOE 会为孩子分配一所还有学额的学校，<b>但那所不受你控制</b>。'
      + '这一点必须提前和家长确认，而不是等 12 月才知道。';
  },

  /* 第六步的终稿建议：写清三个判断，以及为什么不选 B / C */
  finalAdvice: () => {
    return `<h3>如果这是我的孩子，我会这样填</h3>
<p>方案 A 的顺序是三条判断叠出来的，不是按分数排的：</p>
<ul>
<li><b>第 1–2 位给机器人社团证据最扎实的两所（Greendale、Yusof Ishak）。</b>2026-11-23 三方核实后，全池有 Robotics 的从 2 所增至 <b>3 所</b>（加上 Compassvale），所以「没这村就没这店」的说法已不成立；但 Greendale 与 Yusof Ishak 的机器人社有官网 + MOE 双重证据，Yusof 还同时有 Infocomm，优先级仍最高。代价是这两所余量分别 +1 和 0，<b>前两志愿命中率仍是全部方案里最低的</b>。</li>
<li><b>第 3–4 位用余量最大的两所（Seng Kang +4 / North Vista +3）。</b>它们没有机器人，但都有 English Drama / Drama Club——第 3 兴趣有落地。这两所是「前两个落空后」的实际承接位，所以必须选余量大的，不能选兴趣更搭但更险的。</li>
<li><b>第 5–6 位放「各有唯一性」的两所。</b>Outram 是全池唯一有游泳池的（对应第 4 兴趣游泳）。Compassvale 核实后同时有 Robotics 与 English Drama，综合分已升到全池第一，<b>它排第 6 的唯一原因是步行 14 vs 25 分钟两引擎分歧未解决</b>——不是兴趣不匹配。落到这里说明前四位都落空，此时「还有点特色」比「综合分高 3 分」更值钱。</li>
</ul>
<p><b>为什么不选方案 B：</b>B 把 North Vista 提到第 3、把 Compassvale 整所拿掉、用 Punggol 兜底。核实后 Punggol 已从「零命中」更正为<b>命中戏剧（英语 / 印度语 Drama &amp; Debating）</b>，但机器人、游泳、烹饪仍无；North Vista 与 Seng Kang 同样只有戏剧，<b>所以 B 换来的兴趣升级依然有限</b>，还把「余量 +4 的 Seng Kang」推到了第 4。<b>更关键的是：把有 Robotics 的 Compassvale 整所拿掉，等于放弃了核实后新确认的第 3 个机器人落点</b>——除非实地确认它步行确实要 25 分钟，否则 B 的代价被低估了。</p>
<p><b>为什么不选方案 C：</b>C 把 Greendale 压到第 6 位。逻辑上这是「稳健」，但在这份池子里它有个隐藏后果：<b>第 6 位的余量只有 +1，比第 1–5 位都低</b>——前 5 位若因 COP 上浮而落空，第 6 位大概率一起落空。稳健方案反而把最薄的一所放在了最后。<b>要稳健，正确做法是承认「本池没有真正稳健的位置」，而不是把最险的挪到队尾。</b></p>`;
  },

  /* 提交前必做：这一版的重点从「核对余量」变成了「先确认能不能接受滑档」 */
  todo: () => {
    return `<b>提交前必须做的三件事：</b><br>
① <b>先回答一个问题：能接受「6 个志愿全落空、由 MOE 分配」吗？</b>本池没有余量 ≥6 的学校，这是数学事实。如果不能接受，唯一解法是放宽通勤口径（允许坐车），而不是在 7 所里继续调顺序；<br>
② <b>实地走三条路线</b>：Compassvale（14 vs 25 分钟有争议）、Outram（15 vs 25 分钟，且要确认走的是 Anchorvale 新校区不是 York Hill 旧址）、Yusof Ishak（8 vs 21 分钟，争议来自能否穿私人公寓）；<br>
③ <b>开放日问清两件事</b>：Greendale 的 Robotics 有没有选拔、Sec 1 名额多少（这决定第 1 志愿值不值）；Outram 双校区期间 Sec 1 在哪个校区上课（2027 年底前 York Hill 仍在运营）。`;
  },
};

const DETAIL = {
  'Greendale Secondary School': {
    feature: 'CCA <b>21 项，仍是主池最多</b>；2026-11-23 三方核实后 MOE 当前登记 18 项（覆盖率 86%），<b>Robotics 与 Theatricks!（英语戏剧）已在 MOE 与官网双侧确认</b>——旧版「MOE 只登记 7 项、漏掉这两项」的说法已作废。官网独有的 Green Club / GBC / Greendale Orchestra 仍保留（后者是西式管弦乐团，与 MOE 的 Chinese Orchestra 不是同一个）。',
    profile: '盛港一带的社区中学，规模中等。ALP 走「设计、技术与工程」，LLP 是户外与探险教育（ODAC 是其 CCA 之一），整体偏动手与实践。',
    verdict: '<b>适合：</b>孩子的第 1 兴趣（机器人）与第 3 兴趣（戏剧）在这里都有实体社团，且是官网核实过的；ALP 方向与 STEM 一致；步行 27 分钟在本池属中等。<br><b>不适合：</b>余量只有 1 分，属于踩线；COP 区间 11–16 说明它这几年在收紧，不是「稳定好捡」的学校。',
  },
  'Yusof Ishak Secondary School': {
    feature: 'CCA 里有 <b>Robotics Club</b> 与 <b>Infocomm Technology</b> 两个科技社团，另有 English Drama——是全池<b>唯一三项兴趣（机器人 / AI 方向 / 戏剧）都能对上</b>的学校。ALP 是 S4TEM@YI（可持续与智慧城市）。',
    profile: '榜鹅的年轻学校，全岛唯一以总统命名。STEM 竞赛记录在本区属于密集的一档。步行 8 分钟、667 米，是全池最近的。',
    verdict: '<b>适合：</b>兴趣匹配度全池最高，且步行只要 8 分钟；离家最近意味着四年的时间成本最低。<br><b>不适合：</b><b>余量 0 分</b>——踩线中的踩线，去年最后一名就是 {{score}} 分。今年同分还要过 tie-breaker，实质上是「抽签级」风险。放第 1 或第 2 志愿都可以，但不能指望它兜底。',
  },
  'Seng Kang Secondary School': {
    feature: 'LLP 是 <b>Sports &amp; Outdoor Education（TREK for Life）</b>——孩子喜欢 Sports 的话这条线是全校性的，不只社团层面。CCA 按 <b>2027 官网口径 15 项</b>（MOE 当前 14 项），含 English Drama；官网明确 2027 起 Red Cross / NPCC 停办、引入 NCDCC。',
    profile: '盛港的邻里中学。ALP 偏食品科技（Food for the Future），与实际产业结合紧密。步行 33 分钟、2,668 米。',
    verdict: '<b>适合：</b>余量 +4 是并列最高，同时有 English Drama；LLP 覆盖体育方向。<br><b>不适合：</b>没有机器人社团，科技类只有偏美术的 Art Club；ALP 与编程无关；33 分钟步行每天两趟对四年来说不轻松。',
  },
  'North Vista Secondary School': {
    feature: 'CCA 18 项，<b>Drama Club 与 Infocomm Club 同时存在</b>；LLP 是视觉艺术与设计。',
    profile: '盛港/后港交界，社区型中学。ALP 名为 Farm-to-Table（农场到餐桌），归在 STEM - Cities and Urban Landscapes 类。步行 38 分钟、3,032 米。',
    verdict: '<b>适合：</b>戏剧与科技两个方向都有社团；余量 3 分比前两所稳。<br><b>不适合：</b><b>ALP 名实不符</b>——类别写的是城市与景观，实际项目是农业与食品，与 Computing 关系很弱；<b>步行 38 分钟是全池最长</b>，把「只能走路」这个条件放进来后，它的通勤劣势被放大了。',
  },
  'Compassvale Secondary School': {
    feature: 'ACES 项目把物理、D&amp;T、数学串成实体项目；低年级公开样例是玩具车、收纳架、太阳能充电器——<b>「航空」更像切入口，不是深度内容</b>，飞行相关的深度部分多半在高年级或 CCA。',
    profile: '2000 年随盛港新镇建校，约 1,400 人。校风偏严（手机违规要家长到校领回，严重违纪有鞭刑条款）。2024 年 5 科及格 89.7%、Poly 资格率 96.3%，出口以 Poly 为主。步行 14 分钟、1,114 米。',
    verdict: '<b>适合：</b>通勤在两引擎口径下最短（14 分钟，争议按 25 分钟过闸），Coding 是唯一写进 ALP 名称的，且课时内必修、不是选拔班；<b>CCA 核实后为 18 项，Robotics 与 English Drama 均有 MOE 当前登记，官网 DSA 页也列 Robotics Club</b>。<br><b>不适合：</b>官网确实没有完整 CCA 清单页，18 项主要靠 MOE + 第三方交叉；步行 14 vs 25 分钟分歧未实地验证；英文 Distinction 仅 19%，若以 JC 为目标需要自己补。<b>旧版「无科技/戏剧」结论已作废</b>。',
  },
  'Outram Secondary School': {
    feature: '1977 年建成游泳池，<b>全池唯一有 Swimming / Water Polo 的学校</b>，也是唯一开游泳 DSA 的。DSA 项目开 9 项，比社团数量还多——说明它在主动扩张特长生源。',
    profile: '1906 年创办的 120 年老校，<b>2026 年刚迁入盛港 Anchorvale 新校区</b>，York Hill 旧校区 2027 年底才关闭，目前双校区运营。ALP 是 Business &amp; Enterprise，主打商科传统（1969–1973 年是全岛唯一把商业教育办到 H.S.C. 级别的学校）。不公布 O-Level 成绩。',
    verdict: '<b>适合：</b>孩子的第 4 兴趣游泳在这里是全池唯一的落点；步行 15–25 分钟就到盛港校区；新校舍设施最新。<br><b>不适合：</b>CCA 核实后为 <b>MOE 14 项 / 并集 17 项</b>（旧版「只有 6 项」作废），机器人与烹饪仍无证据；<b>English Drama 只见于开放日 microsite，官网主站与 MOE 均未列</b>，2027 是否开设必须现场问；ALP 偏商业与 STEM 方向不符；<b>双校区过渡期还有两年</b>，师资与活动会被摊薄，孩子 2027 年入学正好卡在转折点上。',
  },
  'Punggol Secondary School': {
    feature: 'CCA <b>20 项</b>（官网 21 项，差额只是 Volleyball 按男女分列）。俱乐部栏已补齐 Art / AVA / ELDDS / Environmental / ILDDS / Interact；Shooting（射击）在全岛中学里不常见。',
    profile: '榜鹅最新的一批邻里中学之一。ALP 是 Environmental Sustainability，LLP 是社区青年领导力。步行 24 分钟、1,936 米。',
    verdict: '<b>适合：</b>余量 +4 并列最高，步行 24 分钟在本池属中上，是「保录取」角度最舒服的一所；<b>核实后有 English Language / Indian Language Drama &amp; Debating，戏剧兴趣已落地</b>。<br><b>不适合：</b>机器人、游泳、烹饪三项仍无 CCA 证据（Mobile Robotics 是科目不是社团）；ALP 偏环境可持续，与 Computing 无关。<b>旧版「五项兴趣零命中」已作废</b>——它没进方案 A 的原因是机器人缺位，不是完全不匹配。',
  },
};

module.exports = { PLANS, DETAIL };
