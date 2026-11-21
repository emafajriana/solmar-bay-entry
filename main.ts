// SOLMAR BAY — hand-in program for the make.fun gta6-01 competition.
//
// What this file does, and all it does:
//   1. copies the static game (game/) and the screenshot set (screenshots/)
//      from beside this file into the output directory, and
//   2. writes dossier.json there with the vendored make.fun library — the
//      summary of the entry that the judge reads.
//
// The game itself is plain static files: game/index.html plus its ES modules,
// served offline by any static file server. There is no build step and no
// network access at run time.
//
// Run it the way the grader does (from any working directory):
//   node main.ts
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play the game locally with:  node serve.ts   (then open the printed URL)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const entryDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const DOSSIER_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

mkdirSync(outputDir, { recursive: true });

cpSync(join(entryDir, 'game'), join(outputDir, 'game'), { recursive: true });

const shotsOut = join(outputDir, 'screenshots');
mkdirSync(shotsOut, { recursive: true });
const shotsIn = join(entryDir, 'screenshots');
if (existsSync(shotsIn)) {
  cpSync(shotsIn, shotsOut, { recursive: true });
}

// The scorer's caps for this competition are passed to buildDossier so an
// entry the scorer would refuse is refused here first: at most 4 screenshots
// of 256 KiB each; game/ at most 993 entries and 48 MiB in all, no path over
// 1,000 bytes; the dossier's source text capped at 160 KiB.
const dossier = buildDossier(outputDir, DOSSIER_LIMITS);
writeFileSync(join(outputDir, 'dossier.json'), dossier);
