# Hotel Continuity L1 / L2 / L3 Proof

This folder compares three asset-generation continuity levels for the same luxury hotel consumption scene.

## L1 Room Identity

Folder: `l1-room-identity/`

This is the original angle-pack proof. It preserves the broad hotel identity: dark navy walls, brass lighting, marble floor, arched night windows, reception, bar, boutique shelves, lounge seating, and consumption/service activities.

Result: good for mood and early art direction, but not stable enough for production continuity. People, counters, sofas, bags, and activity clusters are re-authored between angles.

## L2 Landmark Locked

Folder: `l2-landmark-locked/`

This uses named anchors A-J: reception, bar, boutique shelf, windows, lounge seating, concierge counter, family shopping group, solo coffee guest, bellhop/luggage, and red velvet foreground seating.

Result: substantially better continuity than L1. Most named zones and activity clusters stay recognizable and in roughly the correct relative positions. The tradeoff is that left/right camera shifts become more conservative, because the prompt strongly prioritizes preserving anchors.

## L3 Runtime Accurate

Folder: `l3-runtime-accurate/`

This separates the scene into:

- `clean-*-background.png` files: fixed hotel room/counter/furniture angle pack with no people or loose runtime objects.
- `activity-cluster-sheet-magenta.png`: generated 3x2 sheet of dynamic consumption clusters.
- `activity-clusters/`: split transparent runtime-ready clusters for reception payment, bar order, family shopping, solo coffee, concierge bill, and bellhop luggage.

Result: best production direction. Background continuity is easier to control because people and loose props are removed. Activity clusters can be placed by runtime metadata per camera profile.

## Recommendation

Use L1 for rough art direction, L2 for validating whether a generated reference can preserve the same scene, and L3 for final Orbit implementation.

For the real idle window, generate empty room angle packs first, then add furniture/NPC/consumption clusters as separate assets. This gives the editor and camera profiles enough control to stay coherent on mobile.
