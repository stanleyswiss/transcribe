const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedUpload, mediaKind, transcriptionContentType } = require('../media');

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
