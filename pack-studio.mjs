import {
  emptyPack, validatePack, packIssues, countWords, exportPack,
  loadPack, importPack, renderReviewHTML, exportPackText,
} from './pack-core.mjs';

const STORAGE_KEY = 'ai-command-center.pack.v1';
const $ = (id) => document.getElementById(id);
let pack = emptyPack();
let preservedRaw = null;
let recoveryLocked = false;
let storageAvailable = true;
let pendingAction = null;
let noticeTimer;

const slideNames = ['The opening', 'The idea', 'The detail', 'The useful part', 'The takeaway', 'The next step'];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildField({ id, label, path, limit, multiline = false, rows = 3, placeholder = '' }) {
  const field = element('div', 'field');
  const labelRow = element('div', 'field-label-row');
  const fieldLabel = element('label', '', label);
  fieldLabel.htmlFor = id;
  const count = element('span', 'word-count', `0 / ${limit} words`);
  count.id = `${id}-count`;
  count.dataset.countPath = path;
  count.dataset.wordLimit = String(limit);
  labelRow.append(fieldLabel, count);
  const input = element(multiline ? 'textarea' : 'input');
  input.id = id;
  input.dataset.path = path;
  input.maxLength = path.startsWith('slides.') ? (path.endsWith('.title') ? 500 : 3000) : path.startsWith('captions.') ? 6000 : path.endsWith('.subject') ? 500 : 10000;
  input.placeholder = placeholder;
  input.setAttribute('aria-describedby', count.id);
  if (multiline) input.rows = rows;
  field.append(labelRow, input);
  return field;
}

for (let i = 0; i < 6; i += 1) {
  const card = element('article', 'slide-editor');
  const heading = element('div', 'slide-editor-heading');
  heading.append(element('span', 'slide-number', String(i + 1).padStart(2, '0')), element('h3', '', slideNames[i]));
  card.append(heading,
    buildField({ id: `slide-title-${i + 1}`, label: 'Slide heading', path: `slides.${i}.title`, limit: 12, placeholder: 'A short, specific heading' }),
    buildField({ id: `slide-body-${i + 1}`, label: 'Slide body', path: `slides.${i}.body`, limit: 45, multiline: true, placeholder: 'One useful, source-supported point.' }),
  );
  $('slide-fields').append(card);
}
for (let i = 0; i < 5; i += 1) {
  $('caption-fields').append(buildField({ id: `caption-${i + 1}`, label: `Caption ${i + 1}`, path: `captions.${i}`, limit: 80, multiline: true, rows: 4, placeholder: 'A distinct angle on the same supported idea.' }));
}
$('newsletter-fields').append(
  buildField({ id: 'newsletter-subject', label: 'Subject line', path: 'newsletter.subject', limit: 16, placeholder: 'A useful reason to open' }),
  buildField({ id: 'newsletter-body', label: 'Newsletter body', path: 'newsletter.body', limit: 180, multiline: true, rows: 8, placeholder: 'An opening, the useful details, and a supported next step.' }),
);

const inputs = [...document.querySelectorAll('[data-path]')];
const checks = [...document.querySelectorAll('[data-check]')];

function getPath(path) {
  return path.split('.').reduce((value, key) => value[key], pack);
}

function setPath(path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((value, key) => value[key], pack);
  target[last] = value;
}

function showNotice(message, error = false, persistent = false) {
  clearTimeout(noticeTimer);
  $('app-message').textContent = message;
  $('app-message').classList.toggle('error', error);
  $('app-message').hidden = false;
  if (!persistent) noticeTimer = setTimeout(() => { $('app-message').hidden = true; }, 9000);
}

function save() {
  if (recoveryLocked) return;
  try {
    localStorage.setItem(STORAGE_KEY, exportPack(pack));
    storageAvailable = true;
    $('save-status').textContent = 'Saved in this browser only';
    $('save-status').classList.remove('warning');
  } catch {
    storageAvailable = false;
    $('save-status').textContent = 'Memory only — download JSON to keep edits';
    $('save-status').classList.add('warning');
    showNotice('Browser saving is unavailable. Your edits remain open in memory; download a JSON backup before leaving this page.', true, true);
  }
}

function updateCounts() {
  for (const count of document.querySelectorAll('[data-count-path]')) {
    const words = countWords(getPath(count.dataset.countPath));
    const limit = Number(count.dataset.wordLimit);
    count.textContent = `${words} / ${limit} words`;
    count.classList.toggle('over', words > limit);
    const input = document.querySelector(`[data-path="${count.dataset.countPath}"]`);
    input.setAttribute('aria-invalid', String(words > limit));
  }
  const slideCount = pack.slides.filter((slide) => slide.title.trim() && slide.body.trim()).length;
  const captionCount = pack.captions.filter((caption) => caption.trim()).length;
  const newsletterCount = pack.newsletter.subject.trim() && pack.newsletter.body.trim() ? 1 : 0;
  $('slides-progress').textContent = `${slideCount} / 6`;
  $('captions-progress').textContent = `${captionCount} / 5`;
  for (const [id, current, total] of [['scope-slides', slideCount, 6], ['scope-captions', captionCount, 5], ['scope-newsletter', newsletterCount, 1]]) {
    $(id).replaceChildren(document.createTextNode(String(current)), element('span', '', `/${total}`));
  }
}

function updatePreview() {
  const index = Number($('preview-slide').value);
  const slide = pack.slides[index];
  $('preview-brand').textContent = pack.brand.trim() || 'YOUR PROJECT';
  $('preview-slide-title').textContent = slide.title.trim() || 'A little space for a good idea.';
  $('preview-slide-body').textContent = slide.body.trim() || 'Your slide copy will appear here as you write.';
  $('preview-number').textContent = `${String(index + 1).padStart(2, '0')} / 06`;
  const label = pack.fictional ? 'FICTIONAL SAMPLE' : 'INTERNAL DRAFT';
  $('pack-badge').textContent = label;
  $('preview-label').textContent = label;
}

function updateReadiness() {
  const issues = packIssues(pack);
  const ready = issues.length === 0;
  $('review-status').classList.toggle('ready', ready);
  $('readiness-title').textContent = ready ? 'Ready for client review' : 'Draft in progress';
  $('readiness-detail').textContent = ready ? 'The pack is complete and the source checks are recorded. A human still needs to review and approve its use.' : `${issues.length} ${issues.length === 1 ? 'item needs' : 'items need'} attention. You can still export a clearly labelled draft.`;
  $('review-status').querySelector('.status-ring').textContent = ready ? '✓' : '○';
  $('issues-summary').textContent = ready ? 'All completion checks are recorded' : `What still needs attention (${issues.length})`;
  $('issues-list').replaceChildren(...issues.map((issue) => element('li', '', issue)));
  if (ready) $('issues-list').append(element('li', '', 'Review the exported pack with the client before any external use.'));
}

function render() {
  for (const input of inputs) {
    if (input.type === 'checkbox') input.checked = getPath(input.dataset.path);
    else input.value = getPath(input.dataset.path);
  }
  for (const check of checks) check.checked = pack.checks[check.dataset.check];
  updateCounts();
  updatePreview();
  updateReadiness();
}

for (const input of inputs) {
  input.addEventListener('input', () => {
    const previous = getPath(input.dataset.path);
    setPath(input.dataset.path, input.type === 'checkbox' ? input.checked : input.value);
    try {
      validatePack(pack);
    } catch (error) {
      setPath(input.dataset.path, previous);
      if (input.type === 'checkbox') input.checked = previous;
      else input.value = previous;
      showNotice(`The last valid field value was kept. ${error.message}`, true);
      return;
    }
    const hadChecks = pack.checks.permission || pack.checks.facts;
    pack.checks = { permission: false, facts: false };
    for (const check of checks) check.checked = false;
    updateCounts();
    updatePreview();
    updateReadiness();
    save();
    if (hadChecks && storageAvailable) showNotice('The copy changed. Source permission and fact checks have been cleared for this version.');
  });
  if (input.dataset.path.startsWith('slides.')) {
    input.addEventListener('focus', () => {
      $('preview-slide').value = input.dataset.path.split('.')[1];
      updatePreview();
    });
  }
}
for (const check of checks) {
  check.addEventListener('change', () => {
    pack.checks[check.dataset.check] = check.checked;
    updateReadiness();
    save();
  });
}
$('preview-slide').addEventListener('change', updatePreview);
$('pack-editor').addEventListener('submit', (event) => event.preventDefault());

function download(filename, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportFile(kind) {
  if (recoveryLocked) {
    showNotice('Download the original saved data or explicitly reset the preserved draft first.', true);
    return;
  }
  try {
    const safePack = validatePack(pack);
    if (kind === 'json') download('content-pack-draft.json', exportPack(safePack), 'application/json;charset=utf-8');
    if (kind === 'text') download('content-pack-draft.txt', exportPackText(safePack), 'text/plain;charset=utf-8');
    if (kind === 'html') download('content-pack-review-draft.html', renderReviewHTML(safePack), 'text/html;charset=utf-8');
    showNotice(kind === 'json' ? 'JSON backup downloaded. Keep it private; it contains the source and your editable draft.' : 'Draft downloaded. Open it locally to review; nothing has been sent or published.');
  } catch (error) {
    showNotice(`Export could not complete: ${error.message}`, true);
  }
}
for (const kind of ['json', 'text', 'html']) $( `export-${kind}`).addEventListener('click', () => exportFile(kind));

function hasWork() {
  const blank = emptyPack();
  return JSON.stringify(pack) !== JSON.stringify(blank);
}

function requestReplacement({ title, copy, confirmText, nextPack, preview = false, reset = false }) {
  if (recoveryLocked && !reset) {
    showNotice('Your unreadable saved draft is preserved. Download the original, then use “Reset preserved draft” before replacing it.', true);
    $('recovery').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  $('dialog-title').textContent = title;
  $('dialog-copy').textContent = copy;
  $('dialog-confirm').textContent = confirmText;
  $('import-preview').hidden = !preview;
  $('import-preview').replaceChildren();
  if (preview) {
    const filled = nextPack.slides.filter((slide) => slide.title.trim() && slide.body.trim()).length;
    for (const [label, value] of [['Pack title', nextPack.title || '(untitled)'], ['Brand', nextPack.brand || '(not supplied)'], ['Type', nextPack.fictional ? 'Fictional practice' : 'Internal draft'], ['Contents', `${filled} of 6 slides filled, ${nextPack.captions.filter((caption) => caption.trim()).length} of 5 captions filled`], ['Review checks', 'Cleared on import; review this version again']]) {
      $('import-preview').append(element('dt', '', label), element('dd', '', value));
    }
  }
  pendingAction = () => {
    if (reset) {
      preservedRaw = null;
      recoveryLocked = false;
      $('recovery').hidden = true;
      $('editing-fields').disabled = false;
    }
    pack = nextPack;
    $('preview-slide').value = '0';
    render();
    save();
    if (storageAvailable) showNotice(reset ? 'Started a fresh draft. Only this Pack Studio draft was reset.' : 'Draft loaded locally. Source and fact checks need to be reviewed for this version.');
  };
  $('confirm-dialog').returnValue = '';
  $('confirm-dialog').showModal();
}
$('confirm-dialog').addEventListener('close', () => {
  const action = pendingAction;
  pendingAction = null;
  if ($('confirm-dialog').returnValue === 'confirm') action?.();
});

function fictionalExample() {
  return validatePack({
    packVersion: 1,
    title: 'A first sketch · fictional practice pack',
    brand: 'Harbor Studio',
    sourceReference: 'Invented Harbor Studio brief · practice source only',
    sourceText: 'FICTIONAL PRACTICE SOURCE. Harbor Studio is an invented business, not a real workshop or offer. Its beginner sketching session is for adults aged 18 and over. Beginners are welcome. The fictional session runs on Sunday from 10:00 to 11:30. All materials are included. Groups have up to eight people. The fictional price is £18 per session. No real booking, contact or availability is offered.',
    fictional: true,
    slides: [
      { title: 'Start with a sketch.', body: 'A beginner sketching session at fictional Harbor Studio. Beginners are welcome. This is a practice example, not a real workshop.' },
      { title: 'A place to begin.', body: 'The fictional session welcomes beginners aged 18 and over. No experience claim or result is promised.' },
      { title: 'A Sunday session.', body: 'Sunday, 10:00–11:30. These are invented workshop details for this sample. No date or real availability is offered.' },
      { title: 'All materials included.', body: 'The fictional source includes all materials in the session. It does not specify particular supplies.' },
      { title: 'Up to eight people.', body: 'That is the fictional group capacity. It is not a claim about remaining places or demand.' },
      { title: 'The details, together.', body: 'Beginner sketching. Adults 18+. Sunday, 10:00–11:30. All materials included. Groups up to eight. Fictional price: £18 per session. This sample has no real booking.' },
    ],
    captions: [
      'A sketch can be a place to begin. Fictional Harbor Studio welcomes beginners aged 18 and over to its sketching session. This is a practice sample, not a real workshop or booking.',
      'All materials are included in this fictional beginner sketching session. The source keeps the details simple; the copy does too. Harbor Studio is invented for this demonstration.',
      'The fictional Sunday session runs from 10:00 to 11:30, with up to eight adults per group. This is sample copy. No real date, availability or booking is offered.',
      'Beginners welcome. Adults 18+. A short, source-grounded introduction to fictional Harbor Studio’s sketching session. This demonstration makes no promises about learning results.',
      'The fictional details in one place: beginner sketching, Sunday 10:00–11:30, all materials included, groups of up to eight, £18 per session. Practice sample only; no real purchase is available.',
    ],
    newsletter: {
      subject: 'A first sketch: a fictional workshop introduction',
      body: 'Begin with the details. Fictional Harbor Studio’s beginner sketching session is for adults aged 18 and over, and beginners are welcome.\n\nThe invented session runs on Sunday from 10:00 to 11:30. All materials are included, with up to eight people per group. The fictional price is £18 per session.\n\nThis is a practice content pack built from an invented source. Harbor Studio is not a real workshop in this example. No booking, contact or availability is offered. Review how the same small source becomes a carousel, captions and a newsletter without inventing extra business claims.',
    },
    checks: { permission: false, facts: false },
  });
}
$('load-sample').addEventListener('click', () => {
  const nextPack = fictionalExample();
  if (hasWork() || recoveryLocked) requestReplacement({ title: 'Replace with the fictional example?', copy: 'This loads a complete invented Harbor Studio draft so you can try editing and exporting. It replaces this pack’s current fields.', confirmText: 'Load fictional example', nextPack });
  else {
    pack = nextPack;
    render();
    save();
    if (storageAvailable) showNotice('Fictional example loaded. Review the source, try editing, then download the draft.');
  }
});
$('new-pack').addEventListener('click', () => requestReplacement({ title: 'Start a fresh pack?', copy: 'This clears this Pack Studio draft, including its source and checks. Previously downloaded files and the Command Center workspace are unchanged.', confirmText: 'Start fresh', nextPack: emptyPack() }));
$('open-import').addEventListener('click', () => {
  if (recoveryLocked) {
    showNotice('Download or explicitly reset the preserved draft before importing a replacement.', true);
    return;
  }
  $('import-file').click();
});
$('import-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 1000000) throw new Error('Choose a Pack Studio JSON backup smaller than 1 MB.');
    const nextPack = importPack(await file.text());
    requestReplacement({ title: 'Review this import.', copy: 'The file is valid. Importing replaces this Pack Studio draft; it does not merge with your current copy. Review checks are cleared.', confirmText: 'Replace with imported draft', nextPack, preview: true });
  } catch (error) {
    showNotice(`Import failed. Your current draft is unchanged. ${error.message}`, true);
  } finally {
    event.target.value = '';
  }
});
$('download-raw').addEventListener('click', () => {
  if (preservedRaw === null) return;
  download('content-pack-preserved-original.txt', preservedRaw, 'text/plain;charset=utf-8');
  showNotice('Original saved text downloaded. It has not been changed in this browser.');
});
$('reset-saved').addEventListener('click', () => requestReplacement({ title: 'Reset the preserved draft?', copy: 'The saved copy could not be read. This will replace it with an empty pack. Download the original first if you want to keep its contents.', confirmText: 'Reset saved draft', nextPack: emptyPack(), reset: true }));

try {
  preservedRaw = localStorage.getItem(STORAGE_KEY);
  if (preservedRaw !== null) {
    try {
      pack = loadPack(preservedRaw);
      preservedRaw = null;
    } catch {
      recoveryLocked = true;
      $('recovery').hidden = false;
      $('editing-fields').disabled = true;
      $('save-status').textContent = 'Unreadable draft preserved — see recovery';
      $('save-status').classList.add('warning');
    }
  }
} catch {
  storageAvailable = false;
  $('save-status').textContent = 'Memory only — download JSON to keep edits';
  $('save-status').classList.add('warning');
  showNotice('Browser storage is unavailable. Work can stay open in memory; download JSON before leaving the page.', true, true);
}
render();
if (!recoveryLocked && storageAvailable) $('save-status').textContent = 'Local draft — saved as you edit';
