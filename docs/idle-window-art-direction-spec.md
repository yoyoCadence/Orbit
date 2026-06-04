# Idle Window Art Direction Spec

This document defines the production rules for the additive Personal Space idle-growth window. It does not replace the existing 2D scene page or future 3D runtime; it is a separate mobile-idle-style presentation that can reuse the same growth data.

## Visual Target

- Use HD-2D-inspired pixel art: crisp silhouettes, painterly lighting, visible pixel structure, and believable perspective.
- Keep the scene readable at card size and rich enough for fullscreen landscape editing.
- Avoid pure runtime rotation for perspective. Large furniture and backgrounds need authored angle variants.

## Camera Profiles

Every production background set must include these profiles:

- `left`: left wall and left floor perspective are dominant.
- `center`: neutral room view for default card and balanced layout.
- `right`: right wall and right floor perspective are dominant.

Each profile must provide a real background image, not a shifted copy of another profile. Target output is 16:9, matching the idle window frame. Prototype proof assets may be accepted only when labeled `production-proof` and must be regenerated before final art expansion if aspect ratio or wall geometry is off.

## Placement Planes

Use percent-based coordinates with top-left origin:

- `wall-*`: flat wall props such as boards, frames, hooks, and lights.
- `floor-*`: furniture bases and walkable character anchors.
- support surfaces: tabletops, shelf tiers, ledges, and similar parent-relative surfaces.

Plane bounds are editing aids, not final physics. Small props should be movable freely during editing, then snap to valid support surfaces when close enough.

## Scale Rules

- Character height should read as a human-scale unit. In the office prototype, protagonist width should remain around 12-15% of stage width.
- Desks and sofas should occupy about 28-38% stage width.
- Shelves and cabinets should occupy about 10-18% stage width.
- Small tabletop props should occupy about 4-8% stage width.

## Shadow And Lighting

- Backgrounds carry primary room lighting.
- Props should include only soft contact-aware pixel shading, not a baked floor shadow that prevents rearrangement.
- Runtime may add a light drop shadow, but it cannot rescue incorrect perspective.

## Acceptance Checks

- Camera switching changes the actual background image.
- At least one large furniture item has true `left`, `center`, and `right` variants.
- Small props can detach from a default parent, move freely, and snap to another valid surface.
- Furniture overlap warnings are visible but do not permanently block creative placement.
- Character anchors can follow moved furniture without changing the sprite contract.
