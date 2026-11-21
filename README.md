[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/emafajriana/solmar-bay-entry/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/emafajriana/solmar-bay-entry/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# SOLMAR BAY

An original open-world crime game that runs entirely in the browser. One
sun-drenched coastal city, six districts, a fixer with a grudge, a rival gang
that wants the docks, and a police force that remembers *where* you made your
mess. Everything here — city, characters, story, art, sound — is original and
built from scratch on Three.js. No downloads, no server, no network calls:
open the page and play.

## The signature feature: District Heat

Most wanted systems keep one global star rating. Solmar Bay doesn't. **Every
district keeps its own heat.** Commit a crime in the Marina and the Marina
heats up — patrols multiply there, the minimap flushes red there, and the
stars over your head are read from the heat of the ground you are standing
on. Duck two districts over into a quiet part of town and the hunt cools
while the Marina is still boiling. Each district also cools at its own rate:
Downtown's cameras hold a grudge, the Hills forget by sundown. Managing the
map's heat — not just your stars — is the game.

## What's in the city

- **A full procedural city** — an 8×8 block grid with roads, sidewalks,
  traffic lights, palms, billboards, a beach and open ocean to the south,
  and a working container harbor.
- **Six districts** — Downtown, Marina, Old Town, Industrial, Beachfront and
  the Hills — each with its own look, building style and District Heat.
- **On foot and behind the wheel** — third-person walking, running, jumping,
  fists and firearms; steal any car you can reach, drive it, wreck it, get it
  resprayed.
- **Living traffic and crowds** — AI cars that obey traffic lights,
  pedestrians who stroll the sidewalks and scatter when things go loud.
- **Police that hunt by district** — patrol cars, foot cops, roadblocks at
  high heat, bust and wasted states, and a Pay'n'Spray that launders your
  heat for cash.
- **An 8-mission story** — fixer Carmen "La Jefa" Duarte hires you to take
  the bay back from Los Tiburones, from a first drive across town to the
  assault on their headquarters.
- **An economy** — mission pay, cash drops, a gun shop, a diner, a hospital,
  and resprays that all cost money you have to earn.
- **Synthesised audio** — engine hum, sirens, gunfire, jingles and an ambient
  synthwave loop, all generated with WebAudio. No audio files.
- **A save that sticks** — cash, story progress and lifetime stats persist in
  the browser, with Continue on the title screen.

## How to play

Serve the `game/` folder with any static file server (or run
`node serve.ts` from this repo) and open it in a desktop browser.

| Input | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse | Look (click the game to lock the pointer) |
| Shift | Run / boost |
| Space | Jump / handbrake |
| E | Enter or exit a car, talk, use a shop |
| F | Punch |
| Mouse click | Shoot (when armed) |
| 1 / 2 / 3 | Fists / pistol / shotgun or rifle |
| R | Reload |
| P or Esc | Pause |

## District Heat, in detail

- **Heat is a place, not a person.** Each district holds 0–100 heat. Steal
  a car in the Marina and the Marina gains heat; Downtown neither knows
  nor cares.
- **Stars are local.** Your wanted stars are read from the heat of the
  district you are currently in: under 8 heat is a clean record, 84+ is a
  five-star manhunt. Cross a district line into somewhere cool and the
  stars fall off you — the hot district keeps its patrols and its colour
  on the minimap.
- **The PD radios ahead.** While a chase is live, the district you flee
  into warms slowly, so running in circles around one block does not work.
- **Districts cool at their own rates.** Heat fades once a district has
  been quiet for a while — fastest in the Hills (2.2/s), slowest Downtown
  (0.6/s), where the cameras remember. Cooling pauses while the police
  have eyes on you, and hiding at a mission drop-off bleeds heat faster.
- **Escalation follows the stars.** Two stars brings foot cops, three
  brings gunfire, four brings roadblocks, five brings everything.
- **The wash.** Shine Auto's Pay'n'Spray ($300) zeroes the heat of the
  district you are in and halves every other district — the legal way to
  cool a map that has gone red.

Crimes and their heat: stealing a car 16 · hitting a pedestrian 22 ·
killing 40 · killing an officer 55 · shots heard by police 8 · punching
someone 6 · a hard crash 4.

## The story

Eight missions for Carmen "La Jefa" Duarte of La Perla bar, Marina:

1. **Welcome to Solmar** ($200) — cross the Marina and meet the fixer.
2. **Pizza Run** ($350) — a judge's pizza, delivered hot, Downtown.
3. **Getaway Driver** ($600) — a crew, a score, a two-star escape.
4. **Turf War** ($900) — five Tiburones in Beachfront who need evicting.
5. **The Drop** ($1,200) — a package to the harbor, fast and quiet.
6. **Repo Job** ($1,800) — repossess a sports car from the Hills, intact.
7. **Harbor Heist** ($3,000) — clear the pier, then outrun the Industrial grid.
8. **King of the Bay** ($5,000) — storm Club Tiburón and end the war.

## The hand-in

`main.ts` is the entry program: it copies `game/` and `screenshots/` into
the output directory and writes `dossier.json` with the vendored make.fun
library, byte for byte the way the scorer builds it.

An entry for the make.fun [gta6-01](https://make.fun/bounty/gta6-01)
competition ("Make GTA 6"). All names, characters, story and art are
original.
