const path = require('path');

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.webm']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mpeg', '.mpg', '.mov', '.webm']);
const GENERIC_UPLOAD_MIME_TYPES = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
  'application/x-download'
]);

function extensionFor(filename) {
  return path.extname(filename || '').toLowerCase();
}

function mediaKind(filename, mimetype = '') {
  const extension = extensionFor(filename);
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';

  const type = mimetype.toLowerCase();
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  return null;
}

function isAllowedUpload(file) {
  const extension = extensionFor(file.originalname);
  const kind = mediaKind(file.originalname, file.mimetype);
  if (!kind || (!AUDIO_EXTENSIONS.has(extension) && !VIDEO_EXTENSIONS.has(extension))) {
    return false;
  }

  const type = (file.mimetype || '').toLowerCase();
  return GENERIC_UPLOAD_MIME_TYPES.has(type) || type.startsWith(`${kind}/`);
}

function transcriptionContentType(filename) {
  switch (extensionFor(filename)) {
    case '.m4a':
    case '.mp4':
      return 'audio/mp4';
    case '.wav':
      return 'audio/wav';
    case '.ogg':
      return 'audio/ogg';
    case '.webm':
      return 'audio/webm';
    default:
      return 'audio/mpeg';
  }
}

module.exports = { isAllowedUpload, mediaKind, transcriptionContentType };
