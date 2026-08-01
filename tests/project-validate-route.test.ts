import { describe, it, expect, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

async function callValidate(body: unknown): Promise<Response> {
  const { POST } = await import('@/app/api/project/validate/route');
  const { NextRequest } = await import('next/server');
  const req = new NextRequest('http://localhost/api/project/validate', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as NextRequest;
  return POST(req);
}

const validBody = {
  clips: [
    {
      plotName: 'Clip 1',
      text: '',
      imageUrl: '/uploads/image/test.png',
      audioUrl: '',
      duration: 3,
      index: 0,
    },
  ],
  resolution: '1080p',
  aspectRatio: '16:9',
};

describe('POST /api/project/validate', () => {
  it('200 with ok/summary/schema pointer for a valid project', async () => {
    const res = await callValidate(validBody);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.summary).toMatchObject({ clipCount: 1, durationSeconds: 3, fps: 30 });
    expect(json.schema).toBe('/schema/project.schema.json');
  });

  it('422 with path-scoped errors for an invalid project', async () => {
    const res = await callValidate({ ...validBody, resolution: '8k' });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.errors.some((e: { path: string }) => e.path === 'resolution')).toBe(true);
  });

  it('400 for a malformed JSON body', async () => {
    const res = await callValidate('{not json');
    expect(res.status).toBe(400);
    expect((await res.json()).ok).toBe(false);
  });
});

describe('POST /api/project/validate — media-origin policy (mirrors /api/render)', () => {
  afterEach(() => {
    delete process.env.RENDER_ALLOWED_MEDIA_HOSTS;
  });

  it('422 with the offending path for an absolute URL on a disallowed host', async () => {
    const body = structuredClone(validBody);
    body.clips[0].imageUrl = 'http://169.254.169.254/latest/meta-data';
    const res = await callValidate(body);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.errors.some((e: { path: string }) => e.path === 'clips[0].imageUrl')).toBe(true);
    expect(json.errors[0].message).toMatch(/RENDER_ALLOWED_MEDIA_HOSTS/);
  });

  it('200 when the host is explicitly allowlisted', async () => {
    process.env.RENDER_ALLOWED_MEDIA_HOSTS = 'cdn.example.com';
    const body = structuredClone(validBody);
    body.clips[0].imageUrl = 'https://cdn.example.com/intro.png';
    const res = await callValidate(body);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('checks bgmUrl too', async () => {
    const res = await callValidate({ ...validBody, bgmUrl: 'https://evil.example.com/track.mp3' });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.errors.some((e: { path: string }) => e.path === 'bgmUrl')).toBe(true);
  });
});
