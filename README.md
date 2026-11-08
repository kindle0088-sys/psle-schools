# PSLE 择校看板 · 新加坡中学

给家长用的新加坡中学择校工具。147 所中学的录取区间、学校类型、CCA、DSA，加上按 MRT 网络算的通勤时间。

**站点**：https://kindle0088-sys.github.io/psle-schools/

## 两个页面

| 页面 | 用途 |
|---|---|
| `docs/index.html` | 学校看板 —— 按录取区间 / IP / SAP / 区域筛选，输入 PSLE 分数看可报哪些 |
| `docs/map.html` | 通勤地图 —— 输入邮编或点地图，列出 30 / 45 / 60 分钟内可到的学校 |

## 数据来源

| 数据 | 来源 | 更新频率 |
|---|---|---|
| 学校名单、类型、CCA、DSA、科目、录取区间 | MOE SchoolFinder（`moe.gov.sg/schoolfinder`） | 每年（S1 Posting 后） |
| 学校坐标 | OneMap 地理编码（邮编，免 token） | 一次性 |
| MRT 站点坐标与线路代号 | OneMap 搜索（免 token） | 线路开通时 |
| 地址解析（地图页实时） | OneMap Search API（浏览器直连，CORS `*`） | 实时 |

## 关键口径

**录取区间（COP）不是门槛。** 它是上一年度**实际录取**的学生分数范围，每年随报考热度浮动。分数越小越好，区间右端是该校该档最低录取分。

**分档结构有三种，不能混着看：**

| 学校类型 | 结构 | 例子 |
|---|---|---|
| 普通 O-Level | PG1 / PG2 / PG3 × 附属 / 非附属 | ACS (Barker) 非附属 PG3 `6–9` |
| IP 直通车 | 单行 `Integrated Programme` | RI 非附属 `4–6` |
| SAP 特选 | 分数带等级 `5(D)–10(M)`，D=Distinction M=Merit | Chung Cheng Main `5(D)–10(M)` |

**本看板按非附属生口径展示。** 有兄姐在读或父母是校友时，适用附属生区间（通常宽松得多）。

**Posting Group 由 PSLE 总分决定**（2026 起）：4–20 → PG3｜21–22 → PG2/3｜23–24 → PG2｜25 → PG1/2｜26–30 → PG1。

## 通勤时间模型

```
时间 = 步行到最近站 + 进站等车(4min) + MRT 车程 + 出站步行到校
车程 = 站间 2 分钟 × 站数 + 换乘 5 分钟 × 换乘次数
```

**只计 MRT，不含巴士。** 最近站步行 >800m 的学校实际需巴士接驳，模型偏乐观。全岛 147 所中有 36 所（24%）属于这种情况。

模型经 4 组 OD 对照校准（Bishan→Raffles Place、Jurong East→City Hall、Tampines→City Hall、Woodlands→Raffles Place），偏差 ≤2 分钟。详见 `scripts/test-iso.cjs`。

## 重建数据

```bash
cd psle-schools

# 1. 抓学校列表与详情（会缓存到 .tmp/，重跑只重新解析不重下）
node scripts/extract-slugs.cjs      # 从 8.4MB SSR 提取 147 个 slug
node scripts/collect-details.cjs    # 抓详情页，解析 COP/CCA/DSA

# 2. 补坐标（OneMap，147 次调用，限速 700ms）
node scripts/geocode-schools.cjs

# 3. 抓 MRT 站点（OneMap 搜索 85 页，遇 429 自动退避）
node scripts/collect-mrt.cjs

# 4. 建图 + 生成前端数据
node scripts/build-network.cjs      # 校验连通性，输出 data/network.json
node scripts/build-docs-data.cjs    # 输出 docs/data/schools.json
cp lib/iso.cjs docs/assets/iso.js   # 求解器同步到前端

# 5. 验证
node scripts/test-iso.cjs           # 求解器 OD 对照
node scripts/verify-board.cjs       # 看板端到端（需本地服务器 + Chrome CDP）
node scripts/verify-map.cjs         # 地图端到端（含前端/Node 一致性断言）
```

本地预览：

```bash
cd docs && python -m http.server 8901 --bind 127.0.0.1
# 打开 http://127.0.0.1:8901/index.html
```

> ⚠️ 必须用 HTTP 服务打开。`file://` 下 `fetch` 会被浏览器拦截，页面拿不到数据。

## 目录

```
data/                  采集的原始数据（schools.json / mrt-stations.json / network.json）
docs/                  Pages 站点（index.html / map.html / assets / data）
lib/iso.cjs            等时圈求解器（Node + 浏览器共用，UMD）
scripts/               采集、构建、验证脚本
```

## 已知局限

- **COP 只有最新一年**（MOE 只公开当年）。要做趋势得靠 Wayback Machine 快照，数据质量没保证，暂不做。
- **等时圈不含巴士**，也不含等车波动与步行速度差异。
- **CCA 未做分类**，只列名称与数量。
- **单校详细报告页还没做**（规划中）。

## 免责

个人研究工具，非 MOE 官方发布。录取区间仅供定位参考，实际分配由 S1 Posting 按成绩与志愿顺序决定。选校请同时考虑校风、办学理念、孩子性格等本工具无法量化的因素。
