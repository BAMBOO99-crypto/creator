import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import {
  emptyState, normalizeTikTokUrl, addLead, updateLead, reviewLead,
  approvalIssues, createTask, updateTask, exportState, parseImport,
  mergeImport, loadState,
} from '../core.mjs';
import { createStaticServer } from '../scripts/serve.mjs';

const videoId = '7423456789012345678';
const url = `https://www.tiktok.com/@example/video/${videoId}`;
const leadInput = (overrides = {}) => ({
  title: 'Test research idea', url, channel: 'personal', surface: 'fyp',
  sourceNote: 'Manually recorded from the For You feed for a local test.',
  evidence: 'Test fixture only: inspect this source and confirm rights before real use.',
  ...overrides,
});
const checks = (overrides = {}) => ({
  decision: 'approved', risk: 'low', linkChecked: true, rightsChecked: true,
  claimsChecked: true, privacyChecked: true,
  reason: 'Local test: manually reviewed the source, rights, claims, and privacy.',
  ...overrides,
});
function seeded(overrides) {
  const state = addLead(emptyState(), leadInput(overrides));
  return { state, lead: state.leads[0] };
}
function approved(overrides) {
  const seed = seeded(overrides);
  const state = reviewLead(seed.state, seed.lead.id, checks());
  return { state, lead: state.leads[0] };
}
function withTask() {
  const seed = approved();
  const state = createTask(seed.state, seed.lead.id, { title: 'Build a local prototype', notes: 'Use original assets.' });
  return { state, lead: state.leads[0], task: state.tasks[0] };
}
const copy = value => JSON.parse(JSON.stringify(value));

test('normalizes TikTok video URLs and strips tracking', () => {
  assert.deepEqual(normalizeTikTokUrl(`${url}?utm_source=test#detail`), {
    url, videoId, creator: 'example',
  });
});

test('mobile and bare TikTok hosts normalize to one canonical video link', () => {
  for (const host of ['m.tiktok.com', 'tiktok.com']) {
    assert.deepEqual(normalizeTikTokUrl(url.replace('www.tiktok.com', host) + '/?share=fixture'), {
      url, videoId, creator: 'example',
    });
  }
});

test('rejects unsafe, unsupported, ambiguous, or non-video URLs', () => {
  const badUrls = [
    url.replace('https:', 'http:'), 'javascript:alert(1)', 'data:text/html,hello',
    url.replace('www.tiktok.com', 'www.tiktok.com.evil.test'),
    url.replace('www.tiktok.com', 'evil.test'),
    url.replace('https://', 'https://someone:password@'),
    url.replace('www.tiktok.com', 'www.tiktok.com:443'),
    'https://vm.tiktok.com/short-link/', 'https://www.tiktok.com/@example',
    url.replace('/video/', '/photo/'), url.replace('/@example/', '/example/'),
    url.replace('/@example/', '/%40example/'),
    url.replace('/@example/', '/ignored/../@example/'),
    url.replace('/@example/', '/%2e%2e/@example/'),
    url.replace('www.tiktok.com', '%77ww.tiktok.com'),
    `${url}/other`, url.replace('@example', '@exam\nple'),
  ];
  for (const unsafe of badUrls) assert.throws(() => normalizeTikTokUrl(unsafe), undefined, unsafe);
});

test('deduplicates by video ID across handles and tracking parameters', () => {
  const { state } = seeded();
  assert.throws(() => addLead(state, leadInput({ url: `https://www.tiktok.com/@different/video/${videoId}?share=1` })), /duplicate|already/i);
  assert.equal(state.leads.length, 1);
  assert.equal(state.leads[0].url, url);
});

test('requires compatible discovery channel and surface', () => {
  assert.throws(() => addLead(emptyState(), leadInput({ channel: 'web', surface: 'fyp' })));
  assert.throws(() => addLead(emptyState(), leadInput({ channel: 'personal', surface: 'web' })));
  const research = seeded({ channel: 'research', surface: 'search' });
  assert.equal(research.lead.channel, 'research');
  assert.equal(research.lead.surface, 'search');
});

test('approval requires every check, evidence, a reason, and assessed low or medium risk', () => {
  const { state, lead } = seeded();
  assert.ok(approvalIssues(lead).length > 0);
  for (const field of ['linkChecked', 'rightsChecked', 'claimsChecked', 'privacyChecked']) {
    assert.throws(() => reviewLead(state, lead.id, checks({ [field]: false })), undefined, field);
    assert.throws(() => reviewLead(state, lead.id, checks({ [field]: 'true' })), undefined, `${field} must be boolean`);
  }
  for (const risk of ['unassessed', 'high']) assert.throws(() => reviewLead(state, lead.id, checks({ risk })));
  assert.throws(() => reviewLead(state, lead.id, checks({ reason: ' ' })));
  const withoutEvidence = seeded({ evidence: '' });
  assert.throws(() => reviewLead(withoutEvidence.state, withoutEvidence.lead.id, checks()));
  for (const risk of ['low', 'medium']) {
    const reviewed = reviewLead(state, lead.id, checks({ risk }));
    assert.equal(reviewed.leads[0].review.decision, 'approved');
    assert.deepEqual(approvalIssues(reviewed.leads[0]), []);
  }
});

test('build tasks require approved sources and completion needs test evidence', () => {
  const seed = seeded();
  assert.throws(() => createTask(seed.state, seed.lead.id, { title: 'Cannot build yet' }));
  assert.throws(() => createTask(seed.state, 'missing-lead', { title: 'Orphan task' }));
  const { state, task } = withTask();
  assert.equal(task.status, 'todo');
  const doing = updateTask(state, task.id, { status: 'doing' });
  assert.equal(doing.tasks[0].status, 'doing');
  assert.throws(() => updateTask(doing, task.id, { status: 'done', testEvidence: ' ' }));
  const done = updateTask(doing, task.id, { status: 'done', testEvidence: 'Opened local prototype and verified its primary flow.' });
  assert.equal(done.tasks[0].status, 'done');
  assert.ok(done.tasks[0].testEvidence.length > 0);
  assert.equal(state.tasks[0].status, 'todo', 'mutations must preserve prior state');
});

test('source edits and rejection invalidate approval and block existing work', () => {
  const { state, lead, task } = withTask();
  const done = updateTask(state, task.id, { status: 'done', testEvidence: 'Primary local flow checked.' });
  const before = copy(done);
  const edited = updateLead(done, lead.id, { evidence: 'Changed evidence needs a fresh review.' });
  assert.equal(edited.leads[0].review.decision, 'pending');
  assert.equal(edited.tasks[0].status, 'blocked');
  assert.equal(edited.tasks[0].testEvidence, before.tasks[0].testEvidence, 'source edits preserve historical test evidence');
  assert.deepEqual(done, before, 'editing must not mutate the prior reviewed workspace');
  assert.throws(() => updateTask(edited, task.id, { status: 'doing' }));
  const rejected = reviewLead(done, lead.id, checks({ decision: 'rejected', reason: 'Source cannot be used.' }));
  assert.equal(rejected.leads[0].review.decision, 'rejected');
  assert.equal(rejected.tasks[0].status, 'blocked');
  assert.equal(rejected.tasks[0].testEvidence, before.tasks[0].testEvidence, 'rejection preserves historical test evidence');
  assert.deepEqual(done, before, 'review invalidation must not mutate the prior workspace');
});

test('export/import roundtrip resets approvals and blocks imported tasks', () => {
  const { state, task } = withTask();
  const completed = updateTask(state, task.id, { status: 'done', testEvidence: 'Local acceptance flow verified.' });
  const exported = exportState(completed);
  assert.equal(typeof exported, 'string');
  const imported = parseImport(exported);
  assert.equal(imported.schemaVersion, 1);
  assert.equal(imported.leads[0].url, url);
  assert.equal(imported.leads[0].review.decision, 'pending');
  assert.equal(imported.tasks[0].status, 'blocked');
  assert.equal(completed.leads[0].review.decision, 'approved', 'import must not mutate source state');
});

test('import rejects malformed schema, duplicate IDs/videos, orphan references, and fake booleans', () => {
  const { state } = withTask();
  const cases = [null, [], {}, { ...state, schemaVersion: 2 }, { ...state, leads: {} }, { ...state, tasks: 'tasks' }];
  const duplicateLeadId = copy(state);
  duplicateLeadId.leads.push({ ...copy(state.leads[0]), url: 'https://www.tiktok.com/@example/video/7423456789012345679', videoId: '7423456789012345679' });
  cases.push(duplicateLeadId);
  const duplicateVideo = copy(state);
  duplicateVideo.leads.push({ ...copy(state.leads[0]), id: 'another-lead', url: url.replace('@example', '@someone') });
  cases.push(duplicateVideo);
  const duplicateTask = copy(state);
  duplicateTask.tasks.push(copy(state.tasks[0]));
  cases.push(duplicateTask);
  const orphan = copy(state);
  orphan.tasks[0].leadId = 'missing-parent';
  cases.push(orphan);
  const fakeBoolean = copy(state);
  fakeBoolean.leads[0].review.linkChecked = 'false';
  cases.push(fakeBoolean);
  for (const input of cases) assert.throws(() => parseImport(JSON.stringify(input)));
  assert.throws(() => parseImport('{bad json'));
  assert.throws(() => parseImport(' '.repeat(3_000_000)));
});

test('import enforces record count limits before processing the records', () => {
  assert.throws(() => parseImport(JSON.stringify({ schemaVersion: 1, leads: Array(501).fill({}), tasks: [] })), /up to 500 leads/);
  assert.throws(() => parseImport(JSON.stringify({ schemaVersion: 1, leads: [], tasks: Array(1001).fill({}) })), /up to 1000 tasks/);
});

test('import removes unknown fields and prototype payloads at every record level', () => {
  const { state } = withTask();
  const untrusted = copy(state);
  const payload = JSON.parse('{"__proto__":{"commandCenterPolluted":true},"constructor":{"prototype":{"commandCenterPolluted":true}},"prototype":{"commandCenterPolluted":true},"untrustedExtra":{"nested":{"privateFixture":"must not persist"}}}');
  for (const target of [untrusted, untrusted.leads[0], untrusted.leads[0].review, untrusted.tasks[0]]) {
    for (const [key, value] of Object.entries(payload)) {
      Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true });
    }
    assert.equal(Object.hasOwn(target, '__proto__'), true, 'the fixture must include a real own JSON key');
  }
  assert.equal(Object.prototype.commandCenterPolluted, undefined);
  const imported = parseImport(JSON.stringify(untrusted));
  const exported = JSON.parse(exportState(imported));
  for (const clean of [exported, exported.leads[0], exported.leads[0].review, exported.tasks[0]]) {
    for (const key of Object.keys(payload)) assert.equal(Object.hasOwn(clean, key), false, key);
    assert.equal(Object.getPrototypeOf(clean), Object.prototype);
  }
  assert.equal(Object.prototype.commandCenterPolluted, undefined);
  assert.equal({}.commandCenterPolluted, undefined);
  assert.deepEqual(Object.keys(exported).sort(), ['leads', 'schemaVersion', 'tasks']);
  assert.equal(exported.leads[0].title, state.leads[0].title);
  assert.equal(exported.tasks[0].title, state.tasks[0].title);
  assert.equal(exported.leads[0].review.decision, 'pending');
});

test('merge keeps local records and skips tasks for duplicate imported parents', () => {
  const local = withTask();
  const duplicate = withTask();
  const incoming = addLead(duplicate.state, leadInput({ title: 'A new imported lead', url: 'https://www.tiktok.com/@newcreator/video/7423456789012345679' }));
  const newLead = incoming.leads[1];
  const approvedIncoming = reviewLead(incoming, newLead.id, checks());
  const incomingWithTask = createTask(approvedIncoming, newLead.id, { title: 'New imported task' });
  const result = mergeImport(local.state, parseImport(exportState(incomingWithTask)));
  assert.equal(result.added, 1);
  assert.equal(result.duplicates, 1);
  assert.equal(result.tasksAdded, 1);
  assert.equal(result.state.leads.length, 2);
  assert.equal(result.state.tasks.length, 2);
  assert.deepEqual(result.state.leads[0], local.state.leads[0]);
  assert.deepEqual(result.state.tasks[0], local.state.tasks[0]);
  assert.equal(result.state.leads[1].review.decision, 'pending');
  assert.equal(result.state.tasks[1].status, 'blocked');
  assert.equal(result.state.tasks.filter(item => item.leadId === local.lead.id).length, 1);
});

test('local persistence roundtrip retains valid reviews and rejects malformed storage', () => {
  const { state, task } = withTask();
  const completed = updateTask(state, task.id, { status: 'done', testEvidence: 'Local flow passes.' });
  assert.deepEqual(loadState(JSON.stringify(completed)), completed);
  for (const raw of [null, '', '{bad', 'null', '{}', '{"schemaVersion":99,"leads":[],"tasks":[]}']) {
    assert.throws(() => loadState(raw));
  }
});

test('persisted data cannot forge approval, run tasks under unapproved parents, or fake completion', () => {
  const { state, task } = withTask();
  const completed = updateTask(state, task.id, { status: 'done', testEvidence: 'Local flow passes.' });
  const forgedReview = copy(completed);
  forgedReview.leads[0].review.rightsChecked = false;
  assert.throws(() => loadState(JSON.stringify(forgedReview)), /review gates/);
  for (const decision of ['pending', 'rejected']) {
    for (const status of ['todo', 'doing', 'done']) {
      const forgedTask = copy(completed);
      forgedTask.leads[0].review.decision = decision;
      forgedTask.tasks[0].status = status;
      assert.throws(() => loadState(JSON.stringify(forgedTask)), /unapproved lead/);
    }
  }
  const fakeCompletion = copy(completed);
  fakeCompletion.tasks[0].testEvidence = ' ';
  assert.throws(() => loadState(JSON.stringify(fakeCompletion)), /test evidence/);
});

test('future-dated backups stay valid after review reset, edits, and task updates', () => {
  const { state } = withTask();
  const future = copy(state);
  for (const record of [...future.leads, ...future.tasks]) {
    record.createdAt = '2099-01-01T00:00:00.000Z';
    record.updatedAt = '2099-01-02T00:00:00.000Z';
  }
  const imported = parseImport(JSON.stringify(future));
  assert.deepEqual(loadState(exportState(imported)), imported);
  const edited = updateLead(imported, imported.leads[0].id, { title: 'Updated future-dated lead' });
  const reviewed = reviewLead(edited, edited.leads[0].id, checks());
  const unblocked = updateTask(reviewed, reviewed.tasks[0].id, { status: 'doing' });
  assert.deepEqual(loadState(exportState(unblocked)), unblocked);
  assert.ok(unblocked.leads[0].updatedAt >= future.leads[0].updatedAt);
  assert.ok(unblocked.tasks[0].updatedAt >= future.tasks[0].updatedAt);
});

test('local server serves only public assets and rejects writes and path traversal', async t => {
  const server = createStaticServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  const get = (path, method = 'GET') => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, method, path }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
  const module = await get('/core.mjs');
  assert.equal(module.status, 200);
  assert.match(module.headers['content-type'], /javascript/);
  assert.match(module.headers['content-security-policy'], /connect-src 'none'/);
  assert.equal(module.headers['x-content-type-options'], 'nosniff');
  const head = await get('/core.mjs', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.ok(Number(head.headers['content-length']) > 0);
  for (const path of ['/.git/config', '/.env', '/README.md', '/docs/', '/tests/core.test.mjs', '/scripts/serve.mjs']) {
    assert.equal((await get(path)).status, 404, path);
  }
  for (const path of ['/../README.md', '/%2e%2e/README.md', '/%252e%252e/README.md', '/..%5cREADME.md', '/%00', '/%zz']) {
    assert.equal((await get(path)).status, 400, path);
  }
  const post = await get('/core.mjs', 'POST');
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET, HEAD');
});
