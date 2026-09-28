/**
 * Meryem App — Main Application
 * Bottom-nav tab switching, the feature-init dispatcher, localStorage helpers (kept for
 * migration), modal/toast helpers, and PWA registration.
 * Init flow: DOMContentLoaded calls initTabs() once; firebase.js's onAppReady() calls it again
 * (idempotent, a module flag guards it) plus initFeatures() once auth confirms a session.
 *
 * Active-state convention for every feature agent building on this foundation: the class that
 * marks something as currently shown is always `is-active` — `.view.is-active`,
 * `.subview.is-active`, `.nav-btn.is-active`, and the memories segmented-control buttons.
 */

var _tabsInitialized = false;

document.addEventListener('DOMContentLoaded', function () {
  initTabs();
  if (typeof fxFloatingHearts === 'function') fxFloatingHearts(true);
});

/* ── Tab Navigation ─────────────────────────────────── */

/**
 * Wires every .nav-btn to showTab(). Idempotent — safe to call again from onAppReady(), which
 * runs after a second DOMContentLoaded-time call already happened.
 */
function initTabs() {
  if (_tabsInitialized) return;
  _tabsInitialized = true;

  var navButtons = document.querySelectorAll('.nav-btn');
  navButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      showTab(btn.dataset.tab);
    });
  });
}

/**
 * Activates a view and its matching nav button, and announces the change so any feature can
 * react (e.g. the memories map needs a resize the moment it becomes visible again).
 * @param {string} id - a view element's id, e.g. 'today-view'
 */
function showTab(id) {
  var target = document.getElementById(id);
  if (!target) return;

  document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('is-active'); });
  document.querySelectorAll('.nav-btn').forEach(function (b) { b.classList.remove('is-active'); });

  target.classList.add('is-active');
  var btn = document.querySelector('.nav-btn[data-tab="' + id + '"]');
  if (btn) btn.classList.add('is-active');

  document.dispatchEvent(new CustomEvent('meryem:tab', { detail: { tab: id } }));

  /* Kept working here until the Anılar agent takes ownership via the meryem:tab event above. */
  if (id === 'memories-view' && window.appMap) {
    var mapView = document.getElementById('map-view');
    if (mapView && mapView.classList.contains('is-active')) {
      requestAnimationFrame(function () {
        window.appMap.invalidateSize();
      });
    }
  }
}

/* ── Feature Init Dispatcher ─────────────────────────── */

/**
 * Calls every feature's init function if one is defined, each isolated by try/catch so a broken
 * or not-yet-built feature never stops the others. Until each feature agent lands its own
 * js/dates.js, js/words.js, js/gate.js, js/birthday.js, most of these are silently skipped.
 */
function initFeatures() {
  var names = ['initToday', 'initDates', 'initWords', 'initBirthday', 'initMemoriesSwitch'];
  names.forEach(function (name) {
    if (typeof window[name] === 'function') {
      try {
        window[name]();
      } catch (e) {
        console.error('initFeatures: ' + name + ' failed', e);
      }
    }
  });

  if (typeof window.startGateIfDue === 'function') {
    try {
      window.startGateIfDue();
    } catch (e) {
      console.error('initFeatures: startGateIfDue failed', e);
    }
  }
}

/* Default gallery/map segmented control — kept working until the Anılar agent overwrites
   window.initMemoriesSwitch with its own (declared earlier in script-load order than app.js, so
   this guard never clobbers a real implementation; app.js loads last). */
if (typeof window.initMemoriesSwitch !== 'function') {
  window.initMemoriesSwitch = function () {
    var switchEl = document.getElementById('memories-switch');
    if (!switchEl) return;
    var buttons = switchEl.querySelectorAll('[data-seg]');

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var seg = btn.dataset.seg;

        buttons.forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');

        document.querySelectorAll('.subview').forEach(function (sv) { sv.classList.remove('is-active'); });
        var target = document.getElementById(seg + '-view');
        if (target) target.classList.add('is-active');

        if (seg === 'map' && window.appMap) {
          requestAnimationFrame(function () {
            window.appMap.invalidateSize();
          });
        }
      });
    });
  };
}

/* ── localStorage Helpers (kept for migration) ──────── */

function loadData(key) {
  try {
    var data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.warn('localStorage read error:', e);
    return [];
  }
}

function saveData(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    alert('Depolama alanı dolu! Bazı fotoğrafları silmeyi dene.');
  }
}

/* ── Modal Helpers ──────────────────────────────────── */

var _modalReturnFocusEl = null;
var _modalOpenId = null;

/**
 * m7: #memory-modal/#detail-modal are real dialogs (role="dialog" aria-modal="true" in
 * index.html) — the background is inerted, focus moves in, and Escape/close restore it.
 * Unlike js/gate.js and js/birthday.js's own overlays (siblings of #app-content, so they inert
 * the whole thing), these two modals are themselves DOM CHILDREN of #app-content — inerting
 * #app-content here would inert the modal being opened too, so every OTHER child of #app-content
 * is inerted instead, leaving the modal itself fully interactive.
 */
function openModal(id) {
  var modal = document.getElementById(id);
  if (!modal) return;
  _modalOpenId = id;
  _modalReturnFocusEl = document.activeElement;

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  var appContent = document.getElementById('app-content');
  if (appContent) {
    Array.prototype.forEach.call(appContent.children, function (child) {
      if (child !== modal) child.setAttribute('inert', '');
    });
  }

  var closeBtn = modal.querySelector('.modal-close');
  if (closeBtn) {
    try { closeBtn.focus(); } catch (e) { /* not focusable — ignore */ }
  }
  document.addEventListener('keydown', _modalKeydown);
}

function closeModal(id) {
  var modal = document.getElementById(id);
  if (!modal) return;

  modal.classList.remove('open');
  document.body.style.overflow = '';

  var appContent = document.getElementById('app-content');
  if (appContent) {
    Array.prototype.forEach.call(appContent.children, function (child) {
      child.removeAttribute('inert');
    });
  }

  document.removeEventListener('keydown', _modalKeydown);
  if (_modalOpenId === id) _modalOpenId = null;

  var toFocus = _modalReturnFocusEl;
  _modalReturnFocusEl = null;
  if (toFocus && typeof toFocus.focus === 'function' && document.contains(toFocus)) {
    try { toFocus.focus(); } catch (e) { /* element no longer focusable — ignore */ }
  }
}

function _modalKeydown(e) {
  if (e.key === 'Escape' && _modalOpenId) closeModal(_modalOpenId);
}

/* ── Toast Notification ─────────────────────────────── */

function showToast(message, duration) {
  var ms = duration || 2000;
  var existing = document.querySelector('.toast');
  if (existing) existing.remove();

  var toast = document.createElement('div');
  toast.className = 'toast';
  /* m8: without this a toast is silent to VoiceOver — role=status + aria-live=polite gets
     "Anı kaydedildi!" and the upload progress announced without stealing focus. */
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(function () { toast.classList.add('show'); }, 10);
  setTimeout(function () {
    toast.classList.remove('show');
    setTimeout(function () { toast.remove(); }, 300);
  }, ms);
}

/* ── Service Worker ─────────────────────────────────── */

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {
      /* SW registration failed — app still works without it */
    });
  }
}
