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
 *   Failure and offline switches (all default off, set before or after load):
 *     window.__STUB_REJECT = { habitLog: true }      writes (set/add/update/delete) to that collection reject
 *                                                    and change nothing
 *     window.__STUB_FAIL_LISTEN = { habitMonths: true }  onSnapshot on that path tail calls its error
 *                                                    callback (the second argument) instead of delivering:
 *                                                    'habitMonths' = the whole-collection listener,
 *                                                    'habitMonths/2026-10' = that one document,
 *                                                    'habitLog' = the log query
 *     window.__STUB_OFFLINE = true                   writes land locally but stay PENDING: a serverTimestamp()
 *                                                    stays null, snapshots carry metadata.hasPendingWrites,
 *                                                    and data({serverTimestamps:'estimate'}) returns an
 *                                                    estimated timestamp for it (the real SDK's behaviour).
 *                                                    window.__STUB_FLUSH() delivers them: the server time
 *                                                    arrives and hasPendingWrites turns false.
 *     A seeded document whose `at` is null counts as pending too.
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
  var _pending = {}; // doc path -> names of the fields still waiting for a server timestamp

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
    if (isSentinel(v)) return window.__STUB_TS_NULL || window.__STUB_OFFLINE ? null : makeTimestamp(Date.now());
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

  /** A listener fails when a key of window.__STUB_FAIL_LISTEN names its path tail: 'habitMonths' is
      the whole-collection listener, 'habitMonths/2026-10' that one document, 'habitLog' the log
      query (whatever its filter). */
  function failing(label) {
    var f = window.__STUB_FAIL_LISTEN;
    if (!f) return false;
    return Object.keys(f).some(function (k) {
      return f[k] && (label === k || label.slice(-(k.length + 1)) === "/" + k || label.indexOf("/" + k + "?") !== -1);
    });
  }

  function rejects(colPath) {
    var r = window.__STUB_REJECT;
    return !!(r && r[lastSegment(colPath)]);
  }

  function rejection(colPath) {
    return Promise.reject(new Error("stub: write to " + lastSegment(colPath) + " rejected"));
  }

  /** While offline a write leaves its document pending, with the fields that await a server time. */
  function markPending(path, data) {
    if (!window.__STUB_OFFLINE) return;
    var fields = _pending[path] || [];
    for (var k in data) {
      if (Object.prototype.hasOwnProperty.call(data, k) && isSentinel(data[k]) && fields.indexOf(k) === -1) fields.push(k);
    }
    _pending[path] = fields;
  }

  function pendingFields(path, data) {
    if (_pending[path]) return _pending[path];
    return data && data.at === null ? ["at"] : [];
  }

  function isPending(path, data) {
    return !!_pending[path] || !!(data && data.at === null);
  }

  /** What doc.data(options) returns: pending server-timestamp fields read as an estimate on request. */
  function dataOf(path, data, options) {
    var out = resolve(data);
    if (out && options && options.serverTimestamps === "estimate") {
      /* the SDK estimates the moment the write was made - atLocal, when the entry carries it */
      var local = typeof data.atLocal === "number" ? data.atLocal : Date.parse(data.atLocal);
      var est = isFinite(local) ? local : Date.now();
      pendingFields(path, data).forEach(function (f) { if (out[f] === null) out[f] = makeTimestamp(est); });
    }
    return out;
  }

  window.__STUB_FLUSH = function () {
    Object.keys(_pending).forEach(function (path) {
      var docs = col(parentOf(path));
      var d = docs[lastSegment(path)];
      if (d) _pending[path].forEach(function (f) { if (d[f] === null) d[f] = makeTimestamp(Date.now()); });
      delete _pending[path];
      notify(parentOf(path));
    });
  };

  function addListener(colPath, label, emit, errCb) {
    var l = {
      colPath: colPath, label: label, active: true,
      emit: function () {
        if (failing(label)) {
          if (typeof errCb === "function") errCb(new Error("stub: read of " + label + " denied"));
          return;
        }
        emit();
      },
    };
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

  function docSnapshot(id, data, path) {
    var snap = {
      id: id,
      exists: data !== undefined,
      metadata: { hasPendingWrites: data !== undefined && isPending(path, data), fromCache: false },
      data: function (options) { return data === undefined ? undefined : dataOf(path, data, options); },
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
          if (rejects(colPath)) return rejection(colPath);
          var docs = col(colPath);
          if (opts && opts.merge && docs[id]) merge(docs[id], data);
          else docs[id] = resolve(data);
          markPending(path, data);
          notify(colPath);
        }
        return Promise.resolve();
      },
      update: function (data) {
        if (!frozen) {
          if (rejects(colPath)) return rejection(colPath);
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
          markPending(path, data);
          notify(colPath);
        }
        return Promise.resolve();
      },
      delete: function () {
        if (!frozen) {
          if (rejects(colPath)) return rejection(colPath);
          delete col(colPath)[id];
          notify(colPath);
        }
        return Promise.resolve();
      },
      get: function () {
        var docs = frozen ? {} : col(colPath);
        return Promise.resolve(docSnapshot(id, docs[id], path));
      },
      onSnapshot: function (cb, errCb) {
        return addListener(colPath, path, function () {
          var docs = frozen ? {} : col(colPath);
          cb(docSnapshot(id, docs[id], path));
        }, errCb);
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
        var dpath = path + "/" + r.id;
        return {
          id: r.id,
          exists: true,
          metadata: { hasPendingWrites: !frozen && isPending(dpath, r.data), fromCache: false },
          data: function (options) { return dataOf(dpath, r.data, options); },
        };
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
          if (rejects(path)) return rejection(path);
          col(path)[id] = resolve(data);
          markPending(path + "/" + id, data);
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
      onSnapshot: function (cb, errCb) {
        return addListener(path, path + (q.filters.length ? "?" + q.filters.map(function (f) { return f.field + "==" + f.value; }).join("&") : ""), function () { cb(snapshot()); }, errCb);
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
