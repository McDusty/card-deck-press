# Cardforge Improvements Product Requirements Draft

**Status:** Draft for review, revised after adversarial review. **Date:** October 1, 2026.

🔑 Extend Cardforge so a card creator can design in Penpot, manage content in a spreadsheet, and regenerate a deck without rebuilding cards by hand.

The first release combines CSV import, artwork matching, card quantities, and front-only output. Google Sheets connections and AI automation follow later.

## Problem and audience

The primary user makes playing card decks and prototypes. They prefer Penpot’s visual design tools, but need a faster way to manage many cards and print only their faces.

The reviewed Cardforge implementation supports template fields and card generation. Its print-and-play mode joins fronts and backs into fold-over pairs. CSV import and explicit front-only page layouts are missing. [Cardforge source](https://github.com/PIWEEK/cardforge/blob/main/src/plugin.ts)

Cider offers useful examples of spreadsheet data, quantities, template choices, and export controls. These workflows inform the proposal. [Cider card data](https://oatear.github.io/cider-docs/docs/data/card-data/), [Cider export implementation](https://github.com/oatear/cider/blob/main/cider-app/src/app/export-cards/export-cards.component.ts)

## Goals and release boundaries

**First release goals**

- Keep card design and generated cards editable in Penpot.
- Import and reimport a deck from CSV.
- Match spreadsheet artwork values to named Penpot assets.
- Print quantities without manually duplicating card records.
- Generate individual fronts, six fronts per page, or nine fronts per page.
- Keep the existing Cardforge workflows available.
- Include explicit Download PNG ZIP and Download PDF actions for the new front-only modes.

**Later features**

Direct Google Sheets import, selected-card printing, multiple templates per deck, backs-only output, separate front/back sheets, low-ink templates, and deck statistics.

**Outside the first release**

A new card-design application, a Cider fork, a game simulator, AI artwork generation, automatic background synchronization, and unattended printing.

## Main user workflow

1. Create or select a Cardforge deck in Penpot.
2. Design the front template and name its variable layers, such as `#name` and `#rules`.
3. Add artwork to Penpot and give assets recognizable names.
4. Import a CSV and review its column mapping, card counts, and artwork matches.
5. Apply the valid import.
6. Choose an output layout and generate the deck.
7. Export individual images or printable sheets.
8. Edit the spreadsheet or template, then reimport and regenerate.

Google Sheets users initially download a sheet as CSV. No external artwork hosting is required.

## CSV import and deck updates

**Import requirements**

- Accept UTF-8 CSV, including quoted commas, quoted line breaks, and common byte-order marks.
- Match column names to template fields automatically where unambiguous: `name` can map to `#name`.
- Allow users to change mappings and save them with the deck.
- Show a small row preview, total unique cards, total printed copies, and validation errors.
- Do not alter the saved deck until the user applies a valid import.
- Identify errors by row, column, and plain-language explanation.
- Preserve identifiers and text such as `001`; do not silently convert all cells to numbers.

**Proposed data rules**

- `card_id` is a required, unique, stable identifier in imported files.
- `quantity` defaults to 1 when the column is absent. Values must be whole numbers of 0 or more.
- A blank value in a present `quantity` column is an error. Do not treat it as zero or silently default it.
- Quantity 0 excludes a card from generated output while retaining its record.
- Blank mapped cells intentionally clear the corresponding value.
- Unmapped template fields retain their template defaults.
- Extra columns can be explicitly ignored. Duplicate headers, duplicate IDs, malformed rows, and invalid quantities block import.

**Update behavior**

Reimport replaces the deck dataset after showing added, changed, and removed IDs. It does not merge individual rows in the first release.

Generation rebuilds the complete output from the current data and template. Editing a generated card does not change its source record; the interface explains that regeneration replaces generated edits.

Before applying an import, retain one recoverable snapshot of the current dataset, column mappings, and output settings. Provide CSV export for backup and spreadsheet editing.

Show **Output is out of date** whenever imported data, the template, matched artwork, or output settings differ from the last successful generation. Do not label old output as current when a newer import succeeds but generation fails.

**Restore previous import** restores the saved dataset, mappings, and settings together. It does not undo Penpot template edits, restore library artwork, or regenerate output. Revalidate after restoration and keep the out-of-date indicator until the restored inputs match the last successful generation or regeneration succeeds.

## Template validation and text fitting

- Save mappings to field identifiers and verify their names and types against the current template before each generation.
- A renamed or removed mapped field requires explicit remapping or ignoring its CSV column. Do not silently replace it with a template default.
- Repeated field names are allowed when every occurrence has the same supported type; populate every occurrence. A name used for both text and artwork is an error.
- Unsupported mapped layers block generation and identify the layer to fix.
- Preserve the template's text size and styling by default. Do not automatically shrink text or resize cards to fit content.
- Check populated text for clipping and overflow before publishing replacement output. Report the card ID and affected field, with a preview where practical.
- Block publication and downloads while overflow is unresolved. The user can edit the content or template, or explicitly allow clipping for the affected cards in that generation.
- Recheck any clipping exception if the affected card content or template changes. Automatic text shrinking is later scope.

The feasibility milestone must prove overflow detection for supported text layers, including multiline content and rendered font metrics. A failed or unavailable text measurement blocks publication and downloads and must be reported as unverified; it must not count as a successful fit check.

## Artwork matching

The first release targets raster artwork in the current file’s local Penpot library. The implementation must prove this workflow before committing to broader component support.

- Map an artwork column to an image field in the template.
- Resolve artwork by the displayed asset name or full asset path, such as `Artwork/fire-drake`.
- Show matched, missing, and ambiguous assets in the import preview.
- Never choose arbitrarily between duplicate names.
- Block generation when a nonblank artwork reference cannot be resolved.
- Allow blank artwork values and render the field empty.
- Preserve the artwork frame’s intended crop and placement.
- Use current artwork contents when regenerating.
- Retain a resolved asset identifier after a match. A renamed asset requires updating the displayed mapping; a deleted asset requires rematching. Do not silently switch to a different asset that happens to reuse its name.
- Revalidate references before generation, because assets may have changed since import.

The match key is the Penpot asset name or path; it is not guaranteed to be the original upload filename.

Penpot’s plugin API exposes library component names, paths, and instances. Reliable raster extraction and placement remain a feasibility test. [Penpot LibraryComponent API](https://doc.plugins.penpot.app/interfaces/LibraryComponent)

Connected shared libraries and complex vector components are later scope.

## Output and printing

| Output choice | Required behavior |
| --- | --- |
| Individual fronts | One editable card board per included design; export front PNG files in a ZIP |
| Six fronts per page | Two columns and three rows; fronts only |
| Nine fronts per page | Three columns and three rows; fronts only |
| Existing fold-over mode | Preserve the current joined front/back workflow |

**Output defaults**

- Individual image export includes each unique design once. Quantities apply to print sheets.
- Front-only modes work without a back template.
- Print sheets support A4 and US Letter.
- Card order follows CSV row order; copies appear consecutively.
- The final sheet keeps the same grid and leaves unused positions empty.
- Settings include page margins, card spacing, and optional crop marks.
- Save the selected settings with the deck and show the expected page count.
- Produce editable Penpot sheet boards and downloadable print PDFs.
- A4 is 210 × 297 mm. US Letter is 215.9 × 279.4 mm. The new six- and nine-front grids use portrait orientation.
- Start with 5 mm page margins, 2 mm spacing between cards, and crop marks off. Settings remain editable; fitting is checked before generation.

**Physical size requirements**

Store explicit card width and height in millimetres with each deck. These values are the source of truth for print dimensions; canvas pixel dimensions alone do not define physical size. Show the dimensions before generation and include them in saved output settings.

For a new deck, offer a poker preset of 63.5 × 88.9 mm and a custom size. Existing decks require the user to select or confirm physical dimensions during migration; do not reinterpret an old template silently.

Map the complete front template to the selected physical card size with uniform scaling. Require its aspect ratio to match the selected card dimensions within 0.1 percent; otherwise block generation and explain how to correct the size. No automatic stretching or cropping of the full template is allowed.

Resizing a template does not automatically change its saved physical dimensions. Recheck its aspect ratio and mappings. Changing physical dimensions is an explicit settings change that marks output out of date.

Validate exported PDFs against the selected physical sizes. Paper and card dimensions must be within 0.2 mm of their requested values in the PDF; this tolerance covers generated files, not a printer's mechanical accuracy. Tell the user to print at 100 percent or Actual Size.

If a requested grid cannot fit the card size, margins, spacing, and crop marks, explain what needs to change. Never silently shrink cards.

Crop marks indicate cutting positions. They do not create artwork bleed beyond the cut edge; production bleed support is later scope.

When enabled, each crop mark starts 1 mm outside the cut edge and runs a further 2 mm, occupying 3 mm outside that edge. Include their occupied area in the fit calculation; marks must not enter neighboring card artwork or extend beyond the configured printable area.

## Download behaviour

Dedicated downloads are part of the first release, alongside editable Penpot boards. Penpot's manual export remains available, but does not replace the download acceptance criteria.

- Individual fronts download as one ZIP containing one PNG per included unique card ID, in CSV order.
- Render PNGs at 300 pixels per inch, calculated from saved millimetre dimensions and rounded to whole pixels. Do not claim a file's resolution metadata controls physical print size.
- PNGs contain the card front only, without sheet margins or crop marks. Fill transparent areas with white for the first release.
- Print sheets download as one PDF with one correctly sized page per generated sheet, in order. The PDF contains no extra summary or back pages.
- Derive filenames from the deck name, card ID, and a short card name where available. Remove unsafe filename characters and use a deterministic collision suffix so no files overwrite each other.
- Example names are `my-deck-fronts.zip`, `my-deck-fronts-9.pdf`, and `001-fire-drake-front.png`.
- Validate export availability and required fonts before starting. Do not silently substitute missing fonts or produce incomplete cards.
- Download the completed ZIP or PDF only after every required image or page succeeds. A rendering or export error identifies the affected card or page and produces no partial download.
- Show export progress and allow cancellation. Export failure leaves successfully generated boards intact and offers retry.
- Downloads use a validated snapshot of the generation inputs. If inputs change, require regeneration before downloading the current deck; retain the old boards with an out-of-date label.

## Reliability and compatibility

- Validate the dataset, templates, artwork, and page fit before creating output.
- Build replacement output in a temporary area.
- Replace the previous output only after generation completes successfully.
- On failure or cancellation, remove temporary output and retain the last good deck output.
- Show progress and a useful completion or error message.
- Preserve existing decks and manually entered card data.
- Migrate saved data without overwriting unrelated Penpot objects.
- Keep import and layout rules reusable so later AI commands can call the same functions as the interface.

**Output ownership and interrupted runs**

- Give each deck a persistent unique deck ID. Mark each output set and temporary generation with that deck ID and a generation ID in plugin metadata.
- Locate templates and output using saved object identifiers and ownership metadata. Never identify objects to delete solely by display names such as Front, Back, or Output.
- Renaming generated boards does not remove their ownership. Unrelated boards with the same names must never be changed or deleted.
- A copied deck is treated as a new deck with a new ID and independently owned output. Detect copied identity metadata and require explicit adoption before replacing any output.
- For legacy decks without ownership metadata, let the user identify the template and output once. Preview the proposed objects before marking them as owned; never delete an unclaimed board automatically.
- Freeze and record the data, mappings, settings, template state, and matched artwork state used for a generation. Recheck those inputs before committing replacement output; changes during the run abort publication and keep the previous output.
- Mark the completed replacement as current before removing the old output. On restart, resolve interrupted cleanup from recorded ownership and completion markers without deleting the only completed output set.
- Restore the plugin's own temporary state on cancellation or error. On reopening, clean up abandoned temporary output belonging to this deck and retain the last completed set.

The feasibility milestone must prove ownership survives reopening, copying, and renaming, and establish a safe recovery procedure for interruption during output replacement.

## Capacity and empty decks

Proposed first-release safety caps are 500 unique records, 100 copies of one card, 1,000 total included copies, and 200 generated print pages. Apply the relevant limits before generation; exceeding any one limit blocks that operation and explains the limit. Existing oversized data remains readable and exportable as CSV.

Custom dimensions must be finite and greater than zero. Proposed export caps are 16 megapixels per card image and 256 MiB per completed download. Reject an oversized render before allocating it; stop an export that exceeds the download limit without publishing a partial file. These caps also require feasibility validation.

Validate these caps with the supported card sizes in the feasibility milestone. Reduce and publish the supported limits if measurements show they are unsafe; do not ship untested limits. Process generation and export in bounded batches and release temporary render buffers between batches.

An empty dataset or a deck with all quantities set to zero has no printable output. Disable generation and downloads, explain why, and retain existing output with an out-of-date label. Do not create an empty ZIP or PDF, or erase old output.

Cancellation is cooperative between card or page operations. Keep the interface responsive and stop scheduling new work within two seconds of a cancellation request. Any operation already running may finish, but must not publish or download its result after cancellation. Validate this behaviour at the supported capacity limits.

A feasibility test must establish supported Penpot versions, required library permissions, and export behavior. The first release targets home printing and prototyping; commercial print production is not a release claim.

## Acceptance criteria

Use the 63.5 × 88.9 mm poker preset, portrait A4, 5 mm margins, 2 mm spacing, and crop marks off for the page-count checks below. US Letter and layouts with crop marks have separate fit tests and must not be assumed to fit these defaults.

- A 52-record deck with unique IDs and quantity 1 for every record produces 52 unique front images.
- At six fronts per page, the same deck produces nine pages: eight full pages and four cards on the last page.
- At nine fronts per page, it produces six pages: five full pages and seven cards on the last page.
- A record with quantity 3 appears three times on print sheets and once in unique-image export.
- A quantity-0 record generates no cards.
- Front-only generation succeeds without a back template and creates no back shapes.
- Reimporting a changed card updates its content without accumulating duplicate output.
- A missing artwork match identifies the affected card and prevents replacement of the previous output.
- A generation failure leaves the previous output usable.
- Exported PDF paper and card dimensions meet the 0.2 mm tolerance. A test covers both A4 and US Letter and verifies that an impossible nine-front layout is rejected without shrinking.
- PNG pixel dimensions match the saved physical card size at 300 pixels per inch, rounded to whole pixels. ZIP filenames remain unique for duplicate names and unsafe filename characters.
- Renaming a mapped layer requires remapping; conflicting field types and unsupported mapped layers block generation. Repeated fields of the same supported type all receive the value.
- A card with overflowing rules blocks publication until corrected or explicitly allowed. A failed text measurement is reported as unverified and cannot pass silently.
- Unrelated boards named Output survive regeneration. Renamed owned output can be replaced, and an adopted copied deck never replaces its source deck's output.
- Interruption before publication or during old-output cleanup leaves at least one completed output set recoverable on reopening.
- A successful import followed by failed generation displays Output is out of date. Restoring the previous import restores data, mappings, and settings without claiming to restore templates or artwork.
- An empty deck, an all-zero deck, and an over-limit quantity produce clear messages and do not remove existing output.
- Invalid custom dimensions, oversized raster images, and over-limit downloads are rejected without allocating oversized render buffers or producing partial files.
- Cancellation stops new work within the stated responsiveness target and produces no partial download. An export failure allows retry without regenerating unchanged valid boards.
- At the published capacity limits, the sample workflow completes without an unresponsive interface or exhausted render memory.
- Existing standard, tabletop, and fold-over workflows continue to work.

Use a sample deck containing multiline rules, commas, Unicode text, artwork, multiple quantities, and an incomplete final sheet. Include deliberately invalid files to verify import errors.

## Delivery milestones

| Milestone | Deliverable |
| --- | --- |
| Feasibility | Prove artwork matching, text measurement, physical scale, PNG/PDF downloads, ownership recovery, and capacity limits |
| Printing | Individual fronts, six-front sheets, nine-front sheets, dedicated downloads, and safe output replacement |
| Data | CSV import/export, saved mappings, quantities, validation, and reimport |
| Release check | Verify the complete sample-deck workflow and existing-deck compatibility |
| Follow-up | Selected-card printing, multiple templates, direct Sheets access, and AI tools |

The first release is complete when both printing and data milestones pass the acceptance criteria.

Feasibility is a release gate. If correct PDF scale, artwork placement, text measurement, or safe ownership cannot be demonstrated, revise the affected requirement and document the limitation before continuing. Do not silently replace a required download with manual export or describe an unsupported feature as complete.

## Future AI and Google Sheets integration

MCP, the Model Context Protocol, lets an AI assistant call application tools. Penpot already provides an MCP connection for design access, but it does not automatically operate Cardforge. [Penpot MCP documentation](https://help.penpot.app/mcp/)

Later deck tools could validate data, import changes, report artwork problems, and generate a chosen layout. AI should call the tested deck functions rather than place hundreds of cards independently.

Direct Google Sheets import should reuse the CSV validation and mapping workflow. Private-sheet access and authentication need a separate design; automatic synchronization is not assumed.

## Assumptions and unresolved choices

- Start with one front template and local raster artwork per deck.
- Use stable CSV IDs and full dataset replacement for the first release.
- Export unique designs as individual PNGs and respect quantities on print sheets.
- Include PNG ZIP and PDF downloads in the first release; prove their availability and physical sizing in the feasibility milestone.
- Confirm whether every local raster asset can be placed reliably while preserving crop behavior.
- Validate the proposed capacity caps and publish measured supported limits before implementation scope is finalized.
- Final product naming, hosting, and supported Penpot versions remain open.

Cider is licensed under AGPL-3.0 and Cardforge under MIT. The proposed implementation recreates the workflows rather than copying Cider source. [Cider license](https://github.com/oatear/cider/blob/main/LICENSE.md), [Cardforge repository](https://github.com/PIWEEK/cardforge)

**Release focus:** design in Penpot, manage data in CSV, and generate reliable front-only card output.
