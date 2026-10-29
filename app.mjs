import {
  CHANNELS, SURFACES, emptyState, addLead, updateLead, reviewLead, approvalIssues,
  createTask, updateTask, exportState, parseImport, mergeImport, loadState,
} from './core.mjs';

const STORAGE_KEY = 'ai-command-center.v1';
const views = {
  discoveries: ['Discoveries', 'Keep the source. Find the useful idea.'],
  review: ['Evidence review', 'Separate what you observed from what a creator claims.'],
  build: ['Build queue', 'Small experiments, clear gates, recorded results.'],
  data: ['Your data', 'Stored in this browser. Backed up by you.'],
};
const $ = (selector) => document.querySelector(selector);
const escape = (value = '') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const option = (value, label, selected) => `<option value="${escape(value)}"${value === selected ? ' selected' : ''}>${escape(label)}</option>`;
const badge = (label, tone = 'neutral') => `<span class="badge ${tone}">${escape(label)}</span>`;
const date = value => new Date(value).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'});
let state = emptyState();
let view = Object.hasOwn(views, location.hash.slice(1)) ? location.hash.slice(1) : 'discoveries';
let query = '', channelFilter = 'all', reviewFilter = 'pending';
let storageError = '', corruptBackup = '', importDraft = null, modalOpener = null, toastTimer;
let storedRevision = null, externalChange = false;

try {
  const stored = localStorage.getItem(STORAGE_KEY);
  storedRevision = stored;
  if (stored !== null) {
    try { state = loadState(stored); }
    catch { corruptBackup = stored; storageError = 'Saved data could not be read. It has been kept intact. Download it from Your data before resetting this browser workspace.'; }
  }
} catch {
  storageError = 'Browser storage is unavailable. Changes will last only while this page stays open. Export a backup before leaving.';
}

function notify(message, isError = false) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, isError ? 12000 : 6000);
}

function commit(next, message) {
  if (corruptBackup) throw new Error('Recover or reset the unreadable saved data in Your data before making changes.');
  let latest = storedRevision;
  try { latest = localStorage.getItem(STORAGE_KEY); } catch { /* In-memory use remains available. */ }
  if (externalChange || latest !== storedRevision) throw new Error('This workspace changed in another tab. Export any unsaved work, then reload this page before saving.');
  state = next;
  try { const serialized=exportState(state); localStorage.setItem(STORAGE_KEY,serialized); storedRevision=serialized; storageError = ''; }
  catch { storageError = 'These changes are in memory only because browser storage failed. Export a backup before leaving this page.'; }
  render();
  if (message) notify(message);
}

function render() {
  $('#view-title').textContent = views[view][0];
  $('#view-subtitle').textContent = views[view][1];
  document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  const ready = state.leads.filter(l => l.review.decision === 'approved').length;
  const pending = state.leads.filter(l => l.review.decision === 'pending').length;
  const active = state.tasks.filter(t => t.status !== 'done').length;
  $('#metrics').innerHTML = [
    ['01', state.leads.length, 'Discoveries captured'], ['02', pending, 'Awaiting review'],
    ['03', ready, 'Approved to explore'], ['04', active, 'Open build tasks'],
  ].map(([number, count, label]) => `<div class="metric"><span class="eyebrow">${number}</span><strong>${count}</strong><span>${label}</span></div>`).join('');
  $('#storage-status').textContent = storageError ? 'Backup needed' : 'Saved in this browser';
  $('#storage-status').classList.toggle('warning', Boolean(storageError));
  const notice = $('#notice');
  notice.textContent = storageError;
  notice.hidden = !storageError;
  $('#view-content').innerHTML = ({discoveries: discoveriesView, review: reviewView, build: buildView, data: dataView})[view]();
}

function sourceLine(lead) {
  const note = lead.channel === 'web' ? 'Public result; not an account feed' : 'Manually assigned account context';
  return `<div class="provenance">${badge(CHANNELS[lead.channel])}${badge(SURFACES[lead.surface])}<span class="muted">${note}</span></div>`;
}

function reviewBadge(lead) {
  const decision = lead.review.decision;
  return badge(decision === 'approved' ? 'Approved' : decision === 'rejected' ? 'Rejected' : 'Needs review', decision === 'approved' ? 'green' : decision === 'rejected' ? 'red' : 'amber');
}

function leadCard(lead, forReview = false) {
  return `<article class="card lead-card">
    <div class="section-head">${reviewBadge(lead)}<span class="muted">${escape(date(lead.createdAt))}</span></div>
    <h3>${escape(lead.title)}</h3>${sourceLine(lead)}
    <p class="source-note">${escape(lead.sourceNote)}</p>
    <div class="inline">${badge(lead.review.linkChecked ? 'Link checked by you' : 'Format valid · not checked', lead.review.linkChecked ? 'green' : 'neutral')}${lead.review.risk !== 'unassessed' ? badge(`${lead.review.risk} risk`,lead.review.risk === 'high' ? 'red' : 'neutral') : ''}</div>
    <div class="card-actions"><a class="text-link" href="${escape(lead.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Open TikTok <span aria-hidden="true">↗</span></a>
    <button class="button secondary small" data-action="edit" data-id="${escape(lead.id)}">Edit</button>
    <button class="button ${forReview ? 'primary' : 'secondary'} small" data-action="review" data-id="${escape(lead.id)}">Review evidence</button>
    ${lead.review.decision === 'approved' ? `<button class="button primary small" data-action="task" data-id="${escape(lead.id)}">Create task</button>` : ''}</div>
  </article>`;
}

function matches(lead) {
  return (channelFilter === 'all' || lead.channel === channelFilter) &&
    (!query || `${lead.title} ${lead.sourceNote} ${lead.evidence} ${lead.url}`.toLowerCase().includes(query.toLowerCase()));
}

function filterBar(withReview = false) {
  return `<div class="toolbar"><label class="search"><span class="sr-only">Search discoveries</span><input id="search-discoveries" type="search" placeholder="Search ideas, sources, or creators…" value="${escape(query)}" autocomplete="off"></label>
    <label class="filter-field"><span class="sr-only">Discovery channel</span><select id="channel-filter">${option('all','All discovery channels',channelFilter)}${Object.entries(CHANNELS).map(([key,label])=>option(key,label,channelFilter)).join('')}</select></label>
    ${withReview ? `<label class="filter-field"><span class="sr-only">Review status</span><select id="review-filter">${[['pending','Needs review'],['approved','Approved'],['rejected','Rejected'],['all','All review states']].map(([v,l])=>option(v,l,reviewFilter)).join('')}</select></label>` : ''}</div>`;
}

function empty(title, body, button = true) {
  return `<div class="empty-state"><div class="empty-icon" aria-hidden="true">↗</div><h3>${title}</h3><p>${body}</p>${button ? '<button class="button primary" data-action="add">Capture a discovery <span aria-hidden="true">+</span></button>' : ''}</div>`;
}

function discoveriesView() {
  const leads = state.leads.filter(matches).slice().reverse();
  return `<div class="section-head"><h2>Your discovery inbox <span class="count">${state.leads.length}</span></h2>${badge('Manual intake')}</div>
    ${filterBar()}<div class="callout subtle">The channel records your research context. The discovery surface records where you actually found the post. No account is connected.</div>
    ${leads.length ? `<div class="card-grid">${leads.map(l=>leadCard(l)).join('')}</div>` : state.leads.length ? empty('No matching discoveries','Try another channel or search term.',false) : empty('Start with a source, not a promise.','Paste a full TikTok video link, record where it came from, and keep the evidence alongside the idea.')}`;
}

function reviewView() {
  const leads = state.leads.filter(matches).filter(l=>reviewFilter === 'all' || l.review.decision === reviewFilter).slice().reverse();
  return `<div class="section-head"><h2>A deliberate checkpoint</h2>${badge('You make the decision','amber')}</div>
    <div class="callout">Approval requires a manually checked link, evidence notes, rights, claims and privacy checks, a written decision, and low or medium risk. High risk stays blocked.</div>
    ${filterBar(true)}${leads.length ? `<div class="card-grid">${leads.map(l=>leadCard(l,true)).join('')}</div>` : empty('Nothing in this review state.','Captured discoveries appear here for your evidence and risk check.',state.leads.length === 0)}`;
}

function taskCard(task) {
  const lead = state.leads.find(l=>l.id === task.leadId);
  return `<article class="card task-card"><span class="eyebrow">${escape(CHANNELS[lead.channel])}</span><h3>${escape(task.title)}</h3>
    <p class="muted">From: ${escape(lead.title)}</p>${task.notes ? `<p class="task-note">${escape(task.notes)}</p>` : ''}
    ${task.status === 'blocked' ? '<p class="gate-message">Review the source and update this task when ready.</p>' : ''}
    ${task.status === 'done' ? `${badge('Test evidence recorded','green')}<p class="task-note">${escape(task.testEvidence)}</p>` : ''}
    <div class="card-actions"><button class="button secondary small" data-action="edit-task" data-id="${escape(task.id)}">Update task</button><button class="text-link" data-action="review" data-id="${escape(lead.id)}">Source review</button></div></article>`;
}

function buildView() {
  const statuses = [['todo','To do'],['doing','In progress'],['blocked','Blocked'],['done','Done']];
  return `<div class="section-head"><h2>From evidence to experiment</h2>${badge(`${state.tasks.length} tasks`)}</div>
    <div class="callout subtle">Tasks track your work; they never execute code. Create a task from an approved discovery. Marking it done requires written test evidence. Changing a source or revoking approval blocks its tasks.</div>
    ${!state.tasks.length ? empty('Your next build starts with review.','Approve a discovery, then choose Create task. Keep the experiment small and record what you actually tested.',false) : `<div class="task-columns">${statuses.map(([status,label])=>`<section class="task-column"><div class="section-head"><h3>${label}</h3><span class="count">${state.tasks.filter(t=>t.status===status).length}</span></div><div class="stack">${state.tasks.filter(t=>t.status===status).map(taskCard).join('') || '<p class="muted column-empty">No tasks here.</p>'}</div></section>`).join('')}</div>`}`;
}

function dataView() {
  return `<div class="data-grid"><section class="card data-panel"><span class="eyebrow">01 / BACKUP</span><h2>Your workspace, portable.</h2><p>Export discoveries, review decisions and build tasks as a JSON file. It contains the information you entered; keep it somewhere private.</p>
    <button class="button primary" data-action="export">Download JSON backup</button><p class="muted">Browser storage is not cloud backup or cross-device sync. Clearing site data removes local records.</p>${corruptBackup ? '<button class="button secondary" data-action="raw-backup">Download unreadable saved data</button>' : ''}</section>
    <section class="card data-panel"><span class="eyebrow">02 / RESTORE</span><h2>Bring discoveries back.</h2><p>Import a backup, preview the changes, then merge. Existing discoveries win when video IDs match. New records need fresh review; imported tasks start blocked.</p>
    <label class="field">Choose a JSON backup<input id="import-file" type="file" accept="application/json,.json"></label>
    <label class="field">Or paste backup JSON<textarea id="import-text" rows="5" placeholder='{"schemaVersion":1,"leads":[],"tasks":[]}' spellcheck="false"></textarea></label>
    <button class="button secondary" data-action="preview-import">Preview import</button><p class="muted">Maximum 2 MB · 500 discoveries · 1,000 tasks. Files stay in this browser.</p></section>
    <section class="card data-panel"><span class="eyebrow">03 / CAPABILITIES</span><h2>What is connected?</h2><dl class="connection-list"><div><dt>TikTok</dt><dd>Manual links only</dd></div><div><dt>Google Sheets</dt><dd>Not connected</dd></div><div><dt>AI models</dt><dd>Not connected</dd></div><div><dt>GitHub</dt><dd>Source code only; no app sync</dd></div></dl><p class="muted">This static MVP does not read feeds, scrape posts, verify income, call an AI model, schedule work, publish content or execute tasks.</p></section>
    <section class="card data-panel"><span class="eyebrow">04 / RESET</span><h2>A clean workspace.</h2><p>Remove this app's records from this browser after exporting a backup.</p><button class="button danger" data-action="reset">Reset local workspace</button><p class="muted">No other website or workspace is affected.</p></section></div>`;
}

function openModal(html) {
  modalOpener = document.activeElement;
  $('#modal-content').innerHTML = html;
  if (!$('#modal').open) $('#modal').showModal();
  const heading=$('#modal-title');
  if(heading) { heading.tabIndex=-1; heading.focus(); }
}
function closeModal() { $('#modal').close(); }
$('#modal').addEventListener('close',()=>{
  $('#modal-content').innerHTML=''; importDraft=null;
  if(modalOpener?.isConnected) modalOpener.focus(); else $('#main').focus();
});

function leadForm(id) {
  const lead = state.leads.find(l=>l.id===id);
  openModal(`<span class="eyebrow">${lead ? 'EDIT DISCOVERY' : 'MANUAL INTAKE'}</span><h2 id="modal-title">${lead ? 'Keep the record accurate.' : 'Capture a discovery.'}</h2>
    <p class="muted">Only full TikTok video links are accepted. Copy the expanded address from the post; shortened links cannot be checked here.</p>
    ${lead ? '<div class="callout">Saving edits resets this review and blocks associated tasks. Test notes are preserved.</div>' : ''}
    <form id="lead-form" data-id="${escape(id || '')}" class="form-grid">
    <label class="field full">Idea title<input name="title" required maxlength="160" value="${escape(lead?.title || '')}" placeholder="What could this help you do?"></label>
    <label class="field full">Full TikTok video URL<input name="url" type="url" required maxlength="2048" value="${escape(lead?.url || '')}" placeholder="https://www.tiktok.com/@creator/video/…"><span class="muted">We validate the address format only. We do not contact TikTok.</span></label>
    <label class="field">Discovery channel<select name="channel">${Object.entries(CHANNELS).map(([v,l])=>option(v,l,lead?.channel || 'research')).join('')}</select><span class="muted">A manual label, not a connected account.</span></label>
    <label class="field">Actual discovery surface<select name="surface">${Object.entries(SURFACES).map(([v,l])=>option(v,l,lead?.surface || 'manual')).join('')}</select></label>
    <label class="field full">Provenance notes<textarea name="sourceNote" required maxlength="2000" rows="3" placeholder="Where and when did you find it? A search result is not a For You observation.">${escape(lead?.sourceNote || '')}</textarea></label>
    <label class="field full">Evidence and uncertainties<textarea name="evidence" maxlength="6000" rows="5" placeholder="What did you actually see or hear? Separate sampled frames, descriptions, transcripts, creator claims and independent evidence. Leave income claims unverified unless supported.">${escape(lead?.evidence || '')}</textarea></label>
    <p id="form-error" class="form-error full" role="alert" hidden></p><div class="form-actions full"><button type="button" class="button secondary" data-action="close">Cancel</button><button class="button primary" type="submit">${lead ? 'Save and reset review' : 'Save discovery'}</button></div></form>`);
  syncSurface();
}

function syncSurface() {
  const channel = $('#lead-form [name="channel"]');
  const surface = $('#lead-form [name="surface"]');
  if (!channel || !surface) return;
  for (const op of surface.options) op.disabled = channel.value === 'web' ? op.value !== 'web' : op.value === 'web';
  if (channel.value === 'web') surface.value = 'web'; else if (surface.value === 'web') surface.value = 'manual';
}

function reviewForm(id) {
  const lead = state.leads.find(l=>l.id===id);
  if (!lead) throw new Error('Discovery no longer exists.');
  const review = lead.review;
  const checks = [
    ['linkChecked','I opened this post and confirmed it matches the recorded source.'],
    ['rightsChecked','I checked rights and permission for the planned use.'],
    ['claimsChecked','I separated observed evidence from unverified claims.'],
    ['privacyChecked','I checked privacy and kept secrets and private data out of the experiment.'],
  ];
  openModal(`<span class="eyebrow">EVIDENCE REVIEW</span><h2 id="modal-title">${escape(lead.title)}</h2>${sourceLine(lead)}
    <p><a class="text-link" href="${escape(lead.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Open source on TikTok ↗</a></p>
    <div class="evidence-box"><h3>Provenance</h3><p>${escape(lead.sourceNote)}</p><h3>Evidence & uncertainties</h3><p>${escape(lead.evidence || 'No evidence recorded yet. Edit the discovery before approving.')}</p></div>
    <form id="review-form" data-id="${escape(id)}" class="form-grid">
    <fieldset class="field full check-list"><legend>Your checks</legend>${checks.map(([name,label])=>`<label><input type="checkbox" name="${name}"${review[name] ? ' checked' : ''}><span>${label}</span></label>`).join('')}</fieldset>
    <label class="field">Risk assessment<select name="risk">${['unassessed','low','medium','high'].map(v=>option(v,v==='unassessed'?'Not assessed':`${v[0].toUpperCase()+v.slice(1)} risk`,review.risk)).join('')}</select></label>
    <label class="field">Decision<select name="decision">${[['pending','Keep in review'],['approved','Approve for an experiment'],['rejected','Reject']].map(([v,l])=>option(v,l,review.decision)).join('')}</select></label>
    <label class="field full">Decision notes & safeguards<textarea name="reason" maxlength="2000" rows="3" placeholder="Why is it useful and safe to test? Record limits or the reason for rejection.">${escape(review.reason)}</textarea></label>
    <div class="callout full">All four checks, evidence, decision notes and low or medium risk are required for approval. This records your judgment; it does not independently verify the post. Revoking approval blocks its tasks.</div>
    <p id="form-error" class="form-error full" role="alert" hidden></p><div class="form-actions full"><button type="button" class="button secondary" data-action="close">Cancel</button><button class="button primary" type="submit">Save review</button></div></form>`);
}

function taskForm(id, editing = false) {
  const task = editing ? state.tasks.find(t=>t.id===id) : null;
  const lead = state.leads.find(l=>l.id===(task?.leadId || id));
  if (!lead || (editing && !task)) throw new Error('Task or source no longer exists.');
  const issues = approvalIssues(lead);
  openModal(`<span class="eyebrow">BUILD TASK</span><h2 id="modal-title">${editing ? 'Record your progress.' : 'Define a small experiment.'}</h2><p class="muted">Source: ${escape(lead.title)}</p>
    ${lead.review.decision !== 'approved' || issues.length ? `<div class="callout">This source needs review before the task can progress. You can still save notes with Blocked status.</div>` : ''}
    <form id="task-form" data-id="${escape(id)}" data-editing="${editing}" class="form-grid">
    ${editing ? `<h3 class="full">${escape(task.title)}</h3><label class="field full">Status<select name="status">${[['todo','To do'],['doing','In progress'],['blocked','Blocked'],['done','Done']].map(([v,l])=>option(v,l,task.status)).join('')}</select></label>` : `<label class="field full">Task title<input name="title" required maxlength="160" placeholder="Build one local prototype and compare the result"></label>`}
    <label class="field full">Scope, next step & limits<textarea name="notes" maxlength="6000" rows="4" placeholder="What will you test? What will count as useful?">${escape(task?.notes || '')}</textarea></label>
    ${editing ? `<label class="field full">Test evidence<textarea name="testEvidence" maxlength="6000" rows="4" placeholder="Record what you tested, the actual result, and remaining limits. Required for Done.">${escape(task.testEvidence)}</textarea></label>` : '<div class="callout full">Creating a task adds a checklist item. It does not run software, spend money or publish anything.</div>'}
    <p id="form-error" class="form-error full" role="alert" hidden></p><div class="form-actions full"><button type="button" class="button secondary" data-action="close">Cancel</button><button class="button primary" type="submit">${editing ? 'Save progress' : 'Create task'}</button></div></form>`);
}

function download(contents, filename, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([contents],{type}));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function previewImport(text) {
  if (corruptBackup) throw new Error('Recover or reset the unreadable saved data before importing.');
  const incoming = parseImport(text);
  const result = mergeImport(state, incoming);
  openModal(`<span class="eyebrow">IMPORT PREVIEW</span><h2 id="modal-title">Review before merging.</h2><ul class="step-list"><li><strong>${result.added}</strong> new discoveries</li><li><strong>${result.duplicates}</strong> duplicate discoveries skipped; your local records win</li><li><strong>${result.tasksAdded}</strong> new tasks, all blocked for fresh review</li></ul><div class="callout">Imported approvals and checks are reset. Tasks belonging to duplicate imported discoveries are skipped. No current records will be overwritten.</div><div class="form-actions"><button class="button secondary" data-action="close">Cancel</button><button class="button primary" data-action="confirm-import">Merge into workspace</button></div>`);
  importDraft = incoming;
}

document.addEventListener('click', event => {
  const nav = event.target.closest('[data-view]');
  if (nav) { view=nav.dataset.view; location.hash=view; render(); return; }
  const button = event.target.closest('[data-action], #add-discovery, #export-data, #modal-close');
  if (!button) return;
  const action = button.dataset.action || ({'add-discovery':'add','export-data':'export','modal-close':'close'})[button.id];
  try {
    if (action === 'add') leadForm();
    if (action === 'edit') leadForm(button.dataset.id);
    if (action === 'review') reviewForm(button.dataset.id);
    if (action === 'task') taskForm(button.dataset.id);
    if (action === 'edit-task') taskForm(button.dataset.id,true);
    if (action === 'close') closeModal();
    if (action === 'export') { download(exportState(state),`ai-command-center-${new Date().toISOString().slice(0,10)}.json`); notify('Backup downloaded. Keep it somewhere private.'); }
    if (action === 'raw-backup') download(corruptBackup,'ai-command-center-unreadable.txt','text/plain');
    if (action === 'preview-import') previewImport($('#import-text').value);
    if (action === 'confirm-import') {
      if (!importDraft) throw new Error('Preview an import first.');
      const result=mergeImport(state,importDraft);
      commit(result.state,`Imported ${result.added} discoveries and ${result.tasksAdded} tasks. Fresh review required.`); closeModal();
    }
    if (action === 'reset') openModal(`<span class="eyebrow">RESET LOCAL DATA</span><h2 id="modal-title">Clear this workspace?</h2><p>Export a backup first. This removes this app's discoveries, reviews and tasks from this browser.</p><form id="reset-form"><label class="field">Type RESET to continue<input name="confirmation" required autocomplete="off" pattern="RESET"></label><p id="form-error" class="form-error" role="alert" hidden></p><div class="form-actions"><button type="button" class="button secondary" data-action="close">Cancel</button><button class="button danger" type="submit">Clear local workspace</button></div></form>`);
  } catch (error) { notify(error.message,true); }
});

document.addEventListener('submit', event => {
  event.preventDefault();
  const form=event.target, values=Object.fromEntries(new FormData(form));
  try {
    if (form.id === 'lead-form') {
      const next=form.dataset.id ? updateLead(state,form.dataset.id,values) : addLead(state,values);
      commit(next,form.dataset.id ? 'Source updated. Review and linked tasks reset.' : 'Discovery captured. Review it before building.');
    } else if (form.id === 'review-form') {
      for (const key of ['linkChecked','rightsChecked','claimsChecked','privacyChecked']) values[key]=new FormData(form).has(key);
      commit(reviewLead(state,form.dataset.id,values),'Review saved.');
    } else if (form.id === 'task-form') {
      const next=form.dataset.editing === 'true' ? updateTask(state,form.dataset.id,values) : createTask(state,form.dataset.id,values);
      commit(next,'Build task saved.');
    } else if (form.id === 'reset-form') {
      if (values.confirmation !== 'RESET') throw new Error('Type RESET exactly to clear this workspace.');
      localStorage.removeItem(STORAGE_KEY);
      storedRevision=null; externalChange=false; corruptBackup=''; storageError=''; state=emptyState(); render(); notify('Local workspace cleared.');
    } else return;
    closeModal();
  } catch (error) {
    const target=form.querySelector('#form-error');
    if (target) { target.textContent=error.message; target.hidden=false; } else notify(error.message,true);
  }
});

document.addEventListener('input', event => {
  if (event.target.id === 'search-discoveries') {
    const position=event.target.selectionStart;
    query=event.target.value; render();
    const search=$('#search-discoveries'); search.focus(); search.setSelectionRange(position,position);
  }
});
document.addEventListener('change', async event => {
  try {
    if (event.target.id === 'channel-filter') { channelFilter=event.target.value; render(); }
    if (event.target.id === 'review-filter') { reviewFilter=event.target.value; render(); }
    if (event.target.matches('#lead-form [name="channel"]')) syncSurface();
    if (event.target.id === 'import-file') {
      const file=event.target.files[0]; if (!file) return;
      if (file.size > 2 * 1024 * 1024) throw new Error('The backup exceeds the 2 MB limit.');
      previewImport(await file.text());
      event.target.value='';
    }
  } catch (error) { notify(error.message,true); }
});
window.addEventListener('hashchange',()=>{ const next=location.hash.slice(1); if(Object.hasOwn(views,next)){view=next;render();} });
window.addEventListener('storage',event=>{
  if((event.key===STORAGE_KEY || event.key===null) && event.storageArea===localStorage) {
    externalChange=true;
    storageError='This workspace changed in another tab. Export any unsaved work, then reload this page before saving. Your current view has been kept.';
    render();
  }
});
window.addEventListener('beforeunload',event=>{ if(storageError && state.leads.length){ event.preventDefault(); event.returnValue=''; } });
render();
