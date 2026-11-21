// SOLMAR BAY — hand-in program for the make.fun gta6-01 bounty.
//
// Run by the scorer under Node 22. It assembles the entry in the output
// directory and describes it, in three moves:
//
//   1. copy the playable game (game/) and the four staged screenshots
//      (screenshots/) out of this repository, byte for byte;
//   2. run the vendored make.fun library's buildDossier over that output
//      tree with the caps the bounty publishes;
//   3. write the library's answer to dossier.json in the output root.
//
// The output directory is MAKEFUN_OUTPUT_DIR when set, else /output. All
// reads resolve relative to this file, never to the caller's working
// directory, so the same repository produces the same dossier anywhere.

import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

mkdirSync(outDir, { recursive: true });
for (const part of ["game", "screenshots"]) {
  cpSync(join(here, part), join(outDir, part), { recursive: true });
}

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});

writeFileSync(join(outDir, "dossier.json"), dossier);
console.log(`solmar-bay: copied game/ + screenshots/, dossier.json is ${dossier.byteLength} bytes`);
