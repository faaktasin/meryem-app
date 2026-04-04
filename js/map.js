/**
 * Meryem App — Memory Map
 * Leaflet map with Firestore-synced memory pins, Google Drive photo storage,
 * EXIF GPS gallery upload, and geocoder.
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
    renderGallery();
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

  /* Gallery upload */
  initGalleryUpload();
}

/* ── Custom Markers ────────────────────────────────── */

var heartIcon = L.divIcon({
  className: 'heart-marker',
  html: '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="#e74c6f" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32]
});

var cameraIcon = L.divIcon({
  className: 'camera-marker',
  html: '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="#9c27b0" d="M12 12m-3.2 0a3.2 3.2 0 1 0 6.4 0 3.2 3.2 0 1 0-6.4 0"/><path fill="#9c27b0" d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg>',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32]
});

/* ── Marker Sync (diff-based) ───────────────────────── */

function syncMarkers(updatedMemories) {
  var newIds = {};
  updatedMemories.forEach(function (m) {
    if (m.lat != null && m.lng != null) newIds[m.id] = true;
  });

  /* Remove markers that no longer exist */
  Object.keys(markers).forEach(function (id) {
    if (!newIds[id]) {
      window.appMap.removeLayer(markers[id]);
      delete markers[id];
    }
  });

  /* Add markers that are new (only if they have coordinates) */
  updatedMemories.forEach(function (m) {
    if (m.lat != null && m.lng != null && !markers[m.id]) {
      addMarkerToMap(m);
    }
  });
}

function addMarkerToMap(memory) {
  var icon = memory.source === 'gallery' ? cameraIcon : heartIcon;
  var marker = L.marker([memory.lat, memory.lng], { icon: icon }).addTo(window.appMap);

  marker.on('click', function () {
    var current = memories.find(function (m) { return m.id === memory.id; });
    showMemoryDetail(current || memory);
  });

  markers[memory.id] = marker;
}

function showMemoryDetail(memory) {
  var detail = document.getElementById('detail-content');

  var photoSrc = getMemoryPhotoUrl(memory);
  var photoEl = '';
  if (photoSrc) {
    photoEl = '<img src="' + photoSrc + '" alt="' + escapeHtml(memory.title) + '">';
  }

  detail.innerHTML =
    '<h3>' + escapeHtml(memory.title) + '</h3>' +
    '<p class="detail-date">' + formatDate(memory.date) + '</p>' +
    photoEl +
    '<p class="detail-note">' + escapeHtml(memory.note || '') + '</p>' +
    '<div class="detail-actions">' +
      '<button class="btn btn-danger" data-delete-memory="' + escapeHtml(memory.id) + '">Sil</button>' +
    '</div>';

  /* Event delegation for delete */
  detail.querySelector('[data-delete-memory]').addEventListener('click', function () {
    deleteMemory(this.dataset.deleteMemory);
  });

  openModal('detail-modal');
}

/* ── Image Processing ──────────────────────────────── */

/**
 * Processes an image file: resizes and compresses.
 * @param {File} file
 * @param {number} maxWidth
 * @param {number} quality - JPEG quality (0-1)
 * @returns {Promise<{ dataUrl: string, blob: Blob }>}
 */
function processImage(file, maxWidth, quality) {
  return new Promise(function (resolve) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        var scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(function (blob) {
          var dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve({ dataUrl: dataUrl, blob: blob });
        }, 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Creates a small thumbnail for Firestore storage.
 * @param {File} file
 * @returns {Promise<string>} base64 data URL (~10-20KB)
 */
function makeThumbnail(file) {
  return processImage(file, 200, 0.5).then(function (result) {
    return result.dataUrl;
  });
}

/**
 * Returns the original file as a Blob for Drive upload.
 * No resizing or compression — uploads at full quality.
 * @param {File} file
 * @returns {Promise<Blob>}
 */
function makeFullImage(file) {
  return Promise.resolve(file);
}

/* ── CRUD Operations ────────────────────────────────── */

function saveMemory() {
  var title = document.getElementById('memory-title').value.trim();
  var date = document.getElementById('memory-date').value;
  var note = document.getElementById('memory-note').value.trim();
  var lat = parseFloat(document.getElementById('memory-lat').value);
  var lng = parseFloat(document.getElementById('memory-lng').value);
  var fileInput = document.getElementById('memory-photo');
  var file = fileInput.files[0];

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
    source: 'map'
  };

  var uploadPromise;

  if (file) {
    uploadPromise = uploadPhotoForMemory(file, memoryId).then(function (photoData) {
      memory.thumbnail = photoData.thumbnail;
      memory.driveFileId = photoData.driveFileId;
      /* Keep photo field for backward compat with old rendering */
      memory.photo = photoData.thumbnail;
    }).catch(function (err) {
      console.warn('Drive upload failed, falling back to base64:', err);
      /* Fallback: use the preview data URL if Drive upload fails */
      var photoData = document.getElementById('photo-preview').dataset.photo || '';
      if (photoData) {
        memory.photo = photoData;
        memory.thumbnail = photoData;
      }
    });
  } else {
    uploadPromise = Promise.resolve();
  }

  uploadPromise.then(function () {
    return addMemoryToFirestore(memory);
  }).then(function () {
    closeModal('memory-modal');
    showToast('Anı kaydedildi!');
  }).catch(function (err) {
    console.error('Firestore write error:', err);
    if (err.message && err.message.indexOf('size') !== -1) {
      showToast('Fotoğraf çok büyük. Daha küçük fotoğraf dene.');
    } else {
      showToast('Kaydetme hatası: ' + (err.message || 'Tekrar dene.'));
    }
  }).then(function () {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Kaydet';
  });
}

/**
 * Uploads a photo to Drive and creates a thumbnail.
 * @param {File} file
 * @param {string} memoryId
 * @returns {Promise<{ thumbnail: string, driveFileId: string }>}
 */
function uploadPhotoForMemory(file, memoryId) {
  return ensureGoogleAuth().then(function () {
    return Promise.all([
      makeThumbnail(file),
      makeFullImage(file)
    ]);
  }).then(function (results) {
    var thumbnail = results[0];
    var fullBlob = results[1];
    var fileName = memoryId + '_' + Date.now() + '.jpg';

    return uploadToDrive(fullBlob, fileName).then(function (driveFileId) {
      return {
        thumbnail: thumbnail,
        driveFileId: driveFileId
      };
    });
  });
}

function deleteMemory(id) {
  if (!confirm('Bu anıyı silmek istediğine emin misin?')) return;

  /* Find memory to check for Drive file */
  var mem = memories.find(function (m) { return m.id === id; });
  if (mem && mem.driveFileId) {
    deleteFromDrive(mem.driveFileId);
  }

  deleteMemoryFromFirestore(id);
  closeModal('detail-modal');
}

/* ── Gallery Upload ────────────────────────────────── */

function initGalleryUpload() {
  var uploadBtn = document.getElementById('gallery-upload-btn');
  var fileInput = document.getElementById('gallery-file-input');

  if (!uploadBtn || !fileInput) return;

  uploadBtn.addEventListener('click', function () {
    fileInput.click();
  });

  fileInput.addEventListener('change', function () {
    if (fileInput.files.length > 0) {
      uploadFromGallery(fileInput.files);
      fileInput.value = '';
    }
  });
}

/**
 * Uploads files from the gallery upload button.
 * Reads EXIF GPS if available; saves to Drive + Firestore.
 * @param {FileList} files
 */
function uploadFromGallery(files) {
  var total = files.length;
  var completed = 0;
  var galleryCard = document.querySelector('#gallery-view .card');
  galleryCard.classList.add('gallery-uploading');
  showToast('Yükleniyor... 0/' + total);

  var chain = Promise.resolve();

  for (var i = 0; i < files.length; i++) {
    (function (file) {
      chain = chain.then(function () {
        return uploadSingleGalleryPhoto(file).then(function () {
          completed++;
          showToast('Yükleniyor... ' + completed + '/' + total);
        }).catch(function (err) {
          completed++;
          console.error('Gallery upload error:', err);
          showToast('Hata: ' + file.name + ' yüklenemedi');
        });
      });
    })(files[i]);
  }

  chain.then(function () {
    galleryCard.classList.remove('gallery-uploading');
    showToast(total + ' fotoğraf yüklendi!');
  });
}

/**
 * Uploads a single photo from gallery.
 * @param {File} file
 * @returns {Promise<void>}
 */
function uploadSingleGalleryPhoto(file) {
  var memoryId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  var gpsPromise = readExifGps(file);

  return gpsPromise.then(function (gps) {
    return uploadPhotoForMemory(file, memoryId).then(function (photoData) {
      var memory = {
        id: memoryId,
        title: file.name.replace(/\.[^.]+$/, ''),
        date: new Date().toISOString().split('T')[0],
        note: '',
        lat: gps ? gps.lat : null,
        lng: gps ? gps.lng : null,
        source: 'gallery',
        thumbnail: photoData.thumbnail,
        driveFileId: photoData.driveFileId,
        photo: photoData.thumbnail
      };

      return addMemoryToFirestore(memory);
    });
  });
}

/* ── Photo Handling ─────────────────────────────────── */

function previewPhoto(file) {
  if (!file) return;

  var reader = new FileReader();
  reader.onload = function (e) {
    var img = new Image();
    img.onload = function () {
      var canvas = document.createElement('canvas');
      var maxWidth = CONFIG.maxPhotoWidth;
      var scale = Math.min(1, maxWidth / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      /* Try progressively lower quality to fit under 500KB */
      var dataUrl;
      var quality = 0.6;
      do {
        dataUrl = canvas.toDataURL('image/jpeg', quality);
        quality -= 0.1;
      } while (dataUrl.length > 500000 && quality > 0.2);

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

/* ── Photo URL Helper ──────────────────────────────── */

/**
 * Returns the best available photo URL for a memory.
 * Prefers Drive full-quality, falls back to thumbnail/base64.
 * @param {object} memory
 * @returns {string|null}
 */
function getMemoryPhotoUrl(memory) {
  if (memory.driveFileId) {
    return getDriveImageUrl(memory.driveFileId);
  }
  if (memory.photo && isValidPhotoUrl(memory.photo)) {
    return memory.photo;
  }
  if (memory.thumbnail && isValidPhotoUrl(memory.thumbnail)) {
    return memory.thumbnail;
  }
  return null;
}

/**
 * Returns thumbnail URL for gallery grid (small, fast).
 * @param {object} memory
 * @returns {string|null}
 */
function getMemoryThumbnailUrl(memory) {
  /* For gallery grid, prefer local thumbnail for speed */
  if (memory.thumbnail && isValidPhotoUrl(memory.thumbnail)) {
    return memory.thumbnail;
  }
  if (memory.photo && isValidPhotoUrl(memory.photo)) {
    return memory.photo;
  }
  if (memory.driveFileId) {
    return getDriveImageUrl(memory.driveFileId);
  }
  return null;
}

/* ── Gallery ────────────────────────────────────────── */

function renderGallery() {
  var grid = document.getElementById('gallery-grid');
  var gridNomap = document.getElementById('gallery-grid-nomap');
  var nomapSection = document.getElementById('gallery-nomap-section');
  if (!grid) return;

  var withLocation = [];
  var withoutLocation = [];

  memories.forEach(function (m) {
    var hasPhoto = getMemoryThumbnailUrl(m) != null;
    if (!hasPhoto) return;

    if (m.lat != null && m.lng != null) {
      withLocation.push(m);
    } else {
      withoutLocation.push(m);
    }
  });

  /* Render GPS-tagged photos */
  if (withLocation.length === 0 && withoutLocation.length === 0) {
    grid.innerHTML = '<p class="gallery-empty">Henüz fotoğraflı anı eklenmedi</p>';
    if (nomapSection) nomapSection.style.display = 'none';
    return;
  }

  if (withLocation.length === 0) {
    grid.innerHTML = '';
  } else {
    grid.innerHTML = renderGalleryItems(withLocation);
    attachGalleryClickHandlers(grid);
  }

  /* Render GPS-less photos */
  if (gridNomap && nomapSection) {
    if (withoutLocation.length === 0) {
      nomapSection.style.display = 'none';
    } else {
      nomapSection.style.display = 'block';
      gridNomap.innerHTML = renderGalleryItems(withoutLocation);
      attachGalleryClickHandlers(gridNomap);
    }
  }
}

function renderGalleryItems(items) {
  return items.map(function (m) {
    var thumbUrl = getMemoryThumbnailUrl(m);
    return '<div class="gallery-item" data-gallery-id="' + escapeHtml(m.id) + '">' +
      '<img src="' + thumbUrl + '" alt="' + escapeHtml(m.title) + '" loading="lazy">' +
      '<div class="gallery-caption">' + escapeHtml(m.title) + '</div>' +
    '</div>';
  }).join('');
}

function attachGalleryClickHandlers(container) {
  container.querySelectorAll('.gallery-item').forEach(function (item) {
    item.addEventListener('click', function () {
      var mem = memories.find(function (m) { return m.id === item.dataset.galleryId; });
      if (mem) showMemoryDetail(mem);
    });
  });
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
