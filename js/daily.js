/**
 * Meryem App — Daily Love
 * Daily messages, anniversary countdown, and Firestore-synced to-do list.
 */

var todos = [];

function initDaily() {
  /* Daily message */
  document.getElementById('daily-message').textContent = getDailyMessage();

  /* Countdown */
  updateCountdown();
  window._countdownInterval = setInterval(updateCountdown, 1000);

  /* Subscribe to Firestore todos (real-time sync) */
  subscribeTodos(function (updatedTodos) {
    todos = updatedTodos;
    renderTodos();
  });

  document.getElementById('todo-form').addEventListener('submit', function (e) {
    e.preventDefault();
    addTodo();
  });
}

/* ── Countdown ──────────────────────────────────────── */

function updateCountdown() {
  var cd = getCountdown();
  var el = document.getElementById('countdown');

  if (cd.passed) {
    el.innerHTML = '<span class="countdown-celebration">Mutlu Yıldönümü! &#10084;</span>';
    return;
  }

  el.innerHTML =
    '<div class="countdown-unit"><span class="countdown-num">' + cd.days + '</span><span class="countdown-unit-label">gün</span></div>' +
    '<div class="countdown-unit"><span class="countdown-num">' + pad(cd.hours) + '</span><span class="countdown-unit-label">saat</span></div>' +
    '<div class="countdown-unit"><span class="countdown-num">' + pad(cd.minutes) + '</span><span class="countdown-unit-label">dakika</span></div>' +
    '<div class="countdown-unit"><span class="countdown-num">' + pad(cd.seconds) + '</span><span class="countdown-unit-label">saniye</span></div>';
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
      '<label class="todo-check">' +
        '<input type="checkbox"' + (t.done ? ' checked' : '') + ' onchange="toggleTodo(\'' + t.id + '\')">' +
        '<span class="checkmark"></span>' +
      '</label>' +
      '<span class="todo-text">' + escapeHtml(t.text) + '</span>' +
      '<button class="todo-delete" onclick="deleteTodo(\'' + t.id + '\')" title="Sil">&times;</button>' +
    '</div>';
  }).join('');
}
