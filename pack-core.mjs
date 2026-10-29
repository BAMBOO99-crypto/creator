const JSON_BYTE_LIMIT = 1024 * 1024;
const INVALID_CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/u;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

/** Create a complete, deliberately blank fictional draft. */
export function emptyPack() {
  return {
    packVersion: 1,
    title: '',
    brand: '',
    sourceReference: '',
    sourceText: '',
    fictional: true,
    slides: Array.from({ length: 6 }, () => ({ title: '', body: '' })),
    captions: Array.from({ length: 5 }, () => ''),
    newsletter: { subject: '', body: '' },
    checks: { permission: false, facts: false },
  };
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  return value;
}

function field(object, key, label) {
  if (!own(object, key)) throw new TypeError(`${label} is missing.`);
  return object[key];
}

function stringField(object, key, maximum, label) {
  const value = field(object, key, label);
  if (typeof value !== 'string') throw new TypeError(`${label} must be text.`);
  if (value.length > maximum) throw new RangeError(`${label} must be ${maximum} characters or fewer.`);
  if (INVALID_CONTROLS.test(value)) throw new TypeError(`${label} contains unsupported control characters.`);
  return value;
}

function booleanField(object, key, label) {
  const value = field(object, key, label);
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be true or false.`);
  return value;
}

function fixedArray(object, key, count, label) {
  const value = field(object, key, label);
  if (!Array.isArray(value) || value.length !== count) {
    throw new TypeError(`${label} must contain exactly ${count} entries.`);
  }
  // Sparse JavaScript arrays are invalid even though JSON cannot represent them.
  for (let index = 0; index < count; index += 1) {
    if (!own(value, index)) throw new TypeError(`${label} is missing entry ${index + 1}.`);
  }
  return value;
}

/** Validate the complete schema and copy only known fields. Editorial limits are review issues. */
export function validatePack(value) {
  const input = record(value, 'Content pack');
  if (field(input, 'packVersion', 'Pack version') !== 1) {
    throw new TypeError('Unsupported pack version; expected 1.');
  }
  const slides = fixedArray(input, 'slides', 6, 'Slides').map((entry, index) => {
    const slide = record(entry, `Slide ${index + 1}`);
    return {
      title: stringField(slide, 'title', 500, `Slide ${index + 1} title`),
      body: stringField(slide, 'body', 3000, `Slide ${index + 1} body`),
    };
  });
  const captions = fixedArray(input, 'captions', 5, 'Captions').map((entry, index) => {
    return stringField({ text: entry }, 'text', 6000, `Caption ${index + 1}`);
  });
  const newsletter = record(field(input, 'newsletter', 'Newsletter'), 'Newsletter');
  const checks = record(field(input, 'checks', 'Review checks'), 'Review checks');
  return {
    packVersion: 1,
    title: stringField(input, 'title', 200, 'Pack title'),
    brand: stringField(input, 'brand', 200, 'Brand'),
    sourceReference: stringField(input, 'sourceReference', 2000, 'Source reference'),
    sourceText: stringField(input, 'sourceText', 20000, 'Source text'),
    fictional: booleanField(input, 'fictional', 'Fictional sample flag'),
    slides,
    captions,
    newsletter: {
      subject: stringField(newsletter, 'subject', 500, 'Newsletter subject'),
      body: stringField(newsletter, 'body', 10000, 'Newsletter body'),
    },
    checks: {
      permission: booleanField(checks, 'permission', 'Permission check'),
      facts: booleanField(checks, 'facts', 'Facts check'),
    },
  };
}

/** Count whitespace-separated words; punctuation alone does not add a word. */
export function countWords(text) {
  if (typeof text !== 'string') throw new TypeError('Word count requires text.');
  return (text.match(/\S+/gu) || []).filter(word => /[\p{L}\p{N}]/u.test(word)).length;
}

/** Return every missing field, word limit, or incomplete review check. */
export function packIssues(value) {
  const pack = validatePack(value);
  const issues = [];
  function required(text, label, wordLimit) {
    if (!text.trim()) issues.push(`${label} is required.`);
    else if (wordLimit !== undefined && countWords(text) > wordLimit) {
      issues.push(`${label} exceeds ${wordLimit} words (${countWords(text)}).`);
    }
  }
  required(pack.title, 'Pack title');
  required(pack.brand, 'Brand');
  required(pack.sourceReference, 'Source reference');
  required(pack.sourceText, 'Source text');
  pack.slides.forEach((slide, index) => {
    required(slide.title, `Slide ${index + 1} title`, 12);
    required(slide.body, `Slide ${index + 1} body`, 45);
  });
  pack.captions.forEach((caption, index) => required(caption, `Caption ${index + 1}`, 80));
  required(pack.newsletter.subject, 'Newsletter subject', 16);
  required(pack.newsletter.body, 'Newsletter body', 180);
  if (!pack.checks.permission) issues.push('Permission and usage rights review is required.');
  if (!pack.checks.facts) issues.push('Facts and claims review is required.');
  return issues;
}

function parsePack(serialized) {
  if (typeof serialized !== 'string') throw new TypeError('Pack backup must be JSON text.');
  if (new TextEncoder().encode(serialized).byteLength > JSON_BYTE_LIMIT) {
    throw new RangeError('Pack backup must be 1 MB or smaller.');
  }
  let value;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new TypeError('Pack backup is not valid JSON.');
  }
  return validatePack(value);
}

/** Export editable data, including current local review checks. */
export function exportPack(value) {
  return JSON.stringify(validatePack(value), null, 2);
}

/** Restore this browser's saved draft without losing its review checks. */
export function loadPack(serialized) {
  return parsePack(serialized);
}

/** An external backup requires a fresh local review before client review. */
export function importPack(serialized) {
  const pack = parsePack(serialized);
  pack.checks = { permission: false, facts: false };
  return pack;
}

function escapeHTML(value) {
  return value.replace(/[&<>"']/gu, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function exportStatus(pack, issues) {
  return {
    type: pack.fictional ? 'FICTIONAL SAMPLE' : 'SOURCE-BASED DRAFT',
    readiness: issues.length ? `Incomplete — ${issues.length} outstanding issue${issues.length === 1 ? '' : 's'}` : 'Ready for client review',
  };
}

/** Export an inert, self-contained HTML review draft that can be opened offline and printed. */
export function renderReviewHTML(value) {
  const pack = validatePack(value);
  const issues = packIssues(pack);
  const status = exportStatus(pack, issues);
  const e = escapeHTML;
  const missing = text => text.trim() ? e(text) : '<span class="missing">[Missing content]</span>';
  const label = `DRAFT · ${status.type}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; form-action 'none'; base-uri 'none'">
<title>${e(pack.title || 'Untitled content pack')} — DRAFT</title>
<style>
@page { size: A4; margin: 16mm; }
* { box-sizing: border-box; }
body { margin: 0; padding: 28px; color: #17222c; background: #f2f4f5; font-family: system-ui; line-height: 1.5; }
main { max-width: 850px; margin: auto; }
h1, h2, h3, p { margin: 0 0 1rem; }
h1, h2, h3 { line-height: 1.15; overflow-wrap: anywhere; }
.cover, .section, .slide { background: #fff; border: 1px solid #d8dfe3; padding: 32px; margin: 0 0 24px; overflow-wrap: anywhere; }
.eyebrow, .footer { color: #455360; font-size: 0.8rem; font-weight: 700; letter-spacing: .06em; }
.eyebrow { margin-bottom: 20px; }
.status { border: 2px solid #ab5d15; padding: 14px; margin: 20px 0; }
.status strong { display: block; }
.slide { width: 100%; aspect-ratio: 1; display: flex; flex-direction: column; justify-content: center; }
.slide h2 { font-size: clamp(1.4rem, 5vw, 2.5rem); }
.slide .copy { font-size: 1.15rem; }
.copy { white-space: pre-wrap; overflow-wrap: anywhere; }
.footer { margin-top: auto; padding-top: 28px; }
.slide .eyebrow { margin-bottom: auto; }
.missing { color: #9a2d1d; font-style: italic; }
.caption { padding: 20px 0; border-bottom: 1px solid #d8dfe3; break-inside: avoid; }
.source { font-size: .9rem; }
li { margin-bottom: .4rem; }
@media (max-width: 500px) { body { padding: 12px; } .cover, .section, .slide { padding: 22px; } .slide { min-height: 360px; } }
@media print {
  body { background: #fff; padding: 0; font-size: 11pt; }
  main { max-width: none; }
  .cover, .section, .slide { margin: 0; padding: 10mm; border-color: #777; }
  .cover { break-after: page; }
  .slide { width: 178mm; height: 178mm; min-height: 0; aspect-ratio: 1; break-inside: avoid; break-after: page; }
  .slide h2 { font-size: 28pt; }
  .slide .copy { font-size: 15pt; }
  .section { break-before: page; }
  .caption { break-inside: avoid; }
}
</style>
</head>
<body><main>
<header class="cover">
<p class="eyebrow">${e(label)}</p>
<h1>${missing(pack.title)}</h1>
<p class="copy">Brand: ${missing(pack.brand)}</p>
<div class="status"><strong>DRAFT — ${e(status.readiness)}</strong><span>${issues.length} outstanding issue${issues.length === 1 ? '' : 's'} · ${e(status.type)}</span></div>
<p>This is a review draft. Client review and any necessary corrections must happen before publication.</p>
${pack.fictional ? '<p><strong>FICTIONAL SAMPLE:</strong> This pack is illustrative. Brand, source material and claims must be treated as fictional sample content.</p>' : '<p>Check the source, permission, facts and final wording before sharing this draft.</p>'}
<p>Permission and usage rights review: ${pack.checks.permission ? 'checked locally' : 'not completed'}. Facts and claims review: ${pack.checks.facts ? 'checked locally' : 'not completed'}.</p>
${issues.length ? `<h2>Outstanding review issues</h2><ul>${issues.map(issue => `<li>${e(issue)}</li>`).join('')}</ul>` : '<p><strong>Ready for client review</strong></p>'}
</header>
${pack.slides.map((slide, index) => `<article class="slide"><p class="eyebrow">${e(pack.brand || 'Brand missing')} · Slide ${index + 1} of 6</p><h2>${missing(slide.title)}</h2><p class="copy">${missing(slide.body)}</p><p class="footer">${e(label)} · ${issues.length} outstanding issue${issues.length === 1 ? '' : 's'}</p></article>`).join('\n')}
<section class="section"><p class="eyebrow">${e(label)}</p><h2>Five editable captions</h2>${pack.captions.map((caption, index) => `<article class="caption"><h3>Caption ${index + 1}</h3><p class="copy">${missing(caption)}</p></article>`).join('')}</section>
<section class="section"><p class="eyebrow">${e(label)}</p><h2>Newsletter draft</h2><h3>Subject</h3><p class="copy">${missing(pack.newsletter.subject)}</p><h3>Body</h3><p class="copy">${missing(pack.newsletter.body)}</p></section>
<section class="section source"><p class="eyebrow">${e(label)}</p><h2>Source and review record</h2><h3>Source reference</h3><p class="copy">${missing(pack.sourceReference)}</p><h3>Source text</h3><p class="copy">${missing(pack.sourceText)}</p><p>Source references are displayed as plain text. This file contains no active source links.</p></section>
</main></body>
</html>`;
}

/** Export plain editable copy. Draft and fictional labels remain visible in every section. */
export function exportPackText(value) {
  const pack = validatePack(value);
  const issues = packIssues(pack);
  const status = exportStatus(pack, issues);
  const label = `DRAFT | ${status.type}`;
  const present = text => text.trim() ? text : '[Missing content]';
  const lines = [
    label,
    `Pack: ${present(pack.title)}`,
    `Brand: ${present(pack.brand)}`,
    `Status: ${status.readiness}`,
    `Outstanding issues: ${issues.length}`,
    'Client review and necessary corrections are required before publication.',
    ...(pack.fictional ? ['FICTIONAL SAMPLE: Brand, source material and claims are illustrative sample content.'] : []),
    `Permission and usage rights review: ${pack.checks.permission ? 'checked locally' : 'not completed'}`,
    `Facts and claims review: ${pack.checks.facts ? 'checked locally' : 'not completed'}`,
    '',
    'OUTSTANDING REVIEW ISSUES',
    ...(issues.length ? issues.map(issue => `- ${issue}`) : ['None. Ready for client review.']),
  ];
  pack.slides.forEach((slide, index) => {
    lines.push('', `${label} | SLIDE ${index + 1} OF 6`, present(slide.title), present(slide.body));
  });
  pack.captions.forEach((caption, index) => {
    lines.push('', `${label} | CAPTION ${index + 1} OF 5`, present(caption));
  });
  lines.push('', `${label} | NEWSLETTER`, `Subject: ${present(pack.newsletter.subject)}`, '', present(pack.newsletter.body));
  lines.push('', `${label} | SOURCE AND REVIEW RECORD`, `Reference: ${present(pack.sourceReference)}`, '', present(pack.sourceText), '');
  return lines.join('\n');
}
