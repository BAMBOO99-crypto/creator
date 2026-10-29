export const CHANNELS = Object.freeze({
  personal: 'Personal / Business',
  research: 'AI Research',
  web: 'Public web index',
});

export const SURFACES = Object.freeze({
  fyp: 'For You feed',
  saved: 'Saved post',
  search: 'TikTok search',
  web: 'Public web index',
  manual: 'Direct link',
});

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_LEADS = 500;
const MAX_TASKS = 1000;
const DECISIONS = ['pending', 'approved', 'rejected'];
const RISKS = ['unassessed', 'low', 'medium', 'high'];
const STATUSES = ['todo', 'doing', 'blocked', 'done'];
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export function emptyState() {
  return { schemaVersion: 1, leads: [], tasks: [] };
}

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function field(value, key, fallback) {
  return own(value, key) ? value[key] : fallback;
}

function text(value, label, limit, required = false) {
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  const cleaned = value.trim();
  if (required && !cleaned) throw new Error(`${label} is required.`);
  if (cleaned.length > limit) throw new Error(`${label} must be ${limit} characters or fewer.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(cleaned)) {
    throw new Error(`${label} contains unsupported control characters.`);
  }
  return cleaned;
}

function choice(value, choices, label) {
  if (!choices.includes(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function boolean(value, label) {
  if (typeof value !== 'boolean') throw new Error(`${label} must be true or false.`);
  return value;
}

function identifier(value, label) {
  const cleaned = text(value, label, 100, true);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(cleaned)) throw new Error(`${label} is invalid.`);
  return cleaned;
}

function timestamp(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`${label} must be a valid ISO timestamp.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${label} must be a valid ISO timestamp.`);
  }
  return value;
}

function dates(value, label) {
  const createdAt = timestamp(field(value, 'createdAt'), `${label} creation date`);
  const updatedAt = timestamp(field(value, 'updatedAt'), `${label} update date`);
  if (updatedAt < createdAt) throw new Error(`${label} update date cannot precede its creation date.`);
  return { createdAt, updatedAt };
}

export function normalizeTikTokUrl(input) {
  const raw = text(input, 'TikTok link', 4096, true);
  if (!/^https:\/\//i.test(raw)) throw new Error('Use a full HTTPS TikTok link.');
  if (/\s|\\/.test(raw)) throw new Error('TikTok links cannot contain spaces or backslashes.');
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error('Enter a valid full TikTok link.'); }
  if (parsed.username || parsed.password) throw new Error('TikTok links cannot contain login credentials.');
  const authority = raw.slice(raw.indexOf('://') + 3).split(/[/?#]/, 1)[0];
  if (authority.includes(':') || parsed.port) throw new Error('TikTok links cannot include a port.');
  if (['vm.tiktok.com', 'vt.tiktok.com'].includes(parsed.hostname)) {
    throw new Error('Open the short TikTok link, then copy the full /@creator/video/ link from your browser.');
  }
  if (!/^(?:www\.|m\.)?tiktok\.com$/i.test(authority) ||
      !['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'].includes(parsed.hostname)) {
    throw new Error('Use a link hosted on tiktok.com, www.tiktok.com, or m.tiktok.com.');
  }
  // Inspect the literal path before URL normalization can hide encoded or dot segments.
  const path = raw.slice(raw.indexOf('://') + 3 + authority.length).split(/[?#]/, 1)[0];
  if (path.includes('%') || /(?:^|\/)\.{1,2}(?:\/|$)/.test(path)) {
    throw new Error('Use an unencoded TikTok video path without dot segments.');
  }
  const match = /^\/@([A-Za-z0-9._]{1,24})\/video\/(\d{10,25})\/?$/.exec(path);
  if (!match) {
    throw new Error('Open the post and copy its full TikTok /@creator/video/1234567890 link. Short links are not supported.');
  }
  if (/^\.+$/.test(match[1])) throw new Error('The TikTok creator handle is invalid.');
  return { url: `https://www.tiktok.com/@${match[1]}/video/${match[2]}`, videoId: match[2], creator: match[1] };
}

function pendingReview() {
  return {
    decision: 'pending', risk: 'unassessed', linkChecked: false, rightsChecked: false,
    claimsChecked: false, privacyChecked: false, reason: '',
  };
}

function readReview(value) {
  object(value, 'Review');
  return {
    decision: choice(field(value, 'decision'), DECISIONS, 'Review decision'),
    risk: choice(field(value, 'risk'), RISKS, 'Risk level'),
    linkChecked: boolean(field(value, 'linkChecked'), 'Link check'),
    rightsChecked: boolean(field(value, 'rightsChecked'), 'Rights check'),
    claimsChecked: boolean(field(value, 'claimsChecked'), 'Claims check'),
    privacyChecked: boolean(field(value, 'privacyChecked'), 'Privacy check'),
    reason: text(field(value, 'reason'), 'Review reason', 2000),
  };
}

function leadContent(input) {
  object(input, 'Lead');
  const link = normalizeTikTokUrl(field(input, 'url'));
  const channel = choice(field(input, 'channel'), Object.keys(CHANNELS), 'Discovery channel');
  const surface = choice(field(input, 'surface'), Object.keys(SURFACES), 'Discovery surface');
  if ((channel === 'web') !== (surface === 'web')) {
    throw new Error('Public web index discoveries must use the Public web index channel and surface together.');
  }
  return {
    title: text(field(input, 'title'), 'Lead title', 160, true),
    url: link.url,
    videoId: link.videoId,
    channel,
    surface,
    sourceNote: text(field(input, 'sourceNote'), 'Source / observation note', 2000, true),
    evidence: text(field(input, 'evidence', ''), 'Evidence / claim verification', 6000),
  };
}

export function approvalIssues(lead) {
  const issues = [];
  const review = lead && lead.review;
  if (!lead || typeof lead.evidence !== 'string' || !lead.evidence.trim()) issues.push('Add evidence and explain which claims you verified.');
  if (!lead || typeof lead.sourceNote !== 'string' || !lead.sourceNote.trim()) issues.push('Record where and how you observed this post.');
  if (!review || !['low', 'medium'].includes(review.risk)) issues.push('Assess risk as low or medium; high risk cannot be approved.');
  if (!review || review.linkChecked !== true) issues.push('Manually check that the full link opens the intended post.');
  if (!review || review.rightsChecked !== true) issues.push('Check reuse rights and attribution.');
  if (!review || review.claimsChecked !== true) issues.push('Verify claims independently and record the evidence.');
  if (!review || review.privacyChecked !== true) issues.push('Check for private or sensitive information.');
  if (!review || typeof review.reason !== 'string' || !review.reason.trim()) issues.push('Add a review reason.');
  return issues;
}

function readLead(value) {
  object(value, 'Lead');
  const content = leadContent(value);
  if (field(value, 'videoId') !== content.videoId) throw new Error('Lead video ID does not match its link.');
  const date = dates(value, 'Lead');
  const lead = {
    id: identifier(field(value, 'id'), 'Lead ID'),
    title: content.title, url: content.url, videoId: content.videoId,
    channel: content.channel, surface: content.surface, sourceNote: content.sourceNote,
    evidence: content.evidence, createdAt: date.createdAt, updatedAt: date.updatedAt,
    review: readReview(field(value, 'review')),
  };
  if (lead.review.decision === 'approved' && approvalIssues(lead).length) {
    throw new Error(`Approved lead "${lead.title}" does not satisfy its review gates.`);
  }
  return lead;
}

function readTask(value) {
  object(value, 'Task');
  const date = dates(value, 'Task');
  const task = {
    id: identifier(field(value, 'id'), 'Task ID'),
    leadId: identifier(field(value, 'leadId'), 'Task lead ID'),
    title: text(field(value, 'title'), 'Task title', 160, true),
    notes: text(field(value, 'notes'), 'Task notes', 6000),
    status: choice(field(value, 'status'), STATUSES, 'Task status'),
    testEvidence: text(field(value, 'testEvidence'), 'Test evidence', 6000),
    createdAt: date.createdAt, updatedAt: date.updatedAt,
  };
  if (task.status === 'done' && !task.testEvidence) throw new Error('Completed tasks require recorded test evidence.');
  return task;
}

function validateState(value) {
  object(value, 'Workspace');
  if (field(value, 'schemaVersion') !== 1) throw new Error('Unsupported workspace format: schemaVersion must be 1.');
  const rawLeads = field(value, 'leads');
  const rawTasks = field(value, 'tasks');
  if (!Array.isArray(rawLeads) || !Array.isArray(rawTasks)) throw new Error('Workspace leads and tasks must be arrays.');
  if (rawLeads.length > MAX_LEADS) throw new Error(`A workspace supports up to ${MAX_LEADS} leads.`);
  if (rawTasks.length > MAX_TASKS) throw new Error(`A workspace supports up to ${MAX_TASKS} tasks.`);
  const leads = rawLeads.map(readLead);
  const tasks = rawTasks.map(readTask);
  const leadIds = new Map();
  const videoIds = new Set();
  const allIds = new Set();
  for (const lead of leads) {
    if (allIds.has(lead.id)) throw new Error('Workspace contains duplicate record IDs.');
    if (videoIds.has(lead.videoId)) throw new Error('Workspace contains duplicate TikTok video IDs.');
    allIds.add(lead.id); videoIds.add(lead.videoId); leadIds.set(lead.id, lead);
  }
  for (const task of tasks) {
    if (allIds.has(task.id)) throw new Error('Workspace contains duplicate record IDs.');
    allIds.add(task.id);
    const lead = leadIds.get(task.leadId);
    if (!lead) throw new Error('A task refers to a missing lead.');
    if (task.status !== 'blocked' && lead.review.decision !== 'approved') {
      throw new Error('Tasks for an unapproved lead must be blocked.');
    }
  }
  return { schemaVersion: 1, leads, tasks };
}

function parseState(serialized) {
  if (typeof serialized !== 'string') throw new Error('Workspace JSON must be text.');
  if (new TextEncoder().encode(serialized).byteLength > MAX_BYTES) throw new Error('Workspace JSON must be 2 MB or smaller.');
  let parsed;
  try { parsed = JSON.parse(serialized); } catch { throw new Error('The file is not valid JSON.'); }
  return validateState(parsed);
}

function stateSize(state) {
  if (new TextEncoder().encode(JSON.stringify(state, null, 2)).byteLength > MAX_BYTES) {
    throw new Error('Workspace exceeds the 2 MB storage and import limit. Shorten notes or remove unused records.');
  }
  return state;
}

function nextId(prefix, state) {
  const used = new Set([...state.leads, ...state.tasks].map(record => record.id));
  let id;
  do {
    id = globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
  } while (used.has(id));
  return id;
}

function blockTasks(tasks, leadId, now) {
  return tasks.map(task => task.leadId === leadId
    ? { id: task.id, leadId: task.leadId, title: task.title, notes: task.notes, status: 'blocked',
      testEvidence: task.testEvidence, createdAt: task.createdAt, updatedAt: now > task.updatedAt ? now : task.updatedAt }
    : task);
}

export function addLead(state, input) {
  const current = validateState(state);
  const content = leadContent(input);
  if (current.leads.length >= MAX_LEADS) throw new Error(`A workspace supports up to ${MAX_LEADS} leads.`);
  if (current.leads.some(lead => lead.videoId === content.videoId)) throw new Error('This TikTok video is already in your workspace.');
  const now = new Date().toISOString();
  const lead = {
    id: nextId('lead', current), title: content.title, url: content.url, videoId: content.videoId,
    channel: content.channel, surface: content.surface, sourceNote: content.sourceNote,
    evidence: content.evidence, createdAt: now, updatedAt: now, review: pendingReview(),
  };
  return stateSize({ schemaVersion: 1, leads: [...current.leads, lead], tasks: current.tasks });
}

export function updateLead(state, id, input) {
  const current = validateState(state);
  object(input, 'Lead update');
  const previous = current.leads.find(lead => lead.id === id);
  if (!previous) throw new Error('Lead not found.');
  const content = leadContent({
    title: field(input, 'title', previous.title), url: field(input, 'url', previous.url),
    channel: field(input, 'channel', previous.channel), surface: field(input, 'surface', previous.surface),
    sourceNote: field(input, 'sourceNote', previous.sourceNote), evidence: field(input, 'evidence', previous.evidence),
  });
  if (current.leads.some(lead => lead.id !== id && lead.videoId === content.videoId)) throw new Error('This TikTok video is already in your workspace.');
  const now = new Date().toISOString();
  const updated = {
    id: previous.id, title: content.title, url: content.url, videoId: content.videoId,
    channel: content.channel, surface: content.surface, sourceNote: content.sourceNote,
    evidence: content.evidence, createdAt: previous.createdAt, updatedAt: now > previous.updatedAt ? now : previous.updatedAt, review: pendingReview(),
  };
  return stateSize({ schemaVersion: 1, leads: current.leads.map(lead => lead.id === id ? updated : lead), tasks: blockTasks(current.tasks, id, now) });
}

export function reviewLead(state, id, input) {
  const current = validateState(state);
  object(input, 'Review update');
  const previous = current.leads.find(lead => lead.id === id);
  if (!previous) throw new Error('Lead not found.');
  const review = readReview({
    decision: field(input, 'decision', previous.review.decision),
    risk: field(input, 'risk', previous.review.risk),
    linkChecked: field(input, 'linkChecked', previous.review.linkChecked),
    rightsChecked: field(input, 'rightsChecked', previous.review.rightsChecked),
    claimsChecked: field(input, 'claimsChecked', previous.review.claimsChecked),
    privacyChecked: field(input, 'privacyChecked', previous.review.privacyChecked),
    reason: field(input, 'reason', previous.review.reason),
  });
  const now = new Date().toISOString();
  const updated = {
    id: previous.id, title: previous.title, url: previous.url, videoId: previous.videoId,
    channel: previous.channel, surface: previous.surface, sourceNote: previous.sourceNote,
    evidence: previous.evidence, createdAt: previous.createdAt, updatedAt: now > previous.updatedAt ? now : previous.updatedAt, review,
  };
  const issues = approvalIssues(updated);
  if (review.decision === 'approved' && issues.length) throw new Error(`Cannot approve: ${issues.join(' ')}`);
  return stateSize({
    schemaVersion: 1, leads: current.leads.map(lead => lead.id === id ? updated : lead),
    tasks: review.decision === 'approved' ? current.tasks : blockTasks(current.tasks, id, now),
  });
}

export function createTask(state, leadId, input) {
  const current = validateState(state);
  object(input, 'Task');
  const lead = current.leads.find(record => record.id === leadId);
  if (!lead) throw new Error('Lead not found.');
  if (lead.review.decision !== 'approved') throw new Error('Approve the lead before creating a build task.');
  if (current.tasks.length >= MAX_TASKS) throw new Error(`A workspace supports up to ${MAX_TASKS} tasks.`);
  const now = new Date().toISOString();
  const task = {
    id: nextId('task', current), leadId, title: text(field(input, 'title'), 'Task title', 160, true),
    notes: text(field(input, 'notes', ''), 'Task notes', 6000), status: 'todo', testEvidence: '',
    createdAt: now, updatedAt: now,
  };
  return stateSize({ schemaVersion: 1, leads: current.leads, tasks: [...current.tasks, task] });
}

export function updateTask(state, id, input) {
  const current = validateState(state);
  object(input, 'Task update');
  const previous = current.tasks.find(task => task.id === id);
  if (!previous) throw new Error('Task not found.');
  const status = choice(field(input, 'status', previous.status), STATUSES, 'Task status');
  const lead = current.leads.find(record => record.id === previous.leadId);
  if (status !== 'blocked' && lead.review.decision !== 'approved') throw new Error('Reapprove the lead before unblocking its tasks.');
  const testEvidence = text(field(input, 'testEvidence', previous.testEvidence), 'Test evidence', 6000);
  if (status === 'done' && !testEvidence) throw new Error('Record test evidence before marking a task done.');
  const updated = {
    id: previous.id, leadId: previous.leadId, title: previous.title,
    notes: text(field(input, 'notes', previous.notes), 'Task notes', 6000), status, testEvidence,
    createdAt: previous.createdAt, updatedAt: new Date(Math.max(Date.now(), Date.parse(previous.updatedAt))).toISOString(),
  };
  return stateSize({ schemaVersion: 1, leads: current.leads, tasks: current.tasks.map(task => task.id === id ? updated : task) });
}

export function exportState(state) {
  return JSON.stringify(stateSize(validateState(state)), null, 2);
}

export function loadState(serialized) {
  return stateSize(parseState(serialized));
}

function resetImported(state) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    leads: state.leads.map(lead => ({
      id: lead.id, title: lead.title, url: lead.url, videoId: lead.videoId,
      channel: lead.channel, surface: lead.surface, sourceNote: lead.sourceNote,
      evidence: lead.evidence, createdAt: lead.createdAt, updatedAt: now > lead.updatedAt ? now : lead.updatedAt, review: pendingReview(),
    })),
    tasks: state.tasks.map(task => ({
      id: task.id, leadId: task.leadId, title: task.title, notes: task.notes,
      status: 'blocked', testEvidence: task.testEvidence, createdAt: task.createdAt, updatedAt: now > task.updatedAt ? now : task.updatedAt,
    })),
  };
}

export function parseImport(serialized) {
  return stateSize(resetImported(parseState(serialized)));
}

export function mergeImport(state, incoming) {
  const current = validateState(state);
  const imported = resetImported(validateState(incoming));
  const merged = { schemaVersion: 1, leads: current.leads.slice(), tasks: current.tasks.slice() };
  const videos = new Set(merged.leads.map(lead => lead.videoId));
  const remap = new Map();
  let added = 0;
  let duplicates = 0;
  let tasksAdded = 0;
  for (const lead of imported.leads) {
    if (videos.has(lead.videoId)) { duplicates += 1; continue; }
    const newId = nextId('lead', merged);
    remap.set(lead.id, newId);
    merged.leads.push({
      id: newId, title: lead.title, url: lead.url, videoId: lead.videoId,
      channel: lead.channel, surface: lead.surface, sourceNote: lead.sourceNote,
      evidence: lead.evidence, createdAt: lead.createdAt, updatedAt: lead.updatedAt, review: pendingReview(),
    });
    videos.add(lead.videoId); added += 1;
  }
  for (const task of imported.tasks) {
    const leadId = remap.get(task.leadId);
    // A duplicate imported lead never grants foreign tasks access to an approved local lead.
    if (!leadId) continue;
    merged.tasks.push({
      id: nextId('task', merged), leadId, title: task.title, notes: task.notes,
      status: 'blocked', testEvidence: task.testEvidence, createdAt: task.createdAt, updatedAt: task.updatedAt,
    });
    tasksAdded += 1;
  }
  return { state: stateSize(validateState(merged)), added, duplicates, tasksAdded };
}
