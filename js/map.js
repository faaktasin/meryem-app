/**
 * Meryem App — Memory Map
 * Leaflet map with Firestore-synced memory pins, photo upload, and geocoder.
 */

var memories = [];
var markers = {};

function initMap() {
  var map = L.map('map', {
    center: CONFIG.mapCenter,
    zoom: CONFIG.mapZoom,
    zoomControl: false
  });

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19
  }).addTo(map);

  window.appMap = map;

  /* Location search (Geocoder) */
  L.Control.geocoder({
    placeholder: 'Konum ara...',
    errorMessage: 'Konum bulunamadı',
    geocoder: L.Control.Geocoder.nominatim(),
    position: 'topleft',
    collapsed: true,
    defaultMarkGeocode: false
  }).on('markgeocode', function (e) {
    map.fitBounds(e.geocode.bbox);
  }).addTo(map);

  /* Subscribe to Firestore memories (real-time sync) */
  subscribeMemories(function (updatedMemories) {
    syncMarkers(updatedMemories);
    memories = updatedMemories;
  });

  /* Click to add */
  map.on('click', function (e) {
    document.getElementById('memory-lat').value = e.latlng.lat;
    document.getElementById('memory-lng').value = e.latlng.lng;
    resetMemoryForm();
    openModal('memory-modal');
  });

  /* Form submit */
  document.getElementById('memory-form').addEventListener('submit', function (e) {
    e.preventDefault();
    saveMemory();
  });

  /* Close buttons */
  document.querySelectorAll('[data-close-modal]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      closeModal(btn.dataset.closeModal);
    });
  });

  /* Close modal on backdrop click */
  document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        closeModal(overlay.id);
      }
    });
  });

  /* Photo preview */
  document.getElementById('memory-photo').addEventListener('change', function (e) {
    previewPhoto(e.target.files[0]);
  });
}

/* ── Custom Heart Marker ────────────────────────────── */

var heartIcon = L.divIcon({
  className: 'heart-marker',
  html: '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="#e74c6f" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32]
});

/* ── Marker Sync (diff-based) ───────────────────────── */

function syncMarkers(updatedMemories) {
  var newIds = {};
  updatedMemories.forEach(function (m) { newIds[m.id] = true; });

  /* Remove markers that no longer exist */
  Object.keys(markers).forEach(function (id) {
    if (!newIds[id]) {
      window.appMap.removeLayer(markers[id]);
      delete markers[id];
    }
  });

  /* Add markers that are new */
  updatedMemories.forEach(function (m) {
    if (!markers[m.id]) {
      addMarkerToMap(m);
    }
  });
}

function addMarkerToMap(memory) {
  var marker = L.marker([memory.lat, memory.lng], { icon: heartIcon }).addTo(window.appMap);

  marker.on('click', function () {
    /* Re-fetch from current memories array for latest data */
    var current = memories.find(function (m) { return m.id === memory.id; });
    showMemoryDetail(current || memory);
  });

  markers[memory.id] = marker;
}

function showMemoryDetail(memory) {
  var detail = document.getElementById('detail-content');
  var photoHtml = (memory.photo && isValidPhotoUrl(memory.photo))
    ? '<img src="' + memory.photo + '" alt="' + escapeHtml(memory.title) + '">'
    : '';

  detail.innerHTML =
    '<h3>' + escapeHtml(memory.title) + '</h3>' +
    '<p class="detail-date">' + formatDate(memory.date) + '</p>' +
    photoHtml +
    '<p class="detail-note">' + escapeHtml(memory.note || '') + '</p>' +
    '<div class="detail-actions">' +
      '<button class="btn btn-danger" onclick="deleteMemory(\'' + memory.id + '\')">Sil</button>' +
    '</div>';

  openModal('detail-modal');
}

/* ── CRUD Operations ────────────────────────────────── */

function saveMemory() {
  var title = document.getElementById('memory-title').value.trim();
  var date = document.getElementById('memory-date').value;
  var note = document.getElementById('memory-note').value.trim();
  var lat = parseFloat(document.getElementById('memory-lat').value);
  var lng = parseFloat(document.getElementById('memory-lng').value);
  var photoData = document.getElementById('photo-preview').dataset.photo || '';

  if (!title) return;

  var submitBtn = document.querySelector('#memory-form .btn-primary');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Kaydediliyor...';

  var memoryId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  var memory = {
    id: memoryId,
    title: title,
    date: date,
    note: note,
    lat: lat,
    lng: lng,
    photo: ''
  };

  memory.photo = photoData;

  var savePromise = addMemoryToFirestore(memory);

  savePromise.then(function () {
    closeModal('memory-modal');
    showToast('Anı kaydedildi!');
  }).catch(function () {
    showToast('Kaydetme hatası. Tekrar dene.');
  }).then(function () {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Kaydet';
  });
}

function deleteMemory(id) {
  if (!confirm('Bu anıyı silmek istediğine emin misin?')) return;

  deleteMemoryFromFirestore(id);
  closeModal('detail-modal');
}

/* ── Photo Handling ─────────────────────────────────── */

function previewPhoto(file) {
  if (!file) return;

  var reader = new FileReader();
  reader.onload = function (e) {
    var img = new Image();
    img.onload = function () {
      var canvas = document.createElement('canvas');
      var scale = Math.min(1, CONFIG.maxPhotoWidth / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      var dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      if (dataUrl.length > 700000) {
        showToast('Fotoğraf çok büyük, daha küçük bir fotoğraf dene.');
        return;
      }
      var preview = document.getElementById('photo-preview');
      preview.src = dataUrl;
      preview.dataset.photo = dataUrl;
      preview.style.display = 'block';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function resetMemoryForm() {
  document.getElementById('memory-form').reset();
  var preview = document.getElementById('photo-preview');
  preview.src = '';
  preview.dataset.photo = '';
  preview.style.display = 'none';
  document.getElementById('memory-date').value = new Date().toISOString().split('T')[0];
}

/* ── Utilities ──────────────────────────────────────── */

function escapeHtml(text) {
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  var parts = dateStr.split('-');
  return parts[2] + '.' + parts[1] + '.' + parts[0];
}
