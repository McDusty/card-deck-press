# Card Forge Updated

**Card Forge Updated** is a fork of [Cardforge](https://github.com/PIWEEK/cardforge) for [Penpot](https://penpot.app/). It adds spreadsheet-driven decks, reusable artwork, corrected card sizes, and more printing options while keeping Penpot as the design editor.

Design a Front and shared Back template, add card details manually or from CSV, then generate individual cards or printable sheets. The plugin still appears as **Cardforge** in Penpot.

## What changed from the original

| Area | Changes in this fork |
| --- | --- |
| Deck data | CSV import with column mapping, validation, preview, and repeat imports using stable card IDs. Google Sheets works through downloaded CSV files. |
| Card quantities | A Quantity field lets one Healing row produce ten printed copies. CSV imports recognize the `quantity` header. |
| Artwork | A visible Artwork frame stores reusable images. Batch uploads preserve filenames, which CSV image fields match by name or path. |
| Card sizes | Corrected Poker and Tarot dimensions, 11 rectangular presets, custom sizes, and a Pixels / Inches / Millimeters selector. |
| Output layouts | Fronts only or backs only, as individual cards or six-up and nine-up sheets. Original Standard, fold-over Print and Play, and Tabletop layouts remain available. |
| Printing | US Letter by default for the new sheet layouts, optional A4, cards placed edge to edge, single shared cut lines, and physically sized PDF downloads. |
| Interface | Create Deck, Edit Deck, Export, and Help tabs. Common actions stay at the top. Simpler buttons, fewer decorative images, and clearer empty states. |
| Help | One scrollable guide with a table of contents, including CSV headers, quantities, image template setup, and printing. |
| Data protection | Generation replaces only the output owned by that layout. Failed replacements preserve completed output; stale uploads and downloads are rejected after context changes. |
| Development | Tilt setup, locked dependencies, compiler checks, and automated import, generation, and export tests. |

## Getting started

1. On an empty Penpot page, open **Create Deck**. Choose a name, card size, and orientation. Creation adds **Front**, **Back**, and **Artwork** frames, then closes the plugin.
2. Design your templates in Penpot. Keep the Front and Back frame names and dimensions. Name variable layers after your data columns, with a `#` prefix: `name` → `#name`.
3. Reopen the plugin and use **Edit Deck** to add cards manually or import a CSV. Set quantities for designs you want to print more than once.
4. Open **Export**, select a layout, and click **Generate Cards**. Six-up and nine-up sheets offer **Download PDF**. Export individual boards through Penpot.

The **Back** is a shared design and does not support variable fields. The in-plugin **Help** tab contains the full workflow.

## CSV imports and deck updates

Use a unique, stable `card_id` for every row. The optional `quantity` column defaults to 1.

```csv
card_id,quantity,name,art
healing,10,Healing,healing.png
shield,4,Shield,shield.png
```

This example expects a text layer named `#name` and an image placeholder named `#art` in Front. Print sheets contain ten Healing cards followed by four Shield cards.

- **Import CSV:** map columns to Card ID, Quantity, template fields, or Ignore. Matching headers map automatically. Review the preview and added, changed, and removed records before applying.
- **Updates:** each import replaces the complete card list. Keep IDs stable between imports, then generate cards again to update output. Existing output remains until a replacement succeeds.
- **Quantity:** use whole numbers from 0 to 100. Zero excludes the card. Print sheets repeat copies; single-front, Standard, and Tabletop layouts include each nonzero design once.
- **Export CSV:** download a lossless backup for editing and reimporting. Ignored source columns are not retained.
- **Export for spreadsheets:** download a separate viewing copy that protects formula-like text with leading tabs. Use the raw CSV for lossless reimports; spreadsheet handling can vary.
- **Restore previous import:** restore one saved card-list, mapping, and output-settings snapshot. This does not restore artwork or template edits, or regenerate output.

Quoted commas, escaped quotes, Unicode, and multiline text are supported. Limits are **2 MiB per CSV, 100 columns, 500 records, and 1,000 printed copies**.

For **Google Sheets**, download the sheet as CSV and import that file. Live Google Sheets connections and automatic synchronization are not implemented.

## Set up a template image

1. Inside **Front**, draw a rectangle where the variable image should appear.
2. Give it **one image fill** using a sample image. Set its size and crop in Penpot.
3. Name it after the CSV column containing image filenames, with `#` at the start. An `art` column uses `#art`; an `illustration` column uses `#illustration`. Each variable layer needs a unique name.
4. Put source images in **Artwork**. In the import view, **Add artwork images** uploads a batch and names each image rectangle after its filename. You can also place and name image rectangles yourself.
5. Enter the exact image name, including its extension, in the CSV cell: for example, `healing.png`. Apply the import, then generate cards in Export.

Use a path such as `Artwork/creatures/dragon.png` to distinguish duplicate names. Missing or ambiguous matches block the import. A blank mapped image cell clears that field; an unmapped field keeps its template content.

Batch uploads support **100 images totaling 32 MiB**. Replace the fill on an existing Artwork rectangle and regenerate to use the updated image. Legacy `_Images` storage remains compatible and becomes visible when reused for uploads.

Matching currently supports raster image rectangles on the current page. Shared Penpot libraries and complex vector components are not supported.

## Card sizes and measurements

Pixels use a **300 ppi** convention: 300 pixels represent one printed inch. Changing the measurement selector changes the display, not the physical size.

| Preset | Pixels at 300 ppi | Inches | Millimeters |
| --- | --- | --- | --- |
| Poker | 750 × 1050 | 2.5 × 3.5 | 63.5 × 88.9 |
| Tarot | 825 × 1425 | 2.75 × 4.75 | 69.85 × 120.65 |

The rectangular preset list follows MakePlayingCards formats. The 2.45 × 3.95-inch format is called **Medium**. See the [card-size reference](docs/card-size-audit.md) for the full list and sources.

**Custom size** supports other dimensions, including fractional pixels, from 1 to 12,000 px per side. Orientation places the longer dimension horizontally or vertically. No bleed is added automatically.

Older templates are not automatically resized. **Correct Poker Size** fixes the original short Poker template and its inset sample border in one Penpot undo step. Custom artwork keeps its size and position; regenerate output after correction.

## Output and printing

| Layout | Result |
| --- | --- |
| Single fronts | One front board per included design, without backs. |
| Six fronts | Fronts arranged in a 2 × 3 grid per sheet. |
| Nine fronts | Fronts arranged in a 3 × 3 grid per sheet. |
| Single shared back | One back board, without fronts. |
| Six backs / Nine backs | Shared backs repeated to match the number of included card copies. |
| Standard | Separate card designs for individual export, retaining the original workflow. |
| Print and Play | The original A4 fold-over layout with fronts and backs together. |
| Tabletop | A 10 × 7 sheet with up to 69 designs and a shared back. |

Six-up and nine-up sheets default to **US Letter portrait**, with A4 available. They use **5 mm margins and no gaps** between cards. Cut lines default to Yes and can be turned off. Adjacent cards share one straight cut line.

Cards retain their template dimensions. A layout that cannot fit reports an error instead of shrinking them. The final sheet contains only the remaining copies, in card-list order. Paper, layout, and cut-line settings are saved with the page.

Fronts and backs have separate output containers. Generating one preserves the other. Only recorded plugin-owned output is replaced; unrelated or older unclaimed Output frames are preserved.

**Download PDF** is available for six-up and nine-up front or back sheets after generation. PDFs contain 300-ppi raster sheet images on exact Letter or A4 pages. Print at **Actual Size / 100%**, with Fit to Page disabled. Editing cards requires regenerating output before downloading an updated PDF.

## Install and develop locally

Use the local manifest below to run this fork. The original project's hosted manifest installs the upstream plugin, not Card Forge Updated.

Requires **Node.js 20.19+ on the 20.x line, or 22.12+ on later lines**, npm, and Tilt for the recommended development setup.

From this repository, or the parent Penpot project folder:

```sh
tilt up
```

Tilt installs locked dependencies, checks types, builds the plugin, and serves it at **http://localhost:4400/**. Its dashboard is at **http://localhost:10350**. Wait for the **cardforge** service to show ready.

In Penpot on the same computer, open the plugin manager, choose **Load from URL**, and use:

```text
http://localhost:4400/manifest.json
```

Allow local network access if your browser prompts. Test in a scratch file. After a rebuild, close and reopen the plugin to load the updated UI and controller. Manifest permission changes may require reinstalling it. Press `Ctrl+C` in the Tilt terminal to stop the preview.

Without Tilt:

```sh
npm ci
npm run dev
```

The development command builds in watch mode and starts the preview. `npm run build` builds without starting a server. Reuse the Tilt-managed service if it is already running; both setups use port 4400.

For localhost loading issues, see [Penpot's local plugin instructions](https://help.penpot.app/plugins/create-a-plugin/#27-step-7-load-the-plugin-in-penpot).

### Validation

```sh
npm test
```

This runs the compiler, plugin build, and automated tests. The controller is bundled into a standalone script for Penpot. Avoid running a separate build while Tilt is rebuilding the same output folder; once Tilt is ready, run `node --test tests/*.test.mjs` for tests alone.

Automated tests use a simulated Penpot API. Real Penpot rendering, browser downloads, and capacity with large artwork still need live verification. CSV and export limits are protective caps, not performance guarantees.

## Current limits and project notes

Live Google Sheets synchronization, PNG ZIP downloads, text-overflow validation, cancellation controls, and interrupted-run recovery remain future work. PDFs are raster exports rather than vector documents. Existing editable boards retain the original 300-ppi canvas convention.

- [Product requirements](docs/cardforge-prd.md)
- [Feasibility and remaining checks](docs/feasibility.md)
- [Card-size audit and preset sources](docs/card-size-audit.md)

## Credits and feedback

This fork builds on [PIWEEK/Cardforge](https://github.com/PIWEEK/cardforge). The original project's credit and MIT license are preserved in [LICENSE](LICENSE).

Report bugs and suggest improvements in [Card Forge Updated issues](https://github.com/McDusty/card-forge-upgraded/issues).
