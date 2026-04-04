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
    if (splashScreen) splashScreen.style.display = 'none';
    authScreen.style.display = 'none';
    appContent.style.display = 'block';
    onAppReady();
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
  registerServiceWorker();
  migrateLocalStorage();
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
