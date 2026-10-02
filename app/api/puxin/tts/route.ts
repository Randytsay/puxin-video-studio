import { NextRequest, NextResponse } from 'next/server';
import { synthesizeNarration, TTS_VOICES } from '@/lib/puxin/tts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
let busy = false;
export async function GET() { return NextResponse.json({ voices: TTS_VOICES, model: process.env.VERTEX_TTS_MODEL || 'gemini-3.1-flash-tts-preview' }); }
export async function POST(request: NextRequest) {
  if (busy) return NextResponse.json({ error: '正在生成旁白，請稍後再試' }, { status: 429 });
  busy = true;
  try { return NextResponse.json(await synthesizeNarration(await request.json())); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '旁白生成失敗' }, { status: 400 }); }
  finally { busy = false; }
}
