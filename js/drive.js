/**
 * Meryem App — Google Drive Integration
 * Handles authentication via Google Identity Services and file operations via Drive API v3.
 */

var driveState = {
  tokenClient: null,
  accessToken: null,
  appFolderId: null,
  gapiLoaded: false,
  gisLoaded: false
};

/* ── Initialization ────────────────────────────────── */

/**
 * Called when gapi.js is loaded. Initializes the Drive API client.
 */
function onGapiLoaded() {
  gapi.load('client', function () {
    gapi.client.init({
      apiKey: CONFIG.google.apiKey,
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
    }).then(function () {
      driveState.gapiLoaded = true;
    });
  });
}

/**
 * Called when GIS (Google Identity Services) is loaded.
 */
function onGisLoaded() {
  driveState.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.google.clientId,
    scope: 'https://www.googleapis.com/auth/drive.file',
    callback: '' /* set dynamically in ensureGoogleAuth */
  });
  driveState.gisLoaded = true;
}

/**
 * Ensures we have a valid Google access token.
 * Prompts the user if not authenticated yet.
 * @returns {Promise<string>} access token
 */
function ensureGoogleAuth() {
  return new Promise(function (resolve, reject) {
    if (driveState.accessToken) {
      resolve(driveState.accessToken);
      return;
    }

    if (!driveState.gisLoaded || !driveState.gapiLoaded) {
      reject(new Error('Google API henuz yuklenmedi. Sayfayi yenile.'));
      return;
    }

    /* Timeout: if popup is blocked or user doesn't respond in 30s, reject */
    var settled = false;
    var timeout = setTimeout(function () {
      if (!settled) {
        settled = true;
        reject(new Error('Google giris zaman asimi. Popup engellenmis olabilir.'));
      }
    }, 30000);

    driveState.tokenClient.callback = function (response) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      if (response.error) {
        reject(new Error('Google giris hatasi: ' + response.error));
        return;
      }
      driveState.accessToken = response.access_token;
      resolve(response.access_token);
    };

    try {
      driveState.tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (err) {
      settled = true;
      clearTimeout(timeout);
      reject(new Error('Google giris acilamadi: ' + err.message));
    }
  });
}

/* ── Folder Management ─────────────────────────────── */

var APP_FOLDER_NAME = 'MeryemApp';

/**
 * Gets or creates the "MeryemApp" folder in the user's Drive.
 * Caches the folder ID for subsequent calls.
 * @returns {Promise<string>} folder ID
 */
function getOrCreateAppFolder() {
  if (driveState.appFolderId) {
    return Promise.resolve(driveState.appFolderId);
  }

  /* Search for existing folder */
  return gapi.client.drive.files.list({
    q: "name='" + APP_FOLDER_NAME + "' and mimeType='application/vnd.google-apps.folder' and trashed=false",
    fields: 'files(id)',
    spaces: 'drive'
  }).then(function (response) {
    var files = response.result.files;
    if (files && files.length > 0) {
      driveState.appFolderId = files[0].id;
      return driveState.appFolderId;
    }

    /* Create folder */
    return gapi.client.drive.files.create({
      resource: {
        name: APP_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder'
      },
      fields: 'id'
    }).then(function (res) {
      driveState.appFolderId = res.result.id;
      return driveState.appFolderId;
    });
  });
}

/* ── File Upload ───────────────────────────────────── */

/**
 * Uploads a blob to Google Drive inside the MeryemApp folder.
 * Sets the file to "anyone with link can view" for direct image access.
 * @param {Blob} blob - Image blob to upload
 * @param {string} fileName - File name for the upload
 * @returns {Promise<string>} Drive file ID
 */
function uploadToDrive(blob, fileName) {
  return getOrCreateAppFolder().then(function (folderId) {
    var metadata = {
      name: fileName,
      parents: [folderId]
    };

    var form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    return fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + driveState.accessToken
      },
      body: form
    });
  }).then(function (response) {
    if (!response.ok) throw new Error('Drive upload hatasi: ' + response.status);
    return response.json();
  }).then(function (data) {
    var fileId = data.id;

    /* Make file publicly viewable */
    return gapi.client.drive.permissions.create({
      fileId: fileId,
      resource: {
        role: 'reader',
        type: 'anyone'
      }
    }).then(function () {
      return fileId;
    });
  });
}

/* ── File Access ───────────────────────────────────── */

/**
 * Returns a direct image URL for a Drive file.
 * Uses the thumbnail endpoint with a large size for full quality.
 * @param {string} fileId - Google Drive file ID
 * @returns {string} Image URL
 */
function getDriveImageUrl(fileId) {
  return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1600';
}

/* ── File Deletion ─────────────────────────────────── */

/**
 * Deletes a file from Google Drive. Fire-and-forget.
 * @param {string} fileId - Google Drive file ID
 */
function deleteFromDrive(fileId) {
  if (!fileId || !driveState.accessToken) return;

  gapi.client.drive.files.delete({
    fileId: fileId
  }).catch(function (err) {
    console.warn('Drive silme hatasi:', err);
  });
}
