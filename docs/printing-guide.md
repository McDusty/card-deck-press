# Print cards with Card Deck Press

Use **Export → Fronts on pages (automatic fit)** to fill a sheet without changing card sizes. Use **Single fronts** for a PDF with one card-sized page per design.

[Back to the user guides](../README.md#user-guides)

## Contents

- [Print existing frames](#print-existing-frames)
- [Choose card size and style](#choose-card-size-and-style)
- [Prepare the card list](#prepare-the-card-list)
- [Choose an export layout](#choose-an-export-layout)
- [Add a cutting buffer](#add-a-cutting-buffer)
- [Cards per page](#cards-per-page)
- [Download, print, and cut](#download-print-and-cut)
- [Fix common problems](#fix-common-problems)

## Print existing frames

Use this when you already have individual cards or index cards on the Penpot canvas. No Card Deck Press template or data table is needed.

1. Select the **card frames** you want to print.
2. Open **Export** and choose **Print selected frames** using the tabs at the top.
3. Choose **Letter** or **A4** and a page orientation. **Auto** compares both orientations.
4. Set **Page margin (mm)** for all four edges. Default: **5 mm**; range: **0–50 mm**. Check your printer’s minimum margin. A zero margin needs borderless printing.
5. Choose whether cards may rotate 90°, plus optional spacing, buffer color, and cut lines.
6. Review the page count and layout preview, then click **Download PDF**.
7. Print at **Actual Size / 100%**, with **Fit to Page off**.

Mixed sizes are supported. The plugin tries several packing arrangements and may reorder cards to save paper. Cards never shrink: **1500 × 900 px prints at 5 × 3 inches**, using 300 pixels per inch. Larger margins or spacing can increase the number of pages. Colored buffers remain inside the chosen page margin.

The preview shows frame names and positions for the first 12 pages. Every selected frame prints once. Quantity values and front/back pairing do not apply. Originals and generated output are unchanged; this mode downloads a PDF directly without creating sheet boards.

Select up to **500 frames** at once. A selected child frame inside a selected parent is included only through that parent. Select card frames themselves, not an outer board containing the entire collection. Hidden or already rotated canvas frames are rejected; use the print rotation option instead. Frames that cannot fit produce a named error. Reduce margins/spacing or change paper/orientation, keeping within your printer’s limits.

After changing the selection or artwork, use **Use current selection**. Changes during PDF creation cancel that download. If the file exceeds memory limits, print smaller selections.

## Choose card size and style

1. Start on an **empty Penpot page** and open **Create Deck**.
2. Choose the card size, **Card orientation**, and **Template style**.
3. Click **Create Deck**. The plugin creates Front, Back, and Artwork, then closes.
4. Design your cards in Penpot, then reopen the plugin.

**Card orientation** turns the card: Portrait is taller; Landscape is wider. **Page orientation**, chosen later in Export, turns the sheet while leaving the cards unchanged.

| Template style | Starting design |
| --- | --- |
| Title and image | Front has `#title` and a black `#image` placeholder inside its inside frame. Back has a static image placeholder. |
| Blank | White cards with a thin black border; no text or image placeholders. |
| Ruled (writing lines) | The same border, plus editable writing lines on both sides, spaced a quarter inch apart. |

All new templates start with a thin black border. Existing decks keep their designs. Switching Measurements between pixels, inches, and millimeters changes the display, not the physical size. Pixels use 300 ppi: 300 pixels represent one printed inch.

**Index cards:** choose 3 × 5, 4 × 6, or 5 × 8 inches. These presets start in Landscape with Blank style. Both settings can be changed.

**Tarot:** the preset is 2.75 × 4.75 inches, or 825 × 1425 px. For exactly 70 × 120 mm, use Custom size. See the [full size reference](card-size-audit.md).

## Prepare the card list

In **Edit Deck**, add cards manually, import CSV, or connect a Google Sheet. Connected decks are edited in the sheet; use **Pull Latest** to review and apply updates.

- **Quantity 1:** print one copy of that design on sheets.
- **Quantity 10:** print ten copies without duplicating the row.
- **Quantity 0:** keep the row but omit it from output.

For ten blank or ruled index cards, add **one row** and set Quantity to **10**. You do not need title or image fields.

Page layouts repeat Quantity. Single-front, Standard, and Tabletop layouts include each nonzero design once. Single shared back produces one back design. Quantities must be whole numbers from 0 to 100, with at most 1,000 printed copies overall.

Clearing a text or image value leaves that field blank in generated cards. Leaving a CSV column unmapped keeps the template's original content.

## Choose an export layout

| What you want | Output layout |
| --- | --- |
| Separate card-sized PDF pages | Single fronts (no backs) |
| A full sheet of card faces | Fronts on pages (automatic fit) |
| A full sheet of shared backs | Backs on pages (automatic fit) |
| A fixed 2 × 3 or 3 × 3 grid | Six-up or nine-up, when available |
| Joined fronts and backs to fold | Print and play (fold-over), on A4 |
| Individual editable output for a print shop | Standard (print shop) |
| A digital deck image grid | Tabletop Simulator |

For automatic-fit, six-up, and nine-up pages:

1. Choose **Paper → US Letter or A4**.
2. Set **Page orientation → Auto, Portrait, or Landscape**. Auto chooses the largest regular grid for automatic fit. For fixed grids, it prefers portrait when both orientations fit.
3. Set spacing and buffer color if wanted.
4. Choose whether to include **Cut lines**.
5. Read the page-count preview before generating.

Six-up and nine-up are hidden when they cannot fit the actual card face, paper, page orientation, and spacing. If a saved grid stops fitting, Export switches to automatic fit. Cards are never shrunk to fit.

Fronts and backs have independent output. Generate both if needed. Automatic duplex alignment is not provided; check front/back registration on a test sheet before printing both sides of a deck.

## Add a cutting buffer

A buffer makes small cutting errors less visible when its color matches the card edges. It does not extend the artwork.

1. Choose a page layout in **Export**.
2. Set **Space between cards (mm)** to a value from **0 to 10**. Default: **0**. Try **2** to start.
3. Choose **Buffer color → White, Black, or Custom color**. With Custom color, use the color picker.
4. Check the updated capacity. Larger spacing may require more pages.
5. Generate and download again after changing these settings.

Color controls are enabled when spacing is greater than 0.

At **2 mm spacing**, each facing edge gets **1 mm of colored tolerance**. The outer cards also get a 1 mm buffer, inside the 5 mm page margins. Card dimensions stay the same.

With cut lines enabled, trim **both edges of the gap** and discard the strip between them. Cutting once through the middle would leave oversized cards. At 0 mm, adjacent cards share one cut line.

Fold-over output puts the buffer around each front/back pair and leaves their join intact. Single cards, Standard, and Tabletop Simulator do not use the buffer.

**Buffer versus bleed:** a buffer adds a solid color outside the card. Artwork bleed extends the actual artwork beyond the cut edge. Card Deck Press does not create artwork bleed or printer-specific commercial margins automatically.

## Cards per page

These counts use **automatic fit**, **Auto page orientation**, and **5 mm margins**. Poker and Tarot cards are Portrait; index cards use their default Landscape orientation. Changing card orientation can change the count.

| Card | Letter, 0 mm | Letter, 2 mm | A4, 0 mm | A4, 2 mm |
| --- | ---: | ---: | ---: | ---: |
| Poker, 2.5 × 3.5 in | 9 | 8 | 9 | 9 |
| Tarot, 2.75 × 4.75 in | 4 | 4 | 4 | 4 |
| Index, 3 × 5 in | 4 | 4 | 4 | 4 |
| Index, 4 × 6 in | 2 | 2 | 2 | 2 |
| Index, 5 × 8 in | 2 | 2 | 1 | 1 |

For example, **ten 3 × 5 index cards** need three Letter pages: four cards, four cards, then two. A single-front export of that one row would instead contain one card-sized page.

The plugin's preview reflects your actual template dimensions and settings, including custom sizes. Use it when your setup differs from this table.

## Download, print, and cut

1. Click **Generate Cards** and wait for completion.
2. Click **Download PDF**. The PDF uses physical card or paper dimensions; its artwork is rasterized at 300 ppi.
3. In the print dialog, choose **Actual Size / 100%** and turn **Fit to Page** off.
4. Print one test page and measure a card before printing the rest.
5. Cut at the card trim lines. If using a buffer, discard the gap strips. For fold-over output, fold the paired front and back at their join.

Generate again after editing rows, templates, artwork, spacing, or other export settings. Download the new PDF afterward; an older downloaded file does not update itself.

The last page contains only the remaining copies, in card-list order. Fronts Output and Backs Output are separate; generating one preserves the other. A failed generation keeps the last completed output.

## Fix common problems

| Problem | What to do |
| --- | --- |
| Nine-up disappeared | Reduce spacing, change paper/page orientation, or choose automatic fit. Poker on Letter with a 2 mm buffer fits eight, not nine. |
| No page layout fits | Reduce spacing, try another paper orientation or paper size, or use single-card output. |
| Buffer color is disabled | Choose a page layout and set spacing above 0. |
| Blank cards show template text | Clear the mapped field's value. An unmapped field deliberately retains its template content. |
| A blank field causes a characters error | Close and reopen the updated plugin, then generate again. Current builds support blank text. |
| Download PDF is missing | Choose a PDF-capable layout and generate. Standard and Tabletop use Penpot's export tools. |
| Printed card size is wrong | Check template dimensions and PDF print scaling. A PNG's pixel count alone does not specify its physical print size. |
| Edits are missing from output | Generate again, then download a fresh PDF. |
| The editor reloads after a stale-save warning | Newer saved rows were preserved. Review them, then re-enter your last edit if needed. |

See the [README](../README.md) for installation, CSV export choices, Google Sheets connections, and [image setup](../README.md#set-up-a-template-image).
