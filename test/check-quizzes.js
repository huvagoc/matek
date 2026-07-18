#!/usr/bin/env node
/*
 * check-quizzes.js — regression harness for the Magyar Iskolai Kvízek quiz files.
 *
 * WHAT IT DOES
 * ------------
 * Each gradeN.html / kozepszint.html / emelt.html is a self-contained page whose
 * inline <script> defines a pile of "template" generators — arrays of functions
 * (usually named *TPL, but not always — see NOTE below) that each produce one
 * random exercise: { srcStr, ans, ansN?, ansD?, isFrac?, isText?, ... }.
 *
 * This script:
 *   1. Loads each file's inline JS into an isolated Node vm context (with a
 *      minimal window/document/localStorage shim — no real browser needed).
 *   2. Finds every top-level `const NAME = [...]` array and, for any array whose
 *      elements are plain functions, calls each function N_TRIALS times.
 *   3. Also handles the WORD_T-style arrays: [{ gen(){...}, ph:[fn, fn, ...] }],
 *      used by the word-problem generator (makeWordEx).
 *   4. For every generated exercise, checks:
 *        - no exception was thrown
 *        - no NaN / undefined / Infinity leaked into the answer or question text
 *        - no zero-denominator fractions
 *        - SELF-CONSISTENCY: feeding the generator's own "correct" answer back
 *          through the actual checker function (parseNum comparison / 
 *          checkFracAnswer / checkTextAnswer) is accepted as correct.
 *          This is the check most likely to catch a real bug: a generator
 *          producing an answer format its own checker can't parse means every
 *          student who types the "right" answer gets marked wrong.
 *
 * NOTE on template array naming: most generator arrays end in "TPL"
 * (ALAPMUVTPL, EGYENLTPL, ...) but a few don't (OSZTHPL, ARANYPL). The script
 * does NOT rely on the "TPL" suffix — it inspects every top-level const array
 * and only touches the ones that actually contain functions, so it won't miss
 * a generator just because of an odd name.
 *
 * USAGE
 * -----
 * node test/check-quizzes.js --dir . --jobs 28 --trials 10000

 * Exit code is 0 if every file is clean, 1 if any issue was found (handy for CI /
 * a pre-commit hook). Run this after editing any grade file, especially after
 * touching a shared helper (niceStr, parseNum, checkFracAnswer, etc.) or adding
 * a new template — it costs a few seconds and will catch most "this generator's
 * answer can never be marked correct" class of bugs before a student hits them.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

// ── minimal DOM shim ──────────────────────────────────────────────────────
function makeElement(tag) {
  const el = {
    tagName: (tag || 'DIV').toUpperCase(),
    style: {}, dataset: {}, children: [], attributes: {},
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    childNodes: [],
    _listeners: {},
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    removeEventListener(){},
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); },
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k]; },
    querySelector() { return makeElement('div'); },
    querySelectorAll() { return []; },
    focus(){}, blur(){}, click(){}, select(){},
    getBoundingClientRect() { return { top:0,left:0,width:100,height:20,bottom:20,right:100 }; },
    get innerHTML() { return this._html || ''; },
    set innerHTML(v) { this._html = v; },
    get textContent() { return this._text || ''; },
    set textContent(v) { this._text = v; },
    value: '',
  };
  return el;
}

function makeDocument() {
  const byId = {};
  return {
    documentElement: makeElement('html'),
    body: makeElement('body'),
    head: makeElement('head'),
    readyState: 'complete',
    addEventListener(ev, fn) { if (ev === 'DOMContentLoaded') { try { fn(); } catch (e) {} } },
    removeEventListener(){},
    createElement(tag) { return makeElement(tag); },
    createElementNS(ns, tag) { return makeElement(tag); },
    createTextNode(t) { return { nodeValue: t }; },
    getElementById(id) { return (byId[id] = byId[id] || makeElement('div')); },
    querySelector() { return makeElement('div'); },
    querySelectorAll() { return []; },
    getElementsByTagName() { return []; },
  };
}

function makeWindow(doc) {
  const win = {
    innerWidth: 1024, innerHeight: 768,
    visualViewport: { height: 844, width: 390, addEventListener(){}, removeEventListener(){} },
    screen: { width: 390, height: 844, availWidth: 390, availHeight: 844 },
    addEventListener(){}, removeEventListener(){},
    matchMedia: () => ({ matches: false, addEventListener(){}, addListener(){} }),
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    location: { href: 'http://localhost/', search: '', hash: '' },
    history: { replaceState(){}, pushState(){} },
    scrollTo(){},
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    navigator: { userAgent: 'node', clipboard: { writeText: async () => {} } },
    localStorage: (() => {
      const m = {};
      return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } };
    })(),
    print(){}, open() { return null; },
    console,
    document: doc,
  };
  return win;
}

// ── load one file's inline JS into a fresh sandbox ────────────────────────
function loadFile(fname) {
  const html = fs.readFileSync(fname, 'utf-8');
  const scripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const origSrc = scripts.join('\n;\n');

  // Extract candidate template-array names from the ORIGINAL source (before
  // the const->var rewrite below, so the "const NAME = [" pattern still matches).
  const constNames = [...new Set(
    [...origSrc.matchAll(/^(?:const|let)\s+([A-Z0-9_]+)\s*=\s*\[/gm)].map(m => m[1])
  )];

  // CRITICAL: Node's vm module does NOT attach top-level const/let bindings to
  // the sandbox object (only `var` and function declarations become properties
  // of the global object) — this is standard JS semantics, not a vm quirk.
  // This codebase's convention is that top-level declarations are unindented
  // (column 0) while everything nested inside a function is indented, so we
  // can safely rewrite only the top-level ones to `var` without touching
  // block-scoped const/let inside functions (which stay exactly as written).
  const src = origSrc.replace(/^const\s+/gm, 'var ').replace(/^let\s+/gm, 'var ');

  // Some files (currently grade3/grade4) fall back to a diacritic-normalized
  // string comparison when the "correct" answer isn't a parseable number —
  // this lets plain arith() (not just textArith()/isText) carry word answers
  // like "paros"/"paratlan" or Roman numerals. Detect that so the self-check
  // below matches what submitAnswer() actually does in *this* file, instead
  // of assuming every file uses the strict pure-numeric comparison.
  const hasNumericStringFallback = /isNaN\(cv\)/.test(origSrc);

  const doc = makeDocument();
  const win = makeWindow(doc);

  const sandbox = {
    window: win, document: doc, navigator: win.navigator, localStorage: win.localStorage,
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    Math, JSON, Array, Object, String, Number, Boolean, Date, RegExp, Error,
    Promise, Set, Map, isNaN, parseInt, parseFloat, isFinite,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: fname, timeout: 10000 });
  return { sandbox, constNames, hasNumericStringFallback };
}

// ── run the generator sweep for one file ──────────────────────────────────
function checkFile(fname, nTrials) {
  const issues = [];
  let sandbox, constNames, hasNumericStringFallback;
  try {
    ({ sandbox, constNames, hasNumericStringFallback } = loadFile(fname));
  } catch (e) {
    return { file: path.basename(fname), loadError: e.message, issues: [], tplCount: 0 };
  }

  let tplCount = 0;

  const targets = [];
  for (const name of constNames) {
    let arr;
    try { arr = sandbox[name]; } catch { continue; }
    if (!Array.isArray(arr)) continue;
    targets.push({ name, arr });
  }
  // The geometry generators live on an object — `const GEO={cat:[...]}` plus
  // later `GEO['Cat']=[...]` assignments — so the const-array regex above
  // never sees them. Sweep the object's array values directly.
  const GEO = sandbox.GEO;
  if (GEO && typeof GEO === 'object' && !Array.isArray(GEO)) {
    for (const cat of Object.keys(GEO)) {
      if (Array.isArray(GEO[cat])) targets.push({ name: `GEO[${cat}]`, arr: GEO[cat] });
    }
  }

  for (const { name, arr } of targets) {
    const hasFn = arr.some(x => typeof x === 'function');
    const hasGenPh = arr.some(x => x && typeof x === 'object' && typeof x.gen === 'function' && Array.isArray(x.ph));
    if (!hasFn && !hasGenPh) continue;
    tplCount++;

    // Plain generator-function templates: () => ({ srcStr, ans, ... })
    arr.forEach((fn, idx) => {
      if (typeof fn !== 'function') return;
      for (let t = 0; t < nTrials; t++) {
        let ex;
        try { ex = fn(); }
        catch (e) { issues.push({ tpl: name, idx, type: 'exception', msg: e.message }); return; }
        if (ex === null || ex === undefined) continue; // some templates intentionally retry via null

        const badNum = (v, field) => { if (typeof v === 'number' && !isFinite(v)) issues.push({ tpl: name, idx, type: 'bad-number', field, val: v }); };
        const badStr = (v, field) => { if (typeof v === 'string' && /NaN|undefined|Infinity/.test(v)) issues.push({ tpl: name, idx, type: 'bad-string', field, val: v.slice(0, 120) }); };
        badNum(ex.ans, 'ans'); badStr(ex.ans, 'ans'); badStr(ex.srcStr, 'srcStr');
        if (ex.ansN !== undefined) badNum(ex.ansN, 'ansN');
        if (ex.ansD !== undefined) { badNum(ex.ansD, 'ansD'); if (ex.ansD === 0) issues.push({ tpl: name, idx, type: 'zero-denominator' }); }

        // self-consistency: would the exercise's own checker accept its own answer?
        if (ex.isFrac && typeof sandbox.checkFracAnswer === 'function') {
          let r; try { r = sandbox.checkFracAnswer(ex.ans, ex.ansN, ex.ansD); } catch { r = null; }
          if (r !== 'exact' && r !== 'unsimplified') issues.push({ tpl: name, idx, type: 'self-check-fail-frac', val: ex.ans, ansN: ex.ansN, ansD: ex.ansD });
        } else if (ex.isText && typeof sandbox.checkTextAnswer === 'function') {
          let r; try { r = sandbox.checkTextAnswer(ex.ans, ex); } catch { r = false; }
          if (!r) issues.push({ tpl: name, idx, type: 'self-check-fail-text', val: ex.ans });
        } else if (typeof ex.ans === 'string') {
          const parseNum = s => parseFloat(String(s).trim().replace(',', '.'));
          const cv = parseNum(ex.ans);
          // Files with the isNaN(cv) fallback (grade3/grade4) accept a
          // diacritic-normalized string match when the answer isn't numeric,
          // so a non-numeric ans is fine there. Everywhere else, a non-numeric
          // ans reaching the plain numeric branch means it can never be marked
          // correct — that's a real bug.
          if (!isFinite(cv) && !hasNumericStringFallback) {
            issues.push({ tpl: name, idx, type: 'self-check-fail-numeric', val: ex.ans });
          }
        }
      }
    });

    // WORD_T-style templates: [{ gen(){...}, ph:[fn, fn, ...] }]
    arr.forEach((entry, idx) => {
      if (!entry || typeof entry !== 'object' || typeof entry.gen !== 'function' || !Array.isArray(entry.ph)) return;
      for (let t = 0; t < nTrials; t++) {
        let d;
        try { d = entry.gen(); } catch (e) { issues.push({ tpl: name, idx, type: 'gen-exception', msg: e.message }); continue; }
        if (d && typeof d.ans === 'number' && !isFinite(d.ans)) issues.push({ tpl: name, idx, type: 'bad-number', field: 'ans', val: d.ans });
        entry.ph.forEach((phFn, phIdx) => {
          let s;
          try { s = phFn(d); } catch (e) { issues.push({ tpl: name, idx, phIdx, type: 'ph-exception', msg: e.message }); return; }
          if (typeof s === 'string' && /NaN|undefined/.test(s)) issues.push({ tpl: name, idx, phIdx, type: 'bad-ph-string', val: s.slice(0, 150) });
        });
      }
    });
  }

  // dedupe identical issues (same tpl/idx/type/field) so output stays readable
  const seen = new Set();
  const deduped = issues.filter(iss => {
    const key = `${iss.tpl}|${iss.idx}|${iss.type}|${iss.field || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { file: path.basename(fname), issues: deduped, tplCount };
}

if (!isMainThread) {
    const { file, nTrials } = workerData;
    parentPort.postMessage(checkFile(file, nTrials));
    return;
}

// ── CLI ─────────────────────────────────────────────────────────────────
async function main() {
    const args = process.argv.slice(2);

    let nTrials = 60;
    let files = [];

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--trials') {
            nTrials = parseInt(args[++i], 10) || 60;
        } else if (args[i] === '--dir') {
            const dir = args[++i];
            files.push(
                ...fs.readdirSync(dir)
                    .filter(f => f.endsWith('.html'))
                    .map(f => path.join(dir, f))
            );
        } else {
            files.push(args[i]);
        }
    }

    if (files.length === 0) {
        console.log("Usage: node check-quizzes.js [--trials N] [--dir DIR] file1.html ...");
        process.exit(1);
    }

    const maxWorkers = Math.min(os.cpus().length, files.length);

    let nextFile = 0;
    let running = 0;
    let anyIssues = false;

    await new Promise(resolve => {

        function launch() {

            while (running < maxWorkers && nextFile < files.length) {

                const worker = new Worker(__filename, {
                    workerData: {
                        file: files[nextFile++],
                        nTrials
                    }
                });

                running++;

                worker.on("message", result => {

                    if (result.loadError) {
                        anyIssues = true;
                        console.log(`✗ ${result.file}: FAILED TO LOAD — ${result.loadError}`);
                    }
                    else if (result.issues.length === 0) {
                        console.log(
                            `✓ ${result.file}: ${result.tplCount} template arrays, ${nTrials} trials each — no issues`
                        );
                    }
                    else {
                        anyIssues = true;

                        console.log(
                            `✗ ${result.file}: ${result.issues.length} issue(s) found`
                        );

                        for (const iss of result.issues) {
                            console.log(
                                `    [${iss.tpl}][${iss.idx}${iss.phIdx !== undefined ? "." + iss.phIdx : ""}] ${iss.type}` +
                                (iss.field ? ` (${iss.field})` : "") +
                                (iss.val !== undefined ? `: ${JSON.stringify(iss.val)}` : "") +
                                (iss.msg ? `: ${iss.msg}` : "")
                            );
                        }
                    }
                });

                worker.on("exit", () => {

                    running--;

                    if (nextFile < files.length) {
                        launch();
                    }
                    else if (running === 0) {
                        resolve();
                    }
                });

                worker.on("error", err => {
                    running--;
                    anyIssues = true;
                    console.error(err);

                    if (nextFile < files.length)
                        launch();
                    else if (running === 0)
                        resolve();
                });
            }
        }

        launch();
    });

    process.exit(anyIssues ? 1 : 0);
}

main();