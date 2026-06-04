# Hotel Angle Pack Proof

Generated as a live validation sample for the `orbit-idle-window-assets` reference-to-angle-pack workflow.

## Files

- `hotel-consumption-center-reference.png` — base reference image.
- `hotel-consumption-left-angle.png` — left-side camera proof generated from the reference.
- `hotel-consumption-right-angle.png` — right-side camera proof generated from the reference.
- `hotel-consumption-overhead-angle.png` — high overhead / top-down planning proof generated from the reference.
- `hotel-consumption-angle-contact-sheet.png` — 2x2 comparison sheet.

## QC Notes

- Passed for `L1 room-identity`: overall hotel identity remains consistent: dark navy walls, warm brass lighting, marble floor, arched night windows, lounge seating, reception, bar, boutique shelves, and spending/service interactions.
- Passed for angle variety: angles are meaningfully different, including a useful overhead planning view.
- Failed for `L2 landmark-locked`: the generator re-authored details instead of preserving the same floor plan. Reception, bar, boutique shelves, sofa clusters, family, solo guest, concierge, luggage, and shopping bags shift or change between views.
- Failed for production continuity: the four images are the same kind of hotel scene, not a deterministic camera rotation of the exact same scene.

## Skill Implication

This confirms the skill can produce same-room-language angle proofs from one reference, but not production-stable crowded scenes by text reference alone.

Recommended modification:

1. Use a `landmark-locked` prompt for the next proof: name each counter, shelf, window wall, lounge cluster, and human activity group before generating variants.
2. For final Orbit runtime assets, generate clean empty background angle packs first.
3. Generate people, shopping bags, drinks, luggage, and service interactions as separate transparent sprites or prop clusters.
4. Use runtime placement metadata to keep those objects consistent across camera profiles.
