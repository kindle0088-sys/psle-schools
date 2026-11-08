# PSLE 择校数据摘要（v0.1 · 待核对）

采集时间：2026-11-08
数据源：MOE SchoolFinder（`https://www.moe.gov.sg/schoolfinder`）
产出：`data/schools.json`（147 条）

---

## 一、覆盖情况

| 项 | 数量 | 说明 |
|---|---|---|
| 中学总数 | **147** | SchoolFinder 中学目录全量 |
| 有 COP | **139** | 缺的 8 所是专科学校，本来不走 S1 posting |
| 有 CCA | 144 | 缺 3 所：SOTA / Sports School / NUS High |
| 有 DSA | 143 | 缺 4 所：APSN / Northlight / Spectra / Sports School |
| 有 Electives | 134 | ALP / LLP / IP 等项目 |
| **IP 直通车** | **16** | 见下方清单 |
| **有附属生通道** | **26** | 附属生 COP 要求明显更低 |
| **SAP（带 D/M 等级）** | **9** | COP 写作 `5(D) - 10(M)` |

## 二、COP 的两种结构（重要）

**普通 O-Level 学校**——6 格矩阵：

| | 附属生 | 非附属生 |
|---|---|---|
| Posting Group 3 | 8 – 21 | **6 – 9** |
| Posting Group 2 | 21 – 25 | 21 – 21 |
| Posting Group 1 | 25 – 28 | 25 – 26 |

**IP 直通车学校**——单行：

| | 附属生 | 非附属生 |
|---|---|---|
| Integrated Programme | – | **4 – 6** |

> ACS (Independent) 是混合型：既有 IP 行（4–7），也有 PG3 行（附属 7–13 / 非附属 6–8）。

**SAP 学校**的分数带等级标记：`5(D)` = 高级华文 Distinction，`10(M)` = Merit。

## 三、IP 学校（16 所）与非附属 COP

| 学校 | 区域 | 非附属 COP |
|---|---|---|
| Raffles Institution (Secondary) | Bishan | 4 – 6 |
| Raffles Girls' School (Secondary) | Toa Payoh | 4 – 6 |
| Hwa Chong Institution (Secondary) | Bukit Timah | 4 – 6（D–M） |
| Nanyang Girls' High School | Bukit Timah | 4 – 6（D–M） |
| Methodist Girls' School (Secondary) | Bukit Timah | 4 – 6 |
| Chinese Girls' School | — | 4 – 7 |
| CHIJ St. Nicholas Girls' School (Secondary) | Ang Mo Kio | 4 – 7（D–M） |
| Catholic High School (Secondary) | Bishan | 4 – 7（D–M） |
| Anglo-Chinese School (Independent) | Queenstown | 4 – 7 |
| St. Joseph's Institution (Secondary) | — | 4 – 7 |
| Dunman High School (Secondary) | Kallang | 4 – 8（D–M） |
| Temasek Junior College (Secondary) | Tampines | 4 – 8 |
| Cedar Girls' Secondary School | Toa Payoh | 4 – 9 |
| River Valley High School (Secondary) | Jurong West | 4 – 9（M–M） |
| National Junior College (Secondary) | — | 5 – 8 |
| Victoria School | Bedok | 5 – 8 |

## 四、门槛分布（非附属）

- **最低分 4 分**（PSLE 满分即 4）：12 所，含全部头部 IP 校 + Anglican High / Nan Chiau
- **PG3 上限 22 分**（最宽松）：多所邻里中学

## 五、区域分布（前 8）

| 区域 | 学校数 |
|---|---|
| Woodlands / Jurong West / Tampines | 各 10 |
| Bedok | 9 |
| Yishun / Hougang | 各 8 |
| Ang Mo Kio / Toa Payoh / Seng Kang | 各 7 |

## 六、字段清单（每所学校）

```
slug / name / code / area / address / postal
cop{ year, type(IP|PG), ip{}, affiliated{}, nonAffiliated{} }
dsa{ year, areas[] }
cca[] / subjects[] / electives[{type, category, items[]}]
affiliations{ primary[], jc[] }
schoolMode / schoolNature / schoolType
contact{ phone, email, website }
collectedAt
```

## 七、已知限制

1. **COP 只有 2025 一年**。MOE 只保留当年，历史需另找（Wayback 或历年 PDF），质量无保证。
2. **CCA / Subjects 可能逐年变**。页面自带说明："may change for subsequent intakes"。
3. **8 所无 COP 的学校**（SOTA / Sports School / NUS High / SST / APSN / Northlight / Spectra / Crest）通过自主招生或专科通道，**不适用 S1 posting 比对**。
4. **Affiliation 已按「无」处理**（按你的要求）。数据里仍保留附属生那一列，供将来需要时使用。

## 八、建议核对方式

挑 3–5 所你熟悉的学校，对照 MOE 官网或家长圈公认数据检查：

- 头部：Raffles Institution、Hwa Chong、Nanyang Girls、ACS (Independent)
- 邻里：你家附近任意 2 所

**只要这几所的 COP 与已知一致，整个数据集就可信。**
