/**
 * Meryem App — Bugün (Today)
 * Daily love message + shuffle and the Firestore-synced to-do list (same logic and same
 * Firestore calls as before this package's rework) plus this package's own additions: a
 * time-of-day bear greeting and the "days together" pill with its next-milestone line.
 *
 * Countdown rendering (elapsed timers, birthday countdowns) now lives entirely in js/dates.js —
 * this file no longer owns any of it.
 */
(function () {
  'use strict';

  var todos = [];

  /* ── Daily message + Firestore to-do (unchanged behaviour) ───────────── */

  /** True for the whole calendar day of her birthday (local), read through appNow(). */
  function isHerBirthdayToday() {
    var now = appNow();
    return now.getMonth() === CONFIG.herBirthday.month - 1 && now.getDate() === CONFIG.herBirthday.day;
  }

  /** Today's note: the birthday message all day on her birthday, the usual daily line otherwise. */
  function todaysMessage() {
    if (isHerBirthdayToday() && CONTENT.greetings && CONTENT.greetings.birthdayMessage) {
      return CONTENT.greetings.birthdayMessage;
    }
    return getDailyMessage();
  }

  function initDaily() {
    /* Daily message */
    document.getElementById('daily-message').textContent = todaysMessage();

    /* Shuffle button */
    document.getElementById('shuffle-btn').addEventListener('click', function () {
      var msgEl = document.getElementById('daily-message');
      msgEl.style.opacity = '0';
      setTimeout(function () {
        msgEl.textContent = getRandomMessage(msgEl.textContent);
        msgEl.style.opacity = '1';
      }, 250);
    });

    /* Subscribe to Firestore todos (real-time sync) */
    subscribeTodos(function (updatedTodos) {
      todos = updatedTodos;
      renderTodos();
    });

    /* Todo form */
    document.getElementById('todo-form').addEventListener('submit', function (e) {
      e.preventDefault();
      addTodo();
    });

    /* Event delegation for todo actions */
    document.getElementById('todo-list').addEventListener('click', function (e) {
      var toggleEl = e.target.closest('[data-toggle-id]');
      if (toggleEl) {
        toggleTodo(toggleEl.dataset.toggleId);
        return;
      }
      var deleteEl = e.target.closest('[data-delete-id]');
      if (deleteEl) {
        deleteTodo(deleteEl.dataset.deleteId);
      }
    });
  }

  function addTodo() {
    var input = document.getElementById('todo-input');
    var text = input.value.trim();
    if (!text) return;

    addTodoToFirestore({ text: text, done: false });
    input.value = '';
  }

  function toggleTodo(id) {
    var todo = todos.find(function (t) { return t.id === id; });
    if (todo) {
      updateTodoInFirestore(id, { done: !todo.done });
    }
  }

  function deleteTodo(id) {
    deleteTodoFromFirestore(id);
  }

  function renderTodos() {
    var list = document.getElementById('todo-list');

    if (todos.length === 0) {
      list.innerHTML =
        '<div class="bgn-todo-empty">' +
          '<div class="bgn-todo-empty-bear">' + bearSVG({ mood: 'pleading', arms: 'down', size: 60 }) + '</div>' +
          '<p class="todo-empty">Henüz bir plan eklenmedi</p>' +
        '</div>';
      return;
    }

    list.innerHTML = todos.map(function (t) {
      return '<div class="todo-item' + (t.done ? ' done' : '') + '">' +
        '<label class="todo-check" data-toggle-id="' + escapeHtml(t.id) + '">' +
          /* No tabindex="-1": the checkbox is visually hidden in favour of the painted .checkmark
             sibling (style.css), but must stay in the natural tab order for a keyboard-only user —
             bugun.css draws the focus ring on the sibling since the input itself is invisible. */
          '<input type="checkbox"' + (t.done ? ' checked' : '') + '>' +
          '<span class="checkmark"></span>' +
        '</label>' +
        '<span class="todo-text">' + escapeHtml(t.text) + '</span>' +
        '<button class="todo-delete" data-delete-id="' + escapeHtml(t.id) + '" title="Sil">&times;</button>' +
      '</div>';
    }).join('');
  }

  /* ── Time-of-day greeting bear ────────────────────────────────────────── */

  var GREETING_POSE = {
    morning: { mood: 'happy', arms: 'wave' },
    afternoon: { mood: 'normal', arms: 'down', heart: true },
    evening: { mood: 'love', arms: 'down' },
    /* Bigger than the other buckets' shared 80: the sleepy mood's 'z' glyphs are fixed-size SVG
       <text> nodes (18px/13px, in bear viewBox units — js/bears.js, not owned by this package)
       that scale down with the whole bear. At 80 they render at ~7px/~5px, effectively invisible
       on a real phone; 100 keeps the same pose/mood but renders them at a legible ~9px/~6.5px. */
    night: { mood: 'sleepy', arms: 'down', size: 100 },
    /* Her birthday, all day: a party-hat bear holding a heart. */
    birthday: { mood: 'love', arms: 'wave', heart: true, hat: true }
  };

  /**
   * @param {number} hour - 0..23, from appNow()
   * @returns {string} 'morning'|'afternoon'|'evening'|'night'
   */
  function greetingBucket(hour) {
    if (hour >= 5 && hour <= 11) return 'morning';
    if (hour >= 12 && hour <= 17) return 'afternoon';
    if (hour >= 18 && hour <= 22) return 'evening';
    return 'night';
  }

  function renderGreeting() {
    var el = document.getElementById('today-greeting');
    if (!el) return;

    var bucket = greetingBucket(appNow().getHours());
    var birthdayLines = CONTENT.greetings && CONTENT.greetings.birthday;
    if (isHerBirthdayToday() && birthdayLines && birthdayLines.length) bucket = 'birthday';
    var pose = GREETING_POSE[bucket];
    var lines = (CONTENT.greetings && CONTENT.greetings[bucket]) || [];
    var line = lines.length ? lines[Math.floor(Math.random() * lines.length)] : '';

    el.innerHTML =
      '<div class="bgn-greeting-bear">' + bearSVG({
        mood: pose.mood,
        arms: pose.arms,
        heart: !!pose.heart,
        hat: !!pose.hat,
        size: pose.size || 80
      }) + '</div>' +
      '<p class="bgn-greeting-text">' + escapeHtml(line) + '</p>';
  }

  /* ── "Days together" pill + next-milestone line ───────────────────────── */

  function renderTogether() {
    var el = document.getElementById('today-together');
    if (!el) return;

    var now = appNow();
    var days = Math.floor((now.getTime() - CONFIG.loveDate.getTime()) / 86400000);
    if (days < 0) days = 0;

    var nextMilestone = (Math.floor(days / 100) + 1) * 100;
    var daysToMilestone = nextMilestone - days;

    el.innerHTML =
      '<div class="bgn-together-pill">' +
        '<svg class="bgn-together-heart" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">' +
          '<path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>' +
        '</svg>' +
        '<span>' + escapeHtml(CONTENT.together.prefix) + ' <strong class="bgn-together-days">' + days + '</strong> ' + escapeHtml(CONTENT.together.suffix) + '</span>' +
      '</div>' +
      '<p class="bgn-milestone">' + nextMilestone + '. günümüze ' + daysToMilestone + ' gün kaldı 💕</p>';
  }

  /* js/birthday.js dispatches this on document the instant appNow() crosses into her birthday,
     including while the app is already open and no reload happens. Everything on this tab that
     reads appNow() is stale until something re-renders it, so refresh it live: the greeting, the
     together pill/next-milestone line, and the daily message. Registered once at module load
     (not inside initDaily/initToday, which can re-run and would stack duplicate listeners). */
  document.addEventListener('meryem:birthday-unlocked', function () {
    renderGreeting();
    renderTogether();
    var msgEl = document.getElementById('daily-message');
    if (msgEl) msgEl.textContent = todaysMessage();
  });

  /* ── Contract ──────────────────────────────────────────────────────────── */

  /* Called directly by js/firebase.js's onAppReady() — kept as a bare global (via window) exactly
     like every function this frozen caller already relies on. */
  window.initDaily = initDaily;

  /* Called by js/app.js's initFeatures() dispatcher. */
  window.initToday = function initToday() {
    renderGreeting();
    renderTogether();
  };
})();
