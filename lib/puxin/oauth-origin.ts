/** The reverse proxy may expose localhost in NextRequest.url. Use one
 * configured public origin for both OAuth exchange and browser redirects. */
export function driveOauthOrigin(requestOrigin: string): string {
  const configured = process.env.PUXIN_PUBLIC_ORIGIN?.trim();
  if (!configured) return new URL(requestOrigin).origin;
  const url = new URL(configured);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('PUXIN_PUBLIC_ORIGIN must be an HTTPS origin without a path');
  }
  return url.origin;
}
