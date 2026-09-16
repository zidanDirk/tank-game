# Tank 1990 — implementation progress

## Intent and constraints
Playable 26×26 classic base-defense prototype. Procedural Three.js geometry only; orthographic camera 60° above ground. Vite ES modules, custom grid/AABB collision, fixed 1/60 simulation. No external media or physics service.

## Design brief
Command one green tank, open firing lanes through brick, intercept escalating enemy mixes, and protect the gold eagle. Feel: miniature battlefield, deliberate arcade control and readable impacts. Primary verb shoot; secondary verbs move, aim, intercept, and shape a run build. Every 5–30 seconds choose between clearing a lane and protecting the base; after campaign stages 1–2 or every third endless wave, choose one of three persistent tank upgrades. Score, survival, powerups, and build synergy reward better play. Non-goals for this slice: metagame currency, cloud saves, inventory management, and permanent stat progression.

## Core loop contract
Player moves and fires to eliminate enemies while patrols and projectiles threaten the player and base; clearing a sector gives a three-choice run upgrade that changes combat state, failure preserves the current campaign build for a fast level retry, and starting a new run resets the build.

## Level plan
Full board always visible. Spawn/player/base at south, three telegraphed enemy gates north. Brick columns shape cross-fire, central river has traversable breaks, steel islands provide durable cover. Open south corridor affords a first movement decision. Enemy light/heavy/rapid types introduced through the spawn sequence. Base protected initially by destructible brick crown. Floor grid and spawn markings clarify traversal.

## Decisions
- Camera fixed at (0, 38, 22): 60° elevation, screen-aligned grid controls.
- Player cardinal hull control plus optional independent mouse aiming; keyboard movement restores cardinal aim.
- Steel absorbs ordinary bullets. Water passes bullets, blocks tanks. Any shell hitting base ends run.
- All gameplay random choices use seeded RNG. Cosmetic effects use same supplied RNG.
- Run upgrades are deterministic, unique per offer, capped, and applied from one `RunUpgradeSystem` source of truth.
- Campaign offers appear after stages 1–2; endless offers appear after waves 3, 6, 9, and so on.
- Six launch upgrades cover mobility, fire rate, projectile speed, damage, drop rate, and per-spawn armor.
- UI delegated to /root/ui, owns index.html and src/style.css only.

## Pending
Implement game modules, integrate UI, build, run collision and browser checks, capture desktop/mobile and motion evidence.

## Completed
All requested core systems implemented. UI integrated, production build generated. 91 core tests pass. Browser input/combat/pause/fail/retry/win/touch/audio checks pass; zero runtime or network errors. Screenshots and 3-frame unpaused motion evidence captured. Details: final-evidence.md and browser-smoke.json.

Three-stage campaign added: Stage 1 `training` (12 enemies, brick lanes), Stage 2 `crossfire` (15 enemies, cross water and steel), Stage 3 `citadel` (18 enemies, tighter steel/brick corridors). Score carries forward; each stage resets lives and retries restore the stage-start score. Stage clear is an explicit state; only Stage 3 produces the final win state.

Run-build layer added: three-choice upgrade overlay (`upgrade-select`), six stackable upgrades (overdrive, autoloader, velocity, piercing, scavenger, reactive), campaign-cadence (after stage 1/2) and endless-cadence (every third wave), HUD build tray, mobile layout, deterministic snapshots, and browser-level progression coverage. `tests/upgrades-check.mjs` exercises both cadences plus mobile layout and generates desktop/mobile screenshots.

## Remaining
Physical mobile GPU performance remains unmeasured. Upgrade balance is covered by deterministic rules and automated behavior tests, but long-run tuning beyond wave 12 still needs human playtest data.
