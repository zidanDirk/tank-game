# Tank 1990 — implementation progress

## Intent and constraints
Playable 26×26 classic base-defense prototype. Procedural Three.js geometry only; orthographic camera 60° above ground. Vite ES modules, custom grid/AABB collision, fixed 1/60 simulation. No external media or physics service.

## Design brief
Command one green tank, open firing lanes through brick, intercept three enemy archetypes, and protect the gold eagle. Feel: miniature battlefield, deliberate arcade control and readable impacts. Primary verb shoot; secondary move/aim/intercept. Every 5–30 seconds choose between clearing a lane and protecting the base. Twelve enemies in escalating mix, at most four concurrent. Three player lives, spawn protection, immediate retry. Score rewards kills; base and lives create competing pressure. Better play uses steel for cover and shoots across water. Single handcrafted stage; no multiplayer or campaign.

## Core loop contract
Player moves and fires to eliminate 12 enemies while enemy patrols and projectiles threaten the player and base; kills increase score, victory clears the sector, failure explains base loss or depleted lives and permits immediate restart.

## Level plan
Full board always visible. Spawn/player/base at south, three telegraphed enemy gates north. Brick columns shape cross-fire, central river has traversable breaks, steel islands provide durable cover. Open south corridor affords a first movement decision. Enemy light/heavy/rapid types introduced through the spawn sequence. Base protected initially by destructible brick crown. Floor grid and spawn markings clarify traversal.

## Decisions
- Camera fixed at (0, 38, 22): 60° elevation, screen-aligned grid controls.
- Player cardinal hull control plus optional independent mouse aiming; keyboard movement restores cardinal aim.
- Steel absorbs ordinary bullets. Water passes bullets, blocks tanks. Any shell hitting base ends run.
- All gameplay random choices use seeded RNG. Cosmetic effects use same supplied RNG.
- UI delegated to /root/ui, owns index.html and src/style.css only.

## Pending
Implement game modules, integrate UI, build, run collision and browser checks, capture desktop/mobile and motion evidence.

## Completed
All requested core systems implemented. UI integrated, production build generated. 19 core tests pass. Browser input/combat/pause/fail/retry/win/touch/audio checks pass; zero runtime or network errors. Screenshots and 3-frame unpaused motion evidence captured. Details: final-evidence.md and browser-smoke.json.

Three-stage campaign added: Stage 1 `training` (12 enemies, brick lanes), Stage 2 `crossfire` (15 enemies, cross water and steel), Stage 3 `citadel` (18 enemies, tighter steel/brick corridors). Score carries forward; each stage resets lives and retries restore the stage-start score. Stage clear is an explicit state; only Stage 3 produces the final win state.

## Remaining
No blocking defects identified. Optional future scope: multi-stage maps, powerups, smarter pathfinding, persistent best score. Physical mobile GPU performance remains unmeasured.
