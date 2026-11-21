[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/emafajriana/solmar-bay-entry/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/emafajriana/solmar-bay-entry/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# SOLMAR BAY

An original sun-soaked coastal crime city, built with Three.js. Run jobs for
fixer Carmen Duarte, steal anything with wheels, and stay ahead of Solmar PD
across six districts — Downtown, Old Town, The Hills, Marina, Beachfront and
Industrial — with a beach, a working harbor, traffic that stops at lights,
and a story that ends with a king.

**Signature feature — DISTRICT HEAT.** Every district keeps its own heat
meter. A crime raises the heat of the district it happens in, and only that
district; your wanted stars are read off the heat where you stand. So the
map itself is the wanted system: flee across a district line and the
pressure drops, while the district you left stays hot, patrols harder and
charges more at the Pay'n'Spray. The minimap tints each district by its
heat, live.

## District Heat, in detail

Most open-world games keep one global wanted level. Solmar Bay keeps six.

- Every crime — a stolen car, a shot fired, a hostile down — adds heat to
  the district it happens in, and only there. The six meters live
  independently.
- Your stars are computed where you stand: that district's heat, plus a
  quarter of the worst heat anywhere else. Five thresholds, five stars.
- Patrol density scales with the local meter, so a hot district genuinely
  feels hunted — more cruisers, foot police from two stars, roadblocks
  from four.
- Heat cools slowly while nobody sees you in that district. A respray at
  the Pay'n'Spray zeroes the district you are in and halves the rest —
  and a hot district charges you more for the privilege.
- The minimap tints each district by its heat, so the map itself is your
  wanted meter: plan your escape across a border, not just away from the
  nearest cruiser.

## Play it

Serve `game/` with any static server and open it in desktop Chrome:

```
node serve.ts        # then open http://localhost:8080
```

No build step, no network requests, no accounts. Progress saves to
localStorage.

## The game

- **On foot** — WASD + mouse look, Shift run, Space jump, E interact, F punch, click to shoot, 1–4 weapons.
- **Driving** — steal parked or occupied cars, arcade handling, handbrake, damage and smoke, drive-in Pay'n'Spray repairs.
- **The law** — District Heat wanted system, pursuit cars that ram, foot police from two stars, roadblocks at four, a busted meter if they corner you standing still.
- **Eight story jobs** — from a first drive across the bay to the Harbor Heist and the fall of El Tiburón, with timers, escorts, repo work and turf wars.
- **Economy** — mission payouts and cash drops; spend at the Gun Runner, the diner (heals) and the Pay'n'Spray.
- **City life** — signalled traffic, fleeing pedestrians, a working minimap, an in-game clock and radio, and a fully synthesised WebAudio soundtrack: engines, sirens, gunfire and a synthwave pad. No audio files.

## Entry layout

- `main.ts` — the hand-in: copies `game/` and `screenshots/` to the output and writes `dossier.json` with the vendored make.fun library.
- `serve.ts` — a tiny local server for `game/`.
- `game/src/` — one file per job: `city` builds the world, `vehicles` drives it, `police` runs District Heat and the pursuit, `missions` carries Carmen's eight jobs, `hud` draws the interface and minimap, `shots` stages the screenshots, and their companions handle input, combat, crowds, saving and sound.

An entry for the make.fun [gta6-01](https://make.fun/bounty/gta6-01) competition ("Make GTA 6"). All names, characters, story and art are original.
