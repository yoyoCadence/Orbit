# PS-242 production art pipeline

This directory is the reproducible source and review trail for the Personal Space V2 Building Formal Workstation production pack. Runtime files live under `pwa/assets/personal-space/v2/`; raw generation output never does.

## Accepted outputs

- Authored 3:2 empty-room background, encoded as a 1536×1024 WebP.
- Twelve protagonist poses: six states (`idle`, `work`, `celebrate`, `rest`, `walk`, `inspect`) with left/right facings.
- Six Companion poses matching every emitted state (`observe`, `approach`, `congratulate`, `rest`, `work`, `remind`). `idle` intentionally resolves to `observe`.
- Two 960×640 weather overlays: clear motes and rain.
- Eight previously reviewed legacy props, reused without moving or rewriting their source files.

Exact prompts are in `prompts/`. Raw magenta sheets are in `raw/`; accepted processing bundles and metadata are in `processed/` and `metadata/`. `model-manifest.json` records generator, ownership, processing, and legacy reuse.

## Review decisions

- The first protagonist chroma pass was rejected because a purple fringe remained on dark backgrounds. The accepted `protagonist-final` pass uses border-sampled soft matte and despill before shared-scale frame extraction.
- The first Companion `work` expression could read as anger. A targeted correction changed only that expression to calm focus; the corrected sheet was then reprocessed from the raw source.
- All accepted character frames have transparent corners, stable scale, no cell-edge touches, and clean light/dark previews.
- Weather overlays have zero visible magenta-like pixels and keep the central actor zone sparse.
- Background composition, fixed camera identity, safe zone, and WebP quality were reviewed at full size and card size.

## Reproduce and verify

```bash
npm run ps242:manifest
npm run ps242:manifest -- --check
npm run ps243:assets
npm run ps243:assets -- --check
```

The production manifest is derived from the runtime JS contract and records dimensions, byte sizes, SHA-256 hashes, source, QC, camera, state/facing, phase, and license reference for every file.
