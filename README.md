[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/emafajriana/solmar-bay-entry/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/emafajriana/solmar-bay-entry/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# SOLMAR BAY

A complete open-world crime game that runs in a desktop browser from
static files. One procedural coastal city, six districts, traffic and
crowds, stealable cars, an eight-mission story, and a wanted system with
a twist: **the heat belongs to the district, not to you.** Everything —
city, characters, story, art, sound — is original and built on Three.js.
No server, no downloads, no network requests: open the page and play.

## The signature feature: District Heat

Solmar Bay keeps no global wanted level. Each of the six districts holds
its own heat, 0–100, and your stars are read from the heat of the ground
under your feet. Torch the Marina and the Marina boils — patrols double
there, its streets flush red on the minimap — while the Hills stay
sleepy and cool. Flee two districts over and the stars fall off you, but
the hot district does not forget: it keeps its patrols, its colour, and
its grudge, cooling at its own rate (Downtown's cameras are the slowest
to forgive; the Hills forget by sundown). While a chase is live the PD
radios ahead and the district you flee into warms too, so circling one
block never works. The Pay'n'Spray is the legal exit: it washes the
district you are standing in to zero and halves every other district.

That one rule rewrites every chase, every route and every hideout in
the game — the map itself is the wanted system.

### District Heat, in detail

- **Heat is local.** Stealing a car adds 16 heat to the district you are
  standing in; a hard crash 4; a punch 6; gunfire heard by a unit 8;
  running someone down 22; a killing 40; killing an officer 55.
- **Stars are a reading, not a record.** 8 heat is one star, 24 two,
  42 three, 60 four, 80 the full five. Cross a border and the reading
  changes with the ground — the heat itself stays where you made it.
- **Districts cool at their own pace**, and only once you have been
  quiet there for a while: Downtown holds heat longest (×0.55 rate),
  then Marina (×0.8), Industrial (×0.9), Old Town (×1.0), Beachfront
  (×1.15) and the Hills (×1.35). If the PD can see you in a district,
  that district does not cool at all.
- **A live chase leaks.** At two stars or more, with eyes on you, the
  district you are fleeing into warms at 0.85 heat a second — the radio
  is faster than you are.
- **Response scales with the reading:** one patrol car at one star, two
  at two, three at three, four at four, five at five. Foot officers
  deploy from stopped cruisers from two stars, shoot from three, and
  the roadblocks come out at four.
- **The minimap tells the truth:** hot districts flush red in
  proportion to their heat, patrols blink as blue dots, and the district
  name, its heat bar and its radio station sit in the corner of the
  HUD. La Perla's jukebox, the Marina's yacht rock and Downtown's city
  pop are different stations because they are different places.

## What is in the bay

- **A procedural city** — an 8×8 block grid with working traffic lights,
  palms, billboards, street furniture, a beach and open water to the
  south, and a container harbour with a crane and a pier in the
  south-east.
- **Six districts** — Downtown, Marina, Old Town, Industrial,
  Beachfront, the Hills — each with its own building stock, palette and
  cooling rate.
- **On foot and behind the wheel** — third-person walking, running,
  jumping, fists and firearms; any car can be stolen, driven, wrecked
  and resprayed.
- **Living streets** — AI traffic that obeys the lights, pedestrians
  who stroll the pavements and scatter when it gets loud.
- **The Solmar PD** — pursuit cars that ram, foot cops who deploy from
  stopped cruisers and arrest by proximity (or shoot from three stars),
  roadblocks at four stars, bust and wasted states.
- **An eight-mission story** — fixer Carmen "La Jefa" Duarte hires you
  to take the bay back from Los Tiburones, from a first drive across
  town to the storming of Club Tiburón.
- **An economy** — mission pay and cash drops; a gun shop, a diner, a
  hospital and the Pay'n'Spray all charge money you have to earn.
- **Synthesised audio** — engine, sirens, gunfire, jingles and a quiet
  synthwave pad, all WebAudio. There are no audio files.
- **A save that sticks** — cash, story progress, guns and lifetime
  stats persist in the browser; Continue waits on the title screen.

## How to play

Serve the `game/` folder with any static file server — `node serve.ts`
from this repo does it — and open it in a desktop browser.

| Input | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse | Look (click the game to lock the pointer) |
| Shift | Run |
| Space | Jump / handbrake |
| E | Enter or exit a car, talk, use a shop |
| F | Punch |
| Mouse click | Shoot (when armed) |
| 1 / 2 / 3 / 4 | Fists / pistol / shotgun / rifle |
| R | Reload |
| P or Esc | Pause |

## The hand-in

`main.ts` is the entry program: it copies `game/` and `screenshots/`
into the output directory and writes `dossier.json` with the vendored
make.fun library, byte for byte the way the scorer builds it.

An entry for the make.fun
[gta6-01](https://make.fun/bounty/gta6-01) competition ("Make GTA 6").
All names, characters, story and art are original.
