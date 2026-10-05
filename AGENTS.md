# UI changes

Follow [button placement and meaning](docs/button-guidelines.md) for every UI change:

- Creation and output actions: primary color, right side.
- Cancel: neutral, immediately left of its primary action.
- Delete, clear, and disconnect: red, left side.
- Neutral utilities: group on the right beside their related actions.
- Use the shared action-bar classes. Preserve visual and keyboard order.

# Scrolling

- Keep one vertical scroll area per main view. The card table grows with its rows; the page owns vertical scrolling.
- Allow horizontal scrolling for wide tables. Do not add a fixed table height that creates a second vertical scrollbar.
- When adding a card, bring the new row into view through the page's scroll area.
