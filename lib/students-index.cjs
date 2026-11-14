/**
 * 多学生索引：docs/data/students-index.json
 *
 * 这是**派生文件**，不是配置：只保留 data/students/ 下仍有配置的学生，
 * 删掉某个学生的配置后他应自动从索引消失。
 *
 * 为什么要单独抽出来：报告生成器（build-report-v2 / build-report-plan）都要写它，
 * 而 activeId 的取值规则很微妙 —— 它**不是**「最后生成的那个」，而是显式指针。
 * 否则给老二出报告会把老大的入口悄悄顶掉。这段逻辑只该有一份。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const STU_DIR = path.join(BASE, 'data/students');
const IDX_FILE = path.join(BASE, 'docs/data/students-index.json');

/**
 * 写入/更新某个学生的索引项。
 * @param {object} STU  lib/student.cjs 的 load() 结果
 * @param {object} meta 额外字段（目前用 pgShort）
 * @returns {Array} 更新后的学生列表
 */
function upsert(STU, meta = {}) {
  let idx = { students: [] };
  try { idx = JSON.parse(fs.readFileSync(IDX_FILE, 'utf8')); } catch (_) { /* 首次生成 */ }

  const alive = (idx.students || []).filter(x => fs.existsSync(path.join(STU_DIR, x.id + '.json')));
  const list = alive.filter(x => x.id !== STU.id);
  list.push({
    id: STU.id,
    label: STU.label,
    al: STU.al,
    pgShort: meta.pgShort || ('PG' + (STU.al <= 20 ? 3 : STU.al <= 24 ? 2 : 1)),
    postal: STU.home.postal,
    maxCommuteMin: STU.maxCommuteMin,
    planSlug: STU.planSlug,
    updatedAt: new Date().toISOString(),
  });
  // 默认学生（abc1）恒定排第一，其余按 id
  list.sort((a, b) => (a.id === 'abc1' ? -1 : b.id === 'abc1' ? 1 : a.id.localeCompare(b.id)));

  const activeId = (() => {
    try {
      const a = JSON.parse(fs.readFileSync(path.join(STU_DIR, 'active.json'), 'utf8'));
      if (a.active && list.some(x => x.id === a.active)) return a.active;
    } catch (_) { /* 无指针 → 默认 */ }
    return list.some(x => x.id === 'abc1') ? 'abc1' : list[0].id;
  })();

  fs.mkdirSync(path.dirname(IDX_FILE), { recursive: true });
  fs.writeFileSync(IDX_FILE, JSON.stringify({
    generatedAt: new Date().toISOString(),
    defaultId: 'abc1',
    activeId,
    students: list,
  }, null, 1));

  return list;
}

module.exports = { upsert, IDX_FILE, STU_DIR };
