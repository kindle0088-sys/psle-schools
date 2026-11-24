/**
 * abcd2-reverse：从家长已选六校出发的反向校验报告
 *
 * 画像与 abcd2 完全相同（AL 18 / PR / Twin Waterfalls 65431 不换乘公交 / 60 分钟 /
 * 7 个学术科目 + 5 项 CCA 兴趣）。本配置不改评分口径，只把家长顺序作为方案 A，
 * 再用 MOE SchoolFinder、学校官网、SEAB 2026 文告与项目数据层做反向核对，
 * 提出两套新顺序（B/C）。
 *
 * 事实源：data/research/abcd2-reverse.json、data/psle-cohort.json、
 *         data/_recommend-abcd2-reverse.json、data/cca-catalog.json
 * 判断层：本文件。改画像时这些文字必须重新人工核对。
 */
const R = require('../_recommend-abcd2-reverse.json');
const RESEARCH = require('../research/abcd2-reverse.json');
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
const totalOf = n => { const x = get(n); return x ? x.total : '—'; };
const ccaOf = n => { const x = get(n); return x && x.ccaHits && x.ccaHits.length ? x.ccaHits.join('+') : '零命中'; };
const hasComputing = n => { const x = get(n); return !!x && (x.subjectHits || []).includes('Computing'); };
const trendOf = n => {
  const rec = RESEARCH.schools[n];
  if (!rec) return '—';
  return rec.cop.map(c => c.status === 'no-s1'
    ? `${c.year} 无 S1 派位`
    : `${c.year} ${c.min}–${c.max}`).join(' → ');
};
const researchOf = n => RESEARCH.schools[n] || null;
const namesOf = arr => arr.map(short).join(' → ');

const FAMILY = Object.entries(RESEARCH.schools)
  .sort((a, b) => a[1].familyRank - b[1].familyRank)
  .map(([name]) => name);
const OPT_B = RESEARCH.alternativeOrders.B.order;
const OPT_C = RESEARCH.alternativeOrders.C.order;
const ADDED_C = OPT_C.filter(n => !FAMILY.includes(n));
const DROPPED_C = FAMILY.filter(n => !OPT_C.includes(n));
const FAMILY_POSITIVE = FAMILY.filter(n => { const x = get(n); return x && x.margin > 0; });
const FAMILY_THICK = FAMILY.filter(n => { const x = get(n); return x && x.margin >= 2; });
const FULL_SEVEN = R.pool.filter(x => x.subjectFit === 7);
const FULL_SEVEN_COMP = FULL_SEVEN.filter(x => hasComputing(x.name));
const EXACT_COMP = R.pool.filter(x => hasComputing(x.name));
const ROBUST = R.pool.filter(x => x.margin >= 4);
const TIER = n => {
  const x = get(n);
  if (!x || x.margin <= 2) return '冲刺';
  return '匹配';
};

/** 方案 A = 家长原顺序；B/C = 两套新顺序。逐条理由见 picks[].why/risk。 */
const A = FAMILY, B = OPT_B, C = OPT_C;

const A_WHY = {
  'Outram Secondary School': '唯一有游泳 / 水球 DSA 与 CCA 的学校，Anchorvale 新校区已启用，公交 19 分钟。家长把特色放第 1，方向上说得通。',
  'Compassvale Secondary School': '实质上的第一候选：21 分钟、6/7 科目、机器人 + 戏剧双命中，2024/2025 COP 都稳定在 14–18。',
  'Punggol Secondary School': '21 分钟、6/7 科目、戏剧社团，Mobile Robotics 是全岛稀缺科目；作为第 3 位合理。',
  'Naval Base Secondary School': 'Enhanced Art Programme 是 9 所官方 EAP 校之一，30 分钟、6/7 科目；若艺术是家庭优先级，第 4 位可解释。',
  'Junyuan Secondary School': '六校里唯一余量 ≥3（+3），综合分 79 最高，ALP 正是 Food Science；第 5 位承担相对稳妥角色。',
  'Hougang Secondary School': '7/7 科目全命中且明确列 Computing，还有 Speech and Drama 社团、余量 +2；放在最后实际很难轮到。',
};
const A_RISK = {
  'Outram Secondary School': '2025 PG3 区间 9–17，AL 18 差 1 分；2024 无 S1 派位，迁校后只有一年区间可参考。PR 同分输公民，不能当稳位。',
  'Compassvale Secondary School': '余量 0，是踩线；Computing 只有 Computer Applications（G1），G2/G3 组合要向学校确认。',
  'Punggol Secondary School': '余量 +1；Mobile Robotics 是科目不是机器人社团，戏剧命中来自语言辩论社团，不是独立剧社。',
  'Naval Base Secondary School': '余量 +1、综合分 70 为六校最低；EAP 在中二校内选拔，S1 填报不等于进 EAP。AI 命中只是科技类 CCA 归类。',
  'Junyuan Secondary School': 'Computing 只有 G1；虽然余量 +3，但还没到 ≥6，PR 下仍是「相对稳」而非「稳」。',
  'Hougang Secondary School': '32 分钟公交、步行 47 分钟，早高峰缓冲有限；第 6 位意味着前面 +1 的 Naval Base 若录取，它就不会被考虑。',
};
const makePicks = arr => arr.map((name, i) => ({
  name,
  slot: i + 1,
  tier: TIER(name),
  why: A_WHY[name] || (() => {
    const x = get(name);
    if (!x) return '';
    return `${fitOf(name)} 命中、余量 ${mOf(name)}、${howOf(name)}；${x.alpCats && x.alpCats.length ? 'ALP ' + x.alpCats.join(' / ') : '特色项目见逐校卡片'}。`;
  })(),
  risk: A_RISK[name] || (() => {
    const x = get(name);
    if (!x) return '';
    const bits = [`余量 ${mOf(name)}`];
    if (!hasComputing(name)) bits.push('Computing 只有 G1，需确认 G2/G3');
    if (x.minutes >= 40) bits.push('通勤接近上限');
    return bits.join('；') + '。';
  })(),
}));

const PLANS = {
  hero: () => 'AL <b>18</b> · PG3 · PR · 邮编 <b>828765</b> · Twin Waterfalls（65431）不换乘公交 / 纯步行 ≤60 分钟。\n'
    + '这不是新画像，而是<b>反向校验</b>：家长已选 <b>' + FAMILY.length + ' 所</b>学校，其中 <b>'
    + FAMILY.filter(n => !R.pool.some(x => x.name === n)).length + ' 所（' + escShort(FAMILY.filter(n => !R.pool.some(x => x.name === n))) + '）按 2025 COP 还够不着</b>。\n'
    + '结论先说：<b>第 1 位 Outram 可以留，但只能当冲刺位；第 6 位 Hougang 是本名单最明显的顺序错配</b>。'
    + '六校中余量 ≥2 的只有 Junyuan（+3）与 Hougang（+2），而 Hougang 被放最后。',

  intro: () => '这份报告沿用 abcd2 的全部画像与评分口径：<b>分数不变、路网不变、科目匹配不入五维分</b>。变的只是问题方向——'
    + '不是「系统推荐哪六所」，而是「家长选的这六所和这个顺序，在 MOE 官方规则与 2026 大盘下站不站得住」。<br>'
    + '① <b>大盘</b>：2026 考生 40,906 人，与 2024 龙年 40,894 人几乎持平；141 校参与 S1，比 2024 多 1 所。<br>'
    + '② <b>规则</b>：PR 同分排公民之后；往年 COP 只是参考，达到 COP 不代表录取。<br>'
    + '③ <b>科目</b>：六校里只有 Hougang 明确列 Computing；其余五校都只列 Computer Applications（G1）。<br>'
    + '④ <b>顺序</b>：MOE 按分数从高到低依次投档，所以「把更稳的学校放前面」不会伤害冲刺校；但把更想去的学校放最后，基本等于放弃。',

  step2Note: () => '候选池仍是 <b>' + R.pool.length + ' 所</b>（公交入池 ' + R.stats.busInPool + '、纯步行 ' + R.stats.walkInPool
    + '，地铁不计）。家长名单里 5 所在池内，Outram 在「够不着」名单（余量 -1）。<b>这不等于不能填</b>——冲刺位只占一个志愿位；'
    + '但它意味着六校里有 1 所不是真实候选，而是愿望位。',

  step3Note: () => '把 COP 拉长到三年来看：Compassvale（14–18 → 14–18）与 Punggol（13–19 → 13–19）2024/2025 完全稳定；'
    + 'Hougang 2023 的 16–22 到 2024/2025 的 14–20 明显回落；Junyuan 上限从 2024 的 22 收到 2025 的 21；'
    + 'Naval Base 反而从 13–18 放宽到 13–19。<b>Outram 2024 没有 S1 派位、2025 才有 9–17</b>，迁校断裂让它最难判断。'
    + '数值更小 = 门槛更紧；PR 在踩线位还要让公民，余量 0/1 都不该当兜底。',

  step4Note: () => '<b>逐校核对后，最该改的不是「选哪六所」，而是「谁排第 4、谁排第 6」。</b><br>'
    + '① <b>Hougang 被浪费了</b>：它 7/7 命中且明确 Computing，余量 +2、戏剧社团明确，却排第 6；前一位 Naval Base 只有 +1，先录上就不会轮到它。<br>'
    + '② <b>Naval Base 的艺术强项不在孩子兴趣清单</b>：EAP 是真的（MOE 九校之一），但中二校内选拔才决定能不能进，S1 填报不是入场券。<br>'
    + '③ <b>Outram 的游泳是真的，但 DSA 通道已过</b>：普通 S1 入学后能否进泳队要单独问；2025 区间 9–17 又比 AL 18 高一位。<br>'
    + '④ <b>「AI 命中」要打折看</b>：Naval Base / Junyuan / Outram 的 AI 命中来自资讯科技 / 媒体制作 / Maker 类社团归类，不是学校设有名为 AI 的社团。',

  step5Note: () => '主池 ' + R.pool.length + ' 所的档位：冲刺（余量 0–2）' + R.pool.filter(x => x.margin >= 0 && x.margin <= 2).length
    + ' 所、匹配（3–5）' + R.pool.filter(x => x.margin >= 3 && x.margin <= 5).length + ' 所、稳妥（≥6）'
    + R.pool.filter(x => x.margin >= 6).length + ' 所。家长名单里余量 >0 的有 ' + FAMILY_POSITIVE.length + ' 所，但 ≥2 的只有 '
    + namesOf(FAMILY_THICK) + '。<b>官方建议 6 个志愿里放 2–3 个往年 COP 较宽松的学校</b>——这份名单数量达标，质量偏薄，且最厚的两所之一排在最末。',

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
      const verdict = rec ? rec.verdict : '—';
      return `<tr>
  <td class="num"><b>${i + 1}</b></td>
  <td><b>${esc(short(name))}</b><br><span class="soft">综合 ${totalOf(name)} · 余量 ${mOf(name)}</span></td>
  <td class="soft" style="font-size:12.2px">${esc(trendOf(name))}${name === 'Outram Secondary School' ? '<br>2025 为迁校后首个可用区间' : ''}</td>
  <td class="num">${cOf(name)}</td>
  <td class="num">${fitOf(name)}${hasComputing(name) ? '<br><b>明确 Computing</b>' : '<br><span class="soft">Computing 仅 G1</span>'}</td>
  <td class="soft" style="font-size:12.2px">${esc(ccaOf(name))}<br>${esc(x && x.busService ? x.busService + ' 路' : '—')} ${gateOf(name)} 分</td>
  <td class="soft" style="font-size:12.2px">${esc(verdict)}</td>
</tr>`;
    }).join('\n');

    const expansionRows = FAMILY.map(name => {
      const rec = researchOf(name);
      return `<tr><td>${esc(short(name))}</td><td class="soft" style="font-size:12.2px">${esc(rec ? rec.expansionNote : '—')}</td></tr>`;
    }).join('\n');

    const compareRows = [1, 2, 3, 4, 5, 6].map(i =>
      `<tr><td class="num">${i}</td><td>${esc(short(FAMILY[i - 1]))}</td>`
      + `<td>${esc(short(B[i - 1]))}</td><td>${esc(short(C[i - 1]))}</td></tr>`).join('\n');

    return `<h2 style="margin-top:26px">00 反向校验：家长六志愿逐条核对</h2>
<p class="lead">这一节是本次报告的新增内容。事实来自 MOE SchoolFinder、学校官网、SEAB 2026 文告与项目数据层；判断在灰框与第六步里明确标出。</p>

<h3>① 2026 大盘：与 2024 龙年几乎同量</h3>
<div style="overflow-x:auto">
<table>
<thead><tr><th>年份</th><th>PSLE 考生</th><th>同比</th><th>适合升读</th><th>官方备注</th></tr></thead>
<tbody>${cohortRows}</tbody>
</table>
</div>
<div class="note">
<b>判断：</b>2026 的 ${RESEARCH.cohort.candidates2026.toLocaleString('en-US')} 人比 2024 龙年只多 ${RESEARCH.cohort.deltaVs2024} 人（+0.03%），但比 2025 多 ${RESEARCH.cohort.candidates2026 - 37926} 人（约 +10.5%）。
参与 2026 S1 的学校有 ${RESEARCH.cohort.schoolsInS1Posting2026} 所，比 2024 的 ${RESEARCH.cohort.schoolsInS1Posting2024} 所多 1 所。
<b>这说明总体回到 2024 的竞争量级，不能证明这六校今年一定收紧或放松</b>——COP 还取决于同届家长怎么填。SEAB 的官方建议仍是：6 个志愿里放 2–3 个往年 COP 较宽松的学校。
</div>

<h3>② 六校逐年 COP、科目、社团与通勤核对</h3>
<div style="overflow-x:auto">
<table>
<thead><tr><th>家长序位</th><th>学校 / 余量</th><th>PG3 COP 2023 → 2024 → 2025</th><th>2025 区间</th><th>科目</th><th>社团 / 通勤</th><th>反向核对结论</th></tr></thead>
<tbody>${schoolRows}</tbody>
</table>
</div>
<p class="soft" style="font-size:12.4px">口径：COP 只取 PG3 非附属行，数值越小越难；「余量」= 2025 区间上端 − 18。Outram 不在主池，余量为 -1。兴趣模型把 Infocomm Technology / Media Production / Maker 类社团归为「AI」命中，<b>不等于学校有名为 AI 的社团</b>；Mobile Robotics 是科目，不是机器人社团。</p>

<h3>③ 扩招：目前没有能支撑「某校会松」的官方证据</h3>
<div style="overflow-x:auto">
<table>
<thead><tr><th style="width:18%">学校</th><th>公开资料核对结果</th></tr></thead>
<tbody>${expansionRows}</tbody>
</table>
</div>
<p class="soft" style="font-size:12.4px">Outram 官方地址：<b>48 Anchorvale Crescent, Singapore 549936</b>。MOE SchoolFinder 原文说明，York Hill 旧校区在读生将继续在原址就读至 2027 年毕业。</p>
<div class="note">
<b>结论：</b>截至 ${RESEARCH.checkedAt}，MOE / SEAB 的 2026 PSLE 文告、S1 Posting 页面与 SchoolFinder <b>都没有逐校 S1 学额字段，也没有这六所的扩招计划</b>。
项目全量查证过：逐校 S1 学额不存在公开来源；能严谨给的只有全市均值约 ${RESEARCH.capacity.cityAverageSec1PerSchool} 人/校（2025 学年 Sec 1 在册 41,144 ÷ 141 所），<b>这不是任何一所学校的承诺名额</b>。
唯一可核实的结构变化是 Outram 迁往 Anchorvale 新校区；2024 无 S1 派位、2025 才出现 9–17 区间，不能倒推成「扩招所以门槛会松」。
Naval Base 的 EAP 虽是官方九校之一，但按 MOE 原文必须在<b>中二</b>通过校内选拔，S1 填报不构成 EAP 录取。
</div>

<h3>④ 两套新顺序，一眼对照</h3>
<div style="overflow-x:auto">
<table>
<thead><tr><th>志愿位</th><th>家长原顺序（方案 A）</th><th>方案 B · 不换校</th><th>方案 C · 换 1 校</th></tr></thead>
<tbody>${compareRows}</tbody>
</table>
</div>
<p class="soft">方案 B 把 Hougang 从第 6 提到第 3、Naval Base 退到第 6；方案 C 进一步把余量 -1 的 Outram 换成 Springfield（7/7 命中、明确 Computing、余量 +4、公交 32 分钟）。<br><b>取舍：</b>${esc(RESEARCH.alternativeOrders.B.tradeoff)} ${esc(RESEARCH.alternativeOrders.C.tradeoff)} 两套顺序的完整理由与风险见第六步。</p>

<h3>⑥ 主要来源与等级</h3>
<div style="overflow-x:auto">
<table>
<thead><tr><th>等级</th><th>来源</th><th>用途</th></tr></thead>
<tbody>${RESEARCH.sources.map(s => `<tr><td class="num"><span class="tag ${s.grade === 'A' ? 'a' : 'b'}">${esc(s.grade)}</span></td><td>${esc(s.title)}<br><span class="soft" style="font-size:11.8px">${esc(s.url)}</span></td><td class="soft" style="font-size:12.2px">${esc(s.usedFor)}</td></tr>`).join('\n')}</tbody>
</table>
</div>

<div class="warnbox">
<b>反向校验的一句话：</b>这份名单的「选校」基本合理，真正的问题是顺序——<b>Outram 只配做第 1 个冲刺位，Compassvale 才是现实第一志愿；Hougang 不该排第 6，Naval Base 不该挡在它前面</b>。
如果游泳是硬需求，选 B；如果不是，选 C。</div>`;
  },

  A: {
    title: '方案 A · 家长原顺序（反向校验基准）',
    desc: 'Outram → Compassvale → Punggol → Naval Base → Junyuan → Hougang；保留家长判断，逐条给出风险管理',
    picks: makePicks(A),
  },
  B: {
    title: '方案 B · 六校不换，科目与安全边际归位',
    desc: '保留游泳冲刺位；Hougang 提到第 3，Naval Base 退到第 6，Junyuan 留在第 5 兜底',
    picks: makePicks(B),
  },
  C: {
    title: '方案 C · 换掉游泳冲刺位，换成科目 + 缓冲',
    desc: '把 Outram 换成 Springfield：多一所 7/7 + 明确 Computing 的学校，也多 4 分余量；代价是失去泳池',
    picks: makePicks(C),
  },

  focusPair: ['Springfield Secondary School', 'Seng Kang Secondary School'],

  finalAdvice: ({ esc }) => {
    const bSwap = FAMILY.map((n, i) => n === B[i] ? '' : `${i + 1}位 ${short(n)}→${short(B[i])}`).filter(Boolean);
    const cSwap = FAMILY.map((n, i) => n === C[i] ? '' : `${i + 1}位 ${short(n)}→${short(C[i])}`).filter(Boolean);
    return `<h3>如果这是我的孩子，我会这样填</h3>
<p><b>先回答家长名单对不对：学校基本选对了，顺序需要动。</b>六校里有 5 所在通勤与分数口径内，Outram 是唯一够不着的冲刺位；科目、社团、通勤都过得去。问题集中在两个位置。</p>
<ul>
<li><b>第 1 位 Outram：保留，但按「彩票」看待。</b>它是唯一游泳 / 水球校，新校区也确实在 Anchorvale；但 2025 PG3 上端 17，AL 18 差 1 分，PR 又输公民。放第 1 的成本只是占一个志愿位，放第 6 则完全无效——所以如果留它，只能放第 1。</li>
<li><b>第 2 位 Compassvale：不要被「第 2」骗了。</b>它是这份名单真正的现实第一候选：21 分钟、6/7、机器人 + 戏剧、2024/2025 COP 稳定。余量 0 意味着踩线，所以第 2 位既是首选也是风险位。</li>
<li><b>第 4 位 Naval Base 与第 6 位 Hougang：这是最该挑战的一对。</b>Naval Base 余量 +1、综合 70、Computing 仅 G1；Hougang 余量 +2、综合 77、7/7 且明确 Computing、戏剧社团也扎实。MOE 按分数从高到低投档，前一位录上就不会看后一位——把 Hougang 放第 6，相当于主动降低它的作用。</li>
<li><b>第 5 位 Junyuan：位置合理，但可以更前。</b>它是六校唯一余量 ≥3 的学校，ALP 正好是 Food Science。若家庭把「有学上」放在特色之前，它应升到第 4。</li>
</ul>
<p><b>我推荐的顺序：</b>游泳不是硬需求就选<b>方案 C</b>（Compassvale → Hougang → Springfield → Punggol → Junyuan → Naval Base），把 -1 的 Outram 换成 +4 且 7/7 的 Springfield；游泳是硬需求就选<b>方案 B</b>（${esc(namesOf(B))}），六校全留，只把 Hougang 与 Naval Base 对调到位次 3 与 6。</p>
<p class="soft">相对家长原顺序：方案 B 改动 ${bSwap.length} 个位置（${esc(bSwap.join('；'))}）；方案 C 改动 ${cSwap.length} 个位置，并新增 ${esc(namesOf(ADDED_C))}、移出 ${esc(namesOf(DROPPED_C))}。${ADDED_C.length ? '' : ''}综合分排名与志愿顺序仍不完全一致：综合分衡量适配度，志愿顺序衡量落空风险与兴趣保留，两者不能互相替代。</p>`;
  },

  todo: () => {
    const near = R.pool.filter(x => x.busMinutes >= R.student.maxCommute - 5);
    return `<b>提交前必须做的五件事（窗口到 2026-11-30 16:30）：</b><br>
① <b>先定「游泳是不是硬需求」</b>：是 → 用方案 B，Outram 留第 1；不是 → 用方案 C，把 Outram 换成 Springfield。这个决定比微调第 3–6 位重要得多。<br>
② <b>开放日问清科目组合</b>：Hougang / Springfield 的 G3 Computing 是否向 PG3 学生开放、Higher Chinese 与 A-Maths 能否同时选；其余五校的 Computer Applications 只是 G1，不等于 Computing。<br>
③ <b>问清社团入场规则</b>：Outram 泳队 / 水球队普通 S1 生能否进、Compassvale Robotics 与 English Drama 的 Sec 1 名额、Naval Base EAP 的中二选拔条件。<br>
④ <b>实测早高峰公交</b>：本口径从 65431 单向、不换乘，候车 ${R.stats.busParams.waitMin} 分 + 车内 ${R.stats.busParams.rideMinPerStop} 分/站是模型值；${near.length ? escShort(near.slice(0, 2).map(x => x.name)) + ' 已接近 60 分钟上限。' : ''}<br>
⑤ <b>12 月本届 COP 公布后复核</b>：本报告用的是 2025 年度区间；Outram -1、Compassvale 0、Punggol / Naval Base +1 都是 PR 下的高风险位。六个都落空时接受 MOE 分配的退路也要提前谈好。`;
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
