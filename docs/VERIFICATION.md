# MVP verification

Checks recorded on 29 October 2026. No external TikTok observation, private Sheet data, credential or live AI integration was used.

## Automated checks

All **17 tests passed**, with zero skipped, using Node 24.19.0. Node's built-in test suite covers:

- Canonical URLs, tracking removal and duplicate video IDs across handles.
- Short links, spoofed hosts, credentials, ports, encoded paths and unsupported URLs.
- Separate discovery channels and compatible discovery surfaces.
- Approval prerequisites, high-risk blocks and strict boolean checks.
- Approved-source task creation and test evidence required for Done.
- Source edits and revoked approval blocking tasks while preserving notes.
- Export/import roundtrips, fresh-review resets, safe deduplication and task reference remapping.
- Schema, size/count limits, duplicate IDs, orphan tasks and unexpected fields.
- Valid saved-state roundtrips, invalid-state rejection and future-dated records.
- Actual loopback HTTP requests for asset allowlisting, JavaScript MIME, security headers, read-only methods and path traversal rejection.

## Browser checks

The local app was exercised in the Codex in-app browser at a 338 px viewport using clearly labeled fictional records:

- Captured a discovery from a mobile TikTok URL with tracking; the displayed link was canonicalized.
- Saved a complete review; high risk and an unchecked rights box each produced an approval error.
- Created a build task, rejected Done without test evidence, then saved Done with evidence.
- Reloaded the page and confirmed records, approvals, completed status and evidence persisted.
- Revoked source approval and confirmed the completed task moved to Blocked.
- Rejected malformed JSON without changing the workspace.
- Previewed and merged a fictional approved/completed backup; its discovery became Needs review and its task was blocked.
- Downloaded a JSON backup and parsed the downloaded file: schema version 1, two fictional discoveries and two fictional tasks.
- Selected that downloaded file through the file-import control and confirmed the preview showed two duplicates, zero new discoveries and zero new tasks.
- Reset the local workspace after backing up the fictional QA records, then confirmed the starting workspace was empty.
- Confirmed the page width matched the 338 px viewport with no horizontal page overflow.

The scripted checks validate the model and server. Browser observations validate the exercised flow. Neither independently validates a user's source statements, rights assessments or test results.

## Pack Studio follow-up

The follow-up adds a manual production editor for the six-slide, five-caption and newsletter pilot. All 35 combined tests passed, with zero skipped. The editor's 18 model tests cover strict shape and size limits, live-count rules, missing fields, source review gates, sanitized JSON, import check resets and inert hostile text in draft exports. The server test also checks its four public assets are served.

Browser-tested on desktop with the fictional Harbor Studio example: 6/5/1 completion, readiness after both source checks, reload persistence, a 46-word slide failing the 45-word limit, checks clearing after edits, a downloaded JSON backup, confirmed file-import replacement resetting review, and actual editable-text/review-HTML downloads. The downloaded HTML contains the fictional label and no script tags. The desktop page had no horizontal overflow. The browser console showed no errors during the exercised flow.

The new editor's mobile layout, native print output, quota/corrupt-storage paths and simultaneous editing tabs were not browser-tested. Open one editing tab. The HTML export is a draft layout; no PDF or image export was verified. No time savings, buyer demand, payment or earnings were established.

## Remaining limits

No hosted deployment, physical iPhone/Android, external-source reachability, storage-quota failure, malformed-storage recovery, multi-tab race or offline cold start was browser-tested. Storage warnings, recovery and conflict protection are implemented but should not be described as independently browser-verified. No live TikTok or AI automation exists in this MVP.
