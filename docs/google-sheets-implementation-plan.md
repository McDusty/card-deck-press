# Google Sheets import implementation plan

- **Product:** Card Deck Press
- **Branch:** `codex/google-sheets-import`
- **Date:** October 5, 2026
- **Status:** Standalone reader loop implemented, tested, and reviewed locally. Source persistence, transactions, and product UI remain pending. The full transport release gate remains open.
- **Baseline:** `dd73875` on `origin/main` (840 px default plugin width).

## 1. Decision

Accept a normal Google Sheets link. Save one connection, including its selected worksheet tab, on each Penpot page/deck.

Use an explicit **Pull Latest → Preview → Apply Changes** flow. Google Sheets owns the linked deck's card data. Penpot continues to own templates, artwork, and output settings.

When a deck is linked, replace **Add Card** with **Open Sheet**. Make card rows read-only. Keep **Pull Latest**, **Change Link**, and **Disconnect** available. Disconnect retains the current cards and restores manual editing and CSV import.

This prevents local changes that would disappear on the next pull. There is no write-back to Google, automatic refresh, private-sheet sign-in, or background synchronization in this release.

## 2. User interface

### Unlinked deck

The Edit Deck toolbar offers **Import CSV**, **Google Sheet**, and **Add Card**. The empty table offers the same ways to start. Keep **Refresh Artwork** available as a secondary action.

**Google Sheet** opens a connection panel with:

- **Google Sheets link**: a normal `https://docs.google.com/spreadsheets/d/...` link.
- **Worksheet tab**: taken from the link's `gid`, including a fragment such as `#gid=123`. A spreadsheet link without `gid` is valid but incomplete: retain it and show an inline request for the desired worksheet's browser address. Offer **Open Sheet** beside that instruction. Never silently choose whichever tab happens to be first.
- **Preview Sheet** and **Cancel**.
- This helper text: “In Google Sheets, choose Share → General access → Anyone with the link → Viewer. Open the tab containing your cards, then copy the link from your browser's address bar. Anyone with that link can read the sheet.”
- A short reminder: “Use the first row for column names. Include a unique card_id for each card.”

Do not require the user to find or paste a CSV URL. Fetching spreadsheet data is an internal detail.

The connection is a draft until **Apply Changes** succeeds. Opening the panel, fetching, mapping, or cancelling must not link the deck or replace its cards.

### Linked deck

The primary toolbar offers **Pull Latest** and **Open Sheet**. A compact source panel shows the connected link/tab, **Last applied** timestamp, **Change Link**, and **Disconnect**.

- Cards, quantities, IDs, and image choices are read-only. Hide Add/Duplicate/Delete and row image assignment controls.
- Explain: “Card details come from Google Sheets. Edit the sheet, then pull the latest changes.”
- Preserve CSV exports, restore, Refresh Artwork, template tools, and Export/Generate Cards.
- Import CSV is unavailable until Disconnect. It must not silently switch the source.
- Source-link text wraps; controls must fit the 840 px default window.
- Empty linked decks show Open Sheet and Pull Latest, without manual-entry actions.
- Open Sheet opens the canonical Google worksheet URL in a new tab, without closing the plugin.

Templates and Artwork remain editable in Penpot. A linked deck can still add artwork through the import preview's **Add artwork images** action. Matching filenames remain the sheet's responsibility; no per-card overrides are introduced.

### Pull Latest

Fetch only on explicit user action. Disable duplicate pulls and show “Reading Google Sheet…”, with cancellation.

Use the existing import preview: column mapping, five sample rows, artwork matching, design count, printed-copy count, and added/changed/removed counts. Add expandable lists of every added, changed, and removed Card ID, with row numbers where applicable. Identify replaced local cards without IDs by their existing row number. Five samples alone are insufficient to review a full replacement.

State clearly that Apply replaces the whole card list, including cards removed from the sheet. Initial connection and Change Link also warn that the current local deck is being replaced and that editing will move to Google Sheets.

The preview identifies the source worksheet and time read. **Apply Changes** saves exactly that preview; it does not fetch again. Changing column mappings rechecks the downloaded data. **Pull Latest** fetches again. **Refresh matches** rechecks local artwork without fetching again.

A pull without changes reports “No card changes.” It still requires Apply to record a new successful read; do not mark output stale if ordered card data, relevant mapping, and field bindings are unchanged. Reordering cards can change print output even when added/changed/removed counts are zero: report **Order changed** separately.

Use **Last applied**, not “Last synced”: a successful fetch followed by Cancel has not updated the deck. The time read can be stored separately to describe the applied snapshot; it is not proof that Google has no newer edits.

### Change Link

Open the same connection panel, prefilled with the current link/tab. A new link is only saved together with a valid import on Apply. Until then, the current connection and cards remain intact.

Changing the spreadsheet or worksheet tab resets draft mapping and rematches headers. Changing only an equivalent URL does not reset the mapping. Preview replacement counts against the current deck.

### Disconnect

Show a short review: “Keep these cards and stop pulling from Google Sheets?” On confirmation, remove the connection, keep card values, IDs, resolved artwork references, and import mappings, then restore manual editing and CSV import.

Disconnect does not change Google sharing, delete artwork, or regenerate output. It is recoverable through the import/source snapshot described below. Explain that this is one saved snapshot, not an unlimited history; the next meaningful applied import or source-mode change replaces it. Rename the shared recovery action to **Restore Previous State** and describe whether it restores an import, link change, or disconnect.

Before Restore, show whether the target state is manual or linked and identify its worksheet/link: “Restore these cards and reconnect to [worksheet]” or “Restore these cards in manual mode.” State that artwork/template edits remain and output may need regeneration.

## 3. Data contract

Reuse current CSV rules rather than inventing a second card format:

- First row contains unique, nonblank headers; no merged header cells.
- `card_id` is required, nonblank, unique, and stable across pulls.
- `quantity` maps automatically; missing column defaults to 1. A mapped blank cell is invalid. Whole numbers 0–100; 0 excludes the card from output.
- `title` and `image` map to the starter template. Other column names match `#field` names.
- Image values match local Artwork names or paths. No remote-image download or IMAGE-formula support.
- Blank mapped cells clear values. Unmapped template fields use their template defaults.
- Preserve worksheet row order; generated copies retain existing quantity behavior.
- Current limits: 2 MiB UTF-8, 100 columns, 500 records, 1,000 printed copies.
- A header-only or empty sheet is blocked in this release, preserving current CSV behavior. It must never clear a deck accidentally. For initial empty setup, explain: “Add at least one card in Google Sheets before connecting.” Connecting a header-only sheet is a later convenience, not hidden scope in the parser refactor.
- Recommend Google Sheets' Plain text format before entering IDs, especially for leading zeros or values resembling dates. Stable nonblank unique IDs are mandatory; Plain text formatting is not a validator requirement because CSV does not expose that metadata. Validate received IDs as strings; do not synthesize IDs from row position or try to recover leading zeros already lost in Sheets.

Read displayed cell values, including formula results, as strings. No formula evaluation in the plugin. The transport spike must compare every fixture cell, including the raw header row, for mixed text/numeric columns, minority-type values, `001`, commas, quotes, Unicode, multiline text, blank cells, and formula results before choosing a reader. Duplicate/blank headers must remain detectable; guessed headers or silently nulled cells fail the gate.

Imported data is inert content: render names and cell values with textContent, never HTML or executable script.

Artwork uploads are separate persistent Penpot changes. Beside **Add artwork images**, state: “Added artwork stays in Penpot if you cancel this import.” Cancellation or Restore does not remove uploaded images. Refresh matches updates the current preview; a later upload error retains the successfully uploaded batch portion.

## 4. Page storage and state

Keep existing card serialization compatible; source state is a separate versioned page plugin-data key, proposed `deck-source`.

Persist a discriminated source union: local mode, or Google Sheets mode with schema version, canonical spreadsheet ID, explicit worksheet ID, canonical Open Sheet URL, connection revision, applied timestamp, and optional snapshot-read timestamp. Keep mappings in the existing import metadata.

Missing source data means local mode for existing decks. Unknown or malformed saved source data must show a recovery error and block card mutation; do not silently downgrade a previously linked deck to manual mode. Offer a deliberate Disconnect recovery action while preserving cards.

Do not use browser localStorage or file-global storage for a connection. Switching Penpot pages loads that page's own source and cards. Duplicate pages may inherit their connection; explain this behavior in Help and keep Change Link available.

Temporary request state is not persisted. Model idle/loading/preview/applying/error states explicitly. Capture page ID, DeckSession session, source revision, and request revision before awaiting anything. Cancel on page change, Change Link, Disconnect, Restore Previous State, a newer request, or plugin closure.

Use a host-issued monotonic operation/source epoch within DeckSession that is never restored from a backup. Cancel, link changes, disconnect, restore, and page changes advance it and invalidate pending host preview tokens. Cancel must send a host invalidation message, not just hide the panel. Persisted source revision alone cannot distinguish an old request when a disconnect/reconnect or restore returns to the same saved values.

A response may proceed to preview/apply only if all captured identities still match. Revisiting the same page must not revive an old session's response.

## 5. Atomic application, restore, and authority

Extend the current importer, without a second independent apply path:

1. Validate the current page/session and preview token.
2. Recheck deck, source state, mapped template identities/types, and artwork inventory against the preview.
3. Snapshot cards, import metadata, output settings, and source state.
4. Persist and read back a durable, versioned recovery record containing every prior affected key, including stale status and the previous backup. If that record cannot be established and verified, abort before changing the deck. Keep it separate from the one-step user recovery snapshot.
5. Write cards, mappings, source metadata, and output status through a recoverable best-effort transaction. Penpot does not expose an atomic multi-key database commit.
6. On write failure, attempt restoration of every affected key even if one restoration fails. Keep the durable prior record; report incomplete recovery and block subsequent mutations until an explicit retry/recovery succeeds. Never report Apply success after partial recovery.
7. Retain the recovery record until the intended commit or complete rollback has been read back and verified. Record commit status before cleanup; failures before or after a record write or cleanup effect must have a defined outcome. On reopening, unresolved recovery records block mutation and offer recovery; they cannot silently disappear into local mode.
8. Notify the UI only after verified success, regenerate editor row IDs, invalidate obsolete image targets and PDFs, and reload source status.

Restoring a snapshot restores source mode/link, cards, mapping, and output settings together. Introduce a versioned backup envelope that includes all source and output-status keys. Validate the entire target snapshot (card serialization, source schema, mappings, and output settings) before writing any key. A corrupt backup must fail without changing the deck or its recovery snapshot. If restored source is linked, rows become read-only. If it is local, manual actions return. Only explicitly recognized legacy snapshots may omit the source key and restore local mode; incomplete new envelopes and unknown versions fail validation. Restored output must be regenerated when required; no artwork/template edits are undone.

Disconnect and Change Link use the same snapshot/rollback discipline. Unchanged refreshes preserve the previous useful recovery snapshot instead of overwriting it with identical data plus a new timestamp. Source-mode/link changes remain meaningful recoverable operations even if the card contents match.

Use typed apply acknowledgements distinguishing **card/output inputs changed**, **source mode/link changed**, and **metadata-only refresh**. Existing CSV_APPLIED callbacks invalidate every PDF and OUTPUT_SETTINGS reloads invalidate again; both paths must honor this distinction. Comparing sorted object fields must not ignore array/card order. Do not equate zero added/changed/removed counts with no output change.

Block source mutations while a PDF download is running, through both controller rendering and iframe PDF assembly. The controller's current pdfExporting flag ends before assembly, so it is not sufficient alone. Use an operation-ID lock retained until the iframe acknowledges completion/cancellation; stale acknowledgements cannot release a newer lock. Release/invalidate on page change or plugin closure. A bounded abandoned-operation timeout invalidates the old operation before releasing the lock, so late assembly cannot initiate a download. Also carry a generation fingerprint and source epoch through PDF requests/results; source/data changes from another editor cancel the pending download before its final click. Keep output-input fingerprints separate from source timestamps so metadata-only pulls do not invalidate identical output.

Enforce source authority in the Penpot controller, not only disabled buttons. While linked, reject manual save-cards-data, duplicate/delete saves, direct image assignment, and CSV replacement. Permit source previews/apply, artwork inventory changes, generation, CSV exports, restore, and explicit Disconnect. Guard late image uploads and saves that began while local but finish after linking.

Generation and PDF requests also require current source/page/operation context. For linked mode, build from the persisted deck and reject stale request.cardsData; do not permit a stale local request to render different cards and clear the out-of-date flag. Delay local editing controls until source status has loaded. If a write is rejected or a collaborator changes the source, reload authoritative cards/source so the UI cannot keep displaying optimistic values that were never saved.

External/collaborative page changes after preview invalidate Apply. A local UI source revision alone is insufficient; compare persisted source/deck state immediately before committing.

## 6. Transport and permission validation

**Feasibility gate: complete before building the full UI.** Google documents anonymous reads of Sheets shared as Anyone with the link, and worksheet selection using `gid`. That does not prove CSV-fetch behavior inside a deployed Penpot plugin.

The preferred transport is a browser fetch of a canonical Google CSV export endpoint derived from the normal share link. Treat the endpoint and browser cross-origin behavior as assumptions to verify, not a supported contract already proven by this plan.

Use a disposable sheet with Anyone with the link → Viewer. Verify reading without an existing Google login, from an isolated HTTPS-hosted test build inside Penpot (same hosting conditions as GitHub Pages; do not replace the production plugin with a spike). Also test localhost. Check redirects, browser cross-origin rules, viewer download restrictions, explicit nonfirst worksheet selection, an invalid gid that must not fall back to another tab, and cell fidelity.

If the export path is blocked, investigate Google's documented Visualization datasource route only if it preserves all relevant cells as strings and works through fetch. Query routes can infer column types and omit mixed-type values; successful network access alone is not sufficient. Do not add script injection/JSONP, no-cors fetch, a third-party proxy, or weakened browser protections as a shortcut.

If neither reader meets the normal-link requirement, record the evidence and revise the plan with the user before expanding scope to OAuth or a backend. Do not silently require Publish to web instead of the requested share link.

Network boundary requirements:

- Accept HTTPS, exact docs.google.com host, known normal spreadsheet path, a valid spreadsheet ID and nonnegative numeric `gid`; reject credentials, explicit ports, and unrelated paths. A missing gid prompts worksheet selection; it is not a claim that the spreadsheet URL is invalid.
- Prefer a route that works with fetch redirect: error. If Google-managed redirects are necessary, the gate must document browser-managed following, credential omission, and a narrow final-response URL allowlist. Browser fetch cannot inspect/approve every intermediate redirect; do not claim that protection. Never accept a pasted non-Google export endpoint.
- Extract `gid` from query or fragment; reject conflicting values. Ignore unrelated copied UI parameters and derive a clean canonical URL.
- Published `/d/e/...` links are outside this first version; explain which normal worksheet link to copy.
- Fetch with credentials omitted and cache: no-store. Store no Google token, cookie, or API key. Google-side caching may still delay visibility; do not promise an authoritative latest revision.
- Use timeout/cancellation and a streamed 2 MiB limit measured as bytes yielded by the response body. Keep the deadline active through body completion, including a body that stalls after headers. Abort/cancel the reader on overflow or cancellation. Do not rely only on Content-Length or the post-download CSV parser limit. Enforce record/column caps during parsing too.
- Reject HTTP errors, login/permission HTML, malformed/non-UTF-8 data, and mismatched response types before preview.
- Construct requests from normalized identifiers; do not fetch arbitrary pasted URLs.
- Do not forward Penpot card data, filenames, or artwork to Google. Send only the read request needed for the linked worksheet.
- Permission error copy explains Anyone with the link → Viewer. Generic network failures must not claim the sheet is private when the browser cannot distinguish the cause.
- Permission loss, missing/deleted worksheet, and offline failures retain the last applied cards and link. Retry is explicit; no polling or hidden retries.
- The link is saved in the Penpot page and readable by file collaborators. Explain this in Help.

## 7. Implementation sequence

### Milestone 0 — Prove normal-link reads

Run the transport spike against a disposable shared worksheet. Record the chosen route, fidelity checks, and actual browser results in this document. No full feature work until this gate passes.

#### Transport evidence — October 5, 2026

**Local access check passed; the complete release gate remains open.** Tested the user's shared test workbook without changing its cells or the Penpot deck. The workbook link and exported card data were held only in temporary local files, not committed to this repository.

| Check | Observed result |
| --- | --- |
| Anonymous export | `/spreadsheets/d/{id}/export?format=csv&gid={gid}` returned CSV without cookies or Google sign-in |
| Google redirect | Initial response was HTTP 307 to `doc-0s-7g-sheets.googleusercontent.com`; final response HTTP 200, text/csv |
| Browser access | Explicit credentials:omit and cache:no-store succeeded from localhost and from the local test plugin iframe inside the user's HTTPS Penpot deployment |
| Browser origin policy | Initial response allowed the localhost origin; final response allowed any origin. Blocking redirects caused fetch to fail, so this route requires the documented Google-managed follow policy |
| Main worksheet | 54 records, 16 columns, 11,476 response bytes; all parsed headers and cells matched a separately downloaded anonymous CSV baseline |
| Nonfirst worksheet | The selected spade tab returned 13 records, 14 columns, 2,465 bytes; all headers and cells matched its own anonymous baseline |
| Invalid worksheet | An invented gid returned HTTP 400 in both anonymous HTTP and the Penpot iframe test; it did not fall back to another tab |
| Normal link without gid | Google opened the workbook at a specific tab in its editor. This supplied link itself omitted gid; production setup still needs the selected worksheet address, as described in §2 |
| Import compatibility | The main tab's Card column can be explicitly mapped to Card ID; the spade tab already includes card_id and quantity. Template and Artwork mapping were not applied during the transport test |
| Cleanup | Temporary zero-permission test plugin was removed after testing. No production plugin code was changed |

This proves anonymous local browser access and explicit tab selection for this workbook. Comparison against Google's anonymous CSV export does not independently prove original cell-format fidelity. Still required: controlled formatting fixtures (`001`, minority mixed-type cells, multiline/quoted/formula results and invalid headers), viewer download restrictions/revocation, repeat-read freshness, cancellation/stream limits, and an isolated HTTPS-hosted reader check. Do not label the entire Milestone 0 gate complete from these results alone.

#### Reader loop — October 5, 2026

Completed the standalone reader portion of Milestone 2 before source/UI integration:

- `src/google-sheet-link.ts` validates normal links, preserves explicit worksheet selection, and derives canonical Google-only request URLs. Missing gid produces a specific worksheet instruction without fetching.
- `src/google-sheets.ts` reads anonymously with cache disabled, follows the required Google export redirect, validates the final host and CSV response type, and returns string cells. Reads have an abortable 20-second default deadline, fatal UTF-8 decoding, and a streamed 2 MiB cap.
- `src/csv.ts` now enforces the 100-column cap while parsing every row, alongside its existing byte and 500-record caps. Quantity, total-copy, card-ID, and artwork validation still belong to the existing import preview; the reader does not apply a deck.
- 83 offline reader tests cover canonical links, malformed URLs, permissions/status failures, redirects, cell fidelity, exact byte boundaries, malformed encoding/CSV, cancellation, stalled bodies, and continuously ready streams. The complete build and regression suite passes 221 tests.
- Two independent reviews covered transport/security and data/parser behavior. Both identified no remaining reader findings after fixes: valid HTML-like CSV headers now survive, and a monotonic deadline prevents ready stream chunks from starving the timeout timer.
- A temporary read-only harness ran the actual reader in Chrome, then inside a localhost plugin iframe in the deployed HTTPS Penpot workspace. The selected worksheet returned 13 records, 14 columns, and 2,465 bytes; all headers/cells matched the anonymous export baseline. The normal link without gid produced the worksheet instruction; an invented gid produced the expected HTTP error without falling back. No card data was applied.

HTML response types and HTML-prefixed bodies that fail CSV parsing are rejected. A body mislabeled as CSV can also be syntactically valid CSV; tag-like cells remain inert text. Require valid card-ID mapping before any preview can be applied rather than discarding valid user headers through HTML heuristics.

This completes the reader implementation loop, not the full integration or release gate. Controlled Google formatting, sharing revocation/download restrictions, Google-side freshness, and the isolated HTTPS-hosted reader still need live checks before release. Temporary test assets and the zero-permission test plugin are removed after verification; the user's workbook link and contents are not committed.

### Milestone 1 — Source model and transactions

- Add `src/deck-source.ts`: typed persisted source, runtime validation, canonical link parser, read/write helpers, source authority checks. Extend `src/deck-session.ts` with the non-restorable operation/source epoch.
- Extend `src/csv-import.ts`: source-aware pending preview, validated versioned snapshots with legacy compatibility, best-effort rollback/recovery, restore, unchanged-import handling, and typed apply acknowledgement.
- Extend controller messages in `src/model.ts` and `src/plugin.ts` with typed Sheet operations and guarded source status.
- Add source/status loading and authority enforcement to every card-data write path, including asynchronous image assignment, and to generation/PDF requests. Update `src/front-output.ts` where PDF freshness checks need the new context. Extend the PDF operation acknowledgement/lock across iframe assembly.
- Add the transaction, authority, cancellation, and unchanged-output tests before wiring the new Sheet UI.

### Milestone 2 — Reader and preview reuse

- Add `src/google-sheets.ts`: verified URL construction, bounded fetch, decoding, error classification, injectable transport for tests.
- Add `src/sheets-ui.ts`: draft connection and request state, cancellation, Pull Latest, Change Link, Disconnect, source summaries.
- Expose a reusable preview entry point from `src/csv-ui.ts`; share mapping/artwork validation and Apply with CSV. Extend ImportPreview with full change IDs and an order-change indicator.
- Bind Sheet previews to host-issued page/session/source context, not a page binding recaptured after a network await.
- Do not rewrite unrelated generation, quantity, or artwork matching code.

### Milestone 3 — Edit Deck mode

- Update `index.html`, `src/main.ts`, and `src/style.css` with local/linked actions and read-only rows.
- Keep shared secondary controls usable. Ensure artwork uploads do not imply card-value editing.
- Keyboard labels, loading announcements, predictable focus after Cancel/Apply/Disconnect, readable errors, and dark/light theme support.
- Verify toolbar and preview at 840 × 650 px, long links, and decks with hundreds of rows.

### Milestone 4 — Documentation and release

- Update the in-plugin Help and README for connection setup, permissions, source authority, identifiers, pull/apply, worksheet selection, link changes, disconnect, and Restore Previous State's one-snapshot limit.
- Explain images stay in Penpot Artwork and Google changes do not update output until Pull/Apply/Generate.
- Replace Help's current “direct Sheets connection is not available” text.
- Update manifest description if warranted; keep manifest schema version 2 and existing permissions unless the proven transport requires an explicit supported permission.
- Build and run npm test. Validate a production build in Penpot. Release only after feature checks pass.

## 8. Test and acceptance matrix

| Area | Required evidence |
| --- | --- |
| Share link | Normal worksheet links with query/fragment gid; valid share link without gid gets a specific worksheet instruction; reject wrong hosts, credential URLs, malformed IDs, conflicting gids, and published-link format |
| Permissions | Anonymous readable sheet; restricted sheet; download disabled; deleted sheet/tab; permission revoked after connection |
| Fidelity | Every cell and original header preserved; Plain-text 001; minority mixed-type cells; formulas as displayed values; blank/duplicate headers rejected; blank cells; commas/quotes; Unicode; multiline content; invalid gid cannot fall back |
| Freshness | Read → edit → read, read → permission revoke → read; no browser cached body; read timestamp does not claim latest Google revision |
| Limits | Streamed size limit without Content-Length; body stalls after headers; cancellation aborts reader; malformed UTF-8/CSV; early row/column, quantity, and total-copy limits |
| Identity | Page A → B; A → B → A; Change Link mid-request; two pulls completing out of order; Disconnect during fetch; Restore during fetch; disconnect/reconnect with same link; stale apply token |
| Authority | Linked rows cannot be saved/duplicated/deleted/reassigned through UI or controller messages; late local image upload cannot mutate a linked card; stale generation/PDF requests rejected; rejected optimistic edits reload authoritative values |
| Apply | Cancellation preserves cards/link but keeps uploaded artwork; valid Apply saves cards + connection; inject each setter failing before/after its effect, including recovery-record preparation/commit/cleanup; abort if durable prior record cannot be verified; attempt all rollback keys; incomplete recovery blocks mutations after reopening; nonblank unmatched artwork blocks Apply |
| Change Link | Failure/Cancel preserves old link and cards; success replaces both; changing tab resets mapping; equivalent URL retains mapping |
| Restore | Review exposes destination authority/link; restore local ↔ linked; restore previous link; recognized legacy backup compatibility; incomplete/unknown envelope versions and corrupt nested backup/source/settings cause no partial writes; one-step disconnect recovery; no-op refresh preserves prior meaningful backup |
| No changes | Unchanged Apply updates Last applied without making current output/PDF stale; remapped, reordered, or changed cards invalidate output; source-only transition changes mode without rerendering identical cards |
| PDF race | Source changes during controller render and iframe assembly cancel stale download; mutations blocked across both phases; completion/cancel acknowledges operation ID; stale ack cannot release newer lock; page/closure/abandoned-operation cleanup; metadata-only refresh does not cancel identical output |
| UI | Local toolbar has three entry actions; linked toolbar Open Sheet/Pull Latest; Change Link and Disconnect accessible; 840 px layout; keyboard and both themes |
| Regression | Existing CSV import/export, snapshots, artwork uploads, manual rows, quantities, card sizes, all generation modes, and PDF cancellation still pass |

No automated test should read a user's real Google Sheet. Stub network cases in unit tests; use a deliberately shared disposable sheet for live verification. Check Tilt before browser testing; reuse its service when it manages this project.

## 9. Risks and decisions still to prove

- Local browser CSV reads are proven for the shared test workbook, including the Penpot iframe. Controlled fidelity/permissions cases and an isolated HTTPS-hosted reader remain unverified.
- Worksheet visibility/download policy can block reads even if the user can open the file while signed in.
- Multi-user edits can race between a snapshot check and writes; document the supported optimistic-concurrency behavior and never claim a database-level transaction that Penpot does not expose.
- The first release intentionally blocks an empty source rather than treating it as a request to delete every card.
- No picker listing every worksheet: use the selected tab link, preserving gid. This keeps the initial release small.

## 10. Adversarial review record

Three independent reviewers examined the draft. No feature code changed during review. The following corrections are now requirements of this plan.

| Lens | Finding | Resolution |
| --- | --- | --- |
| UX — High | Share → Copy link can omit gid, conflicting with setup instructions | Recognize valid spreadsheet links; request the selected tab's browser address inline and offer Open Sheet (§2) |
| UX — High | Five samples cannot identify off-screen removals | Expandable full change-ID lists; distinguish order changes (§2) |
| UX — Medium | Header-only sheet cannot establish initial connection | Keep the deliberate restriction; tell users to add one card first (§3) |
| UX — Medium | Plain text format cannot be verified by CSV | Recommend formatting; validate actual received ID strings (§3) |
| UX — Medium | Cancel's effect on artwork uploads is unspecified | Uploaded artwork remains; disclose beside upload action (§3) |
| UX — Medium | Restore can unexpectedly reconnect and lock rows | Preview target mode/link; name Restore Previous State and explain its one-snapshot scope (§2, §5) |
| Transport — High | Browser fetch cannot approve every redirect hop | Prefer redirect:error; document any required browser-follow policy and final URL checks (§6) |
| Data fidelity — High, conditional | Visualization fallback can infer headers or null minority-type cells | Compare every cell and original header; reject any lossy reader (§3, §6) |
| Transport — Medium | Pull Latest could reuse browser cached data | cache:no-store; edit/revoke/read tests; do not promise Google-side freshness (§6, §8) |
| Transport — Medium | Header arrival could end timeout too early | Deadline through full body; streaming caps and cancellation (§6) |
| State — High | Generation trusts stale request cards and can clear stale status | Enforce linked authority for generation/PDF, using persisted data and current source context (§5) |
| Recovery — High | Restore can write invalid cards/settings before validating | Validate a complete versioned envelope before writes; support only recognized legacy shapes (§5) |
| Recovery — High | Rollback itself can fail, leaving partial state | Verify durable prior record before destructive writes; attempt all restores; retain/reconcile records across reopening; block mutations on incomplete recovery (§5) |
| Output — Medium | Existing Apply/OUTPUT_SETTINGS handlers invalidate identical PDFs | Typed output/source/metadata change acknowledgements; no-op handling in both paths (§5) |
| Output — Medium | Host PDF lock ends before iframe PDF assembly | Operation-ID completion/cancel acknowledgements and cleanup across both phases (§5) |
| Concurrency — Medium | Cancel/Restore can leave live tokens or revive old requests | Non-restorable host epoch; invalidate tokens and fetches on all source transitions (§4) |

**Review outcome:** Product and implementation contracts are ready to guide Milestone 0. Network feasibility remains unverified and must pass the explicit gate before building the full feature. The accepted first-release restrictions are shared Viewer access, an explicit worksheet tab, at least one card row, read-only linked rows, one recovery snapshot, and manual pulls.

**Second pass:** UX and transport reviewers confirmed their findings resolved. The state reviewer accepted the other amended contracts and requested durable recovery-record verification before any destructive write. This final correction is included in §5 and its failure tests.

## Sources

- [Google: Sheets as a datasource and anonymous link-shared reads](https://developers.google.com/chart/interactive/docs/spreadsheets): sharing requirement and worksheet selection; not proof of CSV export transport.
- [Google: sharing files](https://support.google.com/docs/answer/2494822): Viewer permissions and download/copy restrictions.
- [Google: publishing to the web](https://support.google.com/docs/answer/183965): a different workflow from the normal share link requested here.
- [Google: datasource protocol](https://developers.google.com/chart/interactive/docs/dev/implementing_data_source): CSV response format; not a guarantee of cell fidelity for a typed query reader.
- [Google: QUERY cell typing](https://support.google.com/docs/answer/3093343): mixed-type minority values can become null in query processing.
- [Fetch standard](https://fetch.spec.whatwg.org/): redirect and cache behavior.
- [Penpot: plugin architecture and manifests](https://help.penpot.app/plugins/getting-started/): iframe communication and permission model.
