# AI Command Center

A local-first, review-driven dashboard for organizing AI discoveries and safe software experiments.

## Project status
Early MVP. This repository contains **no TikTok session cookies, API keys, personal calendar/email data, or private Google Sheet contents**. The GitHub repository was public when development started.

## Intended features
- Separate discovery labels for Personal / Business, AI Research, and Public web index
- TikTok canonical-link intake, source provenance and duplicate rejection
- Evidence review before moving a claim into the build queue
- Explicit risk/approval gates and test evidence for completed tasks
- Locally stored changes with JSON export/import for backup

## Boundaries
This app does **not** sign in to TikTok, read personalized For You feeds, sync Google Sheets, call ChatGPT/Claude/Grok APIs, deploy changes, or run code on a user's machine. Those require separately authorized integrations and testing. Never put secrets into client-side JavaScript or commit credentials to this repository.

## Run locally
After the MVP files are added, open `index.html` from a static web server (e.g. `python3 -m http.server 8080`) and visit `http://localhost:8080`. The core uses native browser ES modules and no external JavaScript packages.

## Development
Run `npm test` (Node 20+) to test normalization, duplicate handling, review gates and task completion rules.
