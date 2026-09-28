/**
 * meryem-app tests — fixtures/firebase-stub.js
 *
 * Served in place of https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js by the
 * harness's Fetch interception (the matching auth-compat.js / firestore-compat.js requests are
 * fulfilled with an empty body — everything they would define lives here instead). Talks to no
 * real network or project; every call resolves locally and synchronously-ish (via setTimeout(0),
 * matching the real SDK's async callback shape).
 *
 * Read from disk by harness.mjs — never served as a static file — so it works unmodified against
 * a mutate_app.mjs copy of the site too.
 */
(function () {
  "use strict";

  var _autoId = 0;

  function makeDocRef(path) {
    return {
      id: path.split("/").pop(),
      collection: function (name) { return makeCollectionRef(path + "/" + name, name); },
      set: function () { return Promise.resolve(); },
      update: function () { return Promise.resolve(); },
      delete: function () { return Promise.resolve(); },
      get: function () {
        return Promise.resolve({ exists: false, id: path.split("/").pop(), data: function () { return undefined; } });
      },
    };
  }

  /**
   * A collection reference. `name` is the collection's own last-segment name (e.g. "memories",
   * "todos") — the only thing onSnapshot needs to decide what to hand back.
   */
  function makeCollectionRef(path, name) {
    var ref = {
      doc: function (id) { return makeDocRef(path + "/" + (id || ("auto" + (_autoId++)))); },
      add: function () { return Promise.resolve(makeDocRef(path + "/auto" + (_autoId++))); },
      orderBy: function () { return ref; },
      onSnapshot: function (cb) {
        setTimeout(function () {
          var items = name === "memories" ? (window.__STUB_MEMORIES || []) : [];
          cb({
            forEach: function (fn) {
              items.forEach(function (m) {
                var data = {};
                for (var k in m) { if (k !== "id") data[k] = m[k]; }
                fn({ id: m.id, data: function () { return data; } });
              });
            },
          });
        }, 0);
        return function unsubscribe() {};
      },
    };
    return ref;
  }

  function makeAuth() {
    var listeners = [];
    var currentUser = window.__STUB_SIGNED_IN ? { uid: "test-uid", email: "meryem@test" } : null;

    function notify() {
      listeners.forEach(function (cb) { setTimeout(function () { cb(currentUser); }, 40); });
    }

    return {
      get currentUser() { return currentUser; },
      onAuthStateChanged: function (cb) {
        listeners.push(cb);
        // The real SDK checks IndexedDB/local persistence before firing this — never instant.
        // A 0ms stub fires so fast it can race ahead of later, network-fetched <script> tags
        // (map.js .. app.js) still loading, calling onAppReady() before app.js has defined
        // anything. 40ms comfortably clears that on localhost without slowing tests down.
        setTimeout(function () { cb(currentUser); }, 40);
        return function unsubscribe() {
          var idx = listeners.indexOf(cb);
          if (idx >= 0) listeners.splice(idx, 1);
        };
      },
      signOut: function () {
        currentUser = null;
        notify();
        return Promise.resolve();
      },
      signInWithEmailAndPassword: function (email) {
        currentUser = { uid: "test-uid", email: email };
        notify();
        return Promise.resolve({ user: currentUser });
      },
    };
  }

  var _auth = null;
  var _db = null;

  function firestore() {
    if (!_db) {
      _db = {
        collection: function (name) { return makeCollectionRef(name, name); },
        enablePersistence: function () { return Promise.resolve(); },
      };
    }
    return _db;
  }
  firestore.FieldValue = {
    serverTimestamp: function () { return { __stub: "serverTimestamp", at: Date.now() }; },
  };

  window.firebase = {
    initializeApp: function () { /* no real project — nothing to do */ },
    auth: function () {
      if (!_auth) _auth = makeAuth();
      return _auth;
    },
    firestore: firestore,
  };
})();
