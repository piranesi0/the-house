# v0 deferred minors

From the v0 final whole-branch review (2026-10-13). Deferred by Alex; none blocks v0.

- [ ] `src/player.js`: `requestPointerLock()` rejection is unhandled (logs `WrongDocumentError`); add `.catch` and a "click again" hint.
- [ ] `src/world.js`: vista halls (y = ±1) get the 15% ghost pass and show faintly through floor and ceiling; build them with `ghost = 0`.
- [ ] `src/birds.js`: perches span ±(hx − 1) on the north wall, inside wall mass in octagon and cross halls; clamp to the wall's real span.
- [ ] `src/statues/place.js`: spec §5 "the hash picks a pose and perturbs it slightly" is not implemented; every pose is identical. Pair with pose tuning.
- [ ] `src/main.js`: no `hashchange` listener; pasting a link into an open tab does nothing.
- [ ] `src/main.js`: drips fire in 0.05 m puddles; spec says the drowned quarter (`depth >= 0.4`).
- [ ] Caching: `python -m http.server` and Pages (`max-age=600`) can serve stale modules after a change; no-cache dev server or a version query.
- [ ] `src/world.js`: `params` cache is never pruned; `near()` allocates arrays every frame.
- [ ] Spec §3 says the load boundary is 60 m; it is 48 m (fog now ends at 44 m). Fix the spec line.
