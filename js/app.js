/**
 * Meryem App — Main Application
 * Tab navigation, localStorage helpers (kept for migration), and PWA registration.
 * Init flow is controlled by firebase.js auth state.
 */

document.addEventListener('DOMContentLoaded', function () {
  /* Only init tabs here — the rest waits for Firebase auth in firebase.js → onAppReady() */
  initTabs();
});

/* ── Tab Navigation ─────────────────────────────────── */

function initTabs() {
  var tabs = document.querySelectorAll('.tab-btn');
  var views = document.querySelectorAll('.view');

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var target = tab.dataset.tab;

      tabs.forEach(function (t) { t.classList.remove('active'); });
      views.forEach(function (v) { v.classList.remove('active'); });

      tab.classList.add('active');
      document.getElementById(target).classList.add('active');

      if (target === 'map-view' && window.appMap) {
        window.appMap.invalidateSize();
      }
    });
  });
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

function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

/* ── Toast Notification ─────────────────────────────── */

function showToast(message, duration) {
  var ms = duration || 2000;
  var existing = document.querySelector('.toast');
  if (existing) existing.remove();

  var toast = document.createElement('div');
  toast.className = 'toast';
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
