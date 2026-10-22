/**
 * Meryem App — Firebase Backend
 * Authentication, Firestore sync, and data migration.
 * All data is scoped under /users/{uid}/ for security.
 */

/* ── Firebase Config ────────────────────────────────── */
var firebaseConfig = {
  apiKey: 'AIzaSyANFqXE4v3F6OH1cTzeAHQtvJovNbRh0p8',
  authDomain: 'meryem-app.firebaseapp.com',
  projectId: 'meryem-app',
  storageBucket: 'meryem-app.firebasestorage.app',
  messagingSenderId: '168760808042',
  appId: '1:168760808042:web:13b07dc83955d9f1ccf013'
};

firebase.initializeApp(firebaseConfig);

var auth = firebase.auth();
var db = firebase.firestore();

/* Enable Firestore offline persistence */
db.enablePersistence().catch(function (err) {
  if (err.code === 'failed-precondition') {
    /* Multiple tabs open — persistence can only be enabled in one */
  } else if (err.code === 'unimplemented') {
    /* Browser does not support persistence */
  }
});

/* ── User-scoped collection helpers ─────────────────── */

function userCollection(name) {
  return db.collection('users').doc(auth.currentUser.uid).collection(name);
}

/* ── Auth State ─────────────────────────────────────── */

auth.onAuthStateChanged(function (user) {
  var splashScreen = document.getElementById('splash-screen');
  var authScreen = document.getElementById('auth-screen');
  var appContent = document.getElementById('app-content');

  if (user) {
    /* The private texts (js/private.js) are merged into the page before anything is drawn from
       them, so the splash stays up and the app hidden until the load has settled. It always
       settles (a missing or broken document leaves the repo texts in place). */
    authScreen.style.display = 'none';
    appContent.style.display = 'none';
    if (splashScreen) splashScreen.style.display = '';
    loadPrivateTexts().then(function () {
      if (auth.currentUser !== user) return; /* signed out while the texts were loading */
      if (splashScreen) splashScreen.style.display = 'none';
      authScreen.style.display = 'none';
      appContent.style.display = 'block';
      onAppReady();
    });
  } else {
    if (splashScreen) splashScreen.style.display = 'none';
    authScreen.style.display = 'flex';
    appContent.style.display = 'none';
  }
});

/* ── Login ──────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = document.getElementById('login-email').value;
    var password = document.getElementById('login-password').value;
    var errorEl = document.getElementById('login-error');
    var submitBtn = this.querySelector('button[type="submit"]');

    errorEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Giriş yapılıyor...';

    auth.signInWithEmailAndPassword(email, password)
      .catch(function (error) {
        var msg = 'Giriş başarısız.';
        if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
          msg = 'E-posta veya şifre hatalı.';
        } else if (error.code === 'auth/too-many-requests') {
          msg = 'Çok fazla deneme. Biraz bekle.';
        }
        errorEl.textContent = msg;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Giriş Yap';
      });
  });

  /* Logout button */
  document.getElementById('logout-btn').addEventListener('click', function () {
    auth.signOut();
  });
});

/* ── App Ready (called after auth) ──────────────────── */

var appInitialized = false;

function onAppReady() {
  if (appInitialized) return;
  appInitialized = true;

  initTabs();
  initMap();
  initDaily();
  initFeatures();
  registerServiceWorker();
  migrateLocalStorage();
  maybeOpenPrivatePanel();
}

/* ── Firestore: Memories (user-scoped) ──────────────── */

function subscribeMemories(callback) {
  return userCollection('memories').orderBy('date', 'desc').onSnapshot(function (snapshot) {
    var items = [];
    snapshot.forEach(function (doc) {
      var data = doc.data();
      data.id = doc.id;
      items.push(data);
    });
    callback(items);
  });
}

function addMemoryToFirestore(memory) {
  var id = memory.id;
  delete memory.id;
  return userCollection('memories').doc(id).set(memory);
}

function deleteMemoryFromFirestore(id) {
  return userCollection('memories').doc(id).delete();
}

/* ── Firestore: Todos (user-scoped) ─────────────────── */

function subscribeTodos(callback) {
  return userCollection('todos').orderBy('createdAt', 'asc').onSnapshot(function (snapshot) {
    var items = [];
    snapshot.forEach(function (doc) {
      var data = doc.data();
      data.id = doc.id;
      items.push(data);
    });
    callback(items);
  });
}

function addTodoToFirestore(todo) {
  todo.createdAt = firebase.firestore.FieldValue.serverTimestamp();
  return userCollection('todos').add(todo);
}

function updateTodoInFirestore(id, data) {
  return userCollection('todos').doc(id).update(data);
}

function deleteTodoFromFirestore(id) {
  return userCollection('todos').doc(id).delete();
}

/* ── Firestore: Takip / habits (user-scoped) ────────── */

/* habitMonths/{YYYY-MM}: { days: { 'YYYY-MM-DD': { <itemId>: { <person>: true|false } } } }
   habitLog/{auto}: { at, atLocal, month, day, item, person, value, by } — append-only. */

/* A habit listener the server refuses (rules deny the read, or the project is gone) would leave
   the tab silently empty. Every habit listener reports through here: logged, and ONE toast for
   the whole page however many listeners fail. */
var _habitReadErrorShown = false;
function habitListenError(err) {
  console.error('habit listener failed', err);
  if (_habitReadErrorShown) return;
  _habitReadErrorShown = true;
  if (typeof showToast === 'function' && typeof CONTENT !== 'undefined' && CONTENT.habits) showToast(CONTENT.habits.readError);
}

/** Live month document. `cb` gets the document's data, or {} while the month has no ticks yet. */
function subscribeHabitMonth(monthKey, cb) {
  return userCollection('habitMonths').doc(monthKey).onSnapshot(function (snap) {
    cb(snap && snap.exists ? snap.data() : {});
  }, habitListenError);
}

/** Live view of every month document, as an object keyed by 'YYYY-MM' (month-over-month chart). */
function subscribeHabitMonths(cb) {
  return userCollection('habitMonths').onSnapshot(function (snapshot) {
    var months = {};
    snapshot.forEach(function (doc) { months[doc.id] = doc.data(); });
    cb(months);
  }, habitListenError);
}

/** One person's tick (or untick, value=false) on one day. A merge write: the other person's
    tick and the other days of the month are never touched. */
function setHabitTick(monthKey, day, itemId, person, value) {
  var who = {};
  who[person] = value;
  var item = {};
  item[itemId] = who;
  var days = {};
  days[day] = item;
  return userCollection('habitMonths').doc(monthKey).set({ days: days }, { merge: true });
}

/** Appends a log entry; `at` is the server's clock, `atLocal` (the caller's) is kept as it is. */
function addHabitLog(entry) {
  entry.at = firebase.firestore.FieldValue.serverTimestamp();
  return userCollection('habitLog').add(entry);
}

/** Milliseconds a log entry happened at: `at`, or `atLocal` while `at` is still empty (a tick
    made offline has no server time until it syncs). */
function habitLogMillis(item) {
  if (item.at && typeof item.at.toMillis === 'function') return item.at.toMillis();
  var local = item.atLocal;
  if (typeof local === 'number') return local;
  var parsed = typeof local === 'string' ? Date.parse(local) : NaN;
  return isNaN(parsed) ? 0 : parsed;
}

/** Live log of one month, newest first. Filtered on `month` only and sorted here, so an entry
    whose server time is not set yet is still listed. */
function subscribeHabitLog(monthKey, cb) {
  return userCollection('habitLog').where('month', '==', monthKey).onSnapshot(function (snapshot) {
    var items = [];
    snapshot.forEach(function (doc) {
      /* 'estimate': a just-written entry has no server time yet - read the local estimate so it
         sorts by the moment it was made, never as a null. */
      var data = doc.data({ serverTimestamps: 'estimate' });
      data.id = doc.id;
      /* the SDK's own word for "not on the server yet" (an offline tick) */
      data.pendingWrites = !!(doc.metadata && doc.metadata.hasPendingWrites);
      items.push(data);
    });
    items.sort(function (a, b) { return habitLogMillis(b) - habitLogMillis(a); });
    cb(items);
  }, habitListenError);
}

/* ── Photo Validation ───────────────────────────────── */

function isValidPhotoUrl(str) {
  return typeof str === 'string' &&
    (str.startsWith('data:image/') || str.startsWith('https://'));
}

/* ── localStorage Migration ─────────────────────────── */

function migrateLocalStorage() {
  if (localStorage.getItem('meryem-migrated')) return;

  var oldMemories = [];
  var oldTodos = [];

  try {
    var memData = localStorage.getItem(CONFIG.storageKeys.memories);
    if (memData) oldMemories = JSON.parse(memData);
    var todoData = localStorage.getItem(CONFIG.storageKeys.todos);
    if (todoData) oldTodos = JSON.parse(todoData);
  } catch (e) {
    return;
  }

  /* Validate data shape */
  oldMemories = oldMemories.filter(function (m) {
    return m && typeof m.title === 'string' && typeof m.lat === 'number';
  });
  oldTodos = oldTodos.filter(function (t) {
    return t && typeof t.text === 'string';
  });

  if (oldMemories.length === 0 && oldTodos.length === 0) {
    localStorage.setItem('meryem-migrated', 'true');
    return;
  }

  showToast('Mevcut anılar yükleniyor...');

  var promises = [];

  oldMemories.forEach(function (memory) {
    promises.push(addMemoryToFirestore(memory));
  });

  oldTodos.forEach(function (todo) {
    var todoObj = { text: todo.text, done: todo.done };
    promises.push(addTodoToFirestore(todoObj));
  });

  Promise.all(promises).then(function () {
    localStorage.removeItem(CONFIG.storageKeys.memories);
    localStorage.removeItem(CONFIG.storageKeys.todos);
    localStorage.setItem('meryem-migrated', 'true');
    showToast('Anılar başarıyla yüklendi!');
  }).catch(function () {
    showToast('Yükleme sırasında hata oluştu. Tekrar denenecek.');
  });
}
