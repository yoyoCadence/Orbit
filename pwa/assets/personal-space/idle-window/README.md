# Idle Window Asset Prototype

This folder is for the independent idle-game style growth window prototype.
It is additive and must not replace the existing `personalSpace` scene runtime or future 3D path.

## Intent

- Build a mobile-idle-game style visual window for self-growth.
- Keep the current 2D/3D personal space display available in parallel.
- Use original HD-2D-inspired pixel assets: layered stage, protagonist, props, and growth feedback.

## Current Assets

- `backgrounds/office-idle-window-concept.png`
  - First office-stage concept background.
  - Good for art direction and a first static idle window.
  - Contains baked-in objects, so it should be regenerated as a cleaner wall/floor-only base before final placement gameplay.

- `backgrounds/office-idle-window-base.png`
  - Clean wall/floor-only office-stage base background.
  - Legacy clean base for comparison with true camera profile backgrounds.

- `backgrounds/office-angle-left.png`, `backgrounds/office-angle-center.png`, `backgrounds/office-angle-right.png`
  - First true camera-profile office background proof.
  - QC note: useful for validating profile switching, but future production passes should regenerate strict 16:9 frames before broad expansion.

- `backgrounds/survival-rental-left.png`, `backgrounds/survival-rental-center.png`, `backgrounds/survival-rental-right.png`
  - Strict 16:9 survival-stage rental room camera profile set.
  - Intended as the growth-start background family for the idle window.

- `backgrounds/office-angle-left-v2.png`, `backgrounds/office-angle-center-v2.png`, `backgrounds/office-angle-right-v2.png`
  - Strict 16:9 building-stage office camera profile set.
  - Replaces the proof backgrounds in runtime while preserving the proof assets for provenance.

- `backgrounds/office-angle-overhead-proof.png`
  - First reference-generated overhead / high top-down angle proof from `office-angle-center-v2.png`.
  - QC note: preserves the same dark navy office identity, right-side city windows, warm ceiling lights, and polished wood floor; registered as `role: angle-proof` and not wired into the current left / center / right runtime.

- `backgrounds/mastery-estate-left.png`, `backgrounds/mastery-estate-center.png`, `backgrounds/mastery-estate-right.png`
  - Strict 16:9 mastery-stage estate / penthouse office camera profile set.
  - Intended as the high-growth background family for the idle window.

- `raw/office-props-sheet-magenta.png`
  - Original 3x3 prop sheet with solid magenta background.

- `raw/office-props-sheet-alpha.png`
  - Chroma-keyed alpha version of the prop sheet.

- `raw/office-expansion-furniture-sheet-magenta.png`
  - 3x3 expansion furniture source sheet: sofa, coffee table, filing cabinet, trophy display, achievement board, floor lamp, rug, side table, and wall art.

- `raw/office-growth-small-props-sheet-magenta.png`
  - 3x3 growth small-prop source sheet: notebook, books, clock, photo frame, tea cup, succulent, blueprint, trophy, and journal.

- `raw/office-wall-storage-sheet-magenta.png`
  - 3x3 wall/storage source sheet: bookcase, floating shelf, cork board, window bench, coat rack, printer cabinet, city map frame, wall sconce, and document safe.

- `props/`
  - Extracted office props plus `office-prop-pack.json`.
  - QC note: `office-corner-desk` touches the source cell edge and should be regenerated one-by-one before production use.

- `props/office-corner-desk-v2/`
  - One-by-one regenerated office desk prop.
  - QC passed with no edge-touch frames; retained as a fallback.

- `props/office-corner-desk-v3/`
  - Three perspective-correct direction variants: `front`, `left-wall-flush`, and `right-wall-flush`.
  - Runtime uses this set to prove wall-aligned large furniture should be authored as variants instead of rotated or mirrored in CSS.

- `props/office-leather-sofa/`
  - First skill-validated generated furniture variant loop.
  - Runtime uses the original `prop.png` as `front` and generated `left-wall-flush` / `right-wall-flush` variants from `raw/office-leather-sofa-variant-sheet-v1-magenta.png`.
  - QC note: `split_idle_window_sheet.py` removed flat magenta, cleared transparent RGB, and removed edge key-color fringe before the variants were accepted.

- `props/office-*/`
  - Extracted transparent PNGs for the expanded office furniture, small props, wall props, and storage props.
  - Runtime registry includes all extracted assets, while layout currently places only a curated subset to avoid overfilling the first screen.

- `characters/building-protagonist-idle/`
  - Four-frame office-stage protagonist idle sheet, extracted frames, transparent sheet, GIF preview, and processing metadata.

## Next Recommended Asset Pass

Code-side prototype contract:

- `pwa/js/personalSpace/idleWindow/assetRegistry.js`
- `pwa/js/personalSpace/idleWindow/layouts.js`
- `pwa/js/personalSpace/idleWindow/index.js`
- `pwa/js/personalSpace/idleWindow/renderer.js`

The renderer is mounted by `pwa/js/pages/personalSpace.js` as a separate card.
It shares growth data with Personal Space, but it does not replace the existing
`Current Scene Layer` or the future 3D display path.
The editor runtime lives in `pwa/js/personalSpace/idleWindow/editorRuntime.js`
and persists drag overrides under `personal-space-state.idleWindowLayouts`, kept
separate from scene `placedItems`.

Current placement feasibility layer:

- Small eligible props can persist `rotation` in placement overrides and render through CSS transforms.
- Larger props expose direction `variants`; `office-corner-desk-v3` proves the production path with true perspective-correct `left / center / right` art.
- Layouts define `placementPlanes` such as wall, floor, and desktop; eligible small props can drag freely and snap to valid support surfaces instead of being permanently clamped to one rectangle.
- Furniture can expose `supportSurfaces`; desktop and shelf props use `localX` / `localY`, so they follow the parent furniture when it moves.
- Layouts define `cameraProfiles` (`left`, `center`, `right`) with real background images and preferred furniture variants; survival, building, and mastery now each have strict 16:9 background sets.
- Props can define `footprint` metadata so the editor can show overlap warnings and depth hints without blocking all creative placement.
- Furniture can define `characterAnchors`; the prototype protagonist can follow `corner-desk.desk-work` while preserving the existing sprite contract.
- Editor users can send selected items directly to the back/front layer, use smaller `- / +` layer nudges for fine tuning, hide or show individual unlocked props from grouped item library sections, and use all/none controls per group.
- Expanded non-edit mode supports blank-stage horizontal drag camera switching. Edit mode keeps camera fixed so furniture dragging and angle viewing do not conflict.
- Future room-angle and furniture-variant passes should use the controlled reference workflow in `skills/orbit-idle-window-assets`: generate from an approved center room or front prop reference, then reject variants that change material identity, floor/wall finish, lighting temperature, or object silhouette.
- `docs/idle-window-controlled-generation-queue.md` and `pwa/js/personalSpace/idleWindow/variantReadiness.js` now track which large furniture assets are ready, which are missing authored side variants, and which reference image should drive generation.
- The `orbit-idle-window-assets` skill includes `scripts/audit_idle_window_variants.mjs`; run it from the repo root before generating new large-furniture variants.

Next recommended asset pass:

1. Regenerate the current survival, building, and mastery background angle sets through the reference-image workflow so each angle preserves the exact same floor, wall, trim, window, and lighting identity.
2. Generate true perspective variants from `docs/idle-window-controlled-generation-queue.md`, starting with sofa, coffee table, rug, trophy display, and shelf.
3. Add survival and mastery protagonist idle sheets with the same frame contract.
4. Add particle sheets for work sparks, level-up stars, and fatigue dust.
5. Add scene-specific idle-window layouts for survival and mastery instead of routing them to the building-stage prototype fallback.
