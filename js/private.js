/**
 * Meryem App — Private texts
 * The couple's personal texts are not shipped with the page. After sign-in they are read from one
 * Firestore document, users/{uid}/private/texts = { json: '<payload as a JSON string>', updatedAt },
 * and merged into the globals the rest of the app already reads (CONTENT, CONFIG, LOVE_MESSAGES).
 * Payload: { version: 1, content: {...}, config: {...}, loveMessages: [...] } — each part optional.
 * Runs once, from firebase.js's auth callback, before the app is shown; with no document the texts
 * in js/content.js and js/data.js simply stay. Also holds the small import/export panel that is
 * opened by adding ?ozel-metin to the address after sign-in. Firestore is reached through
 * userCollection() only (tests/checks/rules.mjs).
 */

var PRIVATE_DOC = 'texts';
var PRIVATE_VERSION = 1;
var PRIVATE_KEYS = ['version', 'content', 'config', 'loveMessages'];

/* ── Pure helpers ───────────────────────────────────── */

function _isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

/** Keys that would reach Object.prototype through an assignment — never merged. */
function _isUnsafeKey(key) {
  return key === '__proto__' || key === 'constructor' || key === 'prototype';
}

/**
 * Merges `source` into `target` in place. Plain objects recurse; strings, numbers, booleans and
 * arrays replace; a string arriving where `target` holds a Date becomes a Date. A value of another
 * type than the current one is skipped with a warning — a bad document must never throw. Keys the
 * target lacks, and target values that are null/undefined, accept any type.
 */
function _mergeInto(target, source, path) {
  Object.keys(source).forEach(function (key) {
    if (_isUnsafeKey(key)) return;
    var next = source[key];
    var current = target[key];
    var where = path + '.' + key;

    if (current === undefined || current === null) {
      target[key] = next;
    } else if (current instanceof Date) {
      var parsed = typeof next === 'string' ? new Date(next) : null;
      if (parsed && !isNaN(parsed.getTime())) target[key] = parsed;
      else console.warn('private texts: ' + where + ' is not a valid date, skipped');
    } else if (Array.isArray(current)) {
      if (Array.isArray(next)) target[key] = next;
      else console.warn('private texts: ' + where + ' is not a list, skipped');
    } else if (_isPlainObject(current)) {
      if (_isPlainObject(next)) _mergeInto(current, next, where);
      else console.warn('private texts: ' + where + ' is not an object, skipped');
    } else if (typeof next === typeof current) {
      target[key] = next;
    } else {
      console.warn('private texts: ' + where + ' has the wrong type, skipped');
    }
  });
}

/**
 * Checks a payload object. Used by the loader and by the panel, so a file the panel accepts is a
 * file the loader accepts.
 * @param {*} obj
 * @returns {{ ok: boolean, reason: string }}
 */
function validatePrivatePayload(obj) {
  if (!_isPlainObject(obj)) return { ok: false, reason: 'not an object' };
  if (obj.version !== PRIVATE_VERSION) return { ok: false, reason: 'version must be ' + PRIVATE_VERSION };
  var unknown = Object.keys(obj).filter(function (key) { return PRIVATE_KEYS.indexOf(key) === -1; });
  if (unknown.length) return { ok: false, reason: 'unknown key ' + unknown[0] };
  if ('content' in obj && !_isPlainObject(obj.content)) return { ok: false, reason: 'content must be an object' };
  if ('config' in obj && !_isPlainObject(obj.config)) return { ok: false, reason: 'config must be an object' };
  if ('loveMessages' in obj) {
    var list = obj.loveMessages;
    var allStrings = Array.isArray(list) && list.every(function (item) { return typeof item === 'string'; });
    if (!allStrings) return { ok: false, reason: 'loveMessages must be a list of strings' };
  }
  return { ok: true, reason: '' };
}

/**
 * Merges a validated payload into CONTENT, CONFIG and LOVE_MESSAGES, all in place (CONFIG and
 * LOVE_MESSAGES are const — they are mutated, never reassigned).
 * @param {{ content?: Object, config?: Object, loveMessages?: string[] }} payload
 */
function applyPrivateTexts(payload) {
  if (!_isPlainObject(payload)) return;
  if (_isPlainObject(payload.content)) _mergeInto(CONTENT, payload.content, 'content');
  if (_isPlainObject(payload.config)) _mergeInto(CONFIG, payload.config, 'config');
  if (Array.isArray(payload.loveMessages)) {
    var messages = payload.loveMessages.filter(function (item) { return typeof item === 'string'; });
    /* An empty list would leave the daily message with nothing to pick from. */
    if (messages.length) {
      LOVE_MESSAGES.length = 0;
      messages.forEach(function (item) { LOVE_MESSAGES.push(item); });
    } else {
      console.warn('private texts: loveMessages is empty, skipped');
    }
  }
}

/* ── Load ───────────────────────────────────────────── */

function _privateLoadFailed(err) {
  console.error('private texts failed to load', err);
  if (typeof showToast === 'function') showToast(CONTENT.privateTexts.loadError);
}

/**
 * Reads users/{uid}/private/texts and applies it. Always resolves: no document is the normal
 * state before the first upload (silent); a read, parse or validation failure is logged and
 * toasted once. The caller shows the app after this settles.
 * @returns {Promise<void>}
 */
function loadPrivateTexts() {
  try {
    return userCollection('private').doc(PRIVATE_DOC).get().then(function (snap) {
      if (!snap.exists) return;
      var payload = JSON.parse(snap.data().json);
      var verdict = validatePrivatePayload(payload);
      if (!verdict.ok) throw new Error('invalid private payload: ' + verdict.reason);
      applyPrivateTexts(payload);
    }).catch(_privateLoadFailed);
  } catch (err) {
    _privateLoadFailed(err);
    return Promise.resolve();
  }
}

/* ── Import / export panel (?ozel-metin) ────────────── */

var PRIVATE_PANEL_ID = 'private-modal';

function _privateToast(key, reason) {
  var text = CONTENT.privateTexts.panel[key];
  if (reason !== undefined) text = text.replace('{reason}', reason);
  if (typeof showToast === 'function') showToast(text, 3500);
}

function _privateUpload(file) {
  var reader = new FileReader();
  reader.onerror = function () { _privateToast('invalid', 'unreadable file'); };
  reader.onload = function () {
    var text = String(reader.result);
    var payload;
    try {
      payload = JSON.parse(text);
    } catch (err) {
      _privateToast('invalid', 'not valid JSON');
      return;
    }
    var verdict = validatePrivatePayload(payload);
    if (!verdict.ok) {
      _privateToast('invalid', verdict.reason);
      return;
    }
    userCollection('private').doc(PRIVATE_DOC).set({
      json: text,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      _privateToast('saved');
    }).catch(function (err) {
      console.error('private texts could not be saved', err);
      _privateToast('saveError');
    });
  };
  reader.readAsText(file);
}

function _privateDownload() {
  userCollection('private').doc(PRIVATE_DOC).get().then(function (snap) {
    if (!snap.exists) {
      _privateToast('noDocument');
      return;
    }
    var blob = new Blob([snap.data().json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'ozel-metinler.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }).catch(function (err) {
    console.error('private texts could not be read', err);
    _privateToast('downloadError');
  });
}

function _buildPrivatePanel() {
  var text = CONTENT.privateTexts.panel;
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = PRIVATE_PANEL_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', text.title);

  var box = document.createElement('div');
  box.className = 'modal';

  var header = document.createElement('div');
  header.className = 'modal-header';
  var title = document.createElement('h2');
  title.textContent = text.title;
  var close = document.createElement('button');
  close.type = 'button';
  close.className = 'modal-close';
  close.setAttribute('aria-label', 'Kapat');
  close.innerHTML = '&times;';
  close.addEventListener('click', function () { closeModal(PRIVATE_PANEL_ID); });
  header.appendChild(title);
  header.appendChild(close);

  var hint = document.createElement('p');
  hint.textContent = text.hint;

  var input = document.createElement('input');
  input.type = 'file';
  input.id = 'private-file-input';
  input.accept = '.json,application/json';
  input.hidden = true;
  input.addEventListener('change', function () {
    var file = input.files && input.files[0];
    input.value = '';
    if (file) _privateUpload(file);
  });

  var choose = document.createElement('button');
  choose.type = 'button';
  choose.id = 'private-choose-btn';
  choose.className = 'btn btn-primary btn-full';
  choose.textContent = text.choose;
  choose.addEventListener('click', function () { input.click(); });

  var download = document.createElement('button');
  download.type = 'button';
  download.id = 'private-download-btn';
  download.className = 'btn btn-primary btn-full';
  download.textContent = text.download;
  download.addEventListener('click', _privateDownload);

  box.appendChild(header);
  box.appendChild(hint);
  box.appendChild(input);
  box.appendChild(choose);
  box.appendChild(download);
  overlay.appendChild(box);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeModal(PRIVATE_PANEL_ID);
  });
  /* openModal() inerts every other child of #app-content, so the panel must live inside it. */
  document.getElementById('app-content').appendChild(overlay);
  return overlay;
}

/** Opens the panel when the address carries ?ozel-metin. Called once, from onAppReady(). */
function maybeOpenPrivatePanel() {
  var asked = false;
  try {
    asked = new URLSearchParams(window.location.search).has('ozel-metin');
  } catch (err) {
    asked = false;
  }
  if (!asked) return;
  if (!document.getElementById(PRIVATE_PANEL_ID)) _buildPrivatePanel();
  openModal(PRIVATE_PANEL_ID);
}
