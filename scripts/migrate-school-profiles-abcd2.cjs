#!/usr/bin/env node
/**
 * 一次性迁移：把 54 份单校深度报告的叙述口径从 abc4(AL15)/abc1(AL17)
 * 统一改为 abcd2(AL18)。只改分数、余量、超出额三类数字与 student 字段，
 * 学校事实（COP / CCA / 校史 / 科目）一律不动。
 *
 * 用法： node scripts/migrate-school-profiles-abcd2.cjs [--write]
 *        默认只打印每校将要做的替换统计；加 --write 才落盘。
 *
 * 背景：2026-11-25 复盘中已把 39 份绑 abc4、15 份绑 abc1，使动态卡与
 * 叙述对齐；本次用户要求全部按 abcd2 重做，因此叙述数字必须同步重算，
 * 否则又会回到「叙述 +7、动态 +4」那种静默矛盾。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname, '..');
const DIR = path.join(BASE, 'data/school-profiles');
const SCHOOLS = JSON.parse(fs.readFileSync(path.join(BASE, 'docs/data/schools.json'), 'utf8')).schools;
const WRITE = process.argv.includes('--write');
const NEW_AL = 18;

function copMax(slug) {
  const s = SCHOOLS.find(x => x.slug === slug);
  const row = (s?.cop?.rows || []).find(r => /Posting Group 3/i.test(r.label || ''));
  const v = row?.nonAff || row?.aff;
  if (!v || !Number.isFinite(v.max)) throw new Error('找不到 PG3 上限: ' + slug);
  return v.max;
}

function migrate(text, oldAl, max) {
  const oldM = max - oldAl;
  const newM = max - NEW_AL;
  const oldOver = oldAl - max;
  const newOver = NEW_AL - max;
  const log = [];
  let t = text;

  function sub(re, to, label) {
    const hits = t.match(re);
    if (!hits) return;
    t = t.replace(re, to);
    log.push(`${label} ×${hits.length}`);
  }

  /* 1. 学生分数：AL 15 / AL 17 → AL 18 */
  sub(/AL\s*1[57]\b/g, 'AL 18', 'AL 分数');
  /* 2. 裸分数（排除「分钟」「分之」这类非分数用法） */
  sub(/(?<!\d)(?:15|17)\s*分(?!钟|之)/g, '18 分', '裸分数');

  /* 3. 余量 / 超出额：按旧画像与 abcd2 的差值重算。
        旧余量 >=0 → 新余量可能变负，写成「−N 分（高于上限）」；
        旧已超上限 → 差值随分数同步增加。 */
  const mPattern = n => new RegExp(`(余量\\s*[+＋]?\\s*)${n}(\\s*分?)`, 'g');
  if (oldM >= 0 && newM >= 0) {
    sub(mPattern(oldM), (_, a, b) => `${a}+${newM}${b || ' 分'}`, `余量 +${oldM}→+${newM}`);
    sub(new RegExp(`\\+${oldM}\\s*分\\s*余量`, 'g'), `+${newM} 分余量`, '「+N 分余量」');
    sub(new RegExp(`\\+${oldM}(?=\\s*[分）)])`, 'g'), `+${newM}`, '「+N 分」');
  } else if (oldM >= 0 && newM < 0) {
    sub(mPattern(oldM), (_, a, b) => `${a}${newM}${b || ' 分'}（高于上限）`, `余量 +${oldM}→${newM}`);
    sub(new RegExp(`\\+${oldM}\\s*分\\s*余量`, 'g'), `${newM} 分余量（高于上限）`, '「+N 分余量」');
    sub(new RegExp(`\\+${oldM}(?=\\s*[分）)])`, 'g'), String(newM), '「+N 分」');
  } else if (oldOver > 0) {
    for (const verb of ['差', '超出', '高出', '低']) {
      sub(new RegExp(`(${verb}\\s*)${oldOver}(\\s*分)`, 'g'), `$1${newOver}$2`, `「${verb} N 分」`);
    }
  }

  /* 4. 「距上限 N 分」：abcd2 卡在上限或已超过时换措辞 */
  if (oldM > 0) {
    sub(new RegExp(`距上限\\s*${oldM}\\s*分`, 'g'),
      newM > 0 ? `距上限 ${newM} 分` : (newM === 0 ? '正好卡在上限' : `高于上限 ${-newM} 分`),
      '距上限');
  }
  return { text: t, log };
}

let changed = 0, failed = 0;
for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.json')).sort()) {
  const p = path.join(DIR, f);
  const raw = fs.readFileSync(p, 'utf8');
  const pf = JSON.parse(raw);
  if (pf.student && pf.student !== 'abc4' && pf.student !== 'abcd2') {
    console.error(`✗ ${f}: 未预期的 student=${pf.student}`); failed++; continue;
  }
  const oldAl = pf.student === 'abcd2' ? NEW_AL : (pf.student === 'abc4' ? 15 : 17);
  const max = copMax(pf.slug || f.replace(/\.json$/, ''));
  const r = migrate(raw, oldAl, max);
  const bound = /"student"\s*:\s*"abcd2"/.test(r.text);
  if (!bound) {
    /* 显式写入 student，插在 slug 之后，保持字段顺序稳定 */
    r.text = r.text.replace(/("slug"\s*:\s*"[^"]+",)/, `$1\n "student": "abcd2",`);
  }
  const same = r.text === raw;
  console.log(`${f.padEnd(36)} AL${oldAl}→AL18  上限${max}  ${r.log.join('、') || '无数字变化'}${same ? '（仅加绑定）' : ''}`);
  if (!same && WRITE) fs.writeFileSync(p, r.text);
  if (!same) changed++;
}
console.log(`\n${WRITE ? '已写入' : '待写入'} ${changed} 份${failed ? `，失败 ${failed}` : ''}${WRITE ? '' : '（加 --write 落盘）'}`);
process.exit(failed ? 1 : 0);
