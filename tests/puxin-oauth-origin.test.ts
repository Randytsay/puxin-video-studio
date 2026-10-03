import { afterEach, expect, it, vi } from 'vitest';
import { driveOauthOrigin } from '@/lib/puxin/oauth-origin';
import { buildDriveConsentUrl, createOauthClient } from '@/lib/puxin/drive';

afterEach(() => vi.unstubAllEnvs());

it('keeps consent and token exchange on the registered public callback behind a proxy', () => {
  vi.stubEnv('PUXIN_PUBLIC_ORIGIN', 'https://studio.example.com/');
  vi.stubEnv('GOOGLE_DRIVE_CLIENT_ID', 'test-client');
  vi.stubEnv('GOOGLE_DRIVE_CLIENT_SECRET', 'test-secret');
  const internal = 'https://localhost:3110';
  const consent = new URL(buildDriveConsentUrl(internal, 'test-state'));
  expect(consent.searchParams.get('redirect_uri')).toBe('https://studio.example.com/api/puxin/drive/callback');
  const exchangeClient = new URL(createOauthClient(internal).generateAuthUrl({ scope: ['https://www.googleapis.com/auth/drive'] }));
  expect(exchangeClient.searchParams.get('redirect_uri')).toBe(consent.searchParams.get('redirect_uri'));
  expect(driveOauthOrigin(internal)).toBe('https://studio.example.com');
});

it('supports a direct local development server without a public origin', () => {
  vi.stubEnv('PUXIN_PUBLIC_ORIGIN', '');
  expect(driveOauthOrigin('http://127.0.0.1:3471')).toBe('http://127.0.0.1:3471');
});

it.each(['http://studio.example.com', 'https://studio.example.com/path', 'https://user:pass@studio.example.com', 'https://studio.example.com?next=evil'])('rejects invalid configured origin %s', (origin) => {
  vi.stubEnv('PUXIN_PUBLIC_ORIGIN', origin);
  expect(() => driveOauthOrigin('https://localhost:3110')).toThrow();
});
