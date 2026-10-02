# Cardforge | Penpot Plugin

![](https://raw.githubusercontent.com/PIWEEK/cardforge/d25f9f0d062c040b668a82ac0256192b5ad3080e/public/images/main-logo.svg)

## Development work

The `codex/cardforge-import-print` branch develops CSV imports and front/back output. Requirements are in [the PRD](docs/cardforge-prd.md); verified findings and remaining checks are in [the feasibility plan](docs/feasibility.md). The installation URL below is the upstream release, not this development branch.

Build tooling requires Node 20.19+ on the 20.x line, or Node 22.12+ on later lines. Run `tilt up` from this repository or its parent Penpot project folder. Tilt installs locked dependencies, checks types, builds the plugin, and serves the preview on port 4400. The dashboard is at `http://localhost:10350`.

Tilt rebuilds on source, public asset, and configuration changes. Its readiness check requests the plugin manifest. Generated files and dependencies are not watched, so builds do not trigger rebuild loops. Close and reopen Cardforge in Penpot after a rebuild to load the updated controller and UI. Press `Ctrl+C` in the Tilt terminal to stop its local preview.

Without Tilt, install dependencies with `npm ci` and build with `npm run build`. `npm run dev` builds in watch mode and starts a live preview; a normal build does not start a server. Stop any existing preview before switching between Tilt and standalone development. Both use port 4400, and the preview fails rather than silently switching ports.

### Test locally in deployed Penpot

1. Run `tilt up` and wait for **cardforge** to show ready. The preview binds to localhost only and serves the built plugin with cross-origin headers.
2. In Penpot on the same computer, open a scratch file. Open the plugin manager (`Command + Option + P` on macOS), choose **Load from URL**, and install `http://localhost:4400/manifest.json`.
3. Allow local network access if your browser prompts, then run the locally installed Cardforge entry. This is a separate installation from the upstream URL.
4. On an empty page, create a deck. The plugin closes after creation. Add a text layer inside **Front**, name it `#name`, then reopen Cardforge.
5. Add two cards with different names. Forge them using **Standard**. Check that both names appear in the output.
6. Reopen Cardforge and confirm both cards were saved. Change one name, forge again, and confirm the output updates.

Fronts-only and backs-only layouts, straight cut lines, and sheet PDF downloads are available for local testing. CSV import is available; PNG ZIP downloads remain pending. Use a scratch file because the legacy fronts-and-backs generator replaces its **Output** board on each run. After controller changes, close and reopen the plugin to load the new code. Manifest or permission changes may require reinstalling the local plugin.

If an HTTPS Penpot site cannot load localhost, check the browser's local network permission; Firefox is another option. See [Penpot's local plugin instructions](https://help.penpot.app/plugins/create-a-plugin/#27-step-7-load-the-plugin-in-penpot) and [local network troubleshooting](https://help.penpot.app/mcp/#install-and-activate-1).

### CSV import and artwork

The **Help** tab is one scrollable guide with a clickable table of contents. It covers creation, sizes, templates, CSV/Google Sheets data, artwork, updates and recovery, output layouts, and printing. Its size table uses the same preset data as card creation.

1. Open **Edit deck → Import CSV**. **Download sample** provides a simple starting file. Google Sheets users can download their sheet as UTF-8 CSV.
2. Include a unique `card_id` for every row. Optional `quantity` defaults to 1, accepts 0–100, and 0 excludes the card from output. IDs such as `001` stay text.
3. Map columns to `#` template fields, Card ID, Quantity, or Ignore. Matching names map automatically: `name` → `#name`. Review the first five rows, counts, errors, and added/changed/removed records.
4. Click **Apply import** to replace the whole card list. Existing generated boards stay in place and are marked out of date. Open **Export** and click **Generate Cards** to regenerate them.
5. Use **Export CSV** for a backup or spreadsheet editing. **Restore previous import** restores one saved dataset, mapping, and output-settings snapshot. It does not restore template or artwork edits or regenerate boards. Ignored CSV columns are discarded and do not appear in the export.

Quoted commas, quotes, Unicode, and multiline text are supported. Limits are 2 MiB, 100 columns, 500 records, and 1,000 printed copies. These are protective caps, not measured performance promises. Print sheets repeat quantities consecutively; single-card/standard/tabletop outputs include each nonzero design once. A single shared back still produces one back.

New decks include a visible **Artwork** board. Use **Add artwork images** in the import view to upload multiple images; filenames become layer names. The batch limit is 100 images / 32 MiB. You can also place image rectangles there yourself. CSV image fields match exact names including extensions, such as `dragon.png`. Use `Artwork/folder/dragon.png` to distinguish duplicate names. Missing or ambiguous names block Apply; an empty mapped image cell clears the field. Unmapped fields retain their template design.

Legacy `_Images` boards remain compatible and become visible Artwork containers when reused for uploads. Existing shape references remain intact. Image replacement on the same rectangle uses its current fill when regenerating. Complex vector artwork and shared Penpot libraries are not supported yet.

### Card size controls

**Create deck** now offers **Pixels / Inches / Millimeters** and **Custom size**. Pixels are interpreted at **300 ppi**: 750 × 1050 px = 2.5 × 3.5 inches = 63.5 × 88.9 mm. Switching units changes the display, not the physical dimensions. Custom width and height keep fractional pixels; orientation places the longer dimension horizontally or vertically. Dimensions must be 1–12,000 px per side. No bleed is added. A sheet that cannot fit the chosen size reports an error and keeps the card dimensions.

The [card-size reference](docs/card-size-audit.md) now defines the preset list using MakePlayingCards' rectangular formats. Poker is 750 × 1050 px; Tarot is 825 × 1425 px. The 2.45 × 3.95-inch format is called **Medium**. Custom size supports other conventions, including exact 70 × 120 mm Tarot. Existing templates are not automatically resized by preset updates.

### Fronts-only and backs-only output: local test build

In **Export → Output Layout**, choose single fronts, six fronts, nine fronts, a single shared back, six backs, or nine backs. Fronts-only modes need a **Front** board; backs-only modes need a **Back** board. Back sheets repeat the shared design once for every card in the list. A single back produces one board.

**US Letter** is the default paper. Cut lines default to **Yes** for sheets and can be switched off. Six-up and nine-up sheets use **5 mm margins** and **no gaps**. Adjacent cards share one straight cut line, so a single cut separates them without changing their size.

New poker decks use **750 × 1050 canvas units**, equivalent to **63.5 × 88.9 mm (2.5 × 3.5 inches)** at 300 ppi. The sample border now follows the template edge instead of a smaller inset frame. **Import CSV** and **Add Card** stay at the top of Edit Deck while scrolling. Output settings and PDF downloads live in the dedicated Export tab. The Edit deck tab shows the actual Front/Back dimensions. For an older poker deck, click **Correct poker size** to update the templates and the original smaller inset border. Custom artwork keeps its size and position. The correction is one Penpot undo step; forge again to update output. Custom card sizes are not converted.

Cards keep their template dimensions. Impossible layouts report an error. The final sheet contains only the remaining cards, in order. Layout, paper, and cut-line choices are saved with the page.

Output is named **Fronts Output** or **Backs Output**. Each replaces only its own recorded output for the current page and template. Generating backs preserves generated fronts, and vice versa. Replacement is staged; field or clone failures preserve the previous completed output. Unclaimed boards are preserved.

After forging a sheet layout, use **Download PDF** in the plugin. The file has exact Letter (612 × 792 points) or A4 page dimensions and contains the generated sheets in order. Print at **Actual Size / 100%**. The PDF embeds 300-ppi sheet images; it is not vector output. Reinstall the local manifest once if needed to approve the added download permission.

Editable sheet boards retain the upstream 300-ppi canvas convention. Physical template migration, text-overflow validation, cancellation, large-deck benchmarks, and interrupted-run recovery remain pending. Browser download and real Penpot rendering still require live verification; automated tests use a simulated Penpot API. Avoid running a separate build while Tilt is rebuilding the same output folder; use `node --test tests/*.test.mjs` once Tilt is ready.

Run `npm test` for the compiler, standalone controller build, and generation behavior tests. The controller is bundled separately as one script because Penpot cannot evaluate unresolved JavaScript module imports.

## Introduction

The Cardforge plugin for [Penpot](penpot.app) allows you to create decks for board games. You only have to design the front and the back of a card, create a list of all the cards that you want, and the plugin will generate an output to print the cards or even use on digital game systems.

## Installation

To install the component, just open the plugin manager in Penpot and paste this URL: https://cardforge-dn5.pages.dev/manifest.json

## Usage

### Create a new Deck

Go to an empty page. Open the plugin. Choose a name for the deck, select a size and orientation, and click "Create Deck."

![](https://github.com/PIWEEK/cardforge/blob/main/screenshots/create_deck.jpg?raw=true)

The plugin will set the name of the page and create frames for the front and back of the card.

The sample border follows the full card edge. Adjust the artwork to suit your design.

### Design a base card

Design a card within the Front frame as you wish, but do not change the size or the name of the frame.

Add image and text layers for the sections of the card that will differ on each card. These variable layers must have a unique name and start with the character #. For example, #name, #background, #image, #power...

Design the back of the cards within the Back frame, but do not change the size or the name of the frame either. The back cannot have variable fields.

![](https://github.com/PIWEEK/cardforge/blob/main/screenshots/design.jpg?raw=true)


### Cards list

Here you will find a list of all the cards in your deck. Click "Add Card" to create a new card.

For each card, you can assign values to the text or image variable fields.

Every row has **Quantity**, starting at **1**. Set one Healing card to **10** to print ten copies without duplicating its row. Whole numbers 0–100 are supported; 0 excludes the card. Six-up, nine-up, backs, and fold-over sheets repeat quantities. Single-card, Standard, and Tabletop output includes each nonzero design once. Older cards without quantity still count as 1. CSV imports use the same `quantity` field.

![](https://github.com/PIWEEK/cardforge/blob/main/screenshots/cards.jpg?raw=true)

You can also duplicate or delete a card.

When all the cards are ready, open **Export**, choose a layout, and click **Generate Cards**. Switching tabs retains output settings and a ready PDF; editing cards requires generating the output again.


### Forging cards

![](https://github.com/PIWEEK/cardforge/blob/main/screenshots/forge.jpg?raw=true)

You can create your cards in three different ways

**Standard**: This method is for printing at a print shop. They typically require a separate file for each card, so this option generates a list of all the cards to export each one individually.

**Print and Play**: This method is for printing the cards on a regular printer. It will arrange your cards on A4 pages, which you can export and print individually. It also set the front and back of each card together, so you can fold them along the joint to assemble the physical cards.

**Tabletop**: This method creates a single frame containing all the cards arranged in a 10x7 grid, with the back positioned in the bottom right corner. This format is used by Tabletop Simulator and similar software.


For both Standard and Print and Play, you can also choose to include cut marks to assist you (or the print shop) in cutting the cards.

### Sample result

![](https://github.com/PIWEEK/cardforge/blob/main/screenshots/export.jpg?raw=true)


### Bleeding area and margins

![](https://raw.githubusercontent.com/PIWEEK/cardforge/refs/heads/main/public/images/print_info.png)



## Feedback and Support

Please open an [issue](https://github.com/PIWEEK/cardforge/issues) either to provide feedback or to share a bug.
