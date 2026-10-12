# Card Deck Press

*Design cards. Build decks. Print and play.*

**Card Deck Press** is a [Penpot](https://penpot.app/) plugin for designing and producing card decks, built from the original [Cardforge](https://github.com/PIWEEK/cardforge). It improves the interface and deck-building workflow, and adds spreadsheet-driven decks, reusable artwork, corrected card sizes, and more printing options. Penpot remains the design editor.

Design a Front and shared Back template, add card details manually, from CSV, or through a connected Google Sheet, then generate individual cards or printable sheets. Look for **Card Deck Press** in Penpot's plugin menu.

## Install in Penpot

The plugin is deployed on **GitHub Pages**. You do not need to download this repository, install Node.js, or run Tilt to use it.

1. Open a design file in Penpot.
2. Open **Plugin Manager** from the menu or toolbar.
3. Choose **Load from URL** and paste this manifest URL:

```text
https://mcdusty.github.io/card-deck-press/manifest.json
```

4. Complete installation and approve the requested permissions: read and write document content, and allow downloads for PDF exports.
5. Launch **Card Deck Press** from the plugin manager. Start on an empty page if you are creating a new deck.

Use the **manifest URL** above, rather than the GitHub repository URL or the website's home page. This URL installs Card Deck Press; the original Cardforge deployment is a different installation.

If you previously installed the localhost version, install this hosted URL and launch that entry. The hosted plugin continues working when your local server is stopped. Close and reopen it to load a newly deployed build; permission changes may require reinstalling it.

Previously named **Card Forge Upgraded**. The repository and hosted URL are now **card-deck-press**. If you installed the old `card-forge-upgraded` URL, or Penpot still shows **Card Forge Upgraded** or **Cardforge**, remove that hosted entry and install it again from the new manifest URL above. Your deck data stays in the Penpot document. Original or older localhost installations may appear separately.

See [Penpot's plugin installation instructions](https://help.penpot.app/plugins/create-a-plugin/#27-step-7-load-the-plugin-in-penpot). To work on the code, use the separate [local development setup](#develop-locally) below.

## User guides

- [Get started](#getting-started): create templates, add cards, and generate output.
- [Printing guide](docs/printing-guide.md): card sizes, page layouts, cutting buffers, and PDF printing.
- [Set up a template image](#set-up-a-template-image): name fields and choose reusable artwork.
- [CSV imports](#csv-imports-and-deck-updates) and [Google Sheets](#google-sheets-connections): manage card data.
- **Help tab:** the same workflow inside the plugin, with a table of contents.

## What changed from the original

| Area | Changes in this fork |
| --- | --- |
| Workflow | Dedicated Create Deck, Edit Deck, Export, and Help tabs separate template setup, card editing, generation, and guidance. |
| Interface | Compact tabs, common actions at the top, simpler buttons, fewer decorative images, and helpful empty states. |
| Deck data | CSV import and direct Google Sheets links with column mapping, validation, reviewed updates, and stable card IDs. |
| Card quantities | A Quantity field lets one Healing row produce ten printed copies. CSV imports recognize the `quantity` header. |
| Artwork | A visible Artwork frame stores reusable images. Card rows accept image names or selections from Artwork. Uploads preserve filenames for reuse and CSV matching. |
| Card sizes | Corrected Poker and Tarot dimensions, 14 rectangular presets including 3 × 5, 4 × 6, and 5 × 8 index cards, custom sizes, and a Pixels / Inches / Millimeters selector. |
| Output layouts | Fronts only or backs only, as individual cards, automatic-fit pages, or six-up and nine-up sheets. Original Standard, fold-over Print and Play, and Tabletop layouts remain available. |
| Printing | Letter or A4, page orientation, optional 0–10 mm colored cutting buffers, guides at the trim edges, and physically sized PDF downloads. |
| Help | One scrollable guide with a table of contents, including CSV headers, quantities, image template setup, and printing. |
| Data protection | Generation replaces only the output owned by that layout. Failed replacements preserve completed output; stale uploads and downloads are rejected after context changes. |
| Development | Tilt setup, locked dependencies, compiler checks, and automated import, generation, and export tests. |

## UI and workflow improvements

The updated interface follows a clear sequence: **Create Deck → Edit Deck → Export**. Help is available in its own tab throughout the process.

- **Separate steps:** create the templates first, enter card data in Edit Deck, then choose output settings and generate cards in Export. Printing controls no longer interrupt card editing.
- **Common actions within reach:** Import CSV, Google Sheet, and Add Card stay at the top of local decks. Empty tables offer the same actions. Linked decks show Open Sheet and Pull Latest instead of manual editing.
- **Clearer navigation:** compact tabs sit together at the top right. The creation guide links directly to Edit Deck, and Export includes a Back to Edit Deck button.
- **Simpler presentation:** decorative character artwork and button outlines were removed. The creation panel starts with the form, followed by a short explanation of what to do next.
- **Useful feedback:** template dimensions, import previews, validation errors, and out-of-date output notices explain what needs attention before generating or downloading.
- **Keyboard access and guidance:** tabs support keyboard navigation, row actions stay visible, and Help is one scrollable document with a clickable table of contents.
- **Consistent actions:** primary actions sit on the right, Cancel sits immediately beside its action, and red destructive actions sit on the left. Contributors should follow the [button guidelines](docs/button-guidelines.md).
- **Deck utilities:** the table header's **More actions** menu holds Refresh Artwork, both CSV exports, Restore Previous State, and available template correction. Main actions keep visible labels and small icons.

## Getting started

1. Open an **empty Penpot page**, then launch Card Deck Press.
2. In **Create Deck**, choose the deck name, card size, **Card orientation**, and **Template style**. Click **Create Deck**. The plugin creates Front, Back, and Artwork, then closes.
3. Design the templates in Penpot. Keep their frame names and dimensions. Variable layers use a `#` prefix matching your data column: `title` → `#title`.
4. Reopen the plugin. In **Edit Deck**, choose **Add Card**, **Import CSV**, or **Google Sheet**. Set **Quantity** for repeated printed copies.
5. In **Export**, choose **Single fronts** for individual card-sized pages, or **Fronts on pages (automatic fit)** for full sheets. For sheets, choose paper, page orientation, optional spacing and buffer color, and cut lines. Check the capacity preview.
6. Click **Generate Cards**, then **Download PDF**. Print at **Actual Size / 100%**.

**Title and image** style starts with `#title` and a black `#image` placeholder inside Front's **inside** frame. Each row has Quantity, Title, and Image. CSV headers `title` and `image` map to these fields. Back has a static image placeholder for your shared design.

**Blank** and **Ruled (writing lines)** styles start with Quantity only. All new templates have a thin black border. The Back design is shared by every card and does not support per-card variables.

Use the [printing guide](docs/printing-guide.md) for index cards, Tarot, cutting buffers, and choosing the right layout.

## CSV imports and deck updates

Use a unique, stable `card_id` for every row. The optional `quantity` column defaults to 1.

```csv
card_id,quantity,name,art
healing,10,Healing,healing.png
shield,4,Shield,shield.png
```

This example expects a text layer named `#name` and an image placeholder named `#art` in Front. Print sheets contain ten Healing cards followed by four Shield cards.

- **Import CSV:** map columns to Card ID, Quantity, template fields, or Ignore. Matching headers map automatically. Review the preview and added, changed, and removed records before applying.
- **Import details:** expand this section for the source worksheet and read time, artwork matching details, and lists of changed Card IDs. Card counts, change totals, and errors stay visible in the review.
- **Automatic checks:** artwork uploads and column mapping changes recheck the preview automatically. **Check again** appears only for artwork matching problems or an import error that needs another review. It rechecks the downloaded rows; **Pull Latest** reads updated Google Sheet rows.
- **Updates:** each import replaces the complete card list. Keep IDs stable between imports, then generate cards again to update output. Existing output remains until a replacement succeeds.
- **Quantity:** use whole numbers from 0 to 100. Zero excludes the card. Print sheets repeat copies; single-front, Standard, and Tabletop layouts include each nonzero design once.
- **Export CSV:** keeps your card text unchanged. Use this for backups, editing, and importing back into the plugin. Ignored source columns are not retained.
- **Export for spreadsheets:** also downloads a CSV, but adds a leading tab to values a spreadsheet might interpret as formulas, such as `+2 healing`. Use this as a viewing copy. The added tabs change those values, so use **Export CSV** for reimporting. Spreadsheet applications may handle this protection differently.
- **Restore Previous State:** restore one saved card-list, mapping, output-settings, and data-source snapshot after confirming the destination mode. This does not restore artwork or template edits, or regenerate output.

A blank mapped text or image cell clears that field in generated cards. An unmapped field keeps its template content. Text cleared manually also renders blank.

Quoted commas, escaped quotes, Unicode, and multiline text are supported. Limits are **2 MiB per CSV, 100 columns, 500 records, and 1,000 printed copies**.

## Google Sheets connections

Each Penpot page can connect to one worksheet containing a header and at least one card row. Paste the normal Google Sheets URL in **Edit Deck → Google Sheet**; you do not need a CSV URL.

1. In Sheets, choose **Share → General access → Anyone with the link → Viewer**. Allow viewer downloads. Private sheets requiring sign-in are not supported.
2. Select the worksheet tab you want, then copy its URL including `gid=`.
3. Paste the link and click **Read Sheet**. Map columns and review artwork matches, all changed card IDs, removals, and order changes.
4. Click **Apply Changes** to replace the cards and save the connection. Until then, the previous deck and link remain in use.

Connected rows are read-only. **Open Sheet** lets you add or edit cards in Google Sheets. **Pull Latest** reads the worksheet again and requires another reviewed apply. The plugin never writes to Sheets or polls automatically.

**Change Link** previews a different worksheet before saving it. **Disconnect** keeps the cards and restores manual editing and CSV import. **Restore Previous State** confirms whether the backup restores a Sheets connection or local mode. Failed reads and invalid previews preserve the existing deck. Interrupted storage updates block changes until **Recover interrupted import** succeeds. Restore keeps one snapshot; the next meaningful import or connection change replaces it.

Use unique, stable `card_id` values and optional `quantity` (whole numbers 0–100). Format IDs as plain text in Sheets before entering values such as `001`; Google exports displayed cell values. Image columns refer to existing **Artwork** names or paths, rather than remote image URLs. The CSV import limits also apply to Sheets. Artwork uploaded during preview stays in Artwork even if the import is canceled.

An unchanged refresh updates its last-applied time without replacing the meaningful import backup or invalidating generated output. Regenerate output after a changed import.

## Set up a template image

1. Inside **Front → inside**, draw a rectangle where the variable image should appear.
2. Give it **one image fill** using a sample image. Set its size and crop in Penpot.
3. Name it after the CSV column containing image filenames, with `#` at the start. An `art` column uses `#art`; an `illustration` column uses `#illustration`. Use distinct names for different fields. To repeat the same value, reuse the name on layers of the same type; do not mix text and image layers under one name.
4. Put source images in **Artwork**. In the import view, **Add artwork images** uploads a batch and names each image rectangle after its filename. You can also place and name image rectangles yourself.
5. Enter the image name in the CSV cell: for example, `healing.png`. Raster file extensions can be omitted from the CSV or Artwork layer name. Exact matches take priority; multiple fallback matches require a unique name or folder path. Apply the import, then generate cards in Export.

Use a path such as `Artwork/creatures/dragon.png` to distinguish duplicate names. Missing or ambiguous matches block the import. A blank mapped image cell clears that field; an unmapped field keeps its template content.

Batch uploads support **100 images totaling 32 MiB**. Replace the fill on an existing Artwork rectangle and regenerate to use the updated image. Legacy `_Images` storage remains compatible and becomes visible when reused for uploads.

### Choose an image in a card row

For locally edited decks in **Edit Deck**, each image field offers:

- **Artwork image name:** type an exact filename or path, then press Enter or leave the field to match it.
- **Pencil button:** open the image picker, search image names, and choose a thumbnail. Full paths distinguish duplicate filenames. Click Cancel or press Escape to keep the current image.
- **Upload image** (inside the picker): add a new image to Artwork and assign it to this card. It keeps its filename and can be reused in other rows or CSV imports.
- **Clear image** (inside the picker): remove the card's image without deleting the source from Artwork.

After adding or renaming images directly in Penpot, click **Refresh Artwork** to update the list. Missing or ambiguous names show an error and must be resolved before generating fronts.

Matching currently supports raster image rectangles on the current page. Shared Penpot libraries and complex vector components are not supported.

## Card sizes and measurements

Pixels use a **300 ppi** convention: 300 pixels represent one printed inch. Changing the measurement selector changes the display, not the physical size.

| Preset | Pixels at 300 ppi | Inches | Millimeters |
| --- | --- | --- | --- |
| Poker | 750 × 1050 | 2.5 × 3.5 | 63.5 × 88.9 |
| Tarot | 825 × 1425 | 2.75 × 4.75 | 69.85 × 120.65 |

The playing-card presets follow MakePlayingCards formats, alongside three index-card sizes. The 2.45 × 3.95-inch format is called **Medium**. See the [card-size reference](docs/card-size-audit.md) for the full list and sources.

**Custom size** supports other dimensions, including fractional pixels, from 1 to 12,000 px per side. **Card orientation** places the longer dimension horizontally or vertically. **Page orientation**, chosen later in Export, turns the sheet without rotating or resizing the cards. No artwork bleed is added automatically.

Older templates are not automatically resized. **Correct Poker Size** fixes the original short Poker template and its inset sample border in one Penpot undo step. Custom artwork keeps its size and position; regenerate output after correction.

## Output and printing

| Layout | Result |
| --- | --- |
| Single fronts | One front board per included design, without backs. |
| Fronts / Backs on pages (automatic fit) | Full-size cards in the largest regular grid on Letter or A4, with Auto, Portrait, or Landscape page orientation. Quantities repeat cards. |
| Six fronts | Fronts arranged in a 2 × 3 grid per sheet. |
| Nine fronts | Fronts arranged in a 3 × 3 grid per sheet. |
| Single shared back | One back board, without fronts. |
| Six backs / Nine backs | Shared backs repeated to match the number of included card copies. |
| Standard | Separate card designs for individual export, retaining the original workflow. |
| Print and Play | The original A4 fold-over layout with fronts and backs together. |
| Tabletop | A 10 × 7 sheet with up to 69 designs and a shared back. |

### Index cards

Choose **Index — 3 × 5**, **4 × 6**, or **5 × 8** in Create Deck. Sizes are in inches at 300 ppi. Index presets start in Landscape with Blank style; both settings remain editable.

- **Blank:** white cards with a thin, square black border.
- **Ruled:** the same border plus editable writing lines on both sides, a quarter inch apart.
- **Title and image:** the existing starter fields. All new templates now use the simple black border.

Blank and ruled templates start with Quantity only. Add a card in Edit Deck and set its quantity, or add variable layers to Front for personalized content. Existing decks keep their designs.

Use **Single fronts** for a PDF page at the card's physical size. Use **Fronts on pages (automatic fit)** or **Backs on pages (automatic fit)** to fill Letter or A4 sheets at full size. Choose **Page orientation → Auto, Portrait, or Landscape**. Auto uses the largest regular grid for automatic-fit pages. The default is 5 mm margins and 0 mm spacing. With Auto page orientation and 0 mm spacing, Letter fits four 3 × 5 cards, two 4 × 6 cards, or two 5 × 8 cards per page. A4 fits only one 5 × 8 card within those margins. Page layouts repeat Quantity; single-card layouts include each design once.

### Cutting buffers

1. Choose a page layout in **Export**.
2. Set **Space between cards (mm)**. The default is **0**; try **2** for a cutting buffer.
3. Set **Buffer color** to **White**, **Black**, or **Custom color**. Match the card's edge color.
4. Check the updated page capacity, then generate and download again.

Spacing supports **0–10 mm**. Half that distance also surrounds the outer cards, within the print margins. With a 2 mm gap, each facing edge gets 1 mm of tolerance. Cut guides mark both card edges; trim away the gap to keep the finished card size.

Buffers add solid color, **not artwork bleed**. Fold-over Print and Play keeps each front/back pair joined and adds buffer around the pair. Single cards, Standard, and Tabletop Simulator are unaffected.

**Example:** portrait Poker cards fit nine per Letter page at 0 mm. At 2 mm with Auto page orientation, automatic fit chooses eight per page. A4 still fits nine. See the [capacity table and cutting steps](docs/printing-guide.md#cards-per-page).

### Paper and PDF output

Six-up and nine-up sheets default to **US Letter**, with A4 available. Page orientation offers **Auto**, **Portrait**, and **Landscape**; Auto prefers portrait when the fixed grid fits both ways. They use **5 mm margins** and default to **0 mm spacing**. Cut lines can be turned off. At 0 mm, adjacent cards share one straight cut line. With spacing, each gap has a trim line on both sides.

Cards retain their template dimensions. Six-up and nine-up choices appear only when they fit the current face size, paper, page orientation, and spacing. If a saved grid stops fitting, Export switches to automatic fit. If no page layout fits, reduce spacing, change paper or page orientation, or use single cards. The final sheet contains only the remaining copies, in card-list order. Layout, paper, page orientation, spacing, buffer color, and cut-line settings are saved with the deck when you generate.

Fronts and backs have separate output containers. Generating one preserves the other. Only recorded plugin-owned output is replaced; unrelated or older unclaimed Output frames are preserved.

**Download PDF** is available after generating single fronts, a single shared back, automatic-fit, six-up or nine-up sheets, or Print and Play fold-over pages. Single-card PDFs use one page per generated card at its template print size. Sheet PDFs use exact Letter or A4 pages; fold-over pages use A4 in the generated orientation. All PDFs contain 300-ppi raster images. Print at **Actual Size / 100%**, with Fit to Page disabled. Editing cards requires regenerating output before downloading an updated PDF.

## Common problems

- **A six-up or nine-up option disappeared:** it does not fit the current settings. Use automatic fit or reduce spacing. Cards are never shrunk.
- **Blank text fields:** clearing a value renders that field blank. Leaving a CSV column unmapped keeps the template's original content.
- **The saved cards changed outside this editor:** the plugin preserves the newer data and reloads it. Review the current rows, then re-enter your last edit if needed.
- **The PDF button disappeared:** changed data or export settings require **Generate Cards** again before downloading.
- **Printed dimensions are wrong:** print the PDF at **Actual Size / 100%** with Fit to Page off. Measure one test card first.
- **A new local update is missing:** wait for Tilt to show Ready, then close and reopen the localhost plugin. Local builds and the GitHub Pages installation are separate.

## Automatic deployment

Pull requests targeting **main** run build and test checks without deploying.

Every push to **main** runs the build and tests, then publishes the built `dist` folder through GitHub Actions. A failed build or test leaves the previous deployment in place. The workflow can also be run manually from the repository's **Actions** tab.

The deployment uses [GitHub's Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [Vite's static build support](https://vite.dev/guide/static-deploy.html#github-pages). Relative asset paths support the repository subdirectory and the local preview.

## Develop locally

This setup is for developing and testing changes. For normal use, install the [hosted plugin](#install-in-penpot) instead.

Requires **Node.js 20.19+ on the 20.x line, or 22.12+ on later lines**, npm, and Tilt for the recommended development setup.

From this repository, or the parent Penpot project folder:

```sh
tilt up
```

Tilt installs locked dependencies, checks types, builds the plugin, and serves it at **http://localhost:4400/**. Its dashboard is at **http://localhost:10350**. Wait for the **card-deck-press** service to show ready.

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

The development command builds in watch mode and starts the preview. Automatic UI reload is disabled because it can interrupt operations and disconnect Penpot's controller. Close and reopen the plugin after a rebuild to load both updated parts. `npm run build` builds without starting a server. Reuse the Tilt-managed service if it is already running; both setups use port 4400.

For localhost loading issues, see [Penpot's local plugin instructions](https://help.penpot.app/plugins/create-a-plugin/#27-step-7-load-the-plugin-in-penpot).

### Validation

```sh
npm test
```

This runs the compiler, plugin build, and automated tests. The controller is bundled into a standalone script for Penpot. Avoid running a separate build while Tilt is rebuilding the same output folder; once Tilt is ready, run `node --test tests/*.test.mjs` for tests alone.

Automated tests use a simulated Penpot API. Real Penpot rendering, browser downloads, and capacity with large artwork still need live verification. CSV and export limits are protective caps, not performance guarantees.

## Current limits and project notes

Google Sheets updates are explicit pulls; automatic synchronization and private-sheet sign-in are not included. PNG ZIP downloads, text-overflow validation, generation cancellation, and recovery of interrupted generation remain future work. Import cancellation and interrupted import recovery are supported. PDFs are raster exports rather than vector documents. Existing editable boards retain the original 300-ppi canvas convention.

- [Product requirements](docs/cardforge-prd.md)
- [Feasibility and remaining checks](docs/feasibility.md)
- [Card-size audit and preset sources](docs/card-size-audit.md)

## Credits and feedback

This fork builds on [PIWEEK/Cardforge](https://github.com/PIWEEK/cardforge). The original project's credit and MIT license are preserved in [LICENSE](LICENSE).

Report bugs and suggest improvements in [Card Deck Press issues](https://github.com/McDusty/card-deck-press/issues).
