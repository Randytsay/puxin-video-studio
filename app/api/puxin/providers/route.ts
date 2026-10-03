import { NextResponse } from 'next/server';
import {
  getVideoGenerationProviderStatuses,
  getVoiceGenerationProviderStatuses,
} from '@/lib/puxin/video-providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    videoProviders: getVideoGenerationProviderStatuses(),
    voiceProviders: getVoiceGenerationProviderStatuses(),
    vertex: {
      project: process.env.GOOGLE_CLOUD_PROJECT?.trim() || null,
      serviceAccount: process.env.GOOGLE_IMPERSONATE_SERVICE_ACCOUNT?.trim() || null,
      videoLocation: process.env.VERTEX_VIDEO_LOCATION?.trim() || 'us-central1',
      ttsLocation: process.env.VERTEX_TTS_LOCATION?.trim() || 'global',
    },
  });
}
