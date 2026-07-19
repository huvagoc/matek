# Project Instruction: Magyar Iskolai Kvízek (Unified Repository)

## Project Overview

This project provides browser-based, offline-capable mathematics quiz applications for Hungarian primary, secondary, and érettségi (school-leaving exam) students. The project is organized as a single unified static website containing:
1. **Landing Page (`index.html`)**: A modern, responsive, dark-mode-aware portal that lets users choose their grade level or exam track.
2. **Grade-Specific Quizzes (`grade3.html` … `grade12.html`)**: Self-contained quiz applications, one per grade (3rd through 12th), each handling its own logic, rendering, printing, and problem generation.
3. **Érettségi Prep Quizzes (`kozepszint.html`, `emelt.html`)**: Self-contained quizzes covering középszint (standard-level) and emelt szint (advanced-level) matematika érettségi topics.

All twelve grade files plus the two érettségi files follow the same single-file architecture and conventions described below.

## Current state (2026-07) — read this first

The rest of this file is partially stale; this section is authoritative where they conflict.

- The repo also contains **`felveteli6.html`** and **`felveteli8.html`** (központi írásbeli
  felvételi, 6./8. évfolyam), which the sections below do not yet mention.
- There are two intended page archetypes:
  1. **Interactive drill quiz** — `grade3.html` … `grade12.html`.
  2. **Printable *próbafeladatlap* generator** — the four exam tracks (`felveteli6`,
     `felveteli8`, `kozepszint`, `emelt`): pick settings, print an OH-style paper plus a
     separately printable answer key; no on-screen quiz.
- `felveteli6/8.html` are being converted to archetype 2 now (this branch).
- `kozepszint.html` and `emelt.html` are **still archetype 1** and have not been converted.
  This is known, tracked, and deferred to a later pass — do not "fix" it in passing.
- **`examples/`** holds real Oktatási Hivatal papers (M6/M8 felvételi 2025–2026, K2613, E2513)
  and is the authoritative reference for print layout. The PDFs are deliberately untracked
  (size + third-party material); re-download from oktatas.hu if missing.
- Worksheet codes: felvételi pages and grade9 use a **3-digit hex mask** (`XXXXX-YYY`); on the
  felvételi pages mask bit 10 (`0x400`) selects the booklet (0 = Mat1, 1 = Mat2), and the
  booklet is mixed into the effective PRNG seed so Mat1/Mat2 papers differ for the same seed.
  2-digit masks remain accepted (legacy codes, Mat1).

## Technical Architecture

- **Vanilla Stack**: Everything is written in raw HTML, CSS, and JavaScript. No frameworks (React, Vue, etc.), no compilation/build steps, no `npm`, and no external assets (other than optional system fonts and GoatCounter web analytics).
- **Offline-First**: Once downloaded, all files are completely functional offline. `sw.js` precaches the wrapper, all 12 grade pages, both érettségi pages, the manifest, and icons on first visit.
- **Auto Dark Mode**: All pages detect and apply dark mode styling automatically via the CSS media query `prefers-color-scheme`.
- **Seeded PRNG (xorshift32)**: Re-seeding with random or specified codes enables reproducible task sets. This is critical for printing sheets and looking up solutions. Never call `Math.random()` directly in problem generation — always go through the seeded PRNG.

## Repository Directory Structure

```text
├── index.html                # Main landing page & grade/track selector (wrapper)
├── grade3.html                # 3rd-grade math quiz
├── grade4.html                # 4th-grade math quiz
├── grade5.html                # 5th-grade math quiz
├── grade6.html                # 6th-grade math quiz
├── grade7.html                # 7th-grade math quiz
├── grade8.html                # 8th-grade math quiz
├── grade9.html                # 9th-grade (gimnázium) math quiz
├── grade10.html               # 10th-grade math quiz
├── grade11.html               # 11th-grade math quiz
├── grade12.html                # 12th-grade math quiz
├── kozepszint.html            # Középszintű matematika érettségi prep quiz
├── emelt.html                  # Emelt szintű matematika érettségi prep quiz
├── sw.js                       # Offline service worker (precache list + CACHE version)
├── manifest.json                # PWA manifest
├── README.md                   # Project description for GitHub
├── PROJECT_INSTRUCTION.md      # This project instruction file
└── LICENSE                     # CC BY-NC 4.0 license file
```

---

## Shared Architecture & Custom Codes

Every grade/track quiz uses a single-file structure containing:
1. **CSS Styles**: Theme variables, responsive layouts, print-specific layouts, and dark mode media queries.
2. **HTML Layout**: Settings, Quiz, and Result screens, plus hidden print templates.
3. **JS Generator Logic**: Math problem generation powered by a custom seeded random number generator, organized into curriculum-appropriate category groups (e.g. grade3–8 follow NAT topic groups; grade9–12/kozepszint/emelt follow gimnázium and érettségi topic groups such as gondolkodási módszerek, számelmélet és algebra, függvények, geometria/trigonometria, valószínűség és statisztika, szöveges feladatok).
4. **JS App Logic**: Lifecycle methods (`buildQuiz`, `renderQ`, `submitAnswer`, `printWorksheet`, `solveFromCode`).
5. **GoatCounter Analytics**: Minimalist, privacy-friendly analytics (`site.goatcounter.com/count`).

### Seeded PRNG and Worksheet Codes
- **PRNG**: Simple `xorshift32` with a `_seed` state variable. All random parameters utilize it.
- **Code Format**: `XXXXX-YY` where `XXXXX` is 5 hex digits (20-bit seed) and `YY` is 2 hex digits representing the active category bitmask (bit `i` corresponds to `GROUPS[i]`). All files use this format **except grade9.html**, which has 9 category groups and therefore uses a 3-digit mask (`XXXXX-YYY`); its `decodeWorksheetCode` regex accepts both 2- and 3-digit suffixes for backward compatibility with codes printed before the 9th group was added. Each file's codec only needs to handle its own format — no cross-file compatibility is required (pages are standalone).
- **Solution Verification**: Entering a worksheet code on the settings screen and clicking "Megoldások" (Solutions) allows instant access to answer keys without having to redo the quiz.

### Answer Normalization & Validation
Depending on the exercise type, validation is processed using:
- **Numeric**: Checks with floating-point tolerance of `1e-9` (accepts both `.` and `,` as decimal separators).
- **Fraction**: Supports mixed fractions `w a/b`, integers, and improper fractions `a/b`. Reports if the result is correct but unsimplified.
- **Text**: Normalizes whitespace, unifies multiplication signs (`*`, `·`, `x`, `×`), unifies minus/dash signs, and is case-insensitive.

Note: higher-track files (grade9–12, kozepszint, emelt) may extend these helpers for content the earlier grades don't need (e.g. irrational/surd answers, trigonometric values, vectors). Extensions are fine; the core helper names, signatures, and baseline behavior should stay identical across all files so a fix doesn't silently diverge.

---

## Guidelines for Updates & Maintenance

1. **Keep Pages Independent**: Do not introduce cross-file JS imports or complex dependency structures. Every grade/track HTML file must remain runnable as a standalone file when opened directly via `file://` in any browser.
2. **Back-porting Fixes**: When a bug is fixed in one file's core architecture (e.g., in shared helper functions like `niceStr`, `parseNum`, answer normalization, or styling utilities), apply the identical correction to all other files that share that helper, to keep them in sync. Flag explicitly which files were touched.
3. **Respect Hungarian Grammar Rules**:
   - Always display decimals using commas (e.g., `3,14` instead of `3.14`).
   - Watch suffixes for Hungarian numbers (e.g., `-val`/`-vel`, `-ból`/`-ből`). Use the helper variables and templates built into the generators.
4. **Service Worker Sync**: Whenever any cached file's content changes, bump the `CACHE` constant in `sw.js` and confirm the `FILES` precache array still lists exactly the 12 grade files, both érettségi files, `index.html`, `manifest.json`, and icons — no more, no less.
5. **Git Workflow**: Push the entire directory as a single repository. Enable **GitHub Pages** targeting the `main` branch to host the static site instantly.
