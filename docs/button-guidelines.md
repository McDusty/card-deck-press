# Button placement and meaning

Use these rules in every screen, form, dialog, toolbar, and card row.

| Action | Appearance | Placement |
| --- | --- | --- |
| Create, import, apply, generate, upload, restore, or download | Primary accent color (`btn-primary`) | Right side of its container |
| Cancel or return without applying | Neutral button | Immediately left of the associated primary action |
| Delete, clear, or disconnect | Red (`btn-danger`, or red icon for row deletion) | Left side of its container |
| Navigate, refresh, choose a file, or adjust existing settings | Neutral button or link | Group on the right beside related actions |

## Shared layout

- Use `action-bar` for a full-width action row.
- Use `action-primary` to group controls on the right. Its automatic left margin creates the separation. The group may contain neutral utilities and primary buttons.
- Keep related utilities beside their main action. Reserve the left side of an action bar for destructive actions.
- Wrap Cancel and its primary action in `action-pair`. Keep them together when the layout narrows.
- Keep DOM order the same as visual and keyboard order. Do not reposition controls with CSS `order`.
- Use the existing theme accent for primary buttons. Keep destructive actions red in both themes.
- Keep accessible labels on icon buttons and visible keyboard focus on every control.
- Keep frequent toolbar and import-review actions at the top of their view.

For a destructive confirmation, put the red confirmation on the left and neutral Cancel on the right. Do not style a destructive confirmation as a primary action.

## Penpot appearance

- Use the installed Penpot theme colors so controls adapt to light and dark themes.
- Tabs form one rounded group, aligned right in the header. Use uppercase labels and a filled active tab with accent-colored text. Do not add an underline to the active tab.
- Primary buttons use a solid accent fill, rounded corners, and uppercase labels. Neutral buttons keep sentence-case labels.
- Dropdowns use a rounded neutral fill and a subtle chevron. Keep native selection and keyboard behavior.
- Menus use rounded surfaces and a filled hover or focused item. Preserve visible keyboard focus throughout.

## Secondary menus and icons

Edit Deck keeps Import CSV, Google Sheet, and Add Card together on the top right. Less frequent utilities belong in the **More actions** menu on the right of the table header: Refresh Artwork, both CSV exports, Restore Previous State, and template correction when available.

Menu items use neutral rows with icons and text, including export and recovery commands. Primary styling identifies the main workflow buttons outside the menu. Destructive commands stay red wherever they appear.

Icons supplement visible text; they do not replace it. Use small, consistent line icons in the button's current text color. Hide decorative icons from screen readers. Menus must support arrow keys, Escape, outside-click dismissal, and focus return.

## Examples

```text
Connect sheet:                         [Cancel] [Read Sheet]
Review import:                     [Cancel] [Apply Changes]
Review artwork:                       [Add artwork images]
Artwork error:          [Add artwork images] [Check again]
Image picker: [Clear image]          [Cancel] [Upload image]
Disconnect:   [Disconnect and keep cards]          [Cancel]
Card row:     [Delete]  Number · Quantity · Fields  [Duplicate]
```

Downloads create an output file, so they use primary styling. Restore replaces deck state, but is a recovery action: use primary styling with a reviewed confirmation. Disconnect removes a connection, so it uses destructive styling even though the cards remain.

Hide redundant actions during a successful workflow. Import reviews check artwork automatically after uploads and mapping changes. Show the neutral **Check again** action only for artwork matching problems or retryable import errors; hide it while checking and once the preview is valid.

Keep reviews concise. Put source metadata, artwork guidance, and changed-ID lists in a collapsed **Import details** section. Keep card counts, change totals, operation status, errors, and the effect of Apply visible outside it.
