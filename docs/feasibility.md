# Cardforge Feasibility Checks

**Status:** Started. **Date:** October 1, 2026.

This document tracks evidence needed before implementing the [product requirements](cardforge-prd.md). A documented API or a passing build is not a live Penpot integration test.

## Checkout and baseline

- Source: [PIWEEK Cardforge](https://github.com/PIWEEK/cardforge).
- Starting commit: `9016d76136d526ea74afa0e944cbdaf41589ee35`.
- Development branch: `codex/cardforge-import-print`.
- Locked dependencies installed successfully with `npm ci`.
- Unmodified application passes `npm run build`, including TypeScript compilation.
- Build reports an existing unresolved `images/button-ribbon.svg` reference. Verify its appearance during the first live check.
- No development server was started. Check Tilt before any future server launch, and use a task-specific port if no managed service exists.
- TypeScript language-server tools were unavailable in this session. Compiler checks were performed; language-server checks were not.

## Tooling findings

The installed plugin types are version 1.0.0. They describe library components, plugin metadata, and shape exports, but do not declare `Text.textBounds` or `waitForLayoutUpdate`.

Current official documentation describes both rendered text bounds and waiting for pending layout updates. Select and pin a compatible API-types version, establish the minimum supported Penpot runtime, and verify existing Cardforge behaviour before using these methods. [Text API](https://doc.plugins.penpot.app/interfaces/Text)

The unchanged dependency audit reports six vulnerable packages: one moderate and five high. They are in the development-tool dependency tree: esbuild, nanoid, postcss, rollup, vite, and ws. Review compatible upgrades before starting a live preview; do not apply forced major updates without checking the preview integration. This finding is not a demonstrated vulnerability in generated cards.

## Artwork matching

**Evidence:** Library components expose names, paths, and instances. Cardforge currently stores uploaded artwork in a hidden board and assigns its fills to generated rectangles. Its manifest does not yet request `library:read`. [Library component API](https://doc.plugins.penpot.app/interfaces/LibraryComponent)

**Live test:** Use local assets containing one raster fill, a nested raster fill, duplicate names in different paths, a blank reference, and a deleted asset. Match an asset, insert its artwork into a cloned template frame, and compare its crop with the original frame.

**Pass:** Matching is deterministic; the expected artwork is visible; its placement is preserved; unsupported or ambiguous assets report an error before output replacement. Replacing or renaming an asset cannot silently substitute another asset.

**Status:** API and source review complete. Live placement remains unverified.

## Text fitting

**Evidence:** Current documentation exposes `textBounds`, text growth modes, and a layout-update wait. It does not prove that comparing these bounds detects every clipping case. Fixed-height, auto-height, multiline, mixed styles, and missing fonts need distinct tests.

**Live test:** Populate short and deliberately overflowing rules in cloned text layers. Wait for layout to settle, compare rendered content with the permitted field area, and inspect the result. Include a failed measurement and missing font.

**Pass:** Valid text preserves the design. Overflow identifies the card and field. A timeout or unavailable measurement is unverified and blocks publication. No automatic shrinking occurs.

**Status:** Requires API-types compatibility work and live verification.

## Physical sizing and downloads

**Evidence:** Installed shape-export types support PNG and PDF output. The bitmap export scale is documented, but canvas-to-PDF physical sizing has not been measured. [Board export API](https://doc.plugins.penpot.app/interfaces/Board), [Export settings](https://doc.plugins.penpot.app/interfaces/Export)

**Proposed approach:** Calculate bitmap scale from the template's dimensions and requested 300-pixel-per-inch output. Compare native PDF dimensions with the required physical sizes. If necessary, assemble exported imagery into explicitly sized PDF pages; retain editable Penpot boards. Select the exporter only after checking output quality, fonts, performance, and licensing.

**Live test:** Export one card and six- and nine-front sheets. Read the actual PNG dimensions and PDF page/card dimensions. Verify the PRD's 0.2 mm tolerance, white backgrounds, crop marks, page order, and ZIP filename collisions.

**Pass:** Files meet the size and ordering requirements, and failures do not produce partial downloads. Retry works from unchanged valid boards.

**Status:** API review and independent layout arithmetic complete. Actual exports remain unverified.

## Layout arithmetic

The PRD's 63.5 × 88.9 mm preset, 2 mm spacing, and 5 mm margins require these occupied grid sizes without crop marks:

| Layout | Grid width | Grid height | Portrait A4 | Portrait US Letter |
| --- | --- | --- | --- | --- |
| Six fronts | 129.0 mm | 270.7 mm | Fits | Does not fit |
| Nine fronts | 194.5 mm | 270.7 mm | Fits | Does not fit |

US Letter has 269.4 mm of height available with these margins. Margins of at most 4.35 mm at the top and bottom would fit the grids geometrically; printer constraints still matter. Explain this fit failure rather than shrink cards. Crop marks require a fresh fit calculation.

Upstream's poker preset is labeled 63.5 × 88 mm and uses a 750 × 1039 canvas. The PRD proposes a different new-deck height of 88.9 mm. Migration must preserve existing designs and ask for their physical dimensions; do not map all legacy poker templates to the new preset automatically.

A 52-record deck with quantity 1 requires nine six-front pages or six nine-front pages. These counts were checked independently and do not prove a working generator.

## Ownership and recovery

**Evidence:** Plugin metadata can identify decks and output. Upstream generation currently removes a board found by the name Output before generating its replacement; this must change before new generation modes are exposed.

**Live test:** Rename owned output, add an unrelated Output board, duplicate the deck, reopen the plugin, and interrupt replacement before publication and during cleanup. Include changed inputs during a run.

**Pass:** Only explicitly owned objects are replaced. At least one completed set remains recoverable after interruption. A copied deck cannot delete its source's output. Input changes stop publication and preserve the previous set.

**Status:** Design documented. Metadata copying and interrupted commits remain unverified in Penpot.

## Capacity and release decision

Measure the PRD's proposed record, copy, page, raster-size, and download limits after the live export and text tests work. Record the tested browser, Penpot version, card sizes, elapsed time, memory behaviour, and cancellation response. Do not label proposed limits as measured support.

Resolve the tooling findings first, then run artwork, text, export, and recovery probes. Only mark a gate passed when its output or runtime behaviour has been observed. Failed gates require a documented design change before full feature implementation.
