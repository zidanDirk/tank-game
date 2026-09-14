---
name: tank-implement
description: Implement Tank 1990 changes following project conventions — paper + dark-green + orange palette, HUD in index.html, logic in src/core and src/systems, preserve window.__TANK_GAME__.snapshot() shape.
---

# tank-implement

Code conventions for Tank 1990:

**File layout**
- Entry: `src/main.js`
- Game loop & state: `src/core/GameManager.js`
- Constants & tuning: `src/core/config.js`
- Input: `src/core/Input.js`
- Entities: `src/entities/{Tank,Pickup}.js`
- World: `src/world/{MapManager,models}.js`
- Systems: `src/systems/{Effects,BulletManager,CollisionSystem,AudioSystem,Leaderboard}.js`
- UI: `index.html` + `src/style.css`

**Style rules**
- Vanilla JS modules, no transpiler, no framework
- Three.js for 3D, native DOM/CSS for HUD overlays
- Paper `#e9ecdf` background, dark green `#1c2a1f`, orange `#e3602a` accent
- Game-feel hooks live on `game.effects` (extend `src/systems/Effects.js`, don't create a new system)
- Snapshot API at `GameManager.snapshot()` MUST stay additive — new fields OK, never remove or rename existing fields
- DEBUG hook: `window.__TANK_GAME__.snapshot()` and `window.__TANK_GAME__.spawnPickup(type,x,z)` exist only in dev (`import.meta.env.DEV`)

**Touch points for new UI feedback**
- Screen shake: add method to `Effects` (it has the scene reference), call from `GameManager.onTankDestroyed` and `BulletManager.impact` for `BASE`/`boss`
- Damage flash: DOM class toggle on a wrapper, triggered in `PlayerTank.hit()`
- Score popup: DOM element positioned via world-to-screen, triggered in `GameManager.onTankDestroyed`
- Bullet trail: extend `BulletManager.fire()` to add `THREE.Line` per player bullet, decay alpha in `tick()`
- Level-up animation: DOM class toggle, trigger in `PlayerTank.upgrade()` after `audio.play("levelup")`

**Before finishing**
- Run `npm test` — must stay ≥ previous pass count (currently 22)
- Run `npm run format` to match existing Prettier config
- Update `scripts/loop/state.json` with the cycle entry (id, item_id, files_changed)
