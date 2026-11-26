/**
 * abcd2-reverse-v2：家长改名单后的反向校验报告（第二版）
 *
 * 画像与 abcd2 / abcd2-reverse 完全相同（AL 18 / PR / Twin Waterfalls 65431
 * 不换乘公交 / 60 分钟 / 7 个学术科目 + 5 项 CCA 兴趣）。家长把 Outram 换成
 * North Vista、Compassvale 提到第 1；本配置不改评分口径，只校验新名单与顺序，
 * 与上一版 abcd2-reverse 对照，并提出两套新顺序（B/C）。
 *
 * 事实源：data/research/abcd2-reverse-v2.json、data/psle-cohort.json、
 *         data/_recommend-abcd2-reverse-v2.json、data/cca-catalog.json
 * 判断层：本文件。改画像时这些文字必须重新人工核对。
 *
 * 🔑 与上一版的一处口径更正：MOE 官方 S1 派位图写明「第 1 志愿先审，之后依次」，
 *    所以「把更稳的学校放前面不会伤害冲刺校」是错误推广；正确做法是按真实偏好排序，
 *    把 2–3 所相对宽松的放末尾兜底。见 RESEARCH.comparison.correction。
 */
const R = require('../_recommend-abcd2-reverse-v2.json');
const RESEARCH = require('../research/abcd2-reverse-v2.json');
const COHORT = require('../psle-cohort.json');
const ALL = [...R.pool, ...R.outOfReach, ...R.singleSex];

const get = n => ALL.find(x => x.name === n);
const short = n => String(n).replace(/ Secondary School| \(Secondary\)/, '');
const fmt = m => (m == null ? '—' : m > 0 ? '+' + m : String(m));
const mOf = n => { const x = get(n); return x ? fmt(x.margin) : '—'; };
const cOf = n => { const x = get(n); return x && x.cop ? `${x.cop.min}–${x.cop.max}` : '—'; };
const gateOf = n => { const x = get(n); return x ? x.minutes : '—'; };
const howOf = n => {
  const x = get(n);
  if (!x) return '—';
  return x.commuteMode === 'bus'
    ? `公交 ${x.busMinutes} 分（${x.busService}，${x.busHops} 站，下车走 ${x.busWalkMinutes} 分）`
    : `步行 ${x.walkUpperMinutes != null ? x.walkUpperMinutes : x.walkMinutes} 分`;
};
const fitOf = n => { const x = get(n); return x ? `${x.subjectFit}/7` : '—'; };
const totalOf = n => { const x = get(n) ? get(n).total : '—'; return x; };
const ccaOf = n => {
  const rec = researchOf(n);
  if (rec && rec.ccaNote) return rec.ccaNote;
  const x = get(n);
  return x && x.ccaHits && x.ccaHits.length ? x.ccaHits.join('+') : '零命中';
};
const hasComputing = n => { const x = get(n); return !!x && (x.subjectHits || []).includes('Computing'); };
const trendOf = n => {
  const rec = RESEARCH.schools[n] || (RESEARCH.swapIn || {})[n];
  if (!rec) return '—';
  return rec.cop.map(c => c.status === 'no-s1'
    ? `${c.year} 无 S1 派位`
    : `${c.year} ${c.min}–${c.max}`).join(' → ');
};
const researchOf = n => RESEARCH.schools[n] || (RESEARCH.swapIn || {})[n] || null;
const namesOf = arr => arr.map(short).join(' → ');

const FAMILY = Object.entries(RESEARCH.schools)
  .sort((a, b) => a[1].familyRank - b[1].familyRank)
  .map(([name]) => name);
const OPT_B = RESEARCH.alternativeOrders.B.order;
const OPT_C = RESEARCH.alternativeOrders.C.order;
const ADDED_C = OPT_C.filter(n => !FAMILY.includes(n));
const DROPPED_C = FAMILY.filter(n => !OPT_C.includes(n));
const FAMILY_THICK = FAMILY.filter(n => { const x = get(n); return x && x.margin >= 2; });
const TIER = n => {
  const x = get(n);
  if (!x || x.margin <= 2) return '冲刺';
  return '匹配';
};

/** 方案 A = 家长新顺序；B/C = 两套新顺序。逐条理由见 picks[].why/risk。 */
const A = FAMILY, B = OPT_B, C = OPT_C;

const WHY = {
  'Compassvale Secondary School': '第 1 位保留是对的：21 分钟、6/7 科目、机器人 + 戏剧双命中，2024/2025 PG3 都是 14–18。它是六校里唯一「现实首选」。',
  'North Vista Secondary School': '18 项 CCA、戏剧 + 科技类双命中、26 分钟公交；如果孩子更看重社团广度与短通勤，它值得排前。',
  'Punggol Secondary School': '21 分钟、6/7 科目、英语戏剧社，Mobile Robotics 是全岛稀缺科目；第 3 位合理。',
  'Naval Base Secondary School': 'Enhanced Art Programme 是 MOE 九校之一；若艺术是家庭优先级，放第 4 可解释。',
  'Junyuan Secondary School': '六校里余量最厚（+3）、综合分 79 最高，ALP 正是 Food Science；当前 MOE 页面也有英语戏剧。',
  'Hougang Secondary School': '7/7 科目全命中且明确列 Computing，Speech and Drama 社团扎实、余量 +2；按科目匹配它应是前三位。',
  'Springfield Secondary School': '7/7 + 明确 Computing、余量 +4，当前 MOE 页面也有 English Drama；用「戏剧 + 学科 + 缓冲」替换第二个彩票位。',
};
const RISK = {
  'Compassvale Secondary School': '余量 0，AL 18 正好压在 2025 区间上端；Computing 只有 G1，G2/G3 组合要向学校确认。PR 同分还输公民。',
  'North Vista Secondary School': '2024 PG3 10–17、2025 11–18，AL 18 连续两年压线；没有 Computing、没有机器人社团，DSA 十项全是体艺、STEM 零项。',
  'Punggol Secondary School': '余量 +1；Mobile Robotics 是科目不是机器人社团；戏剧来自语言辩论社团，不是独立剧社；开放日时间至今 TBC。',
  'Naval Base Secondary School': '余量 +1、综合分 70 为六校最低；EAP 在中二校内选拔，S1 填报不等于进 EAP；AI 命中只是科技类 CCA 归类。',
  'Junyuan Secondary School': 'Computing 只有 G1；余量 +3 是六校最厚，但在全岛主池里仍不算「稳」，PR 下只能算相对较稳。2023 COP 为 B 级旧值。',
  'Hougang Secondary School': '32 分钟公交、步行 47 分钟；第 6 位意味着前面余量 +1 的 Naval Base 若录上，派位根本不会看到它。',
  'Springfield Secondary School': '32 分钟公交；没有机器人 / 科技类社团；2025 PG1 的星号在低位段，不能读成 PG3 会降分。',
};
const makePicks = arr => arr.map((name, i) => ({
  name,
  slot: i + 1,
  tier: TIER(name),
  why: WHY[name] || (() => {
    const x = get(name);
    if (!x) return '';
    return `${fitOf(name)} 命中、余量 ${mOf(name)}、${howOf(name)}。`;
  })(),
  risk: RISK[name] || `余量 ${mOf(name)}，PR 下不能当稳位。`,
}));

const PLANS = {
  hero: () => 'AL <b>18</b> · PG3 · PR · 邮编 <b>828765</b> · Twin Waterfalls（65431）不换乘公交 / 纯步行 ≤60 分钟。\n'
    + '这是<b>反向校验第二版</b>：家长把 Outram 换成 <b>North Vista</b>，并把 Compassvale 提到第 1。分数、身份、通勤、兴趣全部不变。\n'
    + '结论先说：<b>把 Outram 换掉是对的</b>（少了一个余量 -1 的彩票位），<b>但 North Vista 也是余量 0 的踩线校</b>；'
    + '更关键的是 <b>Hougang（7/7 + Computing、余量 +2）仍排第 6</b>，被第 4 位余量 +1 的 Naval Base 挡住。',

  intro: () => '这份报告沿用 abcd2 的全部画像与评分口径：分数、路网、科目匹配权重都不变。变的是问题：不是「系统推荐哪六所」，'
    + '而是「家长新选的这六所和这个顺序，在 MOE 规则与 2026 大盘下站不站得住」。<br>'
    + '① <b>大盘</b>：2026 考生 40,906 人，与 2024 龙年 40,894 人几乎持平（+12）；141 校参与 S1，比 2024 多 1 所。<br>'
    + '② <b>派位规则更正</b>：MOE 官方图写明「第 1 志愿先审，再第 2、第 3」，所以<b>按真实偏好排序</b>；'
    + '同分 tie-breaker 是公民 > PR > 国际学生，再看志愿顺序，最后抽签。<br>'
    + '③ <b>科目</b>：六校里只有 Hougang 明确列 Computing；其余五校都只有 Computer Applications（G1）。<br>'
    + '④ <b>事实更新</b>：MOE SchoolFinder 当前双年表已直接给出 2024 年度区间，North Vista 为 <b>10–17</b>；'
    + '当前页面还补上了 Junyuan / Naval Base 的 English Drama 等 CCA（本地 11-08 快照未登记）。',

  step2Note: () => '候选池仍是 <b>' + R.pool.length + ' 所</b>（公交入池 ' + R.stats.busInPool + '、纯步行 ' + R.stats.walkInPool
    + '，地铁不计）。家长新名单<b>六所全部在池内</b>——这是比上一版进步的地方：Outram 原是唯一不在池内的「够不着」学校。'
    + '但「在池内」不等于稳：Compassvale 与 North Vista 的余量都是 0，Punggol / Naval Base 只有 +1。',

  step3Note: () => '把 COP 拉到三年来看：Compassvale（15–19 → 14–18 → 14–18）与 Punggol（14–20 → 13–19 → 13–19）稳定；'
    + 'Hougang 2023 的 16–22 到 2024/2025 的 14–20 明显回落；Junyuan 上限从 2024 的 22 收到 2025 的 21；'
    + 'Naval Base 从 13–18 放宽到 13–19。<b>新增的 North Vista：2023 13–18 → 2024 10–17 → 2025 11–18</b>，'
    + '2024 收紧后 2025 略松，但 AL 18 仍在两年区间上端。<b>数值更小 = 门槛更紧</b>；PR 踩线还要让公民，0/1 余量不能当兜底。',

  step4Note: () => '<b>逐校核对后，最该改的仍是「谁排第 2、谁排第 6」。</b><br>'
    + '① <b>North Vista 不是安全牌</b>：18 项 CCA 与短通勤是真的，但 2024/2025 PG3 上限 17/18，AL 18 压线；'
    + '没有 Computing、没有机器人，DSA 十项全是体艺。<br>'
    + '② <b>Hougang 被浪费了</b>：7/7 命中且明确 Computing，余量 +2、戏剧社团明确，却排第 6；派位先看第 4 位的 Naval Base（+1）。<br>'
    + '③ <b>Naval Base 的艺术强项不在兴趣清单</b>：EAP 是真的，但中二校内选拔才决定能不能进。<br>'
    + '④ <b>「AI 命中」要打折看</b>：North Vista / Naval Base / Junyuan 的命中来自资讯科技 / 媒体制作归类，不是名为 AI 的社团；'
    + 'Mobile Robotics 是科目，不是机器人社团。',

  step5Note: () => '主池 ' + R.pool.length + ' 所的档位：冲刺（余量 0–2）' + R.pool.filter(x => x.margin >= 0 && x.margin <= 2).length
    + ' 所、匹配（3–5）' + R.pool.filter(x => x.margin >= 3 && x.margin <= 5).length + ' 所、稳妥（≥6）'
    + R.pool.filter(x => x.margin >= 6).length + ' 所。新名单里余量 >0 的有 4 所，但 ≥2 的只有 '
    + namesOf(FAMILY_THICK) + '。<b>SEAB 官方建议 6 个志愿里放 2–3 个往年 COP 较宽松的学校</b>——'
    + '数量勉强达标（Junyuan +3、Hougang +2，再加 Punggol / Naval Base +1），但前两位都是踩线，风险仍集中在头部。',

  audit: ({ esc }) => {
    const years = COHORT.years.filter(y => y.year >= 2022 && y.year <= 2026);
    const cohortRows = years.map((y, i) => {
      const prev = years[i - 1];
      const delta = prev ? y.psleCandidates - prev.psleCandidates : null;
      return `<tr><td class="num">${y.year}</td><td class="num"><b>${y.psleCandidates.toLocaleString('en-US')}</b></td>`
        + `<td class="num">${delta == null ? '—' : (delta > 0 ? '+' : '') + delta.toLocaleString('en-US')}</td>`
        + `<td class="num">${y.suitablePct ? y.suitablePct + '%' : '—'}</td>`
        + `<td class="soft">${esc(y.note || '')}</td></tr>`;
    }).join('\n');

    const schoolRows = FAMILY.map((name, i) => {
      const x = get(name);
      const rec = researchOf(name);
      return `<tr>
  <td class="num"><b>${i + 1}</b></td>
  <td><b>${esc(short(name))}</b><br><span class="soft">综合 ${totalOf(name)} · 余量 ${mOf(name)}</span></td>
  <td class="soft" style="font-size:12.2px">${esc(trendOf(name))}</td>
  <td class="num">${cOf(name)}</td>
  <td class="num">${fitOf(name)}${hasComputing(name) ? '<br><b>明确 Computing</b>' : '<br><span class="soft">Computing 仅 G1</span>'}</td>
  <td class="soft" style="font-size:12.2px">${esc((rec && rec.ccaNote ? rec.ccaNote : ccaOf(name)).slice(0, 72))}<br>${esc(x && x.busService ? x.busService + ' 路' : '—')} ${gateOf(name)} 分</td>
  <td class="soft" style="font-size:12.2px">${esc(rec ? rec.verdict : '—')}</td>
</tr>`;
    }).join('\n');

    const expansionRows = [...FAMILY, ...Object.keys(RESEARCH.swapIn)].map(name => {
      const rec = researchOf(name);
      return `<tr><td>${esc(short(name))}</td><td class="soft" style="font-size:12.2px">${esc(rec ? rec.expansionNote : '—')}</td></tr>`;
    }).join('\n');

    const openHouseRows = [...FAMILY].map(name => {
      const rec = researchOf(name);
      return `<tr><td>${esc(short(name))}</td><td class="soft" style="font-size:12.2px">${esc(rec && rec.openHouseNote ? rec.openHouseNote : '未见可核实场次')}</td></tr>`;
    }).join('\n');

    const C = RESEARCH.comparison;
    const compareHead = `<thead><tr>${C.heads.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>`;
    const compareRows = C.rows.map(row => `<tr>${row.map((v, i) => i === 0
      ? `<td class="soft">${esc(v)}</td>`
      : `<td class="${i === 3 || i === 4 ? 'mid' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('\n');

    return `<h2 style="margin-top:26px">00 反向校验 v2：家长六志愿逐条核对</h2>
<p class="lead">这一节是本次报告的新增内容。六校事实来自 <b>MOE SchoolFinder 当前页（2026-11-26）</b>、学校官网、SEAB 2026 文告与项目数据层；判断在灰框与第六步中明确标出。</p>

<h3>① 2026 大盘：与 2024 龙年几乎同量</h3>
<div style="overflow-x:auto">
<table>
<thead><tr><th>年份</th><th>PSLE 考生</th><th>同比</th><th>适合升读</th><th>官方备注</th></tr></thead>
<tbody>${cohortRows}</tbody>
</table>
</div>
<div class="note">
<b>判断：</b>2026 的 ${RESEARCH.cohort.candidates2026.toLocaleString('en-US')} 人比 2024 龙年只多 ${RESEARCH.cohort.deltaVs2024} 人（+0.03%），但比 2025 多 ${RESEARCH.cohort.deltaVs2025.toLocaleString('en-US')} 人（约 +10.5%）。
参与 2026 S1 的学校有 ${RESEARCH.cohort.schoolsInS1Posting2026} 所，比 2024 的 ${RESEARCH.cohort.schoolsInS1Posting2024} 所多 1 所。
<b>这说明总体回到 2024 的竞争量级，不能证明这六校今年一定收紧或放松</b>——COP 还取决于同届家长怎么填。SEAB 的官方建议仍是：6 个志愿里放 2–3 个往年 COP 较宽松的学校。
</div>

<h3>② 六校三年 COP、科目、社团与通勤核对</h3>
<div style="overflow-x:auto">
<table>
<thead><tr><th>家长序位</th><th>学校 / 余量</th><th>PG3 COP 2023 → 2024 → 2025</th><th>2025 区间</th><th>科目</th><th>社团 / 通勤</th><th>反向核对结论</th></tr></thead>
<tbody>${schoolRows}</tbody>
</table>
</div>
<p class="soft" style="font-size:12.4px">口径：COP 只取 PG3 非附属行，数值越小越难；「余量」= 2025 区间上端 − 18（六校全部在池内，无 -1 学校）。兴趣模型把 Infocomm Technology / Media Production 归为「AI」命中，<b>不等于学校有名为 AI 的社团</b>；Mobile Robotics 是科目，不是机器人社团。Junyuan 2023 区间沿用上一版核验值（Wayback 本次返回 429，标 B 级）；其余五校 2023 来自项目存档，2024/2025 来自 MOE 当前双年表。</p>

<h3>③ 扩招：没有能支撑「某校会松」的官方证据</h3>
<div style="overflow-x:auto">
<table>
<thead><tr><th style="width:18%">学校</th><th>公开资料核对结果</th></tr></thead>
<tbody>${expansionRows}</tbody>
</table>
</div>
<div class="note">
<b>结论：</b>截至 ${RESEARCH.checkedAt}，MOE / SEAB 的 2026 PSLE 文告、S1 Posting 页面、SchoolFinder 与六校官网<b>都没有逐校 S1 学额字段，也没有这六所（及备选 Springfield）的扩招计划</b>。
全量查证过：逐校 S1 学额不存在公开来源；能严谨给的只有全市均值约 ${RESEARCH.capacity.cityAverageSec1PerSchool} 人/校（2025 学年 Sec 1 在册 41,144 ÷ 141 所），<b>这不是任何一所学校的承诺名额</b>。
${esc(RESEARCH.capacity.starNote)}
North Vista 的 70 周年是校庆，Naval Base 的 EAP 是中二校内选拔的课程项目，二者都不是扩招。
</div>

<h3>④ 开放日（含已结束场次，照实列）</h3>
<div style="overflow-x:auto">
<table>
<thead><tr><th style="width:18%">学校</th><th>2026 开放日记录</th></tr></thead>
<tbody>${openHouseRows}</tbody>
</table>
</div>
<p class="soft" style="font-size:12.4px">Hougang 的 11-28 09:00–12:30 尚未开始，是六校里唯一还能实地看的场次；其余已结束的场次照列，便于回溯当时问了什么。</p>

<h3>⑤ 与 abcd2-reverse 家长顺序对照：哪一个更合理？</h3>
<p class="soft" style="font-size:12.4px">对照对象：<b>${esc(C.previousReport)}</b>（2026-11-24）。上一版结论：${esc(C.previousRecommendation)}</p>
<div style="overflow-x:auto">
<table>
${compareHead}
<tbody>${compareRows}</tbody>
</table>
</div>
<div class="note"><b>${esc(C.verdict)}</b></div>

<div class="warnbox">
<b>⚠ 上一版口径更正（重要）：</b>${esc(C.correction)}
上一版模板里「明显够不着的学校放第 1 不会伤害后续志愿」这句话本身没错——因为根本轮不到你；错的是把它推广成「更稳的放前面也无害」。
</div>

<h3>⑥ 两套新顺序，一眼对照</h3>
<div style="overflow-x:auto">
<table>
<thead><tr><th>志愿位</th><th>家长新顺序（方案 A）</th><th>方案 B · 六校不换</th><th>方案 C · 换 1 校</th></tr></thead>
<tbody>${[1, 2, 3, 4, 5, 6].map(i => `<tr><td class="num">${i}</td><td>${esc(short(A[i - 1]))}</td><td>${esc(short(B[i - 1]))}</td><td>${esc(short(OPT_C[i - 1]))}</td></tr>`).join('\n')}</tbody>
</table>
</div>
<p class="soft">方案 B 把 Hougang 提到第 2、North Vista 退到第 4；方案 C 再把 North Vista 换成 Springfield（7/7、明确 Computing、余量 +4、公交 32 分钟）。<br><b>取舍：</b>${esc(RESEARCH.alternativeOrders.B.tradeoff)} ${esc(RESEARCH.alternativeOrders.C.tradeoff)} 完整理由与风险见第六步。</p>

<h3>⑦ 主要来源与等级</h3>
<div style="overflow-x:auto">
<table>
<thead><tr><th>等级</th><th>来源</th><th>用途</th></tr></thead>
<tbody>${RESEARCH.sources.map(s => `<tr><td class="num"><span class="tag ${s.grade === 'A' ? 'a' : 'b'}">${esc(s.grade)}</span></td><td>${esc(s.title)}<br><span class="soft" style="font-size:11.8px">${esc(s.url)}</span></td><td class="soft" style="font-size:12.2px">${esc(s.usedFor)}</td></tr>`).join('\n')}</tbody>
</table>
</div>

<div class="warnbox">
<b>一句话：</b>这版比上一版更现实（Outram 的 -1 彩票位没了，Compassvale 归位第 1），
但<b>第 2 位仍是踩线校，Hougang 仍被埋在第 6</b>。不换校选 B，愿意换校选 C；两者都优于两份家长原始顺序。
</div>`;
  },

  A: {
    title: '方案 A · 家长新顺序（反向校验基准）',
    desc: 'Compassvale → North Vista → Punggol → Naval Base → Junyuan → Hougang；六校全部在池内，但前两位都踩线',
    picks: makePicks(A),
  },
  B: {
    title: '方案 B · 六校不换，按真实偏好重排',
    desc: 'Hougang 提到第 2、North Vista 退到第 4，Junyuan / Naval Base 退到末尾兜底',
    picks: makePicks(B),
  },
  C: {
    title: '方案 C · 换掉第二个彩票位，换成科目 + 缓冲',
    desc: 'North Vista 换 Springfield：多 1 个科目、多 4 分余量；代价是通勤 +6 分钟、少一个科技类社团',
    picks: makePicks(C),
  },

  focusPair: ['Springfield Secondary School', 'North Vista Secondary School'],

  finalAdvice: ({ esc }) => {
    const bSwap = FAMILY.map((n, i) => n === B[i] ? '' : `${i + 1}位 ${short(n)}→${short(B[i])}`).filter(Boolean);
    const cSwap = FAMILY.map((n, i) => n === OPT_C[i] ? '' : `${i + 1}位 ${short(n)}→${short(OPT_C[i] || '')}`).filter(Boolean);
    return `<h3>如果这是我的孩子，我会这样填</h3>
<p><b>先回答「哪一版家长顺序更合理」：v2 比 abcd2-reverse 合理，但都还不是最优。</b>v2 去掉了余量 -1 的 Outram，把真正够得着的 Compassvale 放第 1，六校也全部进入通勤与分数池；这是实打实的进步。问题没变：North Vista 是第二个余量 0 的踩线位，Hougang 仍被 Naval Base 挡住。</p>
<ul>
<li><b>第 1 位 Compassvale：保持。</b>21 分钟、6/7、机器人 + 戏剧双命中；余量 0 意味着它既是首选也是风险位，但放第 1 才能拿到最想去的结果。</li>
<li><b>第 2 位：这是最该动的位置。</b>North Vista 的 CCA 广度很吸引人，但 2024/2025 PG3 上限 17/18，AL 18 压线，且没有 Computing / 机器人；Hougang 7/7 + Computing + 余量 +2，更该排这里。</li>
<li><b>第 4 / 第 6 位：Naval Base 与 Hougang 对调。</b>MOE 先看第 1 志愿再看第 2，第 4 位的 Naval Base（+1、综合 70、EAP 中二选拔）若录上，派位根本不会看到第 6 位的 Hougang。喜欢 Hougang 就把它排前面。</li>
<li><b>第 5 位 Junyuan：位置合理。</b>余量 +3 最厚、Food Science ALP 对味，当前 MOE 页面也有英语戏剧，作为较稳档合适。</li>
</ul>
<p><b>我推荐：</b>愿意换校就选<b>方案 C</b>（${esc(namesOf(OPT_C))}）——六个位置只剩 Compassvale 一个彩票位，且 7/7 + Computing 的 Hougang 与 Springfield 都在前半段；坚持六校不换就选<b>方案 B</b>（${esc(namesOf(B))}）。</p>
<p class="soft">相对 v2 家长新顺序：方案 B 改动 ${bSwap.length} 个位置（${esc(bSwap.join('；'))}）；方案 C 改动 ${cSwap.length} 个位置，并新增 ${esc(namesOf(ADDED_C))}、移出 ${esc(namesOf(DROPPED_C))}。综合分衡量适配度，志愿顺序衡量「先看哪所、同分谁优先」，两者不能互相替代。</p>`;
  },

  todo: () => {
    const near = R.pool.filter(x => x.busMinutes >= R.student.maxCommute - 5);
    return `<b>提交前必须做的五件事（窗口到 2026-11-30 16:30）：</b><br>
① <b>先定第 2 志愿给谁</b>：North Vista（社团广、26 分钟、余量 0、无 Computing）还是 Hougang（7/7 + Computing、32 分钟、余量 +2）。这个决定比微调第 3–6 位重要。<br>
② <b>Hougang 开放日 11-28 09:00–12:30 去一趟</b>：问 PG3 学生能否选 G3 Computing、Higher Chinese 与 A-Maths 能否同时修；这是六校里唯一还有实体的可看场次。<br>
③ <b>问清社团入场规则</b>：Compassvale Robotics 与 English Drama 的 Sec 1 名额、North Vista Infocomm Club 与 Drama Club 是否 Sec 1 可进、Naval Base EAP 的中二选拔条件。<br>
④ <b>实测早高峰公交</b>：本口径从 65431 单向、不换乘，候车 ${R.stats.busParams.waitMin} 分 + 车内 ${R.stats.busParams.rideMinPerStop} 分/站是模型值；${near.length ? escShort(near.slice(0, 2).map(x => x.name)) + ' 已接近 60 分钟上限。' : ''}<br>
⑤ <b>12 月本届 COP 公布后复核</b>：本报告用的是 2025 年度区间；Compassvale / North Vista 余量 0、Punggol / Naval Base +1，都是 PR 下的高风险位。六个都落空时接受 MOE 分配的退路也要提前谈好。`;
  },
};

function escShort(arr) { return arr.map(short).join('、'); }

/** 逐校卡片：事实从 research / _recommend 反查，不手写 COP 与命中数。 */
const DETAIL = {};
for (const name of [...new Set([...A, ...B, ...C, ...PLANS.focusPair])]) {
  const x = get(name);
  const rec = researchOf(name);
  if (!x && !rec) continue;
  const hits = (x && x.ccaHits) || [];
  DETAIL[name] = {
    feature: (rec
      ? `${escPlain(rec.programmeNote || '')} ${escPlain(rec.ccaNote || '')}`
      : (hits.length ? '兴趣命中：<b>' + hits.join(' / ') + '</b>。' : '五项 CCA 兴趣没有直接命中。'))
      + ` 科目命中 ${fitOf(name)}${hasComputing(name) ? '（明确 Computing）' : '（Computing 仅 G1）'}。`,
    profile: `${short(name)}，PG3 ${cOf(name)}，${howOf(name)}；COP 轨迹 ${trendOf(name)}。`
      + (x ? `全程纯步行 ${x.walkMinutes != null ? x.walkMinutes + ' 分钟' : '无数据'}。` : ''),
    verdict: `<b>反向判断：</b>${escPlain(rec ? rec.verdict : (x && x.margin >= 3 ? '余量相对较宽，可作为兜底。' : '余量偏薄，PR 下不能当稳位。'))}<br>`
      + `<b>余量：</b>${mOf(name)} · <b>通勤：</b>${gateOf(name)} 分 · <b>科目：</b>${fitOf(name)} · <b>综合：</b>${totalOf(name)}。`,
  };
}
function escPlain(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { PLANS, DETAIL };
