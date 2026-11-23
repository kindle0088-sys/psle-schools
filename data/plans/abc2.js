/**
 * abc2 的六志愿设计与逐校判断（供 scripts/build-report-plan.cjs 读取）
 *
 * 为什么单独成文件：第三个、第四个孩子各需要一套不同判断，
 * 全塞进生成器里就会变成「改一个人、动全部」。
 * 生成器只保留渲染逻辑，判断留在 data/plans/<id>.js。
 *
 * 约定：
 *   PLANS  = 方案 A/B/C 的 6 个位置与理由（slot 1–6，tier ∈ 冲刺/匹配/稳妥）
 *   DETAIL = 逐校的 ⑦ 其他特色 / ⑧ 整体特点 / ⑨ 适合不适合
 *   文案里需要孩子分数时写 {{score}}，由生成器替换
 */

const PLANS = {
  /* hero 文案：abc2 这一份保留「与同一住址 17 分对照」的说法（同一家庭的老大是 17 分）。
     换学生时可以直接删掉，生成器会退回通用版。 */
  hero: ({ S, S2, esc }) => `AL <b>${S.score}</b> 分 · ${S.pgShort} · 邮编 ${esc(S.postal)} · 单程上限 ${S.maxCommute} 分钟。
<b>先说结论：${S.score} 分在这个邮编下可及 ${S2.withinCommuteReachable} 所（比同一住址 17 分时的 19 所多 ${S2.withinCommuteReachable - 19} 所）；主池混校 ${S2.poolMixed} 所（比 17 分时的 18 所多 ${S2.poolMixed - 18} 所）——<b>但多出来的 4 所全是「余量 0–1 分的踩线区」</b>——
真正稳妥的那几所，通勤仍然是 33–44 分钟。这份报告要回答的不是「哪所学校最好」，而是「这 6 个位置怎么排，才在保住录取的同时不浪费孩子的兴趣」。`,
  A: {
    title: '方案 A · 平衡型',
    desc: '1 所冲刺 + 3 所匹配 + 2 所稳妥，兴趣优先、安全边际托底',
    picks: [
      {
        name: 'Greendale Secondary School', slot: 1, tier: '冲刺',
        why: 'CCA <b>21 项仍是全池最多</b>；2026-11-23 核实后 <b>Robotics 与戏剧（Theatricks! / English Drama）在 MOE 当前登记与官网双侧均确认</b>——孩子的第 1 与第 3 兴趣都能落到实体社团。ALP 是 Design, Technology and Engineering（工程设计），与 STEM 方向一致。27 分钟步行（有争议区间 27–28，差异很小）。',
        risk: '余量只有 <b>1 分</b>（PG3 11–16，孩子 15）。这是真正的「踩线」——COP 每年动 1–2 分很常见，一旦区间右端从 16 <b>收紧到 15 或更低</b>就落空（去年最后一名是 16 分，孩子 15 分只领先 1 分；反之上限升到 17 是门槛放宽，更安全）。但它放第 1 志愿，落空不损失任何后续位置，所以风险可控。',
      },
      {
        name: 'Compassvale Secondary School', slot: 2, tier: '匹配',
        why: '<b>通勤最优的一所</b>：步行 14 分钟、1,114 米，四年下来每天省下的时间比任何排名都实在。ALP 是 ACES（Aeronautics, Coding, Engineering and Sustainability）——<b>全池唯一把 Coding 写进项目名称的学校</b>，且是低年级课时内必修，不是选拔班。',
        risk: '余量 3 分。真正的不确定在<b>步行时间</b>：14 分钟存在争议（另一家引擎算 25 分钟），需实地走一次。CCA 已于 2026-11-23 核实为 <b>18 项，含 Robotics 与 English Drama</b>（官网 DSA 页也列 Robotics Club）；旧版「8 项、无科技社团」已作废，但官网确实没有完整清单页，社团活跃度仍需现场确认。',
      },
      {
        name: 'Seng Kang Secondary School', slot: 3, tier: '匹配',
        why: '22 分钟地铁、余量 4 分，是「通勤 + 安全边际」平衡得最好的一所。<b>有 English Drama</b>（戏剧兴趣有社团落地），CCA 按 <b>2027 官网口径 15 项</b>（MOE 当前 14 项，旧版 17 项已作废），ALP 是 Food for the Future（食品科技），LLP 是体育与户外教育——孩子喜欢 Sports 的话 LLP 这条线能接上。',
        risk: 'ALP 偏食品科技而非编程，科技类社团只有 Art Club（偏美术）。如果孩子的第 1 兴趣是机器人，这里给不了。',
      },
      {
        name: 'North Vista Secondary School', slot: 4, tier: '匹配',
        why: '余量 3 分、25 分钟，<b>同时有 Drama Club 与 Infocomm Club</b>——戏剧与科技两个方向都有实体社团，CCA 共 18 项。LLP 是视觉艺术与设计，与 Arts 兴趣也沾边。',
        risk: 'ALP 是 Farm-to-Table（农场到餐桌），虽归在 STEM - Cities and Urban Landscapes 类，<b>实质是农业与食品，与 Computing 关系很弱</b>。这是它和 Compassvale 最大的差别——别被类别名称骗。',
      },
      {
        name: 'Bendemeer Secondary School', slot: 5, tier: '稳妥',
        why: '<b>余量 7 分，是本方案里安全边际最大的。</b>同时有 English Drama 与 Media & Tech Club，ALP 归在 STEM - Emerging Technologies。34 分钟地铁，通勤可接受。适合作为「前四个都落空」时的第一道保险。',
        risk: 'ALP 具体项目是 EcoGen（环保生态），<b>技术含量不如类别名称听起来硬</b>；34 分钟通勤在候选里偏长。',
      },
      {
        name: 'Bartley Secondary School', slot: 6, tier: '稳妥',
        why: '余量 6 分，33 分钟。<b>ALP 是 STEM - Health and Food Science（食品科学）</b>——孩子的第 5 兴趣是烹饪，全岛没有中学设烹饪 CCA，但食品科学是这门兴趣最接近的学术出口。CCA 11 项，含 Infocomm Technology。',
        risk: '社团里没有 Robotics / 戏剧；Infocomm Technology 是 MOE 分类名，不等于真有编程社团。作为最后一志愿，它保的是「有学上且方向不跑偏」，不是「最理想」。',
      },
    ],
  },
  B: {
    title: '方案 B · 进取型',
    desc: '把两所「兴趣最对口但踩线」的学校都放前面，用后续志愿兜底',
    picks: [
      { name: 'Greendale Secondary School', slot: 1 },
      { name: 'Yusof Ishak Secondary School', slot: 2 },
      { name: 'Compassvale Secondary School', slot: 3 },
      { name: 'North Vista Secondary School', slot: 4 },
      { name: 'Seng Kang Secondary School', slot: 5 },
      { name: 'Bendemeer Secondary School', slot: 6 },
    ],
  },
  C: {
    title: '方案 C · 稳健型',
    desc: '前 3 所余量都 ≥6 分，先确保有学上、通勤可接受，再谈兴趣',
    picks: [
      { name: 'Bendemeer Secondary School', slot: 1 },
      { name: 'Bartley Secondary School', slot: 2 },
      { name: 'Yuying Secondary School', slot: 3 },
      { name: 'Seng Kang Secondary School', slot: 4 },
      { name: 'Compassvale Secondary School', slot: 5 },
      { name: 'Peicai Secondary School', slot: 6 },
    ],
  },
};

const DETAIL = {
  'Greendale Secondary School': {
    feature: 'CCA <b>21 项，仍是主池最多</b>；2026-11-23 三方核实后 MOE 当前登记 18 项（覆盖率 86%），<b>Robotics 与 Theatricks!（英语戏剧）已在 MOE 与官网双侧确认</b>——旧版「MOE 只登记 7 项、漏掉这两项」的说法已作废。',
    profile: '盛港一带的社区中学，规模中等。ALP 走「设计、技术与工程」，LLP 是户外与探险教育（ODAC 是其 CCA 之一），整体偏动手与实践。',
    verdict: '<b>适合：</b>孩子的第 1 兴趣（机器人）与第 3 兴趣（戏剧）在这里都有实体社团，且是官网核实过的；ALP 方向与 STEM 一致。<br><b>不适合：</b>余量只有 1 分，属于踩线；27 分钟步行对每天两趟来说不算轻松。',
  },
  'Compassvale Secondary School': {
    feature: 'ACES 项目把物理、D&amp;T、数学串成实体项目；低年级公开样例是玩具车、收纳架、太阳能充电器——<b>「航空」更像切入口，不是深度内容</b>，飞行相关的深度部分多半在高年级或 CCA。',
    profile: '2000 年随盛港新镇建校，约 1,400 人。校风偏严（手机违规要家长到校领回，严重违纪有鞭刑条款）。2024 年 5 科及格 89.7%、Poly 资格率 96.3%，出口以 Poly 为主。',
    verdict: '<b>适合：</b>通勤全池最短（14 分钟步行），Coding 是唯一写进 ALP 名称的，且课时内必修、不是选拔班；<b>CCA 核实后为 18 项，Robotics 与 English Drama 均有 MOE 当前登记</b>。<br><b>不适合：</b>官网没有完整 CCA 清单页，社团活跃度需现场确认；步行 14 vs 25 分钟有分歧；英文 Distinction 仅 19%，若以 JC 为目标需要自己补。<b>旧版「无科技/戏剧」结论已作废</b>。',
  },
  'Seng Kang Secondary School': {
    feature: 'LLP 是 <b>Sports &amp; Outdoor Education（TREK for Life）</b>——孩子喜欢 Sports 的话这条线是全校性的，不只社团层面。',
    profile: '盛港的邻里中学。CCA 按 2027 官网口径 15 项（MOE 当前 14 项；官网 2027 起 Red Cross / NPCC 停办、引入 NCDCC）。ALP 偏食品科技（Food for the Future），与实际产业结合紧密。',
    verdict: '<b>适合：</b>22 分钟是「通勤 + 余量 4 分」平衡最好的一所；有 English Drama；LLP 覆盖体育方向。<br><b>不适合：</b>没有机器人社团，科技类只有偏美术的 Art Club；ALP 与编程无关。',
  },
  'North Vista Secondary School': {
    feature: 'CCA 18 项，<b>Drama Club 与 Infocomm Club 同时存在</b>；LLP 是视觉艺术与设计。',
    profile: '盛港/后港交界，社区型中学。ALP 名为 Farm-to-Table（农场到餐桌），归在 STEM - Cities and Urban Landscapes 类。',
    verdict: '<b>适合：</b>戏剧与科技两个方向都有社团；25 分钟通勤可接受；余量 3 分比前两所稳。<br><b>不适合：</b><b>ALP 名实不符</b>——类别写的是城市与景观，实际项目是农业与食品，与 Computing 关系很弱。别被「STEM」两个字骗。',
  },
  'Bendemeer Secondary School': {
    feature: 'ALP 归在 STEM - Emerging Technologies，但具体项目是 EcoGen（环保生态）；CCA 13 项，官网比 MOE 多登记 5 项。',
    profile: '市区边缘的老牌邻里中学（靠近 Boon Keng），34 分钟地铁可达。CCA 里 Media &amp; Tech Club 是科技类出口。',
    verdict: '<b>适合：</b>余量 7 分，是全部候选里安全边际最大的之一；有 English Drama + Media &amp; Tech Club，戏剧与科技都沾得上。<br><b>不适合：</b>ALP 的技术含量不如类别名听起来硬；34 分钟通勤在候选里偏长。',
  },
  'Bartley Secondary School': {
    feature: 'ALP 是 <b>STEM - Health and Food Science</b>，具体项目「Chemical and Applied Sciences（Fragrance）」——与香精/化妆品化学相关，是少数把化学落到具体产品上的项目。',
    profile: '后港一带，CCA 11 项全部由 MOE 登记（无官网独有项），社团数量中等。LLP 是 i-LEAD 领导力培养。',
    verdict: '<b>适合：</b>余量 6 分；<b>食品科学是「烹饪」兴趣最接近的学术出口</b>（全岛没有中学设烹饪 CCA）；LLP 覆盖 Leadership，符合家长列的方向。<br><b>不适合：</b>没有机器人、没有戏剧；Infocomm Technology 是 MOE 分类名，不等于真有编程社团。',
  },
  'Yusof Ishak Secondary School': {
    feature: 'CCA 里有 <b>Robotics Club</b> 与 <b>Infocomm Technology</b> 两个科技社团，另有 English Drama——是全池<b>唯一三项兴趣（机器人 / AI 方向 / 戏剧）都能对上</b>的学校之一。ALP 是 S4TEM@YI（可持续与智慧城市）。',
    profile: '榜鹅的年轻学校，全岛唯一以总统命名。STEM 竞赛记录在本区属于密集的一档。',
    verdict: `<b>适合：</b>兴趣匹配度全池最高，且步行只要 8 分钟（争议区间 8–21）。<br><b>不适合：</b><b>余量 0 分</b>——踩线中的踩线，去年最后一名就是 {{score}} 分。今年同分还要过 tie-breaker，实质上是「抽签级」风险。`,
  },
  'Punggol Secondary School': {
    feature: 'CCA <b>20 项</b>（官网 21 项，差额只是 Volleyball 按男女分列）；俱乐部栏已补齐 Art / AVA / ELDDS / Environmental / ILDDS / Interact。Shooting（射击）在全岛中学里不常见。',
    profile: '榜鹅最新的一批邻里中学之一，22 分钟地铁。ALP 是 Environmental Sustainability。',
    verdict: '<b>适合：</b>通勤 22 分钟、余量 4 分，位置舒服；有射击这类少见项目；<b>核实后有英语 / 印度语 Drama &amp; Debating，戏剧兴趣已落地</b>。<br><b>不适合：</b>机器人、游泳、烹饪仍无 CCA 证据；ALP 偏环境可持续，与 Computing 无关。<b>旧版「12 项、零命中」已作废</b>。',
  },
};

module.exports = { PLANS, DETAIL };
