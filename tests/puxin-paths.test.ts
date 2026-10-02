import { expect, it } from 'vitest';
import { mediaPath } from '@/lib/puxin/paths';
it('rejects traversal and encoded paths before resolving any private file', async () => {
  for (const key of ['../google-token.json', 'audio/../../private', '/etc/passwd', 'audio/%2e%2e/secret', 'audio/./file']) await expect(mediaPath(key)).rejects.toThrow('無效');
});
