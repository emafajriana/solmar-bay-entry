# SOLMAR BAY

[![make.fun](https://img.shields.io/badge/make.fun-gta6--01-ffd166)](https://make.fun/c/gta6-01)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

An original sun-soaked coastal crime city — built for the make.fun **gta6-01 "Make GTA 6"** competition. Everything is original: the city, characters, story, art and sound. Nothing from Rockstar / GTA.

## Play

Serve `game/` with any static server (or `node serve.ts`) and open `http://localhost:8080` in desktop Chrome. No network requests, no build step.

## The game

- **City:** procedural Three.js city on an 8×8-block grid — Downtown towers, Marina, Old Town, Industrial, Beachfront and Hills districts, beach + ocean on the south edge, palms, streetlights, traffic lights, billboards and props. Day sun, shadows, fog.
- **On foot:** WASD + mouse look (pointer lock), Shift run, Space jump, E enter/exit car, F punch, click shoot, 1/2/3 weapon switch.
- **Driving:** arcade car physics, handbrake, follow camera, speedometer, collisions, car damage + smoke, repair/respray at Pay'n'Spray (clears wanted for cash).
- **Traffic & pedestrians:** AI cars follow the roads and stop at red lights; pedestrians walk the sidewalks and flee gunshots and crashes.
- **Steal cars:** E near a parked or NPC car. Stealing an occupied car is +1 star.
- **Wanted 0–5 stars:** stealing, hitting pedestrians, killing, shooting near police. Police cars chase and ram; foot cops at 2+ stars; stars decay after ~20 s clean. Pay'n'Spray clears them.
- **Combat:** pistol / shotgun / rifle, ammo bought at GUN RUNNER, health regen out of combat, hospital heals for cash.
- **Missions + story (8):** work for fixer Carmen "La Jefa" Duarte against the Los Tiburones gang — driving tutorial, timed pizza run, getaway driver, turf war, timed drop, repo job, harbor heist, and the finale "King of the Bay". Gold beacon + minimap blip + HUD objective + distance. Fail states with retry.
- **Economy:** mission pay $200–$5,000 plus cash pickups. Spend at the weapons shop, Pay'n'Spray, diner and hospital.
- **HUD:** health bar, cash, wanted stars, minimap (roads, player arrow, mission marker, police blips, shop icons), objective, speed, ammo, in-game clock, radio label. Title / how-to / pause / busted / wasted / victory screens.
- **Audio:** WebAudio synth only — engine hum, sirens, gunshots, pickup blips, mission jingle, synthwave loop.
- **Save:** localStorage (cash, missions completed, best stats) — CONTINUE on the title screen.

## Screenshots

Staged by the game's own `?shot=` scenes (`game/src/shots.js`), same seed every time:

1. `1-title.jpg` — cover: city panorama + title + a car
2. `2-play.jpg` — on foot in a Downtown street, traffic, HUD + minimap
3. `3-chase.jpg` — driving with police behind, wanted stars + objective
4. `4-mission.jpg` — Harbor Heist combat at the harbor with wanted level

## Files

```
main.ts            entry program: copies game/ + screenshots/ to /output, writes dossier.json
game/
  index.html       page + HUD + screens, Three.js import map
  style.css        HUD and menu styling
  vendor/three/    vendored Three.js (three.module.min.js)
  src/
    main.js        boot, loop, screens, shops, pickups
    config.js      constants, landmarks, districts, tuning
    rng.js         seeded RNG
    input.js       keyboard / mouse / pointer lock
    audio.js       WebAudio synth
    city.js        procedural city build + collision
    player.js      on-foot controller
    vehicles.js    car physics + traffic AI
    pedestrians.js ped AI
    police.js      wanted level + pursuit
    combat.js      weapons, tracers, enemies
    missions.js    8-mission story arc
    hud.js         HUD + minimap canvas
    save.js        localStorage
    shots.js       staged screenshot scenes + autopilot
    render.js      Three.js scene, camera, lighting
```

## License

MIT — see [LICENSE](./LICENSE).
