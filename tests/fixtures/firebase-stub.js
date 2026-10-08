/**
 * meryem-app tests — fixtures/firebase-stub.js
 *
 * Served in place of https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js by the
 * harness's Fetch interception (the matching auth-compat.js / firestore-compat.js requests are
 * fulfilled with an empty body — everything they would define lives here instead). Talks to no
 * real network or project; every call resolves locally and asynchronously (setTimeout 0, matching
 * the real SDK's async callback shape).
 *
 * Firestore: an in-memory database under window.__STUB_DB, { '<collection path>': { '<doc id>':
 * data } }, e.g. 'users/test-uid/habitMonths' -> { '2026-10': {...} }. The harness seeds it before
 * the app loads (openApp's `habits` option) and reads it back (page.stubDb()). Supported:
 *   doc():  set(data, {merge}) with deep merge, update (dotted paths too), delete, get, onSnapshot
 *   collection(): doc(id), add (generated id), where(field, '==', v), orderBy(field, dir),
 *                 limit(n), get, onSnapshot
 *   onSnapshot fires once straight away and again after every write that touches its collection.
 *   FieldValue.serverTimestamp() resolves, on write, to a timestamp-like object with toMillis() /
 *   toDate(); with window.__STUB_TS_NULL = true it resolves to null instead (a write made offline,
 *   whose server time has not arrived yet).
 *   window.__stubListeners() lists the paths that currently have an open onSnapshot.
 *   window.__STUB_ECHO_DELAY_MS = n delays the snapshot that follows a WRITE by n ms (the write
 *   itself lands in the database at once; the first snapshot after a subscribe is not delayed), so
 *   a test can act again before the echo arrives.
 *
 * Two collections stay exactly as they were before this file had a database, because the existing
 * checks were written against that: 'memories' (served read-only from window.__STUB_MEMORIES, one
 * snapshot, writes accepted and ignored) and 'todos' (always empty, writes ignored).
 *
 * Read from disk by harness.mjs — never served as a static file — so it works unmodified against
 * a mutate_app.mjs copy of the site too.
 */
(function () {
  "use strict";

  var FROZEN = { memories: true, todos: true };
  var _autoId = 0;
  var _listeners = [];

  window.__STUB_DB = window.__STUB_DB || {};

  /* ── values ─────────────────────────────────────────────────────────────── */

  function makeTimestamp(ms) {
    return {
      __ts: ms,
      seconds: Math.floor(ms / 1000),
      nanoseconds: (ms % 1000) * 1e6,
      toMillis: function () { return ms; },
      toDate: function () { return new Date(ms); },
    };
  }

  function isTimestamp(v) {
    return v && typeof v === "object" && typeof v.toMillis === "function";
  }

  function isPlain(v) {
    return v && typeof v === "object" && !Array.isArray(v) && !isTimestamp(v);
  }

  function isSentinel(v) {
    return v && typeof v === "object" && v.__stub === "serverTimestamp";
  }

  /** Deep copy; timestamps stay timestamps, a sentinel becomes the resolved value. */
  function resolve(v) {
    if (isSentinel(v)) return window.__STUB_TS_NULL ? null : makeTimestamp(Date.now());
    if (isTimestamp(v)) return makeTimestamp(v.toMillis());
    if (Array.isArray(v)) return v.map(resolve);
    if (isPlain(v)) {
      if (typeof v.__ts === "number" && Object.keys(v).length === 1) return makeTimestamp(v.__ts);
      var out = {};
      for (var k in v) { if (Object.prototype.hasOwnProperty.call(v, k)) out[k] = resolve(v[k]); }
      return out;
    }
    return v;
  }

  function merge(target, src) {
    for (var k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      if (isPlain(src[k]) && !isSentinel(src[k]) && isPlain(target[k])) merge(target[k], src[k]);
      else target[k] = resolve(src[k]);
    }
    return target;
  }

  function compare(a, b) {
    var x = isTimestamp(a) ? a.toMillis() : a;
    var y = isTimestamp(b) ? b.toMillis() : b;
    if (x === y) return 0;
    if (x === null || x === undefined) return -1;
    if (y === null || y === undefined) return 1;
    return x < y ? -1 : 1;
  }

  /* ── database ───────────────────────────────────────────────────────────── */

  function col(path) {
    var db = window.__STUB_DB;
    if (!db[path]) db[path] = {};
    return db[path];
  }

  function lastSegment(path) {
    return path.split("/").pop();
  }

  function parentOf(path) {
    return path.slice(0, path.lastIndexOf("/"));
  }

  function notify(colPath) {
    _listeners.slice().forEach(function (l) {
      if (l.active && l.colPath === colPath) schedule(l, window.__STUB_ECHO_DELAY_MS || 0);
    });
  }

  function schedule(l, delay) {
    setTimeout(function () { if (l.active) l.emit(); }, delay || 0);
  }

  function addListener(colPath, label, emit) {
    var l = { colPath: colPath, label: label, active: true, emit: emit };
    _listeners.push(l);
    schedule(l);
    return function unsubscribe() {
      l.active = false;
      var i = _listeners.indexOf(l);
      if (i >= 0) _listeners.splice(i, 1);
    };
  }

  // A seed written by the harness (JSON) marks a timestamp as { __ts: <ms> }; turn those into
  // timestamp objects once, before the app reads anything.
  Object.keys(window.__STUB_DB).forEach(function (p) {
    Object.keys(window.__STUB_DB[p]).forEach(function (id) {
      window.__STUB_DB[p][id] = resolve(window.__STUB_DB[p][id]);
    });
  });

  window.__stubListeners = function () {
    return _listeners.map(function (l) { return l.label; });
  };

  /* ── references ─────────────────────────────────────────────────────────── */

  function docSnapshot(id, data) {
    var snap = {
      id: id,
      exists: data !== undefined,
      data: function () { return data === undefined ? undefined : resolve(data); },
    };
    return snap;
  }

  function makeDocRef(path) {
    var colPath = parentOf(path);
    var id = lastSegment(path);
    var frozen = !!FROZEN[lastSegment(colPath)];
    return {
      id: id,
      path: path,
      collection: function (name) { return makeCollectionRef(path + "/" + name); },
      set: function (data, opts) {
        if (!frozen) {
          var docs = col(colPath);
          if (opts && opts.merge && docs[id]) merge(docs[id], data);
          else docs[id] = resolve(data);
          notify(colPath);
        }
        return Promise.resolve();
      },
      update: function (data) {
        if (!frozen) {
          var docs = col(colPath);
          if (!docs[id]) return Promise.reject(new Error("stub: update of a missing document " + path));
          for (var field in data) {
            if (!Object.prototype.hasOwnProperty.call(data, field)) continue;
            var parts = field.split(".");
            var at = docs[id];
            for (var i = 0; i < parts.length - 1; i++) {
              if (!isPlain(at[parts[i]])) at[parts[i]] = {};
              at = at[parts[i]];
            }
            at[parts[parts.length - 1]] = resolve(data[field]);
          }
          notify(colPath);
        }
        return Promise.resolve();
      },
      delete: function () {
        if (!frozen) {
          delete col(colPath)[id];
          notify(colPath);
        }
        return Promise.resolve();
      },
      get: function () {
        var docs = frozen ? {} : col(colPath);
        return Promise.resolve(docSnapshot(id, docs[id]));
      },
      onSnapshot: function (cb) {
        return addListener(colPath, path, function () {
          var docs = frozen ? {} : col(colPath);
          cb(docSnapshot(id, docs[id]));
        });
      },
    };
  }

  /** Collection / query reference. Immutable: where/orderBy/limit return a new one. */
  function makeCollectionRef(path, query) {
    var q = query || { filters: [], order: null, max: null };
    var name = lastSegment(path);
    var frozen = !!FROZEN[name];

    function derive(patch) {
      return makeCollectionRef(path, {
        filters: patch.filters || q.filters,
        order: patch.order !== undefined ? patch.order : q.order,
        max: patch.max !== undefined ? patch.max : q.max,
      });
    }

    function rows() {
      if (frozen) {
        // Legacy behaviour, unchanged: memories come from __STUB_MEMORIES, todos are empty.
        var items = name === "memories" ? (window.__STUB_MEMORIES || []) : [];
        return items.map(function (m) {
          var data = {};
          for (var k in m) { if (k !== "id") data[k] = m[k]; }
          return { id: m.id, data: data };
        });
      }
      var docs = col(path);
      var list = Object.keys(docs).map(function (id) { return { id: id, data: docs[id] }; });
      q.filters.forEach(function (f) {
        list = list.filter(function (r) { return compare(r.data[f.field], f.value) === 0; });
      });
      if (q.order) {
        list.sort(function (a, b) {
          var c = compare(a.data[q.order.field], b.data[q.order.field]);
          return q.order.dir === "desc" ? -c : c;
        });
      }
      if (q.max !== null) list = list.slice(0, q.max);
      return list;
    }

    function snapshot() {
      var list = rows().map(function (r) {
        return { id: r.id, exists: true, data: function () { return resolve(r.data); } };
      });
      return {
        size: list.length,
        empty: list.length === 0,
        docs: list,
        forEach: function (fn) { list.forEach(fn); },
      };
    }

    var ref = {
      path: path,
      doc: function (id) { return makeDocRef(path + "/" + (id || ("auto" + (_autoId++)))); },
      add: function (data) {
        var id = "auto" + (_autoId++);
        if (!frozen) {
          col(path)[id] = resolve(data);
          notify(path);
        }
        return Promise.resolve(makeDocRef(path + "/" + id));
      },
      where: function (field, op, value) {
        if (op !== "==") throw new Error("stub: where() supports '==' only, got " + op);
        return derive({ filters: q.filters.concat([{ field: field, value: value }]) });
      },
      orderBy: function (field, dir) { return derive({ order: { field: field, dir: dir || "asc" } }); },
      limit: function (n) { return derive({ max: n }); },
      get: function () { return Promise.resolve(snapshot()); },
      onSnapshot: function (cb) {
        return addListener(path, path + (q.filters.length ? "?" + q.filters.map(function (f) { return f.field + "==" + f.value; }).join("&") : ""), function () { cb(snapshot()); });
      },
    };
    return ref;
  }

  /* ── auth ───────────────────────────────────────────────────────────────── */

  function makeAuth() {
    var listeners = [];
    var currentUser = window.__STUB_SIGNED_IN ? { uid: "test-uid", email: "meryem@test" } : null;

    function notifyAuth() {
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
        notifyAuth();
        return Promise.resolve();
      },
      signInWithEmailAndPassword: function (email) {
        currentUser = { uid: "test-uid", email: email };
        notifyAuth();
        return Promise.resolve({ user: currentUser });
      },
    };
  }

  var _auth = null;
  var _db = null;

  function firestore() {
    if (!_db) {
      _db = {
        collection: function (name) { return makeCollectionRef(name); },
        enablePersistence: function () { return Promise.resolve(); },
      };
    }
    return _db;
  }
  firestore.FieldValue = {
    serverTimestamp: function () { return { __stub: "serverTimestamp" }; },
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
