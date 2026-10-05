# Card Deck Press Feasibility Checks

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

## Local front-only test build

After the baseline checks, the local preview was started and handed over to Tilt. Parent and repository Tiltfiles produce identical resources. Tilt installs dependencies, builds, serves port 4400, and checks the manifest for readiness. The user successfully installed and ran the existing plugin flow in deployed Penpot.

The interface now includes individual fronts, six/nine-front sheets, a single shared back, and six/nine-back sheets. Each face owns and replaces its own generated output, independently. Back generation does not require Front. Letter is the default paper and sheets default to continuous cut lines. Six-up and nine-up sheets now use zero gaps and 5 mm margins, so adjacent cards have one shared trim edge and one cut line. Boundary indices prevent duplicated lines for fractional template coordinates. New poker templates match the user’s 750 × 1050 PNG reference (63.5 × 88.9 mm at its embedded 300-ppi resolution); older poker templates have an explicit **Correct poker size** action. It fixes 750 × 1039 templates and the original inset border, preserves custom artwork geometry, leaves existing output until regeneration, and groups the correction into one undo step. Custom card sizes are excluded.

The user verified the Letter PNG size in Affinity. Their PNG is 2550 × 3300, matching the Affinity Letter reference. The Penpot PNG lacks resolution metadata, while the Affinity example includes it. Dedicated sheet PDFs now embed PNGs on exact physical pages. Automated checks cover A4/Letter page dimensions, no print scaling, complete exports, stale settings/templates, generation rollback, page identity, straight lines, independent outputs, and full-size poker fit. A PDF assembled from the user’s actual export measured 612 × 792 points and was rendered for visual inspection. These checks do not prove browser download permission or end-to-end Penpot PDF rendering; those remain live checks.

This remains an incremental local test build, not a completed printing milestone or passed release gate. ZIP downloads, physical template migration, text overflow checks, cancellation, measured capacity, and full interruption recovery remain pending. Existing fronts-and-backs generators retain legacy replacement behavior.

Automated controller tests cover 52-card six/nine-front page counts, partial sheets, order and template preservation, generation without Back, renamed ownership, unrelated output protection, copied page identity, clone failure cleanup, missing artwork, invalid/empty data, fit rejection, saved settings, and existing output modes. They use a fake Penpot API; actual Penpot runtime behavior remains to be checked.

Browser checks exercise the visible output controls, front-only descriptions, page counts, paper selection, and empty-deck error. The unresolved ribbon image reference was corrected, and the local server returns the UI assets and controller successfully with cross-origin headers. The controller is now emitted as a standalone script to avoid shared-module imports that Penpot cannot evaluate.

The current build passes 88 automated checks. Browser verification confirms three imported records produce four copies on one Letter nine-up sheet, preserve ID `001` and multiline Unicode text, and switch a 750 × 1050 custom size through inches and millimeters without changing it. A manual Healing row with Quantity 10 generates two nine-up sheets. Tilt was used for the latest previews and has now been stopped at the user's request, along with the Cardforge preview server.

Help is now one continuous document with ten linked sections, a sticky table of contents on wide views, and a preset table generated from the card-creation data. Browser checks confirm sections stay visible, every contents target exists, and the CSV link scrolls to its section. Previous/Next paging was removed. The guide describes current features and explicitly identifies direct Sheets connections, shared-library artwork, text fitting, and PNG ZIP downloads as unavailable.

The workflow now has Create Deck, Edit Deck, Export, and Help tabs. Output settings and PDF downloads live in Export. Switching tabs preserves settings and ready PDFs; card edits invalidate PDF readiness. Edit Deck keeps Import CSV on the left and Add Card on the right, with matching actions in an empty card table. Every row exposes Quantity, including older manual cards that default to one copy. Help explains quantity expansion and image placeholders named after spreadsheet columns, such as `art` → `#art`.

## Tooling findings

**Dependency maintenance complete:** Penpot plugin types are pinned to 1.4.2, TypeScript to 5.9.3, Vite to 7.3.6, and vite-live-preview to 0.4.0. The updated compiler and production build pass. Existing plugin styles remain at 1.0.0.

The preview package now uses a Vite plugin rather than a standalone command. Configuration registers the plugin, and `npm run dev` invokes `vite build --watch`. Configuration loading and CLI resolution pass without opening a server. ES2020 remains the explicit JavaScript build target. [Preview package documentation](https://github.com/Shakeskeyboarde/vite-live-preview)

Build tooling requires Node `^20.19.0 || >=22.12.0`; these checks used Node 25.9.0. This is the build-tool requirement, not the minimum supported Penpot version.

The baseline dependency audit reported six vulnerable packages: one moderate and five high, in the development-tool dependency tree. After the upgrades, installation audits report zero known vulnerabilities. This is an audit result for the resolved dependency tree, not a guarantee that the plugin is free of security defects.

**Text API gap remains:** Published plugin types 1.4.2 still do not declare `Text.textBounds` or `waitForLayoutUpdate`, although current online documentation describes both. Confirm actual runtime availability and establish the minimum supported Penpot version during the text probe. Do not claim the dependency update alone enables those methods or cast away a missing runtime capability. [Text API](https://doc.plugins.penpot.app/interfaces/Text)

## CSV import and artwork

**Implemented in the local test build:** UTF-8 CSV parsing, stable string IDs, quantities, column mapping, five-row preview, added/changed/removed counts, full replacement, one restore snapshot, CSV export, and a stale-output indicator. Imported fields and image references are revalidated before generation. Changed preview inputs invalidate Apply. Ignored columns are not retained.

New decks create visible Artwork boards. Batch uploads name raster rectangles after filenames. Exact names/full paths resolve deterministically; duplicate or missing names block import. Legacy `_Images` references remain readable. Current image fills are used at generation, and template fill settings and geometry are preserved. Shared libraries and vector components remain later scope.

**Automated evidence:** Parser edge cases, invalid IDs/quantities, mapping changes, apply/restore rollback, artwork ambiguity/deletion/replacement, quantity expansion, original dataset PDF signatures, and legacy storage compatibility. Browser checks use a clearly labelled simulated Penpot host with the actual built controller/UI. They exercise file selection, preview, Apply, multiline editing, and quantity counts. These checks do not prove real Penpot upload, typography, crop rendering, or live download behavior.

**Caps:** 2 MiB CSV, 100 columns, 500 records, 100 copies per card, 1,000 copies total; artwork batches up to 100 files / 32 MiB. These are protective limits and have not been capacity-benchmarked.

**Next live check:** Import a scratch deck in deployed Penpot. Check duplicate paths, a blank image, renamed/deleted assets, multiline rules, sheet quantities, export/reimport, and restoration. Compare actual image crop and placement with the template.

## Card size audit

The [card-size reference](card-size-audit.md) now uses the rectangular formats from MakePlayingCards, with the 2.45 × 3.95-inch format renamed Medium at the user’s request. Source physical dimensions produce template dimensions directly. New-template tests verify Tarot 825 × 1425 px; all presets round-trip through their declared units. Exact 70 × 120 mm Tarot is available through Custom size. Existing templates remain unchanged. Circle/hexagon borders and cutting paths are later scope.

## Card creation controls

The Create Deck / Edit Deck / Export / Help tabs replace the old Cards workflow. The creation illustrations were removed. Presets and custom sizes can display pixels, inches, or millimeters at the existing 300-ppi convention. Unit switching preserves dimensions. Custom dimensions are checked before page mutation; orientation normalizes the long/short sides. The sheet fit guard applies to custom sizes without shrinking them. Pure conversion and controller tests cover these behaviors; live Penpot custom-template rendering remains to be checked.

## Text fitting

**Evidence:** Current documentation exposes `textBounds`, text growth modes, and a layout-update wait. It does not prove that comparing these bounds detects every clipping case. Fixed-height, auto-height, multiline, mixed styles, and missing fonts need distinct tests.

**Live test:** Populate short and deliberately overflowing rules in cloned text layers. Wait for layout to settle, compare rendered content with the permitted field area, and inspect the result. Include a failed measurement and missing font.

**Pass:** Valid text preserves the design. Overflow identifies the card and field. A timeout or unavailable measurement is unverified and blocks publication. No automatic shrinking occurs.

**Status:** Published types updated. Measurement-helper declarations and runtime compatibility still require verification.

## Physical sizing and downloads

**Evidence:** Installed shape-export types support PNG and PDF output. The bitmap export scale is documented, but canvas-to-PDF physical sizing has not been measured. [Board export API](https://doc.plugins.penpot.app/interfaces/Board), [Export settings](https://doc.plugins.penpot.app/interfaces/Export)

**Proposed approach:** Calculate bitmap scale from the template's dimensions and requested 300-pixel-per-inch output. Compare native PDF dimensions with the required physical sizes. If necessary, assemble exported imagery into explicitly sized PDF pages; retain editable Penpot boards. Select the exporter only after checking output quality, fonts, performance, and licensing.

**Live test:** Export one card and six- and nine-front sheets. Read the actual PNG dimensions and PDF page/card dimensions. Verify the PRD's 0.2 mm tolerance, white backgrounds, crop marks, page order, and ZIP filename collisions.

**Pass:** Files meet the size and ordering requirements, and failures do not produce partial downloads. Retry works from unchanged valid boards.

**Status:** API review and independent layout arithmetic complete. Actual exports remain unverified.

## Layout arithmetic

The initial 2 mm gap / 5 mm margin proposal produced these occupied grid sizes. This historical comparison explains why current six-up and nine-up sheets now share trim edges with zero gaps:

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

Dependency maintenance is complete. Run artwork, text, export, and recovery probes next, resolving the text API gap before claiming overflow detection. Only mark a gate passed when its output or runtime behaviour has been observed. Failed gates require a documented design change before full feature implementation.
