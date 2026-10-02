import { afterEach, expect, it } from 'vitest';
import { isSignedRenderMedia, signRenderMedia } from '@/lib/puxin/media-auth';
afterEach(() => { delete process.env.PUXIN_RENDER_MEDIA_SECRET; });
it('allows the renderer to read only the signed asset, without bypassing editor authentication', () => {
  process.env.PUXIN_RENDER_MEDIA_SECRET = 'test-only-secret';
  const url = new URL(signRenderMedia('/api/puxin/media/image/a.png', 'http://127.0.0.1:3471'));
  expect(isSignedRenderMedia(url, 'GET')).toBe(true);
  expect(isSignedRenderMedia(url, 'POST')).toBe(false);
  url.pathname = '/api/puxin/projects'; expect(isSignedRenderMedia(url, 'GET')).toBe(false);
  url.pathname = '/api/puxin/media/image/b.png'; expect(isSignedRenderMedia(url, 'GET')).toBe(false);
});
