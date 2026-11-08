# CubeWord — a daily 3D crossword on a cube

A new crossword is folded onto a cube every day. Words travel over edges and across faces. Drag to rotate,
type to solve. The whole game is **one static file** (`dist/index.html`, ~1.4 MB: three.js, the word list and all
code are inlined), so it runs happily on GitHub Pages.

## Deploy to GitHub Pages (free)

1. Create a repo (e.g. `cubeword`), add `dist/index.html` and `dist/.nojekyll` to the repo root (or put `index.html` in `/docs`).
2. Repo → **Settings → Pages** → deploy from branch `main`, folder `/ (root)` (or `/docs`).
3. Open `https://<you>.github.io/cubeword/`. Deep links work: `?d=2026-11-10&s=grand` (`s` = `mini`, `classic`, `grand`).

No build step is needed on the server. Rebuild only if you change the source (below).

## How the puzzle is generated (all in the browser, from the date)

Every face is an N×N grid. A **ring** is a closed loop of 4N tiles running around the cube, like one layer of a
Rubik's cube: 3N rings in total, and every tile lies on exactly two of them. A word is a run of tiles along a ring,
so it can wrap over an edge onto the next face.

1. **Seed.** `cubeword|<date>|<size>|<tier>|<attempt>` is hashed (cyrb128) into an integer-only PRNG (sfc32), so the same
   date gives the same cube on every device. Nothing depends on wall-clock time.
2. **Block pattern** (`pattern.js`). Blocks are placed with antipodal symmetry (the pattern is identical under a 180° turn
   through the cube's centre). Rules: every ring has blocks, every run of white tiles is 3..6 (Grand: 7) long, and the
   word graph is connected, so every white tile sits in two clued words.
3. **Fill** (`solver.js`). A constraint solver over bitset-indexed dictionaries: most-constrained-slot first,
   frequency-weighted randomised word order refined by a least-constraining-value probe, forward checking on all
   crossing slots, no duplicate words, node-budgeted restarts. A quality tier (common words) runs first; a wide-dictionary
   tier is a safety net.
4. Runs in a Web Worker so the cube never stalls. Typical times: Mini ~0.15 s, Classic ~0.15 s, Grand ~1 s.

Tested: 60 days of Mini, 60 of Classic, 30 of Grand all generated, with structure checks (every tile in two words,
consecutive letters physically adjacent on the cube, no duplicate words) and a browser/Node determinism check.

## Project layout

```
src/        rng, topology (cube/rings), pattern, solver, generate, game (pure logic), scene (three.js), audio, main, style.css, index.template.html
data/       words.json  [[word, zipf*10, clue], ...]   (built by tools/build_words.py)
tools/      build_words.py   (wordfreq + WordNet -> words.json)
test/       gen.mjs (batch generation), game.mjs (determinism + logic), diag.mjs (generator diagnostics),
            shot.mjs / play.mjs / ui.mjs / final.mjs (headless-Chrome checks)
build.mjs   esbuild -> dist/index.html
```

```
npm install
npm run build        # node build.mjs  -> dist/index.html
node test/game.mjs   # logic + determinism
node test/gen.mjs classic 30
```

Rebuild the word list: `pip install wordfreq wn==0.0.23 && python3 tools/build_words.py 2.3`.

## Things you may want to change

- **Clues.** They are adapted automatically from Princeton WordNet glosses (the answer is masked). Quality is good for
  most words but not perfect. Edit `data/words.json` by hand to improve or ban words, then rebuild.
  Changing the word list changes which puzzle a given date produces.
- **Launch date.** `EPOCH` in `src/main.js` sets puzzle #1 and the earliest archive date.
- **Look.** Eight daily colour palettes live in `src/palette.js`. Lighting and bloom are at the top of `src/scene.js`.

## Credits and licences

Clues are adapted from Princeton WordNet 3.0 (WordNet licence). Word frequencies come from the wordfreq project
(data CC BY-SA 4.0). Rendering by three.js (MIT). Keep the attribution line in Settings if you publish.

## Install as an app (PWA)

CubeWord ships a web manifest and service worker, so it can be installed from the browser ("Install" / "Add to Home Screen") and plays offline. After `npm run build`, copy everything in `dist/` to the repo root before committing.
