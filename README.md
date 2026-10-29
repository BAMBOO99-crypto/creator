# AI Command Center

A local-first dashboard for turning manual AI discoveries into reviewed software experiments. This is a working, dependency-free static MVP. It starts with an empty workspace.

## Run it

Install Node.js 20 or later, open a terminal in this folder, and run:

```sh
node scripts/serve.mjs
```

Open **http://127.0.0.1:8080**. Keep the terminal running while using the app; press Ctrl+C to stop it. For another port, run `node scripts/serve.mjs 8081`. Browser ES modules require a web server; opening `index.html` directly is unsupported. There is no install or build step. `npm start` is an optional equivalent when npm is available.

## Use the workspace

1. **Capture a discovery.** Paste a full TikTok `/@creator/video/1234567890` HTTPS URL. Record the idea, discovery channel, actual discovery surface, provenance notes and evidence.
2. **Review the evidence.** Open the link yourself. Complete the link, rights, claims and privacy checks, assess risk, and write your decision. Approval requires evidence, all checks, decision notes, and low or medium risk. High risk stays blocked.
3. **Create a build task.** Define a small experiment from an approved discovery. Track To do, In progress, Blocked or Done. Done requires written test evidence. These are user-entered records, not independent proof of testing.
4. **Export a backup.** Download your JSON from the header or Workspace data. Import a file or paste JSON to preview a merge before confirming.

## Content Pack Studio

Open **Build board → Open Pack Studio**, or visit **http://127.0.0.1:8080/pack-studio.html** while the local server runs. The studio supports the proposed six-slide, five-caption and short-newsletter service with a reusable manual editor, source notes, word limits, review checks and draft exports. It formats and checks your entered text; it does not generate AI copy.

The studio has its own browser-local draft and JSON backup, separate from discoveries and tasks. Studio imports replace that draft only after a preview and confirmation, and reset its source/review checks. A fictional sample is provided for rehearsal. Text and review-HTML exports remain marked Draft and require a human decision before use. The review HTML is a printable layout; no PDF file or image export is produced by the app.

Use one editing tab for Pack Studio; its draft storage is not transactional across tabs. Its completion checks are a local writing aid and do not certify that a source or claim is accurate.

This improves delivery preparation. The proposed GBP 35 pilot price, customer demand and delivery-time savings remain unvalidated. No customer has been contacted or charged by this app.

The **Personal / Business**, **AI Research** and **Public web index** channels are separate manual research labels. They do not connect to accounts. Discovery surfaces distinguish For You feed, Saved post, TikTok search, Public web index and Direct link. A public search result cannot be recorded as an account-feed observation through the Public web index channel. Provenance is recorded by you; the app cannot verify that it is truthful.

URL validation checks the address format and deduplicates by TikTok video ID, including across different handles and tracking parameters. It does not check reachability, ownership or the post's contents. Open shortened `vm.tiktok.com` or `vt.tiktok.com` links in your browser and copy the expanded full video URL. Profiles, photo posts and arbitrary websites are outside this MVP.

Editing a discovery resets its review and blocks its linked tasks. Revoking approval also blocks linked tasks, including completed tasks, while preserving their test notes. Reapproval does not automatically resume tasks; update each task when ready.

## Data and backup behavior

- Records stay in browser local storage for this exact origin. A different browser, host name or port has a different workspace. This is not cloud backup or cross-device sync.
- Storage failures are visible; changes remain in memory and can be exported. Unreadable saved data is preserved and can be downloaded before an explicit reset.
- Older tabs refuse to overwrite a workspace changed in another tab. Export unsaved work, then reload before saving. This is a best-effort conflict check; simultaneous writes across tabs are not transactional. Use one editing tab.
- Import is an additive merge. Existing video IDs win. Duplicate imported discoveries and their tasks are skipped. Nothing existing is overwritten. New record IDs are remapped, imported reviews and checks reset, and imported tasks start Blocked. Existing local approvals stay intact.
- Malformed or inconsistent backups are rejected before mutation. Limits: schema version 1, 2 MB of JSON, 500 discoveries and 1,000 tasks. Limits are also enforced on mutations and exports. Unrecognized fields are discarded; orphan tasks, duplicate IDs and forged gate combinations are rejected.
- A reset removes only this app's local storage entry and requires typing `RESET`. Export before resetting. Keep backups private: they contain what you entered.

## Boundaries

This repository contains no session cookies, API keys, private Google Sheet contents or personal calendar/email records. It contains only app source, tests and documentation. The repository is public; do not commit your backups or private information.

The app does **not** sign in to TikTok, read personalized feeds, scrape or automatically discover posts, sync Google Sheets, call ChatGPT/Claude/Grok APIs, verify income, deploy code, run tasks, publish content or schedule work. There is no service worker or offline cold-start support. The preview server must run to load or reload the app.

Review gates guide a local workflow; they are not access-control or a secure multi-user approval system. The browser owner can inspect or alter local data. For sensitive data, a shared device or malicious browser extension is outside this app's protection.

The supplied server binds only to `127.0.0.1`, allows GET/HEAD for an explicit app asset list, and rejects writes and traversal. It does not serve backups, tests, documentation, hidden files or parent folders. A Content Security Policy blocks app network connections; opening a source link is a deliberate browser navigation.

## Verify

```sh
node --test tests/core.test.mjs tests/pack.test.mjs
node --check app.mjs
node --check core.mjs
node --check pack-core.mjs
node --check pack-studio.mjs
node --check scripts/serve.mjs
```

`npm test` and `npm run check` are optional equivalents. Tests use Node's built-in test runner with no third-party packages. See [verification notes](docs/VERIFICATION.md) for the recorded checks and their limits.
