const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedUpload, mediaKind, transcriptionContentType, planChunks } = require('../media');

test('accepts an M4A sent with iPhone and generic MIME types', () => {
  assert.equal(isAllowedUpload({ originalname: 'meeting.m4a', mimetype: 'audio/mp4' }), true);
  assert.equal(isAllowedUpload({ originalname: 'meeting.m4a', mimetype: 'audio/x-m4a' }), true);
  assert.equal(isAllowedUpload({ originalname: 'meeting.m4a', mimetype: 'application/octet-stream' }), true);
});

test('uses the M4A filename to identify audio and label the transcription upload', () => {
  assert.equal(mediaKind('meeting.m4a', 'application/octet-stream'), 'audio');
  assert.equal(transcriptionContentType('meeting.m4a'), 'audio/mp4');
});

test('does not accept an arbitrary file renamed without a supported extension', () => {
  assert.equal(isAllowedUpload({ originalname: 'meeting.txt', mimetype: 'audio/mp4' }), false);
});

test('sends a short, small recording as a single request', () => {
  assert.deepEqual(planChunks(15 * 60, 7), { numChunks: 1, chunkDuration: 900 });
});

test('splits a one-hour phone recording under 24 MB by duration', () => {
  // A 1 h M4A at 48 kbps is about 21 MB: small enough for the upload limit, too long for one request.
  assert.deepEqual(planChunks(3600, 21), { numChunks: 3, chunkDuration: 1200 });
});

test('covers the last seconds of the recording', () => {
  const { numChunks, chunkDuration } = planChunks(3601.7, 21);
  assert.equal(numChunks, 4);
  assert.ok(numChunks * chunkDuration >= 3601.7);
});

test('uses the size limit when it needs more chunks than the duration', () => {
  assert.deepEqual(planChunks(600, 100), { numChunks: 5, chunkDuration: 120 });
});

test('honours a custom chunk length', () => {
  assert.deepEqual(planChunks(180, 2, { maxChunkSeconds: 60 }), { numChunks: 3, chunkDuration: 60 });
});

test('without a readable duration, keeps small files whole and rejects large ones', () => {
  assert.deepEqual(planChunks(NaN, 10), { numChunks: 1, chunkDuration: null });
  assert.throws(() => planChunks(NaN, 50), /audio duration/);
});
