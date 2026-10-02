import { createHmac, timingSafeEqual } from 'node:crypto';
function secret() { return process.env.PUXIN_RENDER_MEDIA_SECRET || process.env.PUXIN_BASIC_AUTH_HEADER || ''; }
export function signRenderMedia(url: string, origin: string) {
  const resolved = new URL(url, origin);
  if (!secret() || !resolved.pathname.startsWith('/api/puxin/media/')) return resolved.toString();
  const expires = String(Math.floor(Date.now() / 1000) + 3600);
  const signature = createHmac('sha256', secret()).update(`${resolved.pathname}:${expires}`).digest('hex');
  resolved.searchParams.set('expires', expires); resolved.searchParams.set('signature', signature);
  return resolved.toString();
}
export function isSignedRenderMedia(url: URL, method: string) {
  if (!secret() || method !== 'GET' || !url.pathname.startsWith('/api/puxin/media/')) return false;
  const expires = url.searchParams.get('expires') || ''; const signature = url.searchParams.get('signature') || '';
  const now = Math.floor(Date.now() / 1000);
  if (!/^\d+$/.test(expires) || Number(expires) < now || Number(expires) > now + 3600 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret()).update(`${url.pathname}:${expires}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
