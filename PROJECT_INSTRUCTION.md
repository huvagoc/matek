# Project Instruction: Magyar Iskolai Kvízek (Unified Repository)

## Project Overview

This project provides browser-based, offline-capable mathematics quiz applications for Hungarian primary school students. The project is organized as a single unified static website containing:
1. **Landing Page (`index.html`)**: A beautiful, modern portal that lets users choose their grade level (grades 3 to 6).
2. **Grade-Specific Quizzes (`grade3.html`, `grade4.html`, `grade5.html`, `grade6.html`)**: Self-contained quiz applications that handle logic, rendering, printing, and problem generation.

## Technical Architecture

- **Vanilla Stack**: Everything is written in raw HTML, CSS, and JavaScript. No frameworks (React, Vue, etc.), no compilation/build steps, no `npm`, and no external assets (other than optional system fonts and GoatCounter web analytics).
- **Offline-First**: Once downloaded, all files are completely functional offline.
- **Auto Dark Mode**: All pages detect and apply dark mode styling automatically via the CSS media query `prefers-color-scheme`.
- **Seeded PRNG (xorshift32)**: Re-seeding with random or specified codes enables reproducible task sets. This is critical for printing sheets and looking up solutions.

## Repository Directory Structure

```text
├── index.html                # Main landing page & grade selector (wrapper)
├── grade3.html               # 3rd-grade math quiz
├── grade4.html               # 4th-grade math quiz
├── grade5.html               # 5th-grade math quiz
├── grade6.html               # 6th-grade math quiz
├── README.md                 # Project description for GitHub
├── PROJECT_INSTRUCTION.md    # This project instruction file
└── LICENSE                   # CC BY-NC 4.0 license file
```

---

## Shared Architecture & Custom Codes

Every grade quiz uses a single-file structure containing:
1. **CSS Styles**: Theme variables, responsive layouts, print-specific layouts, and dark mode media queries.
2. **HTML Layout**: Settings, Quiz, and Result screens, plus hidden print templates.
3. **JS Generator Logic**: Math problem generation powered by a custom seeded random number generator.
4. **JS App Logic**: Lifecycle methods (`buildQuiz`, `renderQ`, `submitAnswer`, `printWorksheet`, `solveFromCode`).
5. **GoatCounter Analytics**: Minimalist, privacy-friendly analytics (`site.goatcounter.com/count`).

### Seeded PRNG and Worksheet Codes
- **PRNG**: Simple `xorshift32` with a `_seed` state variable. All random parameters utilize it.
- **Code Format**: `XXXXX-YY` where `XXXXX` is 5 hex digits (20-bit seed) and `YY` is 2 hex digits representing the active category bitmask (bit `i` corresponds to the category `GROUPS[i]`).
- **Solution Verification**: Entering a worksheet code on the settings screen and clicking "Megoldások" (Solutions) allows instant access to answer keys without having to redo the quiz.

### Answer Normalization & Validation
Depending on the exercise type, validation is processed using:
- **Numeric**: Checks with floating-point tolerance of `1e-9` (accepts both `.` and `,` as decimal separators).
- **Fraction**: Supports mixed fractions `w a/b`, integers, and improper fractions `a/b`. Reports if the result is correct but unsimplified.
- **Text**: Normalizes whitespace, unifies multiplication signs (`*`, `·`, `x`, `×`), unifies minus/dash signs, and is case-insensitive.

---

## Guidelines for Updates & Maintenance

1. **Keep Pages Independent**: Do not introduce cross-file JS imports or complex dependency structures. The grade HTML files must remain runnable as standalone files when opened directly in any browser.
2. **Back-porting Fixes**: When a bug is fixed in one grade file's core architecture (e.g., in helper functions like `niceStr`, `parseNum`, or styling utilities), make sure to apply the correction to the other grade files to keep them in sync.
3. **Respect Hungarian Grammar Rules**:
   - Always display decimals using commas (e.g., `3,14` instead of `3.14`).
   - Watch suffixes for Hungarian numbers (e.g., `-val`/`-vel`, `-ból`/`-ből`). Use the helper variables and templates built into the generators.
4. **Git Workflow**: Push the entire directory as a single repository. Enable **GitHub Pages** targeting the `main` branch to host the static site instantly.
