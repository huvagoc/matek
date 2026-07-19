#!/usr/bin/env node
/*
 * check-exam-papers.js — regression harness for the felvételi paper generators
 * (felveteli6.html, felveteli8.html).
 *
 * These pages are print-only próbafeladatlap generators, so the quiz harness
 * (check-quizzes.js) can't exercise them: their generators throw on purpose
 * (retry pattern) and the unit of output is a whole paper built by
 * buildPaper(seed, booklet, groups), not a template array. This script sweeps
 * that path directly.
 *
 * Per file it asserts, over N seeds x both booklets (Mat1/Mat2):
 *   - buildPaper never throws and always yields exactly GROUPS.length tasks
 *     (a shorter paper means buildExam's silent drop-after-25-tries fired)
 *   - no NaN / undefined / Infinity / [object Object] / empty string in any
 *     intro, table, figure, question or answer
 *   - no dot-decimal in a numeric answer (decimal commas only)
 *   - no FP noise in answers or questions: nothing with more than 6 decimal
 *     places, and no run of 5+ zeros/nines inside the decimal part followed
 *     by further digits (integers like 44444 or 100000 are legitimate
 *     answers, so the check applies to the decimal part only)
 *   - determinism: rebuilding with the same seed+booklet is JSON-identical,
 *     and Mat1 vs Mat2 differ for the same seed
 *   - encode/decode round-trip for random (seed, groups, booklet) triples;
 *     legacy 2-digit masks decode as Mat1; masks with bits above the booklet
 *     bit are rejected
 *   - paperHtml/keyHtml smoke: build once, no garbage, booklet label present
 *   - Hungarian suffix helpers (sfxSzor/sfxAn/sfxNal/sfxDal) match a
 *     hand-written spelling reference over every value their call sites can
 *     produce
 *
 * USAGE:  node test/check-exam-papers.js [--trials 2000] [--dir .]
 * Exit code 0 when clean, 1 otherwise.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── minimal DOM shim (same spirit as check-quizzes.js) ────────────────────
function makeElement() {
  return {
    style: {}, dataset: {}, children: [],
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(){}, removeEventListener(){},
    appendChild(c){ this.children.push(c); return c; },
    querySelector(){ return makeElement(); }, querySelectorAll(){ return []; },
    focus(){}, blur(){},
    get innerHTML(){ return this._html || ''; }, set innerHTML(v){ this._html = v; },
    get textContent(){ return this._text || ''; }, set textContent(v){ this._text = v; },
    value: '', disabled: false,
  };
}
function loadFile(fname) {
  const html = fs.readFileSync(fname, 'utf-8');
  const scripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const src = scripts.sort((a, b) => b.length - a.length)[0]
    .replace(/^const\s+/gm, 'var ').replace(/^let\s+/gm, 'var ');
  const byId = {};
  const doc = {
    body: makeElement(),
    getElementById(id){ return (byId[id] = byId[id] || makeElement()); },
    querySelector(){ return makeElement(); }, querySelectorAll(){ return []; },
    createElement(){ return makeElement(); },
  };
  const sandbox = {
    window: { document: doc, addEventListener(){}, scrollTo(){}, print(){}, screen: { height: 800 } },
    document: doc, navigator: {},
    console, setTimeout: () => 0, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
    Math, JSON, Array, Object, String, Number, Boolean, Date, RegExp, Error,
    Promise, Set, Map, isNaN, parseInt, parseFloat, isFinite,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: fname, timeout: 20000 });
  return sandbox;
}

const GARBAGE = /NaN|undefined|Infinity|\[object Object\]/;
// FP noise lives in the decimal part; whole numbers like 44444 are legitimate.
const FPNOISE = /[.,]\d{7,}|[.,]\d*(0{5,}|9{5,})\d/;

function checkFile(fname, nTrials) {
  const sb = loadFile(fname);
  const issues = [];
  const push = (msg) => { if (issues.length < 200) issues.push(msg); };
  const allGroups = new Set(sb.GROUPS.map(g => g.id));

  // ── paper sweep ─────────────────────────────────────────────────────────
  for (let seed = 1; seed <= nTrials; seed++) {
    for (const bk of [0, 1]) {
      let tasks;
      try { tasks = sb.buildPaper(seed, bk, allGroups); }
      catch (e) { push(`seed ${seed} bk${bk}: buildPaper threw: ${e.message}`); continue; }
      if (tasks.length !== sb.GROUPS.length)
        push(`seed ${seed} bk${bk}: ${tasks.length}/${sb.GROUPS.length} tasks — silent generator drop`);
      for (const t of tasks) {
        for (const s of [t.intro, t.table, t.viz])
          if (typeof s === 'string' && GARBAGE.test(s)) push(`seed ${seed} bk${bk} ${t.group}: garbage in task text`);
        for (const p of t.parts) {
          if (GARBAGE.test(p.q) || GARBAGE.test(p.ans)) push(`seed ${seed} bk${bk} ${t.group} ${p.lbl}): garbage`);
          if (p.ans === '' || p.ans == null) push(`seed ${seed} bk${bk} ${t.group} ${p.lbl}): empty answer`);
          if (p.kind === 'num' && /\d\.\d/.test(p.ans)) push(`seed ${seed} bk${bk} ${t.group} ${p.lbl}): dot decimal "${p.ans}"`);
          if (FPNOISE.test(p.ans)) push(`seed ${seed} bk${bk} ${t.group} ${p.lbl}): FP noise "${p.ans}"`);
          if (FPNOISE.test(p.q)) push(`seed ${seed} bk${bk} ${t.group} ${p.lbl}): FP noise in question`);
        }
      }
      if (seed <= 100) {
        const again = sb.buildPaper(seed, bk, allGroups);
        if (JSON.stringify(again) !== JSON.stringify(tasks)) push(`seed ${seed} bk${bk}: non-deterministic rebuild`);
      }
    }
    if (seed <= 100) {
      const a = sb.buildPaper(seed, 0, allGroups), b = sb.buildPaper(seed, 1, allGroups);
      if (JSON.stringify(a) === JSON.stringify(b)) push(`seed ${seed}: Mat1 === Mat2`);
    }
  }

  // ── code round-trip ─────────────────────────────────────────────────────
  for (let i = 0; i < 2000; i++) {
    const seed = 1 + ((Math.random() * 1048575) | 0);
    const bk = Math.random() < 0.5 ? 1 : 0;
    const gs = new Set();
    sb.GROUPS.forEach(g => { if (Math.random() < 0.5) gs.add(g.id); });
    if (!gs.size) gs.add(sb.GROUPS[0].id);
    const code = sb.encodeWorksheetCode(seed, gs, bk);
    const d = sb.decodeWorksheetCode(code);
    if (!d || d.seed !== seed || d.booklet !== bk ||
        [...gs].sort().join() !== [...d.groups].sort().join())
      push(`code round-trip failed for ${code}`);
  }
  const legacy = sb.decodeWorksheetCode('A3F7B-FF');
  if (!legacy || legacy.booklet !== 0) push('legacy 2-digit mask no longer decodes as Mat1');
  if (sb.decodeWorksheetCode('A3F7B-800') !== null) push('mask with invalid high bit accepted');

  // ── paper/key HTML smoke ────────────────────────────────────────────────
  const qs = sb.buildPaper(777, 1, allGroups);
  const paper = sb.paperHtml(qs, '00309-7FF', 1);
  const key = sb.keyHtml(qs, '00309-7FF', 1);
  if (GARBAGE.test(paper) || GARBAGE.test(key)) push('garbage in rendered paper/key HTML');
  if (!/Mat2/.test(paper) || !/Mat2/.test(key)) push('booklet label missing from paper/key');
  if (!/00309-7FF/.test(paper) || !/00309-7FF/.test(key)) push('worksheet code missing from paper/key');

  // ── suffix helpers vs hand-written spelling reference ───────────────────
  // (kétszer/háromszor/négyszer/ötször; kettőnél/háromnál/négynél;
  //  negyeddel/hatoddal/nyolcaddal/tizeddel; …ketten/…négyen/…hatan/…nyolcan,
  //  …húszan/…negyvenen/…hatvanan/…nyolcvanan/…százan)
  const SZOR = { 2: '-szer', 3: '-szor', 4: '-szer', 5: '-ször' };
  for (const n of [2, 3, 4, 5]) if (sb.sfxSzor(n) !== SZOR[n]) push(`sfxSzor(${n}) = ${sb.sfxSzor(n)}, want ${SZOR[n]}`);
  const NAL = { 2: '-nél', 3: '-nál', 4: '-nél' };
  for (const n of [2, 3, 4]) if (sb.sfxNal(n) !== NAL[n]) push(`sfxNal(${n}) = ${sb.sfxNal(n)}, want ${NAL[n]}`);
  const DAL = { 4: '-del', 6: '-dal', 8: '-dal', 10: '-del' };
  for (const n of [4, 6, 8, 10]) if (sb.sfxDal(n) !== DAL[n]) push(`sfxDal(${n}) = ${sb.sfxDal(n)}, want ${DAL[n]}`);
  const AN_DIGIT = { 2: '-en', 4: '-en', 6: '-an', 8: '-an' };
  const AN_TENS = { 10: '-en', 20: '-an', 30: '-an', 40: '-en', 50: '-en', 60: '-an', 70: '-en', 80: '-an', 90: '-en' };
  const tots = new Set();
  for (let cats = 20; cats <= 60; cats += 2) for (const m of [3, 4, 5]) tots.add(cats * (m + 1));
  for (const tot of tots) {
    const ref = tot % 10 ? AN_DIGIT[tot % 10] : (tot % 100 ? AN_TENS[tot % 100] : '-an');
    if (sb.sfxAn(tot) !== ref) push(`sfxAn(${tot}) = ${sb.sfxAn(tot)}, want ${ref}`);
  }

  // ── hf() regression: rounds FP noise away, keeps decimal commas ─────────
  const hfCases = [[19599.999999999996, '19600'], [0.1 + 0.2, '0,3'], [2.5, '2,5'], [7, '7']];
  for (const [v, want] of hfCases)
    if (sb.hf(v) !== want) push(`hf(${v}) = ${sb.hf(v)}, want ${want}`);

  return issues;
}

// ── CLI ─────────────────────────────────────────────────────────────────
let nTrials = 2000, dir = '.';
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--trials') nTrials = parseInt(args[++i], 10) || 2000;
  else if (args[i] === '--dir') dir = args[++i];
}

let anyIssues = false;
for (const f of ['felveteli6.html', 'felveteli8.html']) {
  const fname = path.join(dir, f);
  let issues;
  try { issues = checkFile(fname, nTrials); }
  catch (e) { console.log(`✗ ${f}: FAILED TO LOAD — ${e.message}`); anyIssues = true; continue; }
  if (!issues.length) {
    console.log(`✓ ${f}: ${nTrials} seeds × 2 booklets, code round-trip, suffix + hf reference — no issues`);
  } else {
    anyIssues = true;
    console.log(`✗ ${f}: ${issues.length} issue(s)`);
    issues.slice(0, 40).forEach(i => console.log('    ' + i));
  }
}
process.exit(anyIssues ? 1 : 0);
