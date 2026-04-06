/**
 * Meryem App — Daily Love
 * Daily messages, anniversary countdown, and Firestore-synced to-do list.
 */

var todos = [];

function initDaily() {
  /* Daily message */
  document.getElementById('daily-message').textContent = getDailyMessage();

  /* Countdowns */
  updateCountdowns();
  window._countdownInterval = setInterval(updateCountdowns, 1000);

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

/* ── Countdown ──────────────────────────────────────── */

function renderElapsed(el, elapsed) {
  el.innerHTML =
    '<div class="countdown-unit"><span class="countdown-num">' + elapsed.days + '</span><span class="countdown-unit-label">gün</span></div>' +
    '<div class="countdown-unit"><span class="countdown-num">' + pad(elapsed.hours) + '</span><span class="countdown-unit-label">saat</span></div>' +
    '<div class="countdown-unit"><span class="countdown-num">' + pad(elapsed.minutes) + '</span><span class="countdown-unit-label">dakika</span></div>' +
    '<div class="countdown-unit"><span class="countdown-num">' + pad(elapsed.seconds) + '</span><span class="countdown-unit-label">saniye</span></div>';
}

function renderBirthdayCountdown(el, cd) {
  if (cd.today) {
    el.innerHTML = '<span class="countdown-celebration">Mutlu Yillar! &#127874;</span>';
    return;
  }
  el.innerHTML =
    '<div class="countdown-unit"><span class="countdown-num">' + cd.days + '</span><span class="countdown-unit-label">gün</span></div>' +
    '<div class="countdown-unit"><span class="countdown-num">' + pad(cd.hours) + '</span><span class="countdown-unit-label">saat</span></div>' +
    '<div class="countdown-unit"><span class="countdown-num">' + pad(cd.minutes) + '</span><span class="countdown-unit-label">dakika</span></div>' +
    '<div class="countdown-unit"><span class="countdown-num">' + pad(cd.seconds) + '</span><span class="countdown-unit-label">saniye</span></div>';
}

function updateCountdowns() {
  renderElapsed(document.getElementById('countdown-meet'), getElapsed(CONFIG.firstMeetDate));
  renderElapsed(document.getElementById('countdown-love'), getElapsed(CONFIG.loveDate));
  renderBirthdayCountdown(document.getElementById('countdown-her-bday'), getNextBirthdayCountdown(CONFIG.herBirthday.month, CONFIG.herBirthday.day));
  renderBirthdayCountdown(document.getElementById('countdown-his-bday'), getNextBirthdayCountdown(CONFIG.hisBirthday.month, CONFIG.hisBirthday.day));
}

function pad(n) {
  return n < 10 ? '0' + n : n;
}

/* ── To-Do List ─────────────────────────────────────── */

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
    list.innerHTML = '<p class="todo-empty">Henüz bir plan eklenmedi</p>';
    return;
  }

  list.innerHTML = todos.map(function (t) {
    return '<div class="todo-item' + (t.done ? ' done' : '') + '">' +
      '<label class="todo-check" data-toggle-id="' + escapeHtml(t.id) + '">' +
        '<input type="checkbox"' + (t.done ? ' checked' : '') + ' tabindex="-1">' +
        '<span class="checkmark"></span>' +
      '</label>' +
      '<span class="todo-text">' + escapeHtml(t.text) + '</span>' +
      '<button class="todo-delete" data-delete-id="' + escapeHtml(t.id) + '" title="Sil">&times;</button>' +
    '</div>';
  }).join('');
}
