/**
 * abcd2 的六志愿设计与逐校判断
 *
 * 画像：AL 18 / PR / 828765 / 不换乘公交+步行 或 纯步行 ≤60 / 混校 / 无附属
 * 与 abcd1 同分、同址、同通勤、同 CCA；唯一差别是学术兴趣具体化为 7 个科目/类别，
 * 并要求逐校列 offered subjects、把匹配项与稀缺/强项高亮。
 *
 * ⚠️ 所有判断从 data/_recommend-abcd2.json 现算。科目匹配只影响展示与方案理由，
 *    不进入五维综合分——改权重不该悄悄改变既有学生的排名口径。
 */
const R = require('../_recommend-abcd2.json');
const ALL = [...R.pool, ...R.outOfReach, ...R.singleSex];
const get = n => ALL.find(x => x.name === n);
const sn = n => n.replace(/ Secondary School| \(Secondary\)/, '');
const fmt = m => (m == null ? '—' : m > 0 ? '+' + m : String(m));
const mOf = n => { const x = get(n); return x ? fmt(x.margin) : '—'; };
const cOf = n => { const x = get(n); return x && x.cop ? x.cop.min + '–' + x.cop.max : '—'; };
const gate = n => { const x = get(n); return x ? x.minutes : '—'; };
const how = n => {
  const x = get(n);
  if (!x) return '—';
  return x.commuteMode === 'bus'
    ? `公交 ${x.busMinutes} 分（${x.busService}，${x.busHops} 站，下车走 ${x.busWalkMinutes} 分）`
    : `步行 ${x.walkUpperMinutes != null ? x.walkUpperMinutes : x.walkMinutes} 分`;
};
const hit = (x, k) => !!x && (x.ccaHits || []).includes(k);
const names = arr => arr.map(x => sn(x.name)).join('、');
const escNames = arr => names(arr);
const fit = n => { const x = get(n); return x ? `${x.subjectFit}/${R.stats.subjectInterests.length}` : '—'; };
const hasSubj = (n, k) => { const x = get(n); return !!x && (x.subjectHits || []).includes(k); };
const subjOf = n => {
  const x = get(n);
  if (!x) return '—';
  const hard = x.subjectHits || [];
  const soft = x.subjectSoftHits || [];
  return hard.join(' + ') + (soft.length ? `（${soft.join('、')} 仅 G1）` : '');
};
const uniqueOf = n => {
  const x = get(n);
  if (!x) return '—';
  return [...(x.rareSubjects || []), ...(x.strongProgrammes || [])].join(' / ') || '无';
};

const FIT_MAX = Math.max(...R.pool.map(x => x.subjectFit));
const FULL_FIT = R.pool.filter(x => x.subjectFit === FIT_MAX);
const EXACT_COMPUTING = R.pool.filter(x => (x.subjectHits || []).includes('Computing'));
const SOFT_COMPUTING = R.pool.filter(x => (x.subjectSoftHits || []).includes('Computing'));
const FULL_EXACT = FULL_FIT.filter(x => (x.subjectHits || []).includes('Computing'));
const NEAR_FULL = FULL_EXACT.filter(x => x.busMinutes <= 35).sort((a, b) => a.busMinutes - b.busMinutes);
const UNIQUE_POOL = R.pool.filter(x => (x.rareSubjects || []).length || (x.strongProgrammes || []).length);
const NO_HCL = R.pool.filter(x => !(x.subjectHits || []).includes('Higher Chinese'));
const NO_NFS = R.pool.filter(x => !(x.subjectHits || []).includes('Nutrition and Food Science'));
const DRAMA_POOL = R.pool.filter(x => hit(x, '戏剧'));
const ROBOT_POOL = R.pool.filter(x => hit(x, '机器人'));
const AI_POOL = R.pool.filter(x => hit(x, 'AI'));
const SAFE4 = R.pool.filter(x => x.margin >= 4).sort((a, b) => a.busMinutes - b.busMinutes);
const BUS_IN_POOL = R.pool.filter(x => x.commuteMode === 'bus').length;
const WALK_IN_POOL = R.pool.filter(x => x.commuteMode === 'walk').length;

const A = [
  'Hougang Secondary School',        // 7/7 + 明确 Computing + 戏剧 + 32 分
  'Springfield Secondary School',    // 7/7 + 明确 Computing + 余量 +4 + 32 分
  'Serangoon Garden Secondary School',// 7/7 + 明确 Computing + AI + 余量 +4
  'Punggol Secondary School',        // Mobile Robotics 全岛稀缺 + 戏剧 + 21 分
  'Seng Kang Secondary School',      // ESS 稀缺 + 戏剧 + 26 分
  'Junyuan Secondary School',        // 余量 +3，AI，29 分
];
const B = [
  'Springfield Secondary School', 'Serangoon Garden Secondary School',
  'Broadrick Secondary School', 'Northbrooks Secondary School',
  'Yuying Secondary School', 'Junyuan Secondary School',
];
const C = [
  'Compassvale Secondary School', 'North Vista Secondary School',
  'Punggol Secondary School', 'Naval Base Secondary School',
  'Orchid Park Secondary School', 'Yishun Secondary School',
];
const B_DROPPED = A.filter(n => !B.includes(n));
const C_DROPPED = A.filter(n => !C.includes(n));

const PLANS = {
  hero: ({ S, esc }) => {
    return 'AL <b>' + S.score + '</b> 分 · ' + S.pgShort + ' · 邮编 ' + esc(S.postal)
      + ' · <b>不换乘公交 / 纯步行</b>上限 ' + S.maxCommute + ' 分钟 · <b>永久居民（PR）</b>。\n'
      + '通勤与分数筛出 <b>' + R.pool.length + ' 所</b>主池，其中公交入池 ' + BUS_IN_POOL
      + ' 所、纯步行 ' + WALK_IN_POOL + ' 所。这一版新增了「学校到底开了哪些科目」这一列：'
      + R.pool.length + ' 所里只有 <b>' + FULL_FIT.length + ' 所命中全部 ' + R.stats.subjectInterests.length
      + ' 项兴趣科目</b>，且都同时列有明确的 <b>Computing</b>（不是 Computer Applications）。\n'
      + '<b>先说结论：第 1 位放 ' + esc(sn(A[0])) + '</b>（' + fit(A[0]) + ' 命中、' + how(A[0])
      + '、余量 ' + mOf(A[0]) + '、戏剧社团）；第 2 位 ' + esc(sn(A[1])) + ' 同为 ' + fit(A[1])
      + ' 且余量 ' + mOf(A[1]) + '。<b>但别把「科目全中」当成录取稳</b>：这是 PR，同分输公民。';
  },

  intro: ({ S, esc }) => {
    return '这份画像与 abcd1 同分、同址、同通勤、同 CCA，唯一变化是把学术兴趣写成了可核对的科目。<br>'
      + '① <b>科目清单不是万能钥匙</b>：' + R.pool.length + ' 所主池里 ' + EXACT_COMPUTING.length
      + ' 所明确列 Computing，' + SOFT_COMPUTING.length + ' 所只列 Computer Applications（G1 Computing）——'
      + '家长口径里的 Computing 若指 G3，后者不能直接算命中。<br>'
      + '② <b>差异其实集中在两门课</b>：Higher Chinese 有 ' + NO_HCL.length + ' 所没列（'
      + esc(names(NO_HCL)) + '），Nutrition and Food Science 有 ' + NO_NFS.length + ' 所没列（'
      + esc(names(NO_NFS)) + '）；其余 A-Maths、Science、D&T 在主池几乎全覆盖。<br>'
      + '③ <b>独特科目集中在少数校</b>：' + UNIQUE_POOL.length + ' 所有稀缺或公开特色项目，例如 '
      + esc(names(UNIQUE_POOL.slice(0, 4))) + '。它们值得看，但「稀缺」不等于「教学强」。<br>'
      + '④ <b>CCA 兴趣没被牺牲</b>：主池仍有 ' + ROBOT_POOL.length + ' 所机器人、' + AI_POOL.length
      + ' 所 AI、' + DRAMA_POOL.length + ' 所戏剧；方案 A 把科目与社团一起看，而不是只追科目数。';
  },

  step2Note: ({ S }) => {
    return '孩子 ' + S.score + ' 分属 PG3，通勤硬约束后主池 ' + R.pool.length + ' 所，余量 '
      + fmt(Math.min(...R.pool.map(x => x.margin))) + ' 到 ' + fmt(Math.max(...R.pool.map(x => x.margin)))
      + '。这 ' + R.pool.length + ' 所里 ' + BUS_IN_POOL + ' 所靠不换乘公交，' + WALK_IN_POOL
      + ' 所靠纯步行，地铁不认；被这口径砍掉 ' + R.stats.busCutCount + ' 所。'
      + '科目维度不改动这个池子——它只回答「留下来的学校开了什么课」，不回答「谁更容易进」。';
  },

  step3Note: ({ S, esc }) => {
    const top = SAFE4[0];
    return '科目全中的 ' + FULL_FIT.length + ' 所里，余量最高也只有 '
      + fmt(Math.max(...FULL_FIT.map(x => x.margin))) + '；通勤最短的两所 ' + esc(names(NEAR_FULL))
      + ' 分别 ' + NEAR_FULL.map(x => x.busMinutes).join(' / ') + ' 分钟。'
      + '而余量 ' + fmt(top.margin) + ' 档里交通最短的 ' + esc(sn(top.name)) + ' 也要 '
      + top.busMinutes + ' 分钟。<b>subjects 匹配解决的是「值不值得去」，COP 余量解决的才是「进不进得去」——两者不能互相抵账。</b>'
      + 'PR 同分让位公民，余量 ' + mOf(A[0]) + ' 的踩线校不能当兜底。';
  },

  step4Note: ({ S, S2, esc }) => {
    return '<b>我的判断：这次把科目维度放高，但没有取代 CCA 与 COP</b><br>'
      + '① 画像里 7 项学术兴趣，主池最高命中 <b>' + FIT_MAX + ' / ' + S2.subjectInterests.length
      + '</b>，达到满分的只有 ' + FULL_FIT.length + ' 所（' + escNames(FULL_FIT) + '），而且这 '
      + FULL_FIT.length + ' 所都列有明确的 Computing。<br>'
      + '② <b>但科目表只说明「开了什么」</b>：学校按资格、选课人数与师资排组合，'
      + 'Computer Applications 只等于 G1 Computing。开放日必须问 G2/G3 是否真的开得出来。<br>'
      + '③ <b>CCA 仍要单独看</b>：主池有 Robotics 的 ' + ROBOT_POOL.length + ' 所、戏剧 '
      + DRAMA_POOL.length + ' 所、AI ' + AI_POOL.length + ' 所。'
      + 'Compassvale / North Vista 社团双命中但科目不是满分，正是「科目 vs 社团」的核心取舍。';
  },

  step5Note: ({ S, esc }) => {
    return '<b>主池 ' + R.pool.length + ' 所的档位：冲刺（0–2）'
      + R.pool.filter(x => x.margin >= 0 && x.margin <= 2).length + ' 所、匹配（3–5）'
      + R.pool.filter(x => x.margin >= 3 && x.margin <= 5).length + ' 所、稳妥（≥6）'
      + R.pool.filter(x => x.margin >= 6).length + ' 所。</b><br><br>'
      + '方案 A 的做法是：<b>前三位全给 7/7 命中 + 明确 Computing 的学校</b>，其中两所通勤 32 分钟；'
      + '第 4–5 位补稀缺科目（Mobile Robotics / Exercise & Sports Science）与戏剧社团，'
      + '第 6 位用余量 ' + mOf(A[5]) + ' 的 ' + esc(sn(A[5])) + ' 收尾。'
      + '<br><br>PR 身份下没有任何 ≥6 分的稳位；'
      + '所以「有得挑」不代表「挑得到稳的」，提交前仍要确认六个都落空时的退路。';
  },

  A: {
    title: '方案 A · 科目优先 + 兴趣兼顾（PR 推荐）',
    desc: '前三位给 7/7 命中且明确有 Computing 的学校，后三位用稀缺科目与戏剧社团补位',
    picks: [
      {
        name: A[0], slot: 1, tier: '冲刺',
        why: '<b>' + fit(A[0]) + ' 全命中，且明确列有 Computing</b>；余量 ' + mOf(A[0])
          + '、' + how(A[0]) + '，还命中戏剧社团。是唯一同时满足科目、社团、通勤与余量的学校。',
        risk: 'COP ' + cOf(A[0]) + '，孩子 {{score}} 分余量只有 ' + mOf(A[0])
          + '；PR 同分让位公民，不能当兜底。纯步行 ' + get(A[0]).walkMinutes
          + ' 分钟不现实，靠公交才成立。',
      },
      {
        name: A[1], slot: 2, tier: '匹配',
        why: '同为 <b>' + fit(A[1]) + ' 全命中 + 明确 Computing</b>，余量 ' + mOf(A[1])
          + ' 比第 1 位更宽，' + how(A[1]) + '。CCA 五项没有直接命中，是它唯一的短板。',
        risk: '没有机器人 / AI / 戏剧 / 游泳 / 烹饪社团证据；科目全中不等于组合排得出来，'
          + '仍需确认 G2/G3 Computing 与 Higher Chinese 的实际开班。',
      },
      {
        name: A[2], slot: 3, tier: '匹配',
        why: fit(A[2]) + ' 全命中 + 明确 Computing，余量 ' + mOf(A[2]) + '，命中 AI 社团；'
          + how(A[2]) + '。用较长通勤换来科目与余量同时到位。',
        risk: how(A[2]) + ' 已接近上限 ' + R.student.maxCommute + ' 分钟；'
          + '高峰车内时间拉长会进一步压缩缓冲。',
      },
      {
        name: A[3], slot: 4, tier: '冲刺',
        why: 'fit ' + fit(A[3]) + '，命中 ' + subjOf(A[3]) + '；独特科目：<b>'
          + uniqueOf(A[3]) + '</b>。' + how(A[3]) + ' 是全池最短之一，戏剧社团也有。',
        risk: 'Computing 只列 Computer Applications（G1），PG3 若指 G3 需确认；余量 ' + mOf(A[3])
          + ' 仍属踩线。Mobile Robotics 是稀缺标签，不代表学校机器人社团更强。',
      },
      {
        name: A[4], slot: 5, tier: '冲刺',
        why: 'fit ' + fit(A[4]) + '，独特科目 <b>' + uniqueOf(A[4]) + '</b>；'
          + how(A[4]) + '，戏剧社团命中。是「科目 + 社团 + 通勤」最均衡的补位。',
        risk: 'Computing 为 G1 关联；余量 ' + mOf(A[4]) + '，PR 下不是稳位。',
      },
      {
        name: A[5], slot: 6, tier: '匹配',
        why: 'fit ' + fit(A[5]) + '，余量 ' + mOf(A[5]) + ' 是后三位最高的；' + how(A[5])
          + '，命中 AI 社团。Computing 虽只列 G1，但其余科目齐全。',
        risk: '无戏剧 / 机器人 / 游泳社团证据；G3 Computing 需向学校确认。',
      },
    ],
  },

  B: {
    title: '方案 B · 余量优先（接受长通勤）',
    desc: '把余量 ≥4 的学校集中到第 2–6 位，用每天多花的时间换分数缓冲',
    picks: B.map((name, i) => ({ name, slot: i + 1 })),
  },

  C: {
    title: '方案 C · 独特科目 + 社团冲刺',
    desc: '纳入 Enhanced Art、ESS、Mobile Robotics 与两所社团双命中校，前两位分数踩线',
    picks: C.map((name, i) => ({ name, slot: i + 1 })),
  },

  focusPair: [A[0], 'Compassvale Secondary School'],

  finalAdvice: () => {
    return `<h3>如果这是我的孩子，我会这样填</h3>
<p>方案 A 的六个位置按四条判断排，不是按综合分也不是按科目数硬排：</p>
<ul>
<li><b>第 1–3 位给「7/7 命中 + 明确 Computing」的三所。</b>${names([get(A[0]), get(A[1]), get(A[2])])} 科目匹配 ${fit(A[0])} / ${fit(A[1])} / ${fit(A[2])}，通勤 ${gate(A[0])} / ${gate(A[1])} / ${gate(A[2])} 分钟，余量 ${mOf(A[0])} / ${mOf(A[1])} / ${mOf(A[2])}。其中 ${sn(A[0])} 还有戏剧社团，所以放第 1 位。</li>
<li><b>第 4–5 位补稀缺科目与戏剧。</b>${sn(A[3])} 的 Mobile Robotics、${sn(A[4])} 的 Exercise &amp; Sports Science 都是全岛 ≤${R.stats.subjectRarityMax} 校列出的标签，且两所通勤只有 ${gate(A[3])} / ${gate(A[4])} 分钟。</li>
<li><b>第 6 位用余量最高的可达校收尾。</b>${sn(A[5])} 余量 ${mOf(A[5])}，是本方案里相对最宽的一所。</li>
<li><b>为什么不把 Compassvale 放前位：</b>它机器人 + 戏剧双命中、通勤 ${gate('Compassvale Secondary School')} 分钟，但科目只有 ${fit('Compassvale Secondary School')} 且 Computing 仅 G1、余量 ${mOf('Compassvale Secondary School')}。 给社团还是给科目，这是这版的核心取舍；方案 C 就是给社团的版本。</li>
</ul>
<p><b>为什么不默认选方案 B：</b>B 把 ${B.filter(n => !A.includes(n)).length} 所余量 ≥4 的学校换进来，但通勤拉到 ${Math.min(...B.map(n => gate(n)))}–${Math.max(...B.map(n => gate(n)))} 分钟；其中 ${B.filter(n => gate(n) >= 50).length} 所超过 50 分钟。<b>安全边际是真的，每天往返多花的时间也是真的。</b></p>
<p><b>为什么不默认选方案 C：</b>C 纳入 ${escNames(UNIQUE_POOL.filter(x => C.includes(x.name)))} 的独特科目，以及机器人 / AI 双命中校，但 ${C.filter(n => mOf(n).startsWith('0') || mOf(n).startsWith('-')).length} 所余量为 0。对 PR 来说，这属于用命中率换兴趣完整度。</p>
<p class="soft">注：综合分排名与志愿顺序并不完全一致，这是刻意的——综合分衡量「对这个孩子多合适」，志愿顺序衡量「落空风险 + 兴趣保留」。科目匹配不参与综合分，所以它只影响方案理由，不改既有排名口径。</p>`;
  },

  todo: () => {
    const nearLimit = R.pool.filter(x => x.busMinutes >= R.student.maxCommute - 5);
    return `<b>提交前必须做的四件事：</b><br>
① <b>先实测公交，不是查地图。</b>本报告按候车 ${R.stats.busParams.waitMin} 分 + 车内 ${R.stats.busParams.rideMinPerStop} 分/站估算，只从 Twin Waterfalls（65431）单向、不换乘。请用实际早高峰走一次 ${sn(A[0])} 与 ${sn(A[2])}；${nearLimit.length ? '尤其 ' + escNames(nearLimit.slice(0, 2)) + ' 已贴到 ' + R.student.maxCommute + ' 分钟上限。' : ''}<br>
② <b>开放日逐校问科目组合。</b>重点问 ${sn(A[0])} / ${sn(A[1])} / ${sn(A[2])}：G3 Computing 是否向 PG3 学生开放、Higher Chinese 与 Additional Mathematics 能否同时选、Nutrition and Food Science 是正式科目还是仅低年级 FCE。<b>报告列了科目 ≠ 组合排得出来。</b><br>
③ <b>确认反向站是否可用。</b>马路对面 65439 按家长口径不纳入；若实际会从那侧上车，池子会变，需要重算。<br>
④ <b>12 月本届 COP 出来后再核对余量。</b>本池没有 ≥6 分的稳位，PR 同分让位公民——这一步不能省。同时确认六个都落空时接受 MOE 分配。`;
  },
};

/** 逐校卡片补充：科目、CCA、ALP 与判断都从数据反查，不臆造 */
const DETAIL = {};
for (const n of [...A, ...B, ...C, ...PLANS.focusPair]) {
  const x = get(n);
  if (!x) continue;
  const hits = (x.ccaHits || []);
  DETAIL[n] = {
    feature: (hits.length ? '兴趣命中：<b>' + hits.join(' / ') + '</b>。' : '五项 CCA 兴趣没有直接命中。')
      + '科目命中 ' + fit(n) + '（' + subjOf(n) + '）；独特科目：' + uniqueOf(n) + '。'
      + ((x.alpCats || []).length ? ' ALP 类别：' + (x.alpCats || []).join(' / ') + '。' : ''),
    profile: sn(n) + '，PG3 区间 ' + cOf(n) + '，' + how(n)
      + '；全程纯步行 ' + (x.walkMinutes != null ? x.walkMinutes + ' 分钟' : '无数据') + '。',
    verdict: '<b>适合：</b>余量 ' + mOf(n) + '，通勤 ' + gate(n) + ' 分钟'
      + (hits.length ? '，' + hits.join(' / ') + ' 有社团承接' : '')
      + '；科目 ' + fit(n) + '。<br>'
      + '<b>不适合：</b>' + (x.margin <= 0
        ? '踩线，PR 同分让位公民，不能当兜底'
        : '余量仍不到 6 分，COP 浮动 1–2 分就会缩窄')
      + (x.busMinutes >= 50 ? '；通勤超过 50 分钟，往返时间长' : '')
      + ((x.subjectSoftHits || []).length ? '；Computing 只有 G1，需确认 G2/G3' : '')
      + (hits.length < 2 ? '；CCA 命中有限' : '') + '。',
  };
}

module.exports = { PLANS, DETAIL };
