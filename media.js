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

// Each request must stay under the 25 MB upload limit. The duration cap keeps long
// meetings independent of how much audio a model accepts in one request. Returns how
// many chunks to cut and how long each one is (the last chunk may be shorter).
function planChunks(durationSeconds, fileSizeMB, { maxChunkSeconds = 1200, maxSizeMB = 24 } = {}) {
  const bySize = Math.ceil(fileSizeMB / maxSizeMB);

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    if (bySize <= 1) return { numChunks: 1, chunkDuration: null };
    throw new Error('Could not read the audio duration needed to split this file');
  }

  const byDuration = Math.ceil(durationSeconds / maxChunkSeconds);
  const numChunks = Math.max(1, bySize, byDuration);
  // Round up so the chunks always cover the whole recording, including the last seconds.
  return { numChunks, chunkDuration: Math.ceil(durationSeconds / numChunks) };
}

module.exports = { isAllowedUpload, mediaKind, transcriptionContentType, planChunks };
