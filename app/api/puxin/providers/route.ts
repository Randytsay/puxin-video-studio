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
      location: process.env.GOOGLE_CLOUD_LOCATION?.trim() || 'global',
    },
  });
}
