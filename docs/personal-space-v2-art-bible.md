# Personal Space V2 Art Bible

## 1. Purpose and Scope

This Art Bible defines the production visual contract for the Personal Space V2 vertical slice. Its target is a readable, emotionally grounded mobile world—not maximum asset count, photorealism, or unrestricted decoration.

The first production target is:

```text
Building Stage
Formal Workstation
Active Project: Workspace Upgrade
```

Every generated, commissioned, or hand-authored asset must follow this contract and pass human visual QA before entering a production registry.

## 2. Relationship to the Legacy Idle Prototype

The current `Idle Growth Window` is a valuable legacy prototype with:

- 16:9 backgrounds;
- left, center, and right camera profiles;
- perspective-specific furniture variants;
- HD-2D-inspired pixel rendering;
- DOM-based layered images and a full-screen placement editor.

V2 does not delete, overwrite, or silently migrate those assets. Existing files, registries, layout metadata, support surfaces, footprints, character anchors, and camera-profile schemas remain available for legacy mode and future reference.

They are not the V2 production art contract. V2 uses one canonical camera, a 3:2 home composition, and a Premium Illustrated Diorama style. A legacy asset may enter V2 only when it matches the canonical camera, scale, lighting, alpha quality, and mobile readability checks. No additional three-angle furniture pack is required for the first V2 slice.

Recommended separation for new production assets:

```text
pwa/assets/personal-space/v2/
```

Do not move or rename legacy assets merely to establish this separation.

## 3. Visual Direction: Premium Illustrated Diorama

### 3.1 Visual Pillars

1. **Readable at phone size.** Major silhouettes, the Project object, player, and Companion remain distinct without zooming.
2. **Illustrated depth.** A fixed three-quarter view, modular transparent props, contact shadows, lighting overlays, and restrained particles create depth without a full 3D scene.
3. **Warm evidence of growth.** Each Project phase visibly changes how the room functions; progress is not communicated by a bar alone.
4. **Grounded aspiration.** Higher stages feel calmer, richer, and more intentional—not gaudy or dominated by gold.
5. **Controlled production cost.** One canonical perspective and a small number of meaningful states replace combinatorial camera and furniture variants.
6. **Stable identity.** Repeated assets preserve silhouette, material, proportion, palette, and light direction across every state and animation.

### 3.2 Include

- fixed 3/4 near-orthographic room view;
- clear silhouettes and moderately simplified forms;
- painterly but controlled material detail;
- modular transparent furniture;
- soft directional lighting and contact-aware shadows;
- small environmental motion and particles;
- a coherent player and Companion identity;
- visible before/after Project states.

### 3.3 Avoid

- photorealistic interiors;
- tiny or noisy pixel art that collapses on mobile;
- exaggerated chibi proportions;
- fisheye or inconsistent perspective;
- baked movable furniture in the room shell;
- baked floor shadows attached to movable props;
- mirrored text, warped geometry, or AI-detail noise;
- gold-heavy “luxury” as the only sign of Mastery;
- multi-camera asset multiplication before the slice is validated.

## 4. Canonical Camera and Canvas Contract

### 4.1 Camera

The V2 room uses one canonical camera:

- fixed three-quarter overhead view;
- near-orthographic projection;
- no user camera rotation in the first slice;
- consistent horizon, floor plane, vanishing behavior, and light direction;
- geometry and camera established from a reusable Blender blockout or equivalent measured guide.

Large furniture is authored for this perspective and placed in legal anchor slots. Small props may move more freely and snap to support surfaces. The legacy `left / center / right` schema may remain in data for compatibility, but the V2 UI and production queue do not require it.

### 4.2 Home Orbit Window

```text
visible ratio: 3:2
logical design size: 960 × 640
baseline production output: 1920 × 1280
```

The scene must not be designed as a 16:9 image and then cropped blindly to 3:2. Compose for 3:2 first.

Recommended logical safe zones:

- scene-critical safe zone: x 10–90%, y 8–88%;
- player and Companion action zone: x 18–82%, y 24–82%;
- Active Project evidence: x 14–86%, y 22–84%;
- keep the outer 8–10% free of unique reward information;
- reserve clear negative space for Project/Main Quest labels without covering faces or interactables.

Player, Companion, current Project phase, and the latest world change must remain visible under safe-area insets and modest responsive cropping.

### 4.3 Full World Adaptation

Full World reuses the same canonical scene and assets. It may reveal more vertical or horizontal room context, but it cannot establish a second perspective. Responsive layouts may use contained scaling, measured crop, or art-directed overscan. They must not stretch the scene or independently reposition every object until perspective breaks.

## 5. Stage Visual Languages

Palette values are starting tokens, not a substitute for lighting and material QA.

| Stage | Core palette | Materials | Emotional target |
|---|---|---|---|
| Survival | gray-blue `#627386`, pale wood `#A78D70`, low-saturation cream `#D7C8AC`, limited warm light `#F1B86B` | inexpensive wood, fabric, painted metal | sparse, restrained, fragile but improvable |
| Building | warm ochre `#D6A24A`, blue-gray `#5F7187`, industrial green `#607967`, muted terracotta `#C98B58` | practical wood, matte metal, cork, paper, glass | active, ordered, capable, visibly under construction |
| Mastery | deep wood `#3E2D27`, ink green `#234B40`, restrained warm gold `#C7A55C`, deep blue `#233B5A` | aged wood, stone, quality textile, patinated metal | mature, calm, historical, free to choose |

Do not communicate stage or unlock state through hue alone. Density, silhouette, material quality, lighting, animation, and room function must reinforce it.

## 6. Building-Stage Vertical Slice

### 6.1 Required Asset Set

- 1 canonical empty-room shell;
- 1 modular window/exterior layer;
- 1 daytime lighting overlay;
- 1 night lighting overlay;
- 8–12 furniture or functional prop assets;
- 1 player character;
- 1 Companion;
- 5–6 player actions;
- 3–4 Companion actions;
- Workspace Upgrade at five visual phases;
- 2 lightweight weather effects;
- 8–10 authored interaction anchors or hit regions.

This is a maximum useful slice, not permission to generate a large surrounding asset pack.

### 6.2 Workspace Upgrade Phases

| Phase | Required visible evidence | Read at home size |
|---:|---|---|
| 0% | Empty, underused work corner with clear future footprint | “There is room to build.” |
| 25% | Basic desk becomes the first functional anchor | “A work place now exists.” |
| 50% | Lamp and storage establish routine and order | “The space supports repeated work.” |
| 75% | Single monitor and planning board make active work visible | “This is becoming a serious workstation.” |
| 100% | Dual-monitor formal workstation with restrained completion accent | “The Project is complete and permanently changed the room.” |

Each phase is a coherent state, not a partially transparent cross-fade between dozens of images. Additions must respect placement, contact shadows, character anchors, and object permanence.

## 7. Environment Layer Contract

Build the scene as separable layers:

```text
room shell
→ exterior / window view
→ far structural props
→ movable large furniture
→ support-surface props
→ player and Companion
→ foreground occluders
→ lighting overlay
→ weather / reward effects
→ UI presentation layer
```

### 7.1 Room Shell

- Contains walls, floor, built-in architecture, and only truly immovable fixtures.
- Contains no player, Companion, movable furniture, reward text, or weather particles.
- Preserves open legal placement zones for every Project phase.
- Uses material detail that survives downscaling without moiré or noisy texture.

### 7.2 Window and Exterior

- Window frame and exterior view should be separable when practical.
- Exterior supports time and weather changes without repainting the entire room.
- Reflections and emissive light must not obscure player or Project silhouettes.

### 7.3 Lighting

- Background establishes the base light direction.
- Day and night overlays share geometry and do not change furniture perspective.
- Movable props use restrained contact shading; runtime shadow or light overlays may unify them.
- Night scenes retain readable faces, interactables, and Project state.
- Reward flashes cannot exceed comfortable intensity or erase the scene.

## 8. Furniture and Prop Contract

Each first-slice furniture asset needs:

- one canonical-perspective transparent image;
- stable pixel dimensions and scale class;
- a placement anchor;
- a footprint;
- a legal placement zone or slot;
- an optional support surface;
- an optional character anchor;
- material, lighting, and registry metadata;
- a human-reviewed alpha edge.

Optional states are limited to proven needs:

```text
off / on
closed / open
normal / upgraded
daytime / emissive
```

Do not assume every large asset needs `front`, `left-wall-flush`, and `right-wall-flush`. Do not use CSS rotation or mirroring to fake a perspective change. If a later feature genuinely introduces a new camera, it requires a separate art-cost decision.

### 8.1 Scale and Placement

- Desks and major work surfaces should read as functional human-scale furniture beside the player.
- Large items use constrained slots to preserve perspective and prevent impossible overlap.
- Small props use free movement only within compatible floor, wall, desktop, or shelf surfaces.
- Support-surface children follow the parent furniture when it moves.
- Footprint warnings may guide the user; they do not justify visually impossible default layouts.

### 8.2 Shadows and Alpha

- No hard floor shadow baked into a movable transparent prop.
- Soft contact darkening may remain inside the object silhouette where physically necessary.
- Alpha edges must be inspected against light, dark, and stage-colored backgrounds.
- Reject magenta/green fringe, white matte halos, clipped antialiasing, and inconsistent softness.

## 9. Player Character Contract

### 9.1 Proportions and Readability

- Approximately 1:4.5 to 1:5 head-to-body ratio.
- Not excessively chibi; hands, pose, and task action remain legible.
- Simplified face and costume detail designed for mobile reduction.
- Character height is approximately 25–32% of the 3:2 scene height.
- Silhouette remains distinct from the Companion and nearby furniture.

### 9.2 First-Slice Actions

```text
idle
work
celebrate
rest
walk
inspect
```

Animation guidance:

- 6–12 FPS;
- 6–16 frames per action;
- two authored facings are sufficient for the slice;
- consistent frame canvas, foot anchor, body scale, and lighting;
- no eight-direction set, combat motion, or complex physics animation;
- idle motion stays subtle enough for continual home display.

The animation contract is independent from furniture. Furniture exposes `characterAnchors`; the runtime chooses animation, facing, and anchor use from world state.

### 9.3 Reward Poses

Small reward reactions should complete within 1.5–3 seconds and return cleanly to idle/work. Celebrate must feel earned but not explosive. Rest must read as healthy recovery, not failure or punishment.

## 10. Companion Contract

The Companion must be immediately distinguishable by silhouette, scale, and motion while belonging to the same visual world.

First-slice actions may include:

```text
observe
approach
congratulate
rest
```

Requirements:

- 3–4 concise animation loops or transitions;
- no facial or body language that implies anger, abandonment, or emotional punishment for missed work;
- reactions support, reflect, or clarify the player's real action;
- dialogue area does not cover the Project object or player face;
- color is not the only distinction between neutral, supportive, and celebratory states;
- relationship progression changes presence and familiarity gradually, not through sudden costume drift.

## 11. Motion, Effects, and Reward Hierarchy

### 11.1 Ambient Motion

- restrained breathing or working loops;
- slow exterior light change;
- limited dust, rain, or window motion;
- no permanent screen shake, aggressive parallax, or high-frequency glitter;
- pause or reduce work when Orbit Window leaves the viewport or the document is hidden.

### 11.2 Reward Motion

| Reward | Visual budget | Art behavior |
|---|---|---|
| Small | 1.5–3 s | One character action, one Companion beat, one object/environment change, concise values |
| Medium | 3–6 s | Stronger lighting/effect accent, clear Project phase swap, temporary window emphasis |
| Major | Purposeful full-screen sequence | Durable unlock reveal, then return to the updated canonical world |

Numeric overlays must reinforce, not replace, the visual change. Effects follow the scene's light direction and palette. Valuable reward amounts are never represented as random loot drops.

### 11.3 Reduced Motion

For `prefers-reduced-motion`:

- replace walking and camera movement with a short cross-fade or direct pose change;
- replace particles and scale bursts with a restrained highlight;
- show a static before/after Project comparison when helpful;
- preserve the text reward summary and next requirement;
- avoid auto-panning or looping parallax.

## 12. Time Band and Weather

The slice supports day/night lighting plus two lightweight weather effects, preferably chosen from rain, clear motes, or distant cloud movement.

- Weather is an atmosphere layer, not a gameplay penalty.
- Time-band transitions reuse the shared Orbit time rules.
- Weather and lighting cannot alter placement geometry or obscure input targets.
- Effects need a static fallback and can be disabled under memory pressure or reduced motion.
- The same state must read consistently in home and full-world presentations.

## 13. UI-on-Art Rules

- Keep player, Companion, Project object, and interaction anchors free of persistent text.
- Use short labels with a solid or gradient readability backing rather than outlining every glyph.
- Maintain WCAG-conscious contrast in day, night, and weather states.
- Project progress uses label, number, and visible phase evidence; never color alone.
- Main Quest and pending-event indicators remain legible at 320 CSS-pixel viewport width.
- Canvas hit areas must have corresponding semantic controls or an accessible interaction list.
- Reward values should be mirrored into a polite live region and remain available after animation.

## 14. Asset Identity, Naming, and Metadata

Suggested IDs are semantic and state-oriented:

```text
building-formal-workstation-room
building-work-desk
building-work-desk-monitor-single
building-work-desk-monitor-dual
player-default-work
companion-default-approach
workspace-upgrade-phase-075
weather-building-rain
```

Every registered production asset should record:

- asset ID and type;
- source path;
- logical dimensions;
- canonical camera/version;
- scale category;
- anchor and footprint where relevant;
- support and character anchors where relevant;
- state or animation key;
- source/reference provenance;
- creator/model/workflow version;
- license and commercial-use status;
- QA status and reviewer note.

Unknown provenance or unclear commercial permission blocks production use.

## 15. Controlled Production Workflow

Preferred workflow:

```text
Approved Art Bible and identity references
→ Blender/measured blockout and canonical camera
→ depth / normal / line-art references where useful
→ controlled generation or illustration
→ inpainting and identity correction
→ alpha cleanup and scale alignment
→ animation continuity review
→ mobile-size visual QA
→ registry metadata
→ runtime integration
```

At minimum, record every model, LoRA, ControlNet, and custom-node dependency with version, source, license, commercial-use terms, hash, and workflow version. Raw generated output stays outside production asset directories until it passes QA.

## 16. Human QA Checklist

### Composition

- Uses the canonical camera and 3:2 home composition.
- Player, Companion, Project object, and recent change fit the safe zone.
- Responsive crop does not remove unique information.

### Perspective and Scale

- Furniture sits on the correct plane with coherent contact.
- Character and furniture scale remain stable across states.
- No CSS rotation, mirroring, or stretching is hiding a perspective mismatch.

### Identity and Materials

- Repeated assets preserve silhouette, palette, material, and light direction.
- Project phases look like the same room evolving.
- Mastery cues remain restrained and mature rather than gold-saturated.

### Technical Quality

- Transparent edges pass light/dark background checks.
- Sprite frames keep stable anchors and do not jitter unintentionally.
- File dimensions, alpha, and registry metadata match the contract.
- Home-size render is readable without zooming.
- Reduced-motion and static fallback presentations remain meaningful.

### Product Meaning

- The visible change communicates what the real action achieved.
- Reward art does not imply gambling, punishment, or emotional coercion.
- The next Project requirement is understandable after the reveal.

An asset failing any required check returns to revision; visual novelty is not a substitute for consistency.

