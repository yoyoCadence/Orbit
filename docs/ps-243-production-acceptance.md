# PS-243 Personal Space V2 Production Acceptance

- Status: **In Progress**
- Baseline date: **2026-07-18**
- Visual/performance base commit: `75d3103` (`main`, merged PR #129)
- Acceptance branch: `test/ps-243-production-acceptance` (`v1.21.2`)
- Automation environment: desktop Chromium, Windows, Playwright

This document separates evidence that can be reproduced in a desktop browser
from evidence that requires real accounts, real mobile hardware, an installed
PWA, assistive technology, or final production art. A desktop emulation result
must never be reported as an iOS, Android, thermal, or device-memory result.

## Reproducing this baseline

Every automated result below is produced by committed code, not a one-off
manual session. Regenerate and verify with:

| Command | Produces | Kind |
|---|---|---|
| `npm run test:e2e` (`tests/e2e/ps243-acceptance.test.js`) | Viewport matrix, horizontal overflow, 44 px touch targets, keyboard order, reduced motion, 200% zoom | Deterministic **PASS gates**, run in CI (`e2e`) |
| `npm test` (`tests/unit/ps243AssetBudget.test.js`) | Asset byte and gzip-budget gates + artifact freshness check | Deterministic **PASS gates**, run in CI (`test`) |
| `npm run ps243:assets` (`scripts/ps243-asset-baseline.mjs`) | `docs/ps243/asset-baseline.json` | Reproducible artifact — pure function of committed files; `git diff` verifies |
| `npm run ps243:perf` (`scripts/ps243-perf-baseline.mjs`) | `docs/ps243/perf-baseline.json` | **BASELINE snapshot** — volatile timings, not a gate |

The asset file set is derived from the committed runtime manifest
(`pwa/js/personalSpace/v2/content/assetManifest.js`) via
`getWorkspaceAssetManifestPaths()`, so recorded evidence cannot drift from the
assets the runtime actually loads.

## Status vocabulary

- **PASS** — the stated automated or static acceptance check passed.
- **BASELINE** — useful synthetic measurement, but not production-device proof.
- **FOLLOW-UP** — measured and outside the target, but still below the hard fallback threshold or owned by another approved task.
- **HUMAN GATE** — requires real hardware, credentials, assistive technology, or final art before PS-243 can close.

## Browser and static baseline

Reproduced by `tests/e2e/ps243-acceptance.test.js` unless noted.

| Area | Evidence | Result |
|---|---|---|
| 320×568 small phone | No horizontal overflow; runtime `ready`; one canvas; the four Orbit actions are each at least 44 px high and **scroll-reachable** (they are not all inside the first screen at this height — see note). | PASS |
| 390×844 phone | No horizontal overflow; runtime `ready`; one canvas; four actions at least 44 px high; Tab order is World → Project → Companion → Main Quest. | PASS |
| 768×1024 tablet | No horizontal overflow; runtime `ready`; one canvas; four touch targets at least 44 px high and scroll-reachable. | PASS |
| 1024×768 narrow desktop | No horizontal overflow; runtime `ready`; one canvas; four touch targets at least 44 px high and scroll-reachable. | PASS |
| 844×390 landscape | No horizontal overflow; runtime `ready`; one canvas; Main Quest and the other actions are scroll-reachable above the fixed bottom navigation. | PASS |
| Keyboard order | Focus moves through World → Project → Companion → Main Quest without entering poster/canvas-only layers. | PASS |
| Detail-panel focus management | Opening a detail panel moves focus to its heading; closing it (button or `Escape`) returns focus to the invoking control. Regression: `tests/unit/personalSpaceV2Page.test.js`. | PASS |
| Reduced motion | `prefers-reduced-motion: reduce` is detected; `.orbit-window` animation/transition durations collapse to ~0 (`0.01 ms`). | PASS |
| 200% zoom stress | At 1280×720 with root CSS zoom 2, no horizontal overflow; one runtime canvas; all four actions stay at least 44 px high and scroll-reachable. | PASS (layout stress) |
| Telemetry privacy | All ten contracted events accept only categorical values; `edit_mode_opened` accepts the full canonical scene inventory (estate/manager/memory included); calendar-invalid dates fail closed; free-form/negative values are rejected; caller retry keys stay local while adapters receive ids derived only from trusted metadata; untrusted or overflowed timestamps are normalized; the local adapter is bounded and failure-safe. Regression: `tests/unit/personalSpaceTelemetry.test.js`. | PASS |

Note on 320×568: `main` occupies roughly y=68..504 with the fixed navigation at
y=504..568, so the Project/Companion/Main Quest actions sit below the first
screen and are reached by scrolling. The evidence claim is deliberately
**scroll-reachable**, not first-screen visible.

The reduced-motion and 200% checks are repeatable layout/stress tests. Final
browser text-zoom, screen-reader announcement, and contrast acceptance remain
human gates because CSS zoom is not a substitute for each platform's browser and
assistive stack.

## Synthetic route and performance baseline

Reproduced by `npm run ps243:perf`; the raw snapshot is committed at
`docs/ps243/perf-baseline.json`. Profile: desktop Chromium at 390×844 with 4×
CPU throttling; two warm-up loops, then ten measured Home ↔ Full World loops
after the initial Home runtime reached `ready`. Route timings are wall-clock
milliseconds around each awaited route transition; p75 is nearest-rank; the JS
heap delta is a GC'd `Runtime.getHeapUsage` read before and after the ten loops.

These numbers are **BASELINE only**: they are volatile and environment-dependent
(a Playwright-driven desktop run includes automation overhead), so they are not
wired to a fragile CI threshold. The committed JSON is one such run; regenerate
it to compare on a given machine. The reproducible, gated assertions are the
canvas-count and asset checks, not the timings.

| Measurement | Source | Interpretation |
|---|---|---|
| Full World route p75 / max | `perf-baseline.json > fullWorldRouteMs` | BASELINE; regression trend only |
| Home route p75 / max | `perf-baseline.json > homeRouteMs` | BASELINE; regression trend only |
| Canvas count across all route states | `perf-baseline.json > canvas.singleCanvasHeld` | Exactly one canvas is held in every state (also gated in `tests/e2e/`) |
| JS heap delta after 10 loops | `perf-baseline.json > jsHeap.deltaBytes` | BASELINE; watch for large monotonic growth across runs |

The headless `requestAnimationFrame` cadence is intentionally not treated as a
device FPS result because headless Chromium can run uncapped. FPS, GPU memory,
thermal behavior, and incremental process memory must be measured on the target
Android and iOS devices.

## Transfer and asset budgets

Reproduced by `npm run ps243:assets`; the raw evidence is committed at
`docs/ps243/asset-baseline.json` and the budgets are gated by
`tests/unit/ps243AssetBudget.test.js`. Asset sizes are raw binary bytes; JS bytes
are read with CRLF normalized to LF so the result equals the committed Git blob
on Windows and Linux alike (the gzip figures are deterministic `zlib` level-6
estimates, not a production network trace). The JS file set is the union of
`pwa/js/personalSpace/v2/**` and the Personal Space modules transitively reached
from the route entry `pwa/js/pages/personalSpaceV2.js` (adds `personalSpaceV2.js`,
`unlockRules.js`, `economy.js`, `gameState.js`); every path is listed in the
artifact.

| Budget | Measured | Target / threshold | Result |
|---|---:|---:|---|
| Personal Space V2 application JS gzip estimate (24-file V2 module set) | 49,782 bytes | part of 300 KB deferred budget | PASS |
| Vendored Pixi gzip estimate (`pwa/vendor/pixi.js`) | 225,428 bytes | part of 300 KB deferred budget | PASS |
| Combined deferred V2 + Pixi gzip estimate | 275,210 bytes | 300 KB | PASS |
| Initial background + protagonist | 1,987,696 bytes | 1.5 MB / 2.5 MB hard | FOLLOW-UP: above target, below hard threshold |
| Complete proof scene + eight manifest props | 2,760,735 bytes | 4 MB / 6 MB hard | PASS |

The initial-scene target remains assigned to PS-242 because the current scene is
explicitly `fallback-proof`, not final production art. PS-243 records the
measured baseline but does not relabel the proof assets as final.

## Human-device acceptance checklist

These items are intentionally open. Record evidence against the merged `main`
build rather than a stale feature branch.

- [ ] Two real accounts with delayed sync: rapidly switch A → B → A and verify profile, Tasks, Energy, Sessions, pending writes, and V2 world never cross owners.
- [ ] iOS Safari: complete Home Main Quest → Focus settlement → Reveal → Full World → Undo.
- [ ] Android Chrome: complete the same end-to-end flow.
- [ ] Installed standalone PWA: portrait/landscape rotation, safe areas, background/foreground, offline reload, and poster fallback.
- [ ] VoiceOver or TalkBack plus keyboard/switch input: verify region and button announcements, focus order, detail-panel focus return, and reveal status announcement. (Programmatic focus return has automated coverage; the spoken screen-reader announcement remains a human gate.)
- [ ] Browser 200% text zoom and OS large-text settings: verify no clipped labels, hidden actions, or fixed-navigation traps.
- [ ] Representative mid/low device: record warm runtime p75, route teardown, FPS, incremental memory, ten-loop heap trend, temperature, and fallback behavior.

Use this evidence record for each device run:

| Field | Value |
|---|---|
| Date / tester | |
| Device / SoC / RAM | |
| OS / browser version | |
| Browser tab or installed PWA | |
| Orientation / viewport / text scale | |
| Network and cache state | |
| Home poster visible ms | |
| Warm runtime ready p75 ms | |
| Home / World route teardown ms | |
| Sustained FPS / low-mode trigger | |
| Incremental memory / ten-loop delta | |
| Temperature or throttling observation | |
| Account-isolation result | |
| Screen-reader / keyboard result | |
| Screenshot, trace, or issue link | |
| Final result and notes | |

## Exit rule

PS-243 remains **In Progress** until the human-device checklist has evidence or
an explicit product decision accepts a documented exception. The automated
baseline can catch regressions early, but it cannot close the real-device gates.
