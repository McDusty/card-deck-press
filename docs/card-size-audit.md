# Card size reference

Checked October 2, 2026. The plugin now uses the rectangular formats in the [MakePlayingCards image-upload guide](https://www.makeplayingcards.com/pops/faq-photo.html), as requested. **Medium** is our preferred name for the 2.45 × 3.95-inch format.

All dimensions below are **finished trim sizes**, without added bleed. Inches are the source dimensions. Millimeters and pixels are calculated from them; pixels use 300 ppi.

| Preset | Inches | Millimeters | Pixels at 300 ppi |
| --- | --- | --- | --- |
| Poker | 2.5 × 3.5 | 63.50 × 88.90 | 750 × 1050 |
| Bridge | 2.25 × 3.5 | 57.15 × 88.90 | 675 × 1050 |
| Large | 3.5 × 5.75 | 88.90 × 146.05 | 1050 × 1725 |
| Tarot | 2.75 × 4.75 | 69.85 × 120.65 | 825 × 1425 |
| Medium | 2.45 × 3.95 | 62.23 × 100.33 | 735 × 1185 |
| Mini | 1.75 × 2.5 | 44.45 × 63.50 | 525 × 750 |
| Micro | 1.25 × 1.75 | 31.75 × 44.45 | 375 × 525 |
| Domino | 1.75 × 3.5 | 44.45 × 88.90 | 525 × 1050 |
| Small square | 2 × 2 | 50.80 × 50.80 | 600 × 600 |
| Large square | 3.5 × 3.5 | 88.90 × 88.90 | 1050 × 1050 |
| Business | 2 × 3.5 | 50.80 × 88.90 | 600 × 1050 |

## What changed

- Poker is 750 × 1050 px. Its original upstream 1039 px height was 11 px short.
- Tarot is 825 × 1425 px, matching 2.75 × 4.75 inches. The old 827 × 1417 px represented approximately 70 × 120 mm, a different convention. [The Game Crafter](https://www.thegamecrafter.com/make/products/TarotDeck) also gives the inch-based size.
- The inherited list of game/sleeve nicknames has been replaced with the table above. Custom size remains available for other formats, including exact 70 × 120 mm Tarot.
- Presets derive directly from physical dimensions. Display-unit switching does not change the underlying size.

## Scope

Circle and hexagon formats from the guide are excluded for now: they need shaped borders and cutting paths, not rectangular templates. The larger image-upload dimensions in the printer guide include bleed and are not used as card trim dimensions.

These are this printer's conventions, not universal standards for every printer or game edition. Existing templates are not resized automatically. Older poker templates have an explicit Correct poker size action; other existing templates should be checked before printing.
