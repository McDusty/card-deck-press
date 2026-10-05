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

## What changed from the original

| Area | Changes in this fork |
| --- | --- |
| Workflow | Dedicated Create Deck, Edit Deck, Export, and Help tabs separate template setup, card editing, generation, and guidance. |
| Interface | Compact tabs, common actions at the top, simpler buttons, fewer decorative images, and helpful empty states. |
| Deck data | CSV import and direct Google Sheets links with column mapping, validation, reviewed updates, and stable card IDs. |
| Card quantities | A Quantity field lets one Healing row produce ten printed copies. CSV imports recognize the `quantity` header. |
| Artwork | A visible Artwork frame stores reusable images. Card rows accept image names or selections from Artwork. Uploads preserve filenames for reuse and CSV matching. |
| Card sizes | Corrected Poker and Tarot dimensions, 11 rectangular presets, custom sizes, and a Pixels / Inches / Millimeters selector. |
| Output layouts | Fronts only or backs only, as individual cards or six-up and nine-up sheets. Original Standard, fold-over Print and Play, and Tabletop layouts remain available. |
| Printing | US Letter by default for the new sheet layouts, optional A4, cards placed edge to edge, single shared cut lines, and physically sized PDF downloads. |
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

1. On an empty Penpot page, open **Create Deck**. Choose a name, card size, and orientation. Creation adds **Front**, **Back**, and **Artwork** frames, then closes the plugin. Front's **inside** frame starts with a `#title` text layer and a black `#image` image placeholder. Back also has a black image placeholder inside its **inside** frame for your shared back design.
2. Design your templates in Penpot. Keep the Front and Back frame names and dimensions. Name variable layers after your data columns, with a `#` prefix: `name` → `#name`.
3. Reopen the plugin and use **Edit Deck** to add cards manually, import CSV, or connect a Google Sheet. New templates give each row **Quantity** (starting at 1), **Title**, and **Image**. CSV headers `title` and `image` map to these starter fields automatically. Set quantities for designs you want to print more than once.
4. Open **Export**, select a layout, and click **Generate Cards**. Single-card, six-up, nine-up, and fold-over layouts offer **Download PDF**. Export individual boards through Penpot.

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
- **Import details:** expand this section for the source worksheet and read time, artwork matching details, and lists of changed Card IDs. Card counts, change totals, and errors stay visible in the review.
- **Automatic checks:** artwork uploads and column mapping changes recheck the preview automatically. **Check again** appears only for artwork matching problems or an import error that needs another review. It rechecks the downloaded rows; **Pull Latest** reads updated Google Sheet rows.
- **Updates:** each import replaces the complete card list. Keep IDs stable between imports, then generate cards again to update output. Existing output remains until a replacement succeeds.
- **Quantity:** use whole numbers from 0 to 100. Zero excludes the card. Print sheets repeat copies; single-front, Standard, and Tabletop layouts include each nonzero design once.
- **Export CSV:** keeps your card text unchanged. Use this for backups, editing, and importing back into the plugin. Ignored source columns are not retained.
- **Export for spreadsheets:** also downloads a CSV, but adds a leading tab to values a spreadsheet might interpret as formulas, such as `+2 healing`. Use this as a viewing copy. The added tabs change those values, so use **Export CSV** for reimporting. Spreadsheet applications may handle this protection differently.
- **Restore Previous State:** restore one saved card-list, mapping, output-settings, and data-source snapshot after confirming the destination mode. This does not restore artwork or template edits, or regenerate output.

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

1. Inside **Front**, draw a rectangle where the variable image should appear.
2. Give it **one image fill** using a sample image. Set its size and crop in Penpot.
3. Name it after the CSV column containing image filenames, with `#` at the start. An `art` column uses `#art`; an `illustration` column uses `#illustration`. Each variable layer needs a unique name.
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

**Download PDF** is available after generating single fronts, a single shared back, six-up or nine-up sheets, or Print and Play fold-over pages. Single-card PDFs use one page per generated card at its template print size. Sheet PDFs use exact Letter or A4 pages; fold-over pages use A4 in the generated orientation. All PDFs contain 300-ppi raster images. Print at **Actual Size / 100%**, with Fit to Page disabled. Editing cards requires regenerating output before downloading an updated PDF.

## Automatic deployment

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
