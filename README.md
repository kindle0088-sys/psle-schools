# PSLE 择校看板 · 新加坡中学

给家长用的新加坡中学择校工具：147 所学校的录取区间、学校类型、CCA、科目、通勤，加上按学生画像生成的志愿报告和单校深度报告。

**站点**：https://kindle0088-sys.github.io/psle-schools/

## 页面（7 个）

| 页面 | 用途 |
|---|---|
| `docs/index.html` | 学校看板 —— 按录取区间 / IP / SAP / 区域 / CCA 兴趣筛选，输入 PSLE 分数看可报哪些 |
| `docs/map.html` | 通勤地图 —— 输入邮编或点地图，列出 30 / 45 / 60 分钟内可到的学校 |
| `docs/cohort.html` | 考生人数与学额 —— 2022–2026 官方考生数、适合升读比例、COP 年际传导 |
| `docs/guide.html` | 填报手册 —— 录取规则、志愿梯度、单科 AL / HMTL / Full SBB 口径 |
| `docs/full-sbb.html` | Full SBB 专题 —— 取消分流、G1/G2/G3、31 类科目分级、四年后 JC 路径 |
| `docs/openhouse.html` | 开放日汇总 —— 13 所深度报告学校的场次、活动、矛盾点；状态按打开当天实时计算 |
| `docs/plans.html` | 志愿方案看板 —— 9 位学生的报告入口，`activeId` 决定谁被标为「当前」 |

**报告产物**：`docs/reports/` 下 65 份 HTML = 54 份生成的单校深度报告 + 9 份学生志愿报告 + 2 份手写历史存档（`abc1-s1-choice-2026.html`、`school-compassvale-secondary.html`）。历史存档不随数据重建，也不冒充新快照。

## 数据来源

| 数据 | 来源 | 更新方式 |
|---|---|---|
| 学校名单、类型、CCA、DSA、科目、录取区间 | MOE SchoolFinder | `collect-details.cjs`，每年 S1 Posting 后重抓 |
| 2024 / 2025 COP | MOE SchoolFinder 线上双年表 | `collect-cop-official.cjs` |
| 2023 PG3 COP | Wayback 上 MOE SchoolFinder 官方存档 | `collect-cop-2023-fill*.cjs` |
| CCA 完整清单（13 校） | 学校官网 ∪ MOE SchoolFinder | `data/cca-catalog.json`，`verifiedAt` 字段记录核对日 |
| 考生人数 / 适合升读比例 | SEAB / MOE 新闻稿 + Education Statistics Digest | `data/psle-cohort.json`，带来源等级 A/B |
| Full SBB / SEC / JC 政策 | MOE 与 SEAB 官方页（10 条来源） | `data/full-sbb.json`，`sources` 记 URL 与核验日 |
| 学校坐标 / MRT 站点 | OneMap（免 token） | `geocode-schools.cjs` / `collect-mrt.cjs` |
| 步行路网 | OSM + OSRM foot profile，Valhalla 交叉校验 | 采集脚本在 `.tmp/` 缓存 |

所有页面的页脚都带**同一行数据快照**（`lib/snapshot.cjs` 从 `docs/data/schools.json` 的 `meta.generatedAt` 读 SGT 日期）。`index.html` / `map.html` 是手写静态页，用 `assets/snapshot.js` 现读同一字段。

## 关键口径

**COP 不是门槛。** 它是上一年度**实际录取**学生的分数范围，每年随报考热度浮动。分数越小越好，区间右端是该校该档最后一名。

| 学校类型 | 结构 | 例子 |
|---|---|---|
| 普通 O-Level | PG1 / PG2 / PG3 × 附属 / 非附属 | ACS (Barker) 非附属 PG3 `6–9` |
| IP 直通车 | 单行 `Integrated Programme` | RI 非附属 `4–6` |
| SAP 特选 | 分数带等级 `5(D)–10(M)` | Chung Cheng Main `5(D)–10(M)` |

本看板一律按**非附属生**口径展示。有兄姐在读或父母是校友时适用附属生区间（通常宽松得多）。

**Posting Group 不是新分流**（2024 起 Full SBB）。它只用于入学与 S1 起点；进校按单科 G1/G2/G3 走班，可升可降。2026 起总分 4–20 → PG3｜21–22 → PG2/3｜23–24 → PG2｜25 → PG1/2｜26–30 → PG1。

**通勤**：顶层看板只计 MRT（站间 2 分钟 × 站数 + 换乘 5 分钟 + 进站 4 分钟 + 出站步行），不含巴士；最近站步行 >800m 的学校偏乐观。学生报告另有「不换乘公交 + 步行」与「步行 / 地铁取最快」两套口径，见各报告页脚。

**CCA**：`cca` 是 MOE 登记项，`ccaFull` 是官网核实后的并集，择校以 `ccaFull` 为准。2026-11-23 三方核实后，多数学校 MOE 登记已补齐，早期「MOE 系统性漏登、覆盖率低至 37%」的判断已过时；目录仍保留官网独有项并标来源。

## 已知缺口

- **2023 COP 覆盖 52/54**：Bedok South、Bedok View 在 Wayback 的 2023 派位窗口零快照，已二次核验，不用二手表填空。2024 覆盖 53/54（Outram 当年无 S1 派位，官方注明不存在 COP），2025 覆盖 54/54。
- 等时圈不含巴士、等车波动与个体步行速度差异。
- 开放日只覆盖 13 所深度报告学校，数据更新于 2026-11-15；日期时间可能临时调整，出发前以学校官网或电话为准。
- Full SBB 政策快照核验于 2026-11-25；JC 规则 2028 起生效，之后需复核官方更新。

## 构建与验证

```bash
cd psle-schools

# 一次跑完 25 步：数据层 → 每位学生候选池 → 每位学生报告 → 54 份校报 → 各页面 → 方案看板
node scripts/build-all.cjs              # 只构建
node scripts/build-all.cjs --verify     # 构建 + 全部离线验证器
node scripts/build-all.cjs --only=guide,plans
```

`--verify` 包含：主题色板、全站导航、数据快照、CCA 清单、多学生配置、考生页、Full SBB、手册、看板、开放日、9 份学生报告、反向校验报告、54 份校报。**顺序有硬依赖**，不能随意调换：数据层 → 候选池 → 报告 → 方案看板（最后）。

需要浏览器的两组另行执行：

```bash
cd docs && python -m http.server 8901 --bind 127.0.0.1
# 另开一个终端
SITE=http://127.0.0.1:8901 node scripts/verify-board.cjs
CDP_PORT=9231 node scripts/verify-map.cjs
```

本地预览也必须走 HTTP：`file://` 下 `fetch` 会被浏览器拦截。

### 重新采集数据（很少需要）

```bash
node scripts/extract-slugs.cjs        # 从 SchoolFinder SSR 提取 slug
node scripts/collect-details.cjs      # COP / CCA / DSA / 科目
node scripts/collect-cop-official.cjs # 2024 / 2025 官方双年表
node scripts/geocode-schools.cjs      # OneMap 邮编地理编码
node scripts/collect-mrt.cjs          # OneMap MRT 站点
node scripts/build-network.cjs        # 连通性校验 → data/network.json
cp lib/iso.cjs docs/assets/iso.js     # 求解器同步到前端
node scripts/test-iso.cjs             # 4 组 OD 对照，偏差 ≤2 分钟
```

## 多学生与数据隔离

- 每位学生在 `data/students/<id>.json` 一份画像；候选池写 `data/_recommend-<id>.json`，报告读同名文件。
- **没有全局兜底**：缺专属文件直接 fail-fast（旧版会退回别人的数据还全绿，2026-11-25 已修）。报告 `<meta name="student">` 标明数据来源。
- `docs/data/students-index.json` 的 `activeId` 是**显式指针**，不是「最后生成的那位」——给老二出报告不应把老大的看板入口顶掉。

## 框架约定（复盘后固化）

- `lib/nav.cjs`：7 个页面入口的唯一来源；所有生成器和两份手写存档互链一致，`verify-nav.cjs` 硬断言。
- `lib/snapshot.cjs`：数据快照日期唯一来源；`verify-snapshot.cjs` 检查所有生成页面。
- 开放日状态在浏览器端按当天 SGT 现算（`data-evdate` + 内联脚本），构建时不写死「还有 N 天」。验证器守「静态 HTML 无相对天数」，实际文字用 Chrome 探针核对。
- 负向测试三件事：退出码非 0、无新产物、上次成功产物的 SHA256 未变。

## 目录

```
data/                  采集的原始数据（schools.json / cop-*.json / cca-catalog.json …）
data/students/         学生画像；data/plans/ 志愿方案；data/school-profiles/ 校报配置
docs/                  Pages 站点：7 个页面 + reports/ + data/ + assets/
lib/                   共享逻辑：nav / snapshot / student / subjects / iso / walk / students-index
scripts/build-*.cjs    页面与报告生成器；scripts/verify-*.cjs 离线验证器
```

## 免责

个人研究工具，非 MOE 官方发布。录取区间仅供定位参考，实际分配由 S1 Posting 按成绩与志愿顺序决定。选校请同时考虑校风、办学理念、孩子性格等本工具无法量化的因素。
