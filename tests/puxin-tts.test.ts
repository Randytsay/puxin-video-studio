import { expect, it, vi } from 'vitest';
import { pcmToWav, synthesizeNarration } from '@/lib/puxin/tts';
it('wraps PCM as playable 24k mono WAV without changing samples', () => {
  const pcm = Buffer.alloc(48000); pcm.writeInt16LE(1234, 0); const wav = pcmToWav(pcm);
  expect(wav.subarray(0, 4).toString()).toBe('RIFF'); expect(wav.readUInt32LE(24)).toBe(24000); expect(wav.readUInt32LE(40)).toBe(48000); expect(wav.subarray(44)).toEqual(pcm);
});
it('rejects oversized input and unsupported voices without a billable call', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  await expect(synthesizeNarration({ text: '禪'.repeat(5000) })).rejects.toThrow('太長');
  await expect(synthesizeNarration({ text: '停一下', voice: 'unknown' })).rejects.toThrow('聲線');
  expect(fetch).not.toHaveBeenCalled(); fetch.mockRestore();
});
it('uses Vertex audio configuration and reuses the exact narration cache', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const dir = await mkdtemp(`${tmpdir()}/puxin-tts-`);
  vi.stubEnv('PUXIN_DATA_DIR', dir); vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'test-project'); vi.stubEnv('GOOGLE_CLOUD_ACCESS_TOKEN', 'test-token'); vi.stubEnv('VERTEX_TTS_LOCATION', 'global');
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: Buffer.alloc(48000).toString('base64') } }] } }] }), { status: 200 }));
  try {
    const a = await synthesizeNarration({ text: '停一下，慢慢呼吸。', voice: 'Kore' });
    const b = await synthesizeNarration({ text: '停一下，慢慢呼吸。', voice: 'Kore' });
    expect(a.duration).toBe(1); expect(b.cached).toBe(true); expect(b.audioUrl).toBe(a.audioUrl); expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain('aiplatform.googleapis.com/v1beta1/projects/test-project/locations/global');
    expect(JSON.parse(String(init?.body)).generationConfig).toMatchObject({ responseModalities: ['AUDIO'], speechConfig: { languageCode: 'cmn-tw', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } });
  } finally { fetch.mockRestore(); vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); }
});

it('retries transient Vertex throttling and then stores the successful audio', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const dir = await mkdtemp(`${tmpdir()}/puxin-tts-retry-`);
  vi.stubEnv('PUXIN_DATA_DIR', dir); vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'test-project'); vi.stubEnv('GOOGLE_CLOUD_ACCESS_TOKEN', 'test-token'); vi.stubEnv('VERTEX_TTS_LOCATION', 'global');
  const fetch = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Resource exhausted' } }), { status: 429, headers: { 'retry-after': '0.001' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: Buffer.alloc(48000).toString('base64') } }] } }] }), { status: 200 }));
  try {
    const result = await synthesizeNarration({ text: '這是一段重試測試。', voice: 'Kore' });
    expect(result.duration).toBe(1); expect(fetch).toHaveBeenCalledTimes(2);
  } finally { fetch.mockRestore(); vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); }
});
