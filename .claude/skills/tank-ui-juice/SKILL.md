---
name: tank-ui-juice
description: Game-feel rules for Tank 1990 — when to shake, flash, popup, trail. Avoid over-application; intensity must scale with event significance.
---

# tank-ui-juice

Five feedback channels. **Each has a trigger, intensity rule, and duration budget.**

## Screen shake — `effects.shake(durationMs, magnitude)`
| Trigger | Duration | Magnitude |
|---|---|---|
| Player takes damage | 180ms | 0.06 |
| Enemy explodes (light/rapid) | 120ms | 0.04 |
| Heavy/armor explodes | 200ms | 0.08 |
| Boss explodes | 600ms | 0.18 (peak) → 0.06 (decay) |
| Base destroyed | 800ms | 0.22 (peak) → 0.05 (decay) |
| Player destroyed | 350ms | 0.10 |

Magnitude is in world units. Decay linearly across duration.

## Damage flash — `.damage-vignette.show` on `#overlay` wrapper
- Only on `PlayerTank.hit()` when `hp` drops but tank stays alive
- NOT on shield absorption (shield has its own blue burst)
- 280ms opacity 0 → 0.55 → 0 with cubic-bezier ease-out
- Color: red-orange `#a24e38`

## Score popup — `effects.scorePopup(x, z, text)`
- Triggers in `GameManager.onTankDestroyed` for enemies
- Text = `+${TYPES[type].score}` (e.g. `+300`)
- Color matches tank type (light=yellow, heavy=orange, armor=red, boss=gold)
- 1.2s total: 0–0.15s scale up + rise, 0.15–1.0s rise+fade, 1.0–1.2s remove
- Max 8 concurrent popups (evict oldest)

## Bullet trail — `THREE.Line` per player bullet
- Only for `team === "player"` (don't add to enemies — visual noise)
- Width: 0.08 world units
- Color matches bullet material
- Alpha decay: 1.0 → 0 over 0.18s
- Dispose on bullet death

## Level-up burst — `.level-burst` on body or `#buff-tray`
- Triggers in `PlayerTank.upgrade()` after `audio.play("levelup")`
- 600ms total: burst element fades + scales from 1.4 → 1.0
- Text: `+1` or `★ N → N+1` (just `+1` is cleaner)
- Color: gold `#f3d65a`

**Important:** the `effects.shake()` call must check `prefers-reduced-motion` (CSS media query already honored by `index.html`). If reduced motion, skip shake and shorten popup to 400ms.
