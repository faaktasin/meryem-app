/**
 * Meryem App — EXIF GPS Reader
 * Pure JavaScript EXIF parser that extracts GPS coordinates from JPEG files.
 * No external dependencies.
 */

/**
 * Reads GPS coordinates from a JPEG file's EXIF data.
 * @param {File} file - Image file to read
 * @returns {Promise<{ lat: number, lng: number } | null>} GPS coords or null
 */
function readExifGps(file) {
  return new Promise(function (resolve) {
    if (!file || !file.type || file.type.indexOf('jpeg') === -1 && file.type.indexOf('jpg') === -1 && file.name.search(/\.jpe?g$/i) === -1) {
      resolve(null);
      return;
    }

    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var gps = parseExifGps(new DataView(e.target.result));
        resolve(gps);
      } catch (err) {
        resolve(null);
      }
    };
    reader.onerror = function () { resolve(null); };
    /* Read only first 128KB — EXIF is always near the start */
    reader.readAsArrayBuffer(file.slice(0, 131072));
  });
}

/**
 * Parses EXIF GPS data from a DataView of the file header.
 * @param {DataView} view
 * @returns {{ lat: number, lng: number } | null}
 */
function parseExifGps(view) {
  /* Check JPEG SOI marker */
  if (view.getUint16(0) !== 0xFFD8) return null;

  var offset = 2;
  var length = view.byteLength;

  while (offset < length - 4) {
    var marker = view.getUint16(offset);

    /* APP1 marker (EXIF) */
    if (marker === 0xFFE1) {
      var segLen = view.getUint16(offset + 2);

      /* Check "Exif\0\0" header */
      if (view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0x0000) {
        return readTiffGps(view, offset + 10, segLen - 8);
      }
      offset += 2 + segLen;
      continue;
    }

    /* Skip non-APP1 markers */
    if ((marker & 0xFF00) === 0xFF00 && marker !== 0xFFD8 && marker !== 0xFFD9) {
      offset += 2 + view.getUint16(offset + 2);
    } else {
      offset += 1;
    }
  }

  return null;
}

/**
 * Reads GPS IFD from TIFF structure.
 * @param {DataView} view
 * @param {number} tiffStart - Offset where TIFF header begins
 * @param {number} maxLen
 * @returns {{ lat: number, lng: number } | null}
 */
function readTiffGps(view, tiffStart, maxLen) {
  var endian = view.getUint16(tiffStart);
  var le = endian === 0x4949; /* II = little-endian, MM = big-endian */

  function getU16(off) { return view.getUint16(tiffStart + off, le); }
  function getU32(off) { return view.getUint32(tiffStart + off, le); }

  /* Verify TIFF magic number 42 */
  if (getU16(2) !== 0x002A) return null;

  var ifdOffset = getU32(4);

  /* Find GPS IFD pointer in IFD0 */
  var gpsIfdOffset = findGpsIfdOffset(getU16, getU32, ifdOffset);
  if (!gpsIfdOffset) return null;

  /* Parse GPS IFD */
  return parseGpsIfd(view, tiffStart, le, gpsIfdOffset);
}

/**
 * Finds the GPS IFD offset from IFD0 entries.
 * GPS IFD pointer has tag 0x8825.
 */
function findGpsIfdOffset(getU16, getU32, ifdOffset) {
  var entryCount = getU16(ifdOffset);

  for (var i = 0; i < entryCount; i++) {
    var entryOff = ifdOffset + 2 + i * 12;
    var tag = getU16(entryOff);

    if (tag === 0x8825) {
      return getU32(entryOff + 8);
    }
  }

  return null;
}

/**
 * Parses GPS IFD and extracts lat/lng.
 * Tags: 1=LatRef, 2=Lat, 3=LngRef, 4=Lng
 */
function parseGpsIfd(view, tiffStart, le, gpsOffset) {
  function getU16(off) { return view.getUint16(tiffStart + off, le); }
  function getU32(off) { return view.getUint32(tiffStart + off, le); }

  var count = getU16(gpsOffset);
  var latRef = null, lngRef = null;
  var latData = null, lngData = null;

  for (var i = 0; i < count; i++) {
    var entryOff = gpsOffset + 2 + i * 12;
    var tag = getU16(entryOff);
    var valOffset = getU32(entryOff + 8);

    switch (tag) {
      case 1: /* GPSLatitudeRef — N or S */
        latRef = String.fromCharCode(view.getUint8(tiffStart + entryOff + 8));
        break;
      case 2: /* GPSLatitude — 3 rationals */
        latData = readRationals(view, tiffStart, le, valOffset, 3);
        break;
      case 3: /* GPSLongitudeRef — E or W */
        lngRef = String.fromCharCode(view.getUint8(tiffStart + entryOff + 8));
        break;
      case 4: /* GPSLongitude — 3 rationals */
        lngData = readRationals(view, tiffStart, le, valOffset, 3);
        break;
    }
  }

  if (!latData || !lngData) return null;

  var lat = dmsToDecimal(latData[0], latData[1], latData[2]);
  var lng = dmsToDecimal(lngData[0], lngData[1], lngData[2]);

  if (latRef === 'S') lat = -lat;
  if (lngRef === 'W') lng = -lng;

  /* Sanity check */
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;

  return { lat: lat, lng: lng };
}

/**
 * Reads n RATIONAL values (each is two uint32: numerator/denominator).
 */
function readRationals(view, tiffStart, le, offset, n) {
  var result = [];
  for (var i = 0; i < n; i++) {
    var num = view.getUint32(tiffStart + offset + i * 8, le);
    var den = view.getUint32(tiffStart + offset + i * 8 + 4, le);
    result.push(den === 0 ? 0 : num / den);
  }
  return result;
}

/**
 * Converts degrees/minutes/seconds to decimal degrees.
 */
function dmsToDecimal(deg, min, sec) {
  return deg + min / 60 + sec / 3600;
}
