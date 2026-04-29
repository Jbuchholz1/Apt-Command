// Magic-byte verification for image uploads.
//
// Multer's fileFilter only sees the client-supplied Content-Type, which is
// trivially spoofable. This module reads the actual byte signature after the
// upload is in memory and rejects anything that isn't a recognized raster
// image format. SVG is intentionally excluded — it can carry inline <script>
// and is the reason this module exists.

const SVG_MIME = 'image/svg+xml';

// Drop-in multer fileFilter: accepts image/* mimetypes EXCEPT SVG. The real
// defense is verifyImageBuffer below (after the buffer is in memory); this
// fast-fail just saves bandwidth on obviously-bad uploads.
function imageFileFilter(req, file, cb) {
  if (file.mimetype === SVG_MIME) {
    return cb(new Error('SVG files are not allowed'));
  }
  if (file.mimetype && file.mimetype.startsWith('image/')) {
    return cb(null, true);
  }
  cb(new Error('Only image files are allowed'));
}

// Identify a buffer's image format by its magic bytes. Returns the canonical
// mimetype, or null if the bytes don't match any allowed image format.
function detectImageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  const b = buffer;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) {
    return 'image/jpeg';
  }

  // GIF: "GIF87a" or "GIF89a"
  if (
    b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 &&
    (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61
  ) {
    return 'image/gif';
  }

  // WEBP: "RIFF" + 4 size bytes + "WEBP"
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return 'image/webp';
  }

  // BMP: "BM"
  if (b[0] === 0x42 && b[1] === 0x4D) {
    return 'image/bmp';
  }

  // TIFF: II*\0 (little-endian) or MM\0* (big-endian)
  if (
    (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2A && b[3] === 0x00) ||
    (b[0] === 0x4D && b[1] === 0x4D && b[2] === 0x00 && b[3] === 0x2A)
  ) {
    return 'image/tiff';
  }

  // ICO: 00 00 01 00
  if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) {
    return 'image/x-icon';
  }

  // HEIC / HEIF / AVIF: "ftyp" at offset 4, then 4-char brand at offset 8.
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (brand === 'heic' || brand === 'heix' || brand === 'mif1' || brand === 'msf1') {
      return 'image/heic';
    }
    if (brand === 'avif' || brand === 'avis') {
      return 'image/avif';
    }
  }

  return null;
}

// Express middleware: runs after multer.single()/array(). Verifies that the
// uploaded buffer's first bytes match a known image signature; on success,
// overrides req.file.mimetype with the canonical type so downstream code
// (e.g. Supabase Storage) serves the file with the correct Content-Type.
function verifyImageBuffer(req, res, next) {
  if (!req.file) return next();
  const detected = detectImageMime(req.file.buffer);
  if (!detected) {
    return res.status(400).json({
      error: 'Uploaded file is not a recognized image format',
    });
  }
  req.file.mimetype = detected;
  next();
}

module.exports = { imageFileFilter, detectImageMime, verifyImageBuffer };
