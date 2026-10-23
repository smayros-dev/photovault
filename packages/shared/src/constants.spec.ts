import { describe, expect, it } from 'vitest';
import { ALLOWED_IMAGE_MIMES, API_BASE_URL, MAX_UPLOAD_BYTES } from './constants';

describe('shared constants', () => {
  it('MAX_UPLOAD_BYTES vaut 25 Mo', () => expect(MAX_UPLOAD_BYTES).toBe(26214400));
  it('ALLOWED_IMAGE_MIMES contient jpeg/png/webp/gif/avif', () =>
    expect([...ALLOWED_IMAGE_MIMES]).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/avif',
    ]));
  it('API_BASE_URL pointe vers /api', () => expect(API_BASE_URL).toBe('/api'));
});
