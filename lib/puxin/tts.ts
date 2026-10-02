import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getImpersonatedAccessToken } from './google-auth';
import { mediaPath, mediaUrl } from './paths';

export const TTS_VOICES = ['Kore', 'Leda', 'Aoede', 'Charon', 'Puck', 'Sulafat'] as const;
export function pcmToWav(pcm: Buffer): Buffer {
  if (!pcm.length || pcm.length % 2) throw new Error('語音服務回傳的音訊格式不正確');
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
export async function synthesizeNarration(input: { text: string; voice?: string; style?: string }) {
  const text = input.text?.trim();
  if (!text) throw new Error('請先輸入旁白');
  const voice = input.voice || 'Kore';
  if (!(TTS_VOICES as readonly string[]).includes(voice)) throw new Error('請選擇可用聲線');
  const style = input.style?.trim() || '請用自然台灣華語，溫和清楚，不刻意煽情；自然停頓。';
  const contents = `${style}\n僅朗讀以下旁白，不要朗讀指示：\n${text}`;
  if (Buffer.byteLength(contents, 'utf8') > 7800) throw new Error('這段旁白太長，請拆成較短場景');
  const model = process.env.VERTEX_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  const location = process.env.VERTEX_TTS_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'global';
  if (!project) throw new Error('尚未設定旁白服務的 Google Cloud 專案');
  if (!/^[a-zA-Z0-9-]+$/.test(project) || !/^[a-z0-9-]+$/.test(location) || !/^gemini-[a-zA-Z0-9.-]+tts[a-zA-Z0-9.-]*$/.test(model)) throw new Error('旁白服務設定不正確');
  const key = `audio/${createHash('sha256').update(JSON.stringify({ text, style, voice, model, project, location })).digest('hex')}.wav`;
  const output = await mediaPath(key);
  try { const cached = await readFile(output); return { audioUrl: mediaUrl(key), duration: (cached.length - 44) / 48000, cached: true, model }; } catch { /* first generation */ }
  const token = process.env.GOOGLE_CLOUD_ACCESS_TOKEN?.trim() || await getImpersonatedAccessToken();
  const hostname = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
  const response = await fetch(`https://${hostname}/v1beta1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`, {
    method: 'POST', signal: AbortSignal.timeout(120000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-goog-user-project': project },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: contents }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { languageCode: 'cmn-tw', voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } }),
  });
  const data = await response.json() as { error?: { message?: string }; candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] };
  if (!response.ok) throw new Error(`旁白生成失敗（${response.status}）：${data.error?.message || '請檢查模型與權限'}`);
  const parts = data.candidates?.[0]?.content?.parts || [];
  const audioParts = parts.filter(p => p.inlineData?.data);
  if (audioParts.some(p => !/^audio\/(L16|pcm)(;|$)/i.test(p.inlineData?.mimeType || ''))) throw new Error('語音服務回傳了不支援的音訊格式');
  const pcm = Buffer.concat(audioParts.map(p => Buffer.from(p.inlineData!.data!, 'base64')));
  if (!pcm.length) throw new Error('沒有取得音訊，請調整旁白後再試');
  const wav = pcmToWav(pcm);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, wav);
  return { audioUrl: mediaUrl(key), duration: pcm.length / 48000, cached: false, model };
}
