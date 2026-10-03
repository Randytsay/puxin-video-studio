import { GoogleAuth, Impersonated, type AuthClient } from 'google-auth-library';

export const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT?.trim() || '';
export const GOOGLE_IMPERSONATE_SERVICE_ACCOUNT =
  process.env.GOOGLE_IMPERSONATE_SERVICE_ACCOUNT?.trim() || '';

const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

export function isGoogleImpersonationConfigured(): boolean {
  return Boolean(GOOGLE_CLOUD_PROJECT && GOOGLE_IMPERSONATE_SERVICE_ACCOUNT);
}

/**
 * Uses the VPS' existing Application Default Credentials only as the source
 * identity, then exchanges them for a short-lived service-account token.
 * No service-account private key is stored in this repository or deployment.
 */
export async function createGoogleAuthClient(scopes: string[]): Promise<AuthClient> {
  if (!GOOGLE_IMPERSONATE_SERVICE_ACCOUNT) {
    return new GoogleAuth({ scopes }).getClient();
  }

  const sourceClient = await new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] }).getClient();
  return new Impersonated({
    sourceClient,
    targetPrincipal: GOOGLE_IMPERSONATE_SERVICE_ACCOUNT,
    targetScopes: scopes,
    lifetime: 3600,
  });
}

export async function getImpersonatedAccessToken(
  scopes: string[] = [CLOUD_PLATFORM_SCOPE],
): Promise<string> {
  const client = await createGoogleAuthClient(scopes);
  const token = await client.getAccessToken();
  if (!token.token) throw new Error('Google Cloud access token is unavailable');
  return token.token;
}
