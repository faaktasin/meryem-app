/**
 * Meryem App — Sözler (Words) feature
 * Renders three lovely sections into #words-root:
 *   1) a swipeable deck mixing CONTENT.words.quotes and CONTENT.words.lines, with favourites
 *   2) a jar of CONTENT.words.reasons drawn without replacement
 *   3) a grid of wax-sealed envelopes (CONTENT.words.letters) that open in a full-screen reader
 * Package prefix: wz- (CSS classes) / #wz-* (element ids). Only window.initWords is exposed.
 * Reads CONTENT (js/content.js), appNow()/isBirthdayUnlocked() (js/time.js),
 * storageGet/storageSet (js/time.js), prefersReducedMotion() (js/fx.js), bearAutoRender()
 * (js/bears.js) and CONFIG/getNextBirthdayCountdown() (js/data.js) — all read-only.
 */
(function () {
  'use strict';

  /* ── Storage keys (single source, so a mutation test can anchor on the literal) ─────── */
  var FAV_KEY = 'meryem-fav-quotes';
  var JAR_KEY = 'meryem-jar-drawn';
  var LETTERS_KEY = 'meryem-letters-opened';

  /* Fallback text, used only if CONTENT.words.ui is ever missing a key — CONTENT.words.ui
     (favEmpty / jarHint / jarReshuffled) is the source of truth these three shadow. */
  var DEFAULT_FAV_EMPTY = 'Henüz favori sözün yok. Kalbe dokun, favorilere ekle 💗';
  var DEFAULT_JAR_HINT = 'Kavanoza dokun, sana bir not çıksın 💌';
  var DEFAULT_JAR_RESHUFFLED = 'Hepsini okudun! Kavanoz yeniden karışıyor 🔄';

  /* A cute jar illustration — our own inline SVG, no external art. Draw order: cap, lid, a ribbon
     bow sitting on the cap, the glass body, five folded love-notes tucked inside (fuller than a
     bare handful), then the heart popping out of the neck on top of everything. */
  var JAR_SVG =
    '<svg class="wz-jar-svg" viewBox="0 0 140 160" width="118" height="135" ' +
    'xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<rect x="46" y="6" width="48" height="12" rx="5" fill="var(--berry)" stroke="var(--bear-stroke)" stroke-width="2"/>' +
    '<rect x="38" y="16" width="64" height="16" rx="6" fill="var(--rose-strong)" stroke="var(--bear-stroke)" stroke-width="2"/>' +
    '<path d="M70 12 L55 3 Q50 1 53 7 L63 14 Z" fill="var(--peach)" stroke="var(--bear-stroke)" ' +
    'stroke-width="1.6" stroke-linejoin="round"/>' +
    '<path d="M70 12 L85 3 Q90 1 87 7 L77 14 Z" fill="var(--peach)" stroke="var(--bear-stroke)" ' +
    'stroke-width="1.6" stroke-linejoin="round"/>' +
    '<circle cx="70" cy="12" r="4.5" fill="var(--rose)" stroke="var(--bear-stroke)" stroke-width="1.6"/>' +
    '<path d="M32 32 L28 140 Q28 152 40 152 L100 152 Q112 152 112 140 L108 32 Z" ' +
    'fill="rgba(255,255,255,0.55)" stroke="var(--bear-stroke)" stroke-width="3"/>' +
    '<rect x="52" y="72" width="20" height="26" rx="3" fill="var(--peach)" stroke="var(--bear-stroke)" ' +
    'stroke-width="1.5" transform="rotate(-8 62 85)"/>' +
    '<rect x="66" y="92" width="20" height="26" rx="3" fill="var(--lavender)" stroke="var(--bear-stroke)" ' +
    'stroke-width="1.5" transform="rotate(10 76 105)"/>' +
    '<rect x="46" y="106" width="20" height="26" rx="3" fill="var(--rose-100)" stroke="var(--bear-stroke)" ' +
    'stroke-width="1.5" transform="rotate(-4 56 119)"/>' +
    '<rect x="32" y="98" width="18" height="24" rx="3" fill="var(--rose)" stroke="var(--bear-stroke)" ' +
    'stroke-width="1.5" transform="rotate(8 41 110)"/>' +
    '<rect x="90" y="110" width="18" height="24" rx="3" fill="var(--blush)" stroke="var(--bear-stroke)" ' +
    'stroke-width="1.5" transform="rotate(-9 99 122)"/>' +
    '<path d="M70 44 C64 36 52 40 52 50 C52 60 70 72 70 72 C70 72 88 60 88 50 C88 40 76 36 70 44 Z" ' +
    'fill="var(--rose)" stroke="var(--berry)" stroke-width="2"/>' +
    '</svg>';

  /* ── Module state (reset every initWords() call — idempotent) ───────────────────────── */
  var deck = [];
  var deckIndex = 0;
  var favOnly = false;
  var favorites = [];
  var openedLetters = [];
  var dragState = null;
  var lastLetterOpener = null;
  var letterKeydownHandler = null;

  /* ── Small storage helpers (JSON list over time.js's storageGet/storageSet) ─────────── */

  /* Preview-mode shadow: while a birthday rehearsal is live (?onizleme=dogumgunu), reads/writes
     to this package's three keys never touch real localStorage — the same guarantee
     TIME_PREVIEW_PROTECTED_KEYS gives the gate/birthday flags, reproduced here because js/time.js
     is frozen for this package and its protected-keys list does not know these three keys. Each
     key is seeded once from its real value (a rehearsal starts from her actual progress), then
     every write during the rehearsal only updates the shadow copy and vanishes when the tab
     closes, so a rehearsed jar draw or opened letter never marks the real record. */
  var previewShadow = null;

  function readRealList(key) {
    try {
      var raw = storageGet(key);
      var arr = raw ? JSON.parse(raw) : [];
      return Object.prototype.toString.call(arr) === '[object Array]' ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function readList(key) {
    if (isPreviewMode()) {
      if (!previewShadow) previewShadow = {};
      if (!(key in previewShadow)) previewShadow[key] = readRealList(key);
      return previewShadow[key].slice();
    }
    return readRealList(key);
  }

  function writeList(key, arr) {
    if (isPreviewMode()) {
      if (!previewShadow) previewShadow = {};
      previewShadow[key] = arr.slice();
      return;
    }
    storageSet(key, JSON.stringify(arr));
  }

  /* ── Deck: evenly interleave quotes among lines (even-spacing / Bresenham-style) ────── */

  function buildDeck() {
    var quotes = CONTENT.words.quotes;
    var lines = CONTENT.words.lines;
    var qCount = quotes.length;
    var lCount = lines.length;
    var total = qCount + lCount;
    var qi = 0, li = 0, qAcc = 0, lAcc = 0;
    var out = [];
    var k;
    for (k = 0; k < total; k++) {
      qAcc += qCount;
      lAcc += lCount;
      if (qi < qCount && (qAcc >= lAcc || li >= lCount)) {
        out.push({ id: 'q' + qi, type: 'quote', data: quotes[qi] });
        qAcc -= total;
        qi++;
      } else {
        out.push({ id: 'l' + li, type: 'line', data: lines[li] });
        lAcc -= total;
        li++;
      }
    }
    return out;
  }

  function visibleDeck() {
    if (!favOnly) return deck;
    return deck.filter(function (c) { return favorites.indexOf(c.id) !== -1; });
  }

  function renderDeck() {
    var list = visibleDeck();
    var cardEl = document.getElementById('wz-card');
    var textEl = document.getElementById('wz-card-text');
    var metaEl = document.getElementById('wz-card-meta');
    var posEl = document.getElementById('wz-deck-pos');
    var emptyEl = document.getElementById('wz-deck-empty');
    var favBtn = document.getElementById('wz-fav-btn');
    var controls = document.querySelector('.wz-deck-controls');
    if (!cardEl) return;

    if (list.length === 0) {
      cardEl.hidden = true;
      if (controls) controls.hidden = true;
      emptyEl.hidden = false;
      emptyEl.textContent = (CONTENT.words.ui && CONTENT.words.ui.favEmpty) || DEFAULT_FAV_EMPTY;
      return;
    }
    cardEl.hidden = false;
    if (controls) controls.hidden = false;
    emptyEl.hidden = true;

    if (deckIndex >= list.length) deckIndex = 0;
    if (deckIndex < 0) deckIndex = list.length - 1;

    var item = list[deckIndex];
    if (item.type === 'quote') {
      textEl.textContent = item.data.text;
      metaEl.textContent = '— ' + item.data.author + ', ' + item.data.source;
      metaEl.hidden = false;
    } else {
      textEl.textContent = item.data + ' 💗';
      metaEl.textContent = '';
      metaEl.hidden = true;
    }
    cardEl.className = 'wz-card wz-card--' + item.type;

    var isFav = favorites.indexOf(item.id) !== -1;
    favBtn.setAttribute('aria-pressed', isFav ? 'true' : 'false');
    favBtn.setAttribute('aria-label', isFav ? 'Favorilerden çıkar' : 'Favorilere ekle');
    favBtn.className = 'wz-fav-btn' + (isFav ? ' wz-fav-btn--active' : '');

    posEl.textContent = (deckIndex + 1) + ' / ' + list.length;
  }

  function nextCard() {
    var list = visibleDeck();
    if (!list.length) return;
    deckIndex = (deckIndex + 1) % list.length;
    renderDeck();
  }

  function prevCard() {
    var list = visibleDeck();
    if (!list.length) return;
    deckIndex = (deckIndex - 1 + list.length) % list.length;
    renderDeck();
  }

  function toggleFavorite() {
    var list = visibleDeck();
    if (!list.length) return;
    var item = list[deckIndex];
    var idx = favorites.indexOf(item.id);
    if (idx === -1) favorites.push(item.id); else favorites.splice(idx, 1);
    writeList(FAV_KEY, favorites);
    renderDeck();
  }

  function setFavOnly(on) {
    favOnly = on;
    deckIndex = 0;
    renderDeck();
  }

  function wireDeck() {
    var deckEl = document.getElementById('wz-deck');
    var SWIPE_THRESHOLD = 40;

    deckEl.addEventListener('pointerdown', function (e) {
      dragState = { startX: e.clientX, id: e.pointerId, dx: 0 };
    });
    deckEl.addEventListener('pointermove', function (e) {
      if (!dragState || e.pointerId !== dragState.id) return;
      dragState.dx = e.clientX - dragState.startX;
    });
    function finishDrag(e) {
      if (!dragState) return;
      if (e && e.pointerId !== undefined && e.pointerId !== dragState.id) return;
      var dx = dragState.dx;
      dragState = null;
      if (dx <= -SWIPE_THRESHOLD) nextCard();
      else if (dx >= SWIPE_THRESHOLD) prevCard();
    }
    deckEl.addEventListener('pointerup', finishDrag);
    deckEl.addEventListener('pointercancel', finishDrag);
    deckEl.addEventListener('pointerleave', finishDrag);

    document.getElementById('wz-next-btn').addEventListener('click', nextCard);
    document.getElementById('wz-prev-btn').addEventListener('click', prevCard);
    document.getElementById('wz-fav-btn').addEventListener('click', toggleFavorite);
    document.getElementById('wz-fav-toggle').addEventListener('click', function () {
      var next = !favOnly;
      this.setAttribute('aria-pressed', next ? 'true' : 'false');
      setFavOnly(next);
    });
  }

  /* ── Jar: draw-without-replacement over CONTENT.words.reasons ───────────────────────── */

  function spawnFlyingNote() {
    var wrap = document.getElementById('wz-jar-wrap');
    if (!wrap) return;
    var fly = document.createElement('span');
    fly.className = 'wz-note-fly';
    fly.setAttribute('aria-hidden', 'true');
    fly.textContent = '💌';
    wrap.appendChild(fly);
    setTimeout(function () {
      if (fly.parentNode) fly.parentNode.removeChild(fly);
    }, 650);
  }

  function showJarResult(index, count, total, reshuffled) {
    var reshuffleEl = document.getElementById('wz-jar-reshuffle');
    reshuffleEl.hidden = !reshuffled;
    reshuffleEl.textContent = reshuffled
      ? ((CONTENT.words.ui && CONTENT.words.ui.jarReshuffled) || DEFAULT_JAR_RESHUFFLED)
      : '';

    /* Decorative flourish only — never runs under reduced motion (this guard, not the global
       CSS collapse, is what a mutation test can prove: the element must not exist at all). */
    if (!prefersReducedMotion()) {
      spawnFlyingNote();
    }

    var noteEl = document.getElementById('wz-jar-note');
    var noteTextEl = document.getElementById('wz-jar-note-text');
    noteTextEl.textContent = CONTENT.words.reasons[index];
    noteEl.hidden = false;

    document.getElementById('wz-jar-counter').textContent = count + ' / ' + total;
  }

  function drawReason() {
    var total = CONTENT.words.reasons.length;
    var drawn = readList(JAR_KEY);
    var reshuffled = false;
    if (drawn.length >= total) {
      drawn = [];
      reshuffled = true;
    }
    var remaining = [];
    var i;
    for (i = 0; i < total; i++) {
      if (drawn.indexOf(i) === -1) remaining.push(i);
    }
    var pick = remaining[Math.floor(Math.random() * remaining.length)];
    drawn.push(pick);
    writeList(JAR_KEY, drawn);
    showJarResult(pick, drawn.length, total, reshuffled);
  }

  /* ── Letters: 8 wax-sealed envelopes + a full-screen reader overlay ─────────────────── */

  function markLetterOpened(id) {
    if (openedLetters.indexOf(id) === -1) {
      openedLetters.push(id);
      writeList(LETTERS_KEY, openedLetters);
    }
    var btn = document.querySelector('.wz-envelope[data-letter-id="' + id + '"]');
    if (!btn) return;
    var statusEl = btn.querySelector('.wz-envelope-status');
    if (statusEl) statusEl.textContent = 'okundu ✓';
    if (btn.className.indexOf('wz-envelope--opened') === -1) {
      btn.className += ' wz-envelope--opened';
    }
  }

  function buildLetterReader() {
    var existing = document.getElementById('wz-letter-reader');
    if (existing) return existing;

    var el = document.createElement('div');
    el.className = 'wz-letter-reader';
    el.id = 'wz-letter-reader';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'wz-letter-title');
    el.hidden = true;
    el.innerHTML =
      '<div class="wz-letter-backdrop" id="wz-letter-backdrop"></div>' +
      '<div class="wz-letter-sheet">' +
        '<button type="button" class="wz-letter-close" id="wz-letter-close" aria-label="Kapat">' +
          '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
          '<path fill="currentColor" d="M18.3 5.71L12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.3 19.71 2.89 18.3 9.17 12 2.89 5.71 4.3 4.29l6.29 6.3 6.3-6.3z"/>' +
          '</svg>' +
        '</button>' +
        '<div class="wz-letter-envelope">' +
          '<div class="wz-letter-flap" id="wz-letter-flap"></div>' +
          '<div class="wz-letter-pocket"></div>' +
        '</div>' +
        '<div class="wz-letter-paper" id="wz-letter-paper">' +
          '<p class="wz-letter-emoji" id="wz-letter-emoji"></p>' +
          '<h3 class="wz-letter-title" id="wz-letter-title"></h3>' +
          '<div class="wz-letter-body" id="wz-letter-body"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);

    el.querySelector('#wz-letter-close').addEventListener('click', closeLetterReader);
    el.querySelector('#wz-letter-backdrop').addEventListener('click', closeLetterReader);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        document.getElementById('wz-letter-close').focus();
      }
    });
    return el;
  }

  function openLetterReader(letter, openerBtn) {
    document.body.style.overflow = 'hidden';
    var reader = buildLetterReader();
    lastLetterOpener = openerBtn || null;

    document.getElementById('wz-letter-emoji').textContent = letter.emoji;
    document.getElementById('wz-letter-title').textContent = letter.title;
    var bodyEl = document.getElementById('wz-letter-body');
    bodyEl.innerHTML = '';
    var i, p;
    for (i = 0; i < letter.body.length; i++) {
      p = document.createElement('p');
      p.textContent = letter.body[i];
      bodyEl.appendChild(p);
    }

    var flap = document.getElementById('wz-letter-flap');
    var paper = document.getElementById('wz-letter-paper');
    flap.className = 'wz-letter-flap';
    paper.className = 'wz-letter-paper';

    reader.hidden = false;

    if (prefersReducedMotion()) {
      flap.className = 'wz-letter-flap wz-letter-flap--open';
      paper.className = 'wz-letter-paper wz-letter-paper--up';
    } else {
      setTimeout(function () { flap.className = 'wz-letter-flap wz-letter-flap--open'; }, 260);
      setTimeout(function () { paper.className = 'wz-letter-paper wz-letter-paper--up'; }, 460);
    }

    letterKeydownHandler = function (e) {
      if (e.key === 'Escape') closeLetterReader();
    };
    document.addEventListener('keydown', letterKeydownHandler);

    document.getElementById('wz-letter-close').focus();

    markLetterOpened(letter.id);
  }

  function closeLetterReader() {
    var reader = document.getElementById('wz-letter-reader');
    if (!reader || reader.hidden) return;
    reader.hidden = true;
    document.body.style.overflow = '';
    if (letterKeydownHandler) {
      document.removeEventListener('keydown', letterKeydownHandler);
      letterKeydownHandler = null;
    }
    if (lastLetterOpener && typeof lastLetterOpener.focus === 'function') {
      lastLetterOpener.focus();
    }
    lastLetterOpener = null;
  }

  function renderLettersGrid() {
    var grid = document.getElementById('wz-letters-grid');
    grid.innerHTML = '';
    var letters = CONTENT.words.letters;
    var i;
    for (i = 0; i < letters.length; i++) {
      (function (letter) {
        var locked = letter.birthdayOnly === true && !isBirthdayUnlocked();
        var opened = openedLetters.indexOf(letter.id) !== -1;

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wz-envelope' + (locked ? ' wz-envelope--locked' : '') + (opened ? ' wz-envelope--opened' : '');
        btn.setAttribute('data-letter-id', letter.id);
        btn.setAttribute('aria-label', letter.title + (locked ? ' zarfı kilitli' : ' zarfını aç'));

        var emojiSpan = document.createElement('span');
        emojiSpan.className = 'wz-envelope-emoji';
        emojiSpan.setAttribute('aria-hidden', 'true');
        emojiSpan.textContent = locked ? '🔒' : letter.emoji;
        btn.appendChild(emojiSpan);

        var titleSpan = document.createElement('span');
        titleSpan.className = 'wz-envelope-title';
        titleSpan.textContent = letter.title;
        btn.appendChild(titleSpan);

        var statusSpan = document.createElement('span');
        statusSpan.className = 'wz-envelope-status';
        statusSpan.textContent = locked ? 'Kilitli' : (opened ? 'okundu ✓' : '');
        btn.appendChild(statusSpan);

        btn.addEventListener('click', function () {
          if (locked) {
            var teases = CONTENT.birthday.locked.teases;
            var tease = teases[Math.floor(Math.random() * teases.length)];
            var cd = getNextBirthdayCountdown(CONFIG.herBirthday.month, CONFIG.herBirthday.day);
            var days = cd.days + ((cd.hours > 0 || cd.minutes > 0 || cd.seconds > 0) ? 1 : 0);
            tease = tease.replace('{days}', String(days));
            if (typeof window.showToast === 'function') window.showToast(tease);
            return;
          }
          openLetterReader(letter, btn);
        });

        grid.appendChild(btn);
      })(letters[i]);
    }
  }

  /* ── Init ────────────────────────────────────────────────────────────────────────────── */

  var SKELETON =
    '<div class="wz-wrap">' +
      '<section class="wz-section wz-quotes card">' +
        '<div class="wz-section-head">' +
          '<p class="wz-section-title">Güzel Sözler</p>' +
          '<button type="button" class="wz-fav-toggle" id="wz-fav-toggle" aria-pressed="false">' +
            '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">' +
            '<path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>' +
            '</svg>' +
            '<span>Favorilerim</span>' +
          '</button>' +
        '</div>' +
        '<div class="wz-deck" id="wz-deck">' +
          '<article class="wz-card" id="wz-card">' +
            '<button type="button" class="wz-fav-btn" id="wz-fav-btn" aria-label="Favorilere ekle" aria-pressed="false">' +
              '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
              '<path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>' +
              '</svg>' +
            '</button>' +
            '<p class="wz-card-text" id="wz-card-text"></p>' +
            '<p class="wz-card-meta" id="wz-card-meta"></p>' +
          '</article>' +
        '</div>' +
        '<div class="wz-deck-controls">' +
          '<button type="button" class="wz-nav-btn" id="wz-prev-btn" aria-label="Önceki söz">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>' +
          '</button>' +
          '<span class="wz-deck-pos" id="wz-deck-pos"></span>' +
          '<button type="button" class="wz-nav-btn" id="wz-next-btn" aria-label="Sonraki söz">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>' +
          '</button>' +
        '</div>' +
        '<p class="wz-deck-empty" id="wz-deck-empty" hidden></p>' +
      '</section>' +

      '<section class="wz-section wz-jar card">' +
        '<p class="wz-section-title">Seni Sevme Nedenlerim</p>' +
        '<div class="wz-jar-wrap" id="wz-jar-wrap">' +
          '<div class="wz-jar-group" id="wz-jar-group">' +
            '<span class="wz-jar-bear" data-bear data-bear-mood="love" data-bear-arms="wide" data-bear-heart="true" data-bear-size="50" aria-hidden="true"></span>' +
            '<button type="button" class="wz-jar-btn" id="wz-jar-btn" aria-label="Kavanozdan bir neden çek">' + JAR_SVG + '</button>' +
          '</div>' +
          '<p class="wz-jar-hint" id="wz-jar-hint"></p>' +
          '<p class="wz-jar-counter" id="wz-jar-counter"></p>' +
          '<p class="wz-jar-reshuffle" id="wz-jar-reshuffle" hidden></p>' +
          '<div class="wz-jar-note" id="wz-jar-note" hidden>' +
            '<p class="wz-jar-note-text" id="wz-jar-note-text"></p>' +
          '</div>' +
        '</div>' +
      '</section>' +

      '<section class="wz-section wz-letters card">' +
        '<p class="wz-section-title">Açınca Oku</p>' +
        '<div class="wz-letters-grid" id="wz-letters-grid"></div>' +
      '</section>' +
    '</div>';

  /**
   * Renders the Sözler view into #words-root. Safe to call again (clears and rebuilds).
   */
  function initWords() {
    var root = document.getElementById('words-root');
    if (!root) return;

    deck = buildDeck();
    deckIndex = 0;
    favOnly = false;
    favorites = readList(FAV_KEY);
    openedLetters = readList(LETTERS_KEY);
    dragState = null;

    root.innerHTML = SKELETON;

    if (typeof bearAutoRender === 'function') bearAutoRender();

    wireDeck();
    renderDeck();

    renderLettersGrid();

    document.getElementById('wz-jar-hint').textContent = (CONTENT.words.ui && CONTENT.words.ui.jarHint) || DEFAULT_JAR_HINT;

    var initialDrawn = readList(JAR_KEY);
    document.getElementById('wz-jar-counter').textContent = initialDrawn.length + ' / ' + CONTENT.words.reasons.length;
    document.getElementById('wz-jar-btn').addEventListener('click', drawReason);
  }

  window.initWords = initWords;
})();
