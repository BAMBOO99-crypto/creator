/**
 * Offline, read-only news briefing adapter for n8n RSS Read output.
 * No network requests, API credentials, AI-generated claims, or side effects.
 * All source text is untrusted publisher-provided metadata.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MAX_INPUT_BYTES = 1_000_000;
const MAX_ITEMS = 10_000;

function plain(value, max = 220) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/gi, m => ({
      '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' '
    })[m.toLowerCase()] ?? ' ')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}

function markdownText(value) {
  return plain(value).replace(/([\\`*_{}\[\]()#+.!>|~-])/g, '\\$1');
}

function secureLink(value) {
  if (typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    if (!u.hostname.includes('.') || u.hostname.length > 253) return null;
    return u;
  } catch {
    return null;
  }
}

function dedupKey(url) {
  const u = new URL(url.href);
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_') || ['fbclid', 'gclid'].includes(key.toLowerCase())) {
      u.searchParams.delete(key);
    }
  }
  u.pathname = u.pathname.replace(/\/+$/, '') || '/';
  return u.href;
}

function boundedNumber(value, min, max, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

/** Convert untrusted RSS items to a review-only markdown briefing. */
export function buildBrief(input, options = {}) {
  if (!Array.isArray(input)) throw new TypeError('RSS input must be a JSON array');
  if (input.length > MAX_ITEMS) throw new RangeError('RSS input too large');
  const now = options.now ? new Date(options.now) : new Date();
  if (!Number.isFinite(now.getTime())) throw new RangeError('Invalid now date');
  const hours = boundedNumber(options.hours, 1, 168, 72);
  const limit = boundedNumber(options.limit, 1, 20, 5);
  const cutoff = now.getTime() - hours * 3_600_000;
  const seen = new Set();
  const valid = [];
  const skipped = { invalid: 0, stale: 0, future: 0, duplicate: 0 };

  for (const row of input) {
    const item = row?.json ?? row;
    if (typeof item !== 'object' || item === null) { skipped.invalid++; continue; }
    const title = plain(item.title, 180);
    const url = secureLink(item.link ?? item.url);
    const date = new Date(item.isoDate ?? item.pubDate ?? item.published ?? item.date ?? '');
    if (!title || !url || !Number.isFinite(date.getTime())) { skipped.invalid++; continue; }
    const timestamp = date.getTime();
    if (timestamp > now.getTime()) { skipped.future++; continue; }
    if (timestamp < cutoff) { skipped.stale++; continue; }
    const key = dedupKey(url);
    if (seen.has(key)) { skipped.duplicate++; continue; }
    seen.add(key);
    valid.push({
      title,
      link: url.href,
      date: date.toISOString(),
      source: plain(item.source ?? item.feedTitle ?? url.hostname, 80) || url.hostname,
      snippet: plain(item.contentSnippet ?? item.description ?? item.summary ?? '', 220),
      timestamp,
    });
  }
  valid.sort((a, b) => b.timestamp - a.timestamp || a.title.localeCompare(b.title));
  const items = valid.slice(0, limit);
  const lines = [
    '# Public News Brief — Review Draft',
    '',
    `Generated: ${now.toISOString()} | Window: ${hours} hours | Max articles: ${limit}`,
    '',
    '**Evidence warning:** Headlines and excerpts are unverified RSS publisher metadata, not articles read or independently fact-checked. No AI-generated summaries or personalized news feed access.',
    ''
  ];
  if (items.length === 0) lines.push('No qualifying recent HTTPS headlines were supplied.', '');
  for (const [i, a] of items.entries()) {
    lines.push(`## ${i + 1}. ${markdownText(a.title)}`);
    lines.push(`Source: ${markdownText(a.source)} | Published: ${a.date}`);
    lines.push(`Source link: ${a.link}`);
    if (a.snippet) lines.push(`Publisher excerpt (unverified): ${markdownText(a.snippet)}`);
    lines.push('');
  }
  return {
    markdown: lines.join('\n'),
    items,
    stats: { input: input.length, valid: valid.length, shown: items.length, skipped },
  };
}

function parseFlags(args) {
  if (args.length < 1 || args[0].startsWith('--')) throw new Error('Usage: node scripts/news-brief.mjs <rss-items.json> [--now ISO] [--hours 72] [--limit 5]');
  const options = {};
  for (let i = 1; i < args.length; i += 2) {
    const flag = args[i];
    if (!['--now', '--hours', '--limit'].includes(flag) || !args[i + 1]) throw new Error(`Invalid flag: ${flag}`);
    options[flag.slice(2)] = args[i + 1];
  }
  return { file: args[0], options };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { file, options } = parseFlags(process.argv.slice(2));
    const data = readFileSync(file);
    if (data.length > MAX_INPUT_BYTES) throw new RangeError('Input file exceeds 1 MB');
    const parsed = JSON.parse(data.toString('utf8'));
    const result = buildBrief(parsed, options);
    process.stdout.write(result.markdown + '\n');
    process.stderr.write(`Review-only offline processing: ${JSON.stringify(result.stats)}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 1;
  }
}
