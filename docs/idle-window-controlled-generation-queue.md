# Idle Window Controlled Generation Queue

This queue prevents future idle-window asset expansion from drifting into unrelated room or furniture designs.

Use the `orbit-idle-window-assets` skill and generate each item from its approved reference image. Do not replace these with text-only prompt batches.

## Required Direction Variants

Every large layout-critical furniture asset should eventually provide:

- `front`
- `left-wall-flush`
- `right-wall-flush`

Final variants must use `status: 'perspective-correct'` in `assetRegistry.js`.

Extended angle packs may later add `back`, `left-side`, `right-side`, `three-quarter-left`, `three-quarter-right`, or `top-down` variants when a future editor/runtime needs them. These should be generated from the same approved reference image and registered or documented as `angle-proof` until the runtime consumes them.

Background reference generation follows the same rule: one approved room or location image should be able to produce controlled `left`, `center`, `right`, `overhead`, `top-down`, `isometric`, or `plan-view` proofs without changing material identity.

## Current Queue

| Priority | Asset | Reference | Missing / non-final work | Runtime need |
|---:|---|---|---|---|
| 6 | `office-tall-bookcase` | `props/office-tall-bookcase/prop.png` | Generate authored side variants before placing as a major wall/floor object. | Future storage layout. |
| 7 | `office-filing-cabinet` | `props/office-filing-cabinet/prop.png` | Generate authored side variants before placing against side walls. | Future denser office layout. |

`office-corner-desk-v3` is the current completed reference: it already provides `front`, `left-wall-flush`, and `right-wall-flush` with `perspective-correct` status.

`office-leather-sofa` is the first completed skill-validated loop after the queue was added. It uses the original `prop.png` as `front` and the generated `left-wall-flush` / `right-wall-flush` variants from `raw/office-leather-sofa-variant-sheet-v1-magenta.png`.

The first large-furniture batch is also complete:

- `office-low-coffee-table` uses the original `prop.png` as `front` and generated side variants from `raw/office-low-coffee-table-variant-sheet-v1-magenta.png`.
- `office-pattern-rug` uses the original `prop.png` as `front` and generated side variants from `raw/office-pattern-rug-variant-sheet-v1-magenta.png`.
- `office-trophy-display` uses the original `prop.png` as `front` and generated side variants from `raw/office-trophy-display-variant-sheet-v1-magenta.png`.
- `office-shelf` replaces the old `mirror-test` side views with generated variants from `raw/office-shelf-variant-sheet-v1-magenta.png`.

`office-angle-overhead-proof` is the first background reference-angle proof. It was generated from `backgrounds/office-angle-center-v2.png` and registered as `role: angle-proof`, not as a runtime camera profile.

## Runtime Contract

The queue is mirrored in `pwa/js/personalSpace/idleWindow/variantReadiness.js`.

Tests should keep these expectations true:

- completed assets do not appear in `buildIdleWindowVariantGenerationQueue()`
- one-view or mirror-only assets remain in the queue
- generated variants are not considered complete until every required variant exists and has `status: 'perspective-correct'`

## Generation Rule

For every queued item:

1. Inspect the current `front` reference.
2. Generate only the missing side views from that reference.
3. Reject outputs that change material, silhouette, palette, light direction, or pixel density.
4. Save accepted variants under the existing prop folder.
5. Register variants in `assetRegistry.js`.
6. Re-run `npm run test -- tests/unit/personalSpaceIdleWindow.test.js`.

For background angle proofs:

1. Inspect the approved room or location reference.
2. Generate the target angle from that reference, not from text alone.
3. Reject outputs that change architecture, material family, lighting temperature, palette, or pixel density.
4. Save accepted proofs under `backgrounds/` or `raw/` with clear `*-proof` naming.
5. Register only if useful for discovery; use `role: 'angle-proof'` and do not wire into `layouts.js` until the runtime supports it.
