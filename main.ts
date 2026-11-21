// SOLMAR BAY — the hand-in program for this make.fun gta6-01 entry.
//
// What it does, in order:
//   1. copies the playable game (game/) and its four renders (screenshots/)
//      from this repository into the output directory;
//   2. asks the vendored make.fun library to build the dossier of that
//      output directory, with exactly the caps the bounty's scorer uses;
//   3. writes the result to dossier.json in the output directory.
//
// The output directory comes from MAKEFUN_OUTPUT_DIR when the grader sets
// it, and defaults to /output. The program only ever reads paths relative
// to its own file, so it can be run from any working directory and will
// produce the same bytes every time.

import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const repoDir = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

mkdirSync(outputDir, { recursive: true });
for (const part of ["game", "screenshots"]) {
  cpSync(join(repoDir, part), join(outputDir, part), { recursive: true });
}

const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});

writeFileSync(join(outputDir, "dossier.json"), dossier);
console.log(`solmar-bay: game + screenshots copied, dossier.json written (${dossier.byteLength} bytes)`);
