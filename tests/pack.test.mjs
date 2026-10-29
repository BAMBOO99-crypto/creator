import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyPack, validatePack, packIssues, countWords, exportPack,
  loadPack, importPack, renderReviewHTML, exportPackText,
} from '../pack-core.mjs';

const words = length => Array.from({ length }, () => 'word').join(' ');
function completePack() {
  const pack = emptyPack();
  pack.title = 'A calmer desk: fictional pilot';
  pack.brand = 'Example Desk Studio (fictional)';
  pack.sourceReference = 'Synthetic rehearsal brief written for this local test. No real source.';
  pack.sourceText = 'Fictional brief: suggest clearing a desk and choosing a small place for everyday items. No real product or performance claims.';
  pack.slides = Array.from({ length: 6 }, (_, index) => ({
    title: `A fictional desk idea ${index + 1}`,
    body: 'Choose one small area. Clear the objects you do not use and return the essentials to a place you can find.',
  }));
  pack.captions = Array.from({ length: 5 }, (_, index) => `Fictional example ${index + 1}: choose a small desk change and try it for yourself.`);
  pack.newsletter = { subject: 'A fictional desk reset', body: 'This is a fictional rehearsal. Choose a small area of your desk, sort what is useful and decide where everyday items should go. Adapt the idea to your space.' };
  pack.checks = { permission: true, facts: true };
  return pack;
}

test('emptyPack has complete independent 6/5/1 draft shape', () => {
  const pack = emptyPack();
  assert.equal(pack.packVersion, 1);
  assert.equal(pack.fictional, true);
  assert.equal(pack.slides.length, 6);
  assert.equal(pack.captions.length, 5);
  assert.deepEqual(pack.checks, { permission: false, facts: false });
  pack.slides[0].title = 'Changed';
  assert.equal(pack.slides[1].title, '');
  assert.equal(emptyPack().slides[0].title, '');
  assert.deepEqual(validatePack(emptyPack()), emptyPack());
});

test('strict schema rejects missing fields, wrong versions and wrong nested types', () => {
  for (const value of [null, [], {}, 'pack', { ...emptyPack(), packVersion: '1' }, { ...emptyPack(), packVersion: 2 }]) {
    assert.throws(() => validatePack(value));
  }
  for (const key of Object.keys(emptyPack())) {
    const pack = emptyPack();
    delete pack[key];
    assert.throws(() => validatePack(pack), undefined, key);
  }
  for (const value of [1, null, {}, false]) {
    assert.throws(() => validatePack({ ...emptyPack(), title: value }));
  }
  for (const value of ['true', 1, null]) {
    assert.throws(() => validatePack({ ...emptyPack(), fictional: value }));
    assert.throws(() => validatePack({ ...emptyPack(), checks: { permission: value, facts: false } }));
  }
  assert.throws(() => validatePack({ ...emptyPack(), newsletter: [] }));
  assert.throws(() => validatePack({ ...emptyPack(), checks: { permission: false } }));
  assert.throws(() => validatePack({ ...emptyPack(), newsletter: { subject: '' } }));
});

test('exact array counts and entry shapes are required', () => {
  for (const count of [0, 5, 7]) {
    assert.throws(() => validatePack({ ...emptyPack(), slides: Array.from({ length: count }, () => ({ title: '', body: '' })) }));
  }
  for (const count of [0, 4, 6]) {
    assert.throws(() => validatePack({ ...emptyPack(), captions: Array(count).fill('') }));
  }
  assert.throws(() => validatePack({ ...emptyPack(), slides: Array(6) }));
  assert.throws(() => validatePack({ ...emptyPack(), captions: Array(5) }));
  const pack = emptyPack();
  pack.slides[1] = { title: '' };
  assert.throws(() => validatePack(pack));
  pack.slides[1] = { title: '', body: 0 };
  assert.throws(() => validatePack(pack));
  pack.slides[1] = { title: '', body: '' };
  pack.captions[1] = null;
  assert.throws(() => validatePack(pack));
});

test('allowlist copying strips unknown and prototype payload fields without mutating input', () => {
  const input = JSON.parse(exportPack(completePack()));
  input.secret = 'discard';
  input.slides[0].html = '<script>discard</script>';
  input.newsletter.url = 'https://example.invalid';
  input.checks.clientApproved = true;
  Object.defineProperty(input, '__proto__', { value: { injected: true }, enumerable: true });
  const result = validatePack(input);
  assert.deepEqual(Object.keys(result), Object.keys(emptyPack()));
  assert.deepEqual(Object.keys(result.slides[0]), ['title', 'body']);
  assert.deepEqual(Object.keys(result.newsletter), ['subject', 'body']);
  assert.deepEqual(Object.keys(result.checks), ['permission', 'facts']);
  assert.equal(result.injected, undefined);
  assert.equal(Object.hasOwn(result, '__proto__'), false);
  assert.equal(input.secret, 'discard');
  result.slides[0].title = 'New';
  assert.notEqual(result.slides[0].title, input.slides[0].title);
});

test('all hard character limits reject overflow and accept the exact boundary', () => {
  const cases = [
    ['title', 200], ['brand', 200], ['sourceReference', 2000], ['sourceText', 20000],
    ['slides.0.title', 500], ['slides.0.body', 3000], ['captions.0', 6000],
    ['newsletter.subject', 500], ['newsletter.body', 10000],
  ];
  function set(pack, path, value) {
    const parts = path.split('.');
    const last = parts.pop();
    parts.reduce((value, key) => value[key], pack)[last] = value;
  }
  for (const [path, limit] of cases) {
    const pack = emptyPack();
    set(pack, path, 'x'.repeat(limit));
    assert.doesNotThrow(() => validatePack(pack), path);
    set(pack, path, 'x'.repeat(limit + 1));
    assert.throws(() => validatePack(pack), RangeError, path);
  }
});

test('control characters are rejected while useful whitespace and Unicode are preserved', () => {
  for (const control of ['\u0000', '\u0008', '\u000b', '\u000c', '\u001f', '\u007f', '\u0085', '\u202e', '\u2067']) {
    assert.throws(() => validatePack({ ...emptyPack(), title: `before${control}after` }));
  }
  const pack = emptyPack();
  pack.sourceText = 'Useful\tspaces\r\nCafé — 你好 🌱';
  assert.equal(validatePack(pack).sourceText, pack.sourceText);
});

test('word counting handles whitespace, Unicode and punctuation consistently', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords(' \n\t '), 0);
  assert.equal(countWords('One\ttwo\nthree'), 3);
  assert.equal(countWords('Café 你好 123'), 3);
  assert.equal(countWords('Keep — this, useful.'), 3);
  assert.equal(countWords('one-two'), 1);
  assert.throws(() => countWords(1), TypeError);
});

test('empty draft reports every field and both human review gates', () => {
  const issues = packIssues(emptyPack());
  assert.equal(issues.length, 25);
  for (const label of ['Pack title', 'Brand', 'Source reference', 'Source text', 'Slide 6 body', 'Caption 5', 'Newsletter body', 'Permission', 'Facts']) {
    assert.ok(issues.some(issue => issue.startsWith(label)), label);
  }
});

test('complete fictional 6/5/1 rehearsal passes without requiring real business data', () => {
  const pack = completePack();
  const before = JSON.stringify(pack);
  assert.deepEqual(packIssues(pack), []);
  assert.equal(JSON.stringify(pack), before);
  const html = renderReviewHTML(pack);
  const text = exportPackText(pack);
  assert.match(html, /DRAFT — Ready for client review/);
  assert.match(html, /FICTIONAL SAMPLE/);
  assert.match(html, /0 outstanding issues/);
  assert.match(text, /Status: Ready for client review/);
  assert.match(text, /Outstanding issues: 0/);
  assert.doesNotMatch(html + text, /client approved/i);
});

test('all editorial word limits are inclusive and exceeding them remains exportable as a draft', () => {
  const cases = [
    ['slides', 'title', 12], ['slides', 'body', 45], ['captions', null, 80],
    ['newsletter', 'subject', 16], ['newsletter', 'body', 180],
  ];
  for (const [group, key, limit] of cases) {
    const pack = completePack();
    const target = group === 'slides' ? pack.slides[0] : pack[group];
    if (group === 'captions') target[0] = words(limit);
    else target[key] = words(limit);
    assert.deepEqual(packIssues(pack), [], `${group}.${key} boundary`);
    if (group === 'captions') target[0] = words(limit + 1);
    else target[key] = words(limit + 1);
    assert.equal(packIssues(pack).length, 1);
    assert.match(packIssues(pack)[0], new RegExp(`exceeds ${limit} words`));
    assert.doesNotThrow(() => exportPack(pack));
    assert.match(renderReviewHTML(pack), /DRAFT — Incomplete — 1 outstanding issue/);
    assert.match(exportPackText(pack), /Outstanding issues: 1/);
  }
});

test('false permission or facts checks each independently block readiness, including fictional samples', () => {
  for (const field of ['permission', 'facts']) {
    const pack = completePack();
    pack.checks[field] = false;
    assert.equal(packIssues(pack).length, 1);
    assert.doesNotMatch(renderReviewHTML(pack), /Ready for client review/);
  }
  const pack = completePack();
  pack.sourceText = '  \t\n';
  assert.match(packIssues(pack)[0], /Source text is required/);
});

test('local JSON round trip preserves checks and every content field', () => {
  const pack = completePack();
  const serialized = exportPack(pack);
  assert.deepEqual(loadPack(serialized), pack);
  assert.equal(loadPack(serialized).checks.facts, true);
  assert.equal(loadPack(serialized).checks.permission, true);
});

test('external JSON import resets both checks while preserving the source and copy', () => {
  const original = completePack();
  const imported = importPack(exportPack(original));
  assert.deepEqual(imported, { ...original, checks: { permission: false, facts: false } });
  assert.equal(packIssues(imported).length, 2);
  assert.deepEqual(original.checks, { permission: true, facts: true });
});

test('JSON import rejects malformed, non-text, oversized and incomplete input', () => {
  for (const parser of [loadPack, importPack]) {
    for (const value of [null, {}, 'not json', '{}', '[]', '{"packVersion":1}']) assert.throws(() => parser(value));
    assert.throws(() => parser(` ${' '.repeat(1024 * 1024)}{}`), /1 MB/);
    assert.throws(() => parser(JSON.stringify({ padding: '🌱'.repeat(270000) })), /1 MB/);
  }
});

test('HTML export escapes hostile text everywhere and contains no active markup, scripts or network references', () => {
  const hostile = '</script><script>alert("x")</script><!-- <img src="https://evil.invalid/x" onerror="alert(1)"> --> <a href="javascript:alert(1)">click</a> & \'quoted\'';
  const pack = completePack();
  pack.title = hostile;
  pack.brand = hostile;
  pack.sourceReference = hostile;
  pack.sourceText = hostile;
  pack.slides.forEach(slide => { slide.title = hostile; slide.body = hostile; });
  pack.captions.fill(hostile);
  pack.newsletter = { subject: hostile, body: hostile };
  const html = renderReviewHTML(pack);
  assert.doesNotMatch(html, /<(?:script|img|a|iframe|object|embed|form|input|link|base)\b/i);
  assert.doesNotMatch(html, /<!--/);
  const activeMarkup = (html.match(/<[^>]+>/gu) || []).join('\n');
  assert.doesNotMatch(activeMarkup, /\s(?:src|href|onerror|onclick)\s*=/i);
  assert.match(html, /&lt;\/script&gt;&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(html, /&lt;!--/);
  assert.match(html, /&amp; &#39;quoted&#39;/);
  assert.match(html, /default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; form-action 'none'; base-uri 'none'/);
  assert.match(html, /font-family: system-ui/);
  assert.doesNotMatch(html, /@import|url\s*\(/i);
});

test('HTML draft includes six square layouts followed by captions, newsletter and plain source text', () => {
  const pack = completePack();
  pack.sourceReference = 'https://example.invalid/source?not-a-live-link=true';
  const html = renderReviewHTML(pack);
  assert.equal((html.match(/<article class="slide">/g) || []).length, 6);
  assert.equal((html.match(/<article class="caption">/g) || []).length, 5);
  assert.match(html, /aspect-ratio: 1/);
  assert.match(html, /break-after: page/);
  assert.ok(html.lastIndexOf('<article class="slide">') < html.indexOf('<h2>Five editable captions</h2>'));
  assert.ok(html.indexOf('<h2>Five editable captions</h2>') < html.indexOf('<h2>Newsletter draft</h2>'));
  assert.match(html, /https:\/\/example.invalid\/source\?not-a-live-link=true/);
  assert.doesNotMatch(html, /href=/);
});

test('missing content exports are visibly incomplete drafts with truthful counts', () => {
  const html = renderReviewHTML(emptyPack());
  const text = exportPackText(emptyPack());
  for (const output of [html, text]) {
    assert.match(output, /DRAFT/);
    assert.match(output, /FICTIONAL SAMPLE/);
    assert.match(output, /25/);
    assert.match(output, /Missing content/);
    assert.doesNotMatch(output, /Ready for client review/);
  }
  assert.equal((text.match(/SLIDE \d OF 6/g) || []).length, 6);
  assert.equal((text.match(/CAPTION \d OF 5/g) || []).length, 5);
});

test('nonfictional drafts use source-based labels without claiming approval or publication', () => {
  const pack = completePack();
  pack.fictional = false;
  for (const output of [renderReviewHTML(pack), exportPackText(pack)]) {
    assert.match(output, /SOURCE-BASED DRAFT/);
    assert.doesNotMatch(output, /FICTIONAL SAMPLE/);
    assert.match(output, /Ready for client review/);
    assert.doesNotMatch(output, /client approved|has been published/i);
  }
});
