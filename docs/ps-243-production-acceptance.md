# PS-243 Personal Space V2 Production Acceptance

- Status: **In Progress**
- Baseline date: **2026-07-18**
- Visual/performance base commit: `75d3103` (`main`, merged PR #129)
- Acceptance branch: `test/ps-243-production-acceptance` (`v1.21.1`)
Automation environment: desktop Chromium, Windows, Playwright CLI

This document separates evidence that can be reproduced in a desktop browser
from evidence that requires real accounts, real mobile hardware, an installed
PWA, assistive technology, or final production art. A desktop emulation result
must never be reported as an iOS, Android, thermal, or device-memory result.

## Status vocabulary

- **PASS** — the stated automated or static acceptance check passed.
- **BASELINE** — useful synthetic measurement, but not production-device proof.
- **FOLLOW-UP** — measured and outside the target, but still below the hard fallback threshold or owned by another approved task.
- **HUMAN GATE** — requires real hardware, credentials, assistive technology, or final art before PS-243 can close.

## Browser and static baseline

| Area | Evidence | Result |
|---|---|---|
| 320×568 small phone | No horizontal overflow; canvas matches its 3:2 host; all four Orbit actions are visible and at least 44 px high. | PASS |
| 390×844 phone | No horizontal overflow; runtime `ready`; one canvas; stage 336×224; Tab order is World → Project → Companion → Main Quest. | PASS |
| 768×1024 tablet | No horizontal overflow; runtime `ready`; one canvas; four touch targets at least 44 px high. | PASS |
| 1024×768 narrow desktop | No horizontal overflow; runtime `ready`; one canvas; four touch targets at least 44 px high. | PASS |
| 844×390 landscape | No horizontal overflow; Main Quest can be scrolled fully above the fixed bottom navigation. | PASS |
| Accessibility tree | Personal Space is a named region (`Building Stage · 正式工作站`); World, Project, Companion, and Main Quest expose distinct button names; reward summary is a polite atomic status. | PASS |
| Keyboard order | Focus moves through World → Project → Companion → Main Quest without entering poster/canvas-only layers. | PASS |
| Reduced motion | `prefers-reduced-motion: reduce` is detected; Pixi protagonist and Companion positions remain unchanged over 600 ms; CSS animation/transition duration becomes `0.01ms` for one iteration. | PASS |
| 200% zoom stress | At 1280×720 with root CSS zoom 2, no horizontal overflow; all four actions remain visible and at least 44 px high; one runtime canvas remains active. | PASS (layout stress) |
| Telemetry privacy | All ten contracted events accept categorical values; free-form/negative values are rejected; caller retry keys remain local while adapters receive ids derived only from trusted metadata; untrusted timestamps are normalized; local adapter is bounded and failure-safe. | PASS |

The 200% check is a repeatable layout stress test. Final browser text-zoom,
screen-reader announcement, and contrast acceptance remain human gates because
CSS zoom is not a substitute for each platform's browser and assistive stack.

## Synthetic route and performance baseline

Profile: desktop Chromium at 390×844 with 4× CPU throttling. Ten warm
Home ↔ Full World loops were executed after the initial Home runtime reached
`ready`.

| Measurement | Result | Interpretation |
|---|---:|---|
| Full World route p75 | 173 ms | BASELINE; below 250 ms target |
| Full World route maximum | 363 ms | BASELINE; below 500 ms hard threshold |
| Home route p75 | 88 ms | BASELINE; below 250 ms target |
| Home route maximum | 108 ms | BASELINE; below 250 ms target |
| Canvas count | 1 in all 20 route states | PASS |
| JS heap delta after 10 loops | +562,968 bytes | BASELINE; no large monotonic leak signal in this short run |
| Long tasks | 2; maximum 108 ms | FOLLOW-UP on real hardware; not repeatable on every route |

The headless `requestAnimationFrame` cadence was intentionally not treated as a
device FPS result because headless Chromium can run uncapped. FPS, GPU memory,
thermal behavior, and incremental process memory must be measured on the target
Android and iOS devices.

## Transfer and asset budgets

Static sizes are measured from repository bytes. JavaScript gzip values are
estimates from concatenated source and are not a replacement for a production
network trace.

| Budget | Measured | Target / threshold | Result |
|---|---:|---:|---|
| Personal Space V2 application JS gzip estimate | 41,873 bytes | part of 300 KB deferred budget | PASS |
| Vendored Pixi gzip estimate | 225,645 bytes | part of 300 KB deferred budget | PASS |
| Combined deferred V2 + Pixi gzip estimate | 267,518 bytes | 300 KB | PASS |
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
- [ ] VoiceOver or TalkBack plus keyboard/switch input: verify region and button announcements, focus order, detail-panel focus return, and reveal status announcement.
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
