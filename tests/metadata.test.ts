import { describe, it, expect } from 'vitest';
import {
  generateCanonicalUrl,
  removeLocalePrefix,
  addLocalePrefix,
  generateHreflangUrls,
  getBaseUrl,
} from '@/lib/utils/metadata';

const BASE = getBaseUrl();

describe('locale prefix handling', () => {
  // Regression: the prefix was stripped with a bare /^\/ja/, so any path whose
  // first segment merely *starts* with "ja" got its first two letters eaten.
  describe('paths that only start with "ja" are not locale-prefixed', () => {
    const notLocale = ['/japan-guide', '/jazz-bgm', '/java', '/ja-nope'];

    it.each(notLocale)('removeLocalePrefix leaves %s intact', (p) => {
      expect(removeLocalePrefix(p)).toBe(p);
    });

    it.each(notLocale)('generateCanonicalUrl(%s, "en") leaves the path intact', (p) => {
      expect(generateCanonicalUrl(p, 'en')).toBe(`${BASE}${p}`);
    });

    it.each(notLocale)('addLocalePrefix(%s, "ja") still adds the prefix', (p) => {
      expect(addLocalePrefix(p, 'ja')).toBe(`/ja${p}`);
    });

    it('generateHreflangUrls keeps both variants pointing at the real path', () => {
      const urls = generateHreflangUrls('/japan-guide');
      expect(urls.en).toBe(`${BASE}/japan-guide`);
      expect(urls.ja).toBe(`${BASE}/ja/japan-guide`);
    });
  });

  describe('real /ja locale paths are still handled', () => {
    it('strips the prefix at a segment boundary', () => {
      expect(removeLocalePrefix('/ja/pricing')).toBe('/pricing');
    });

    it('strips a bare /ja to the root', () => {
      expect(removeLocalePrefix('/ja')).toBe('/');
    });

    it('does not double-prefix an already-prefixed path', () => {
      expect(addLocalePrefix('/ja/pricing', 'ja')).toBe('/ja/pricing');
      expect(generateCanonicalUrl('/ja/pricing', 'ja')).toBe(`${BASE}/ja/pricing`);
    });

    it('adds the prefix for ja and removes it for en', () => {
      expect(generateCanonicalUrl('/pricing', 'ja')).toBe(`${BASE}/ja/pricing`);
      expect(generateCanonicalUrl('/ja/pricing', 'en')).toBe(`${BASE}/pricing`);
    });

    it('leaves the root alone', () => {
      expect(generateCanonicalUrl('/', 'ja')).toBe(`${BASE}/`);
      expect(generateCanonicalUrl('/', 'en')).toBe(`${BASE}/`);
    });
  });
});
