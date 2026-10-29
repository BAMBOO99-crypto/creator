# VI-007 — News briefing prototype (offline and review-only)

Source video (NOT watched): https://www.tiktok.com/@aiwithhammad2026/video/7681008618967272725

**Provenance:** Public web index snippet only, not activity on either personalized TikTok account. The snippet describes an n8n daily news reading workflow with Google Sheets; the specific video workflow and performance are unverified.

## First-party capability evidence
- n8n RSS Read node: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.rssfeedread
- n8n Google Sheets node: https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets
The two nodes exist. This does not prove the video was watched, that this creator used the claimed implementation, or that these services are connected to this repository.

## Implemented workflow
A deterministic, **offline** RSS metadata adapter in `scripts/news-brief.mjs`. It accepts exported n8n RSS Read JSON (array of objects or `{json:{...}}` envelopes) and prints an unverified-headline review brief. It filters missing/invalid/future/stale records, rejects non-HTTPS and embedded-credential URLs, deduplicates common tracking variants, escapes untrusted Markdown and limits outputs. It makes **no** network calls, does not open the linked articles, does not summarize unseen content, and has no credentials, webhooks, scheduled actions or automatic sending.

## Reproduce
```sh
npm test
npm run brief
# Or provide your own public RSS Read JSON export:
node scripts/news-brief.mjs path/to/rss-items.json --now 2026-10-29T12:00:00Z --hours 72 --limit 5
```

Example source items are explicitly fictional and live under `examples/rss-items.json`.

## Verification and remaining gaps
Local Node 22 test run on 2026-10-29: seven unit tests passed and the CLI generated two synthetic headlines, skipping one stale item. GitHub CI re-checks the committed branch after the PR opens. No live RSS fetch, no n8n workspace, no Google Sheets OAuth, no Claude/Grok connection and no personalized TikTok access were exercised. For eventual live use, separately approve n8n account access, feed selection, privacy/data retention and costs. The next step is to add a consented public feed input, then review quality before scheduling.
