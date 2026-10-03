import { isGoogleImpersonationConfigured } from '@/lib/puxin/google-auth';

export type VideoGenerationProviderId = 'minimax-h3-colab' | 'vertex-veo-3.1';

export interface VideoGenerationProviderStatus {
  id: VideoGenerationProviderId;
  label: string;
  configured: boolean;
  purpose: string;
}

export interface VoiceGenerationProviderStatus {
  id: 'vertex-gemini-tts';
  label: string;
  configured: boolean;
  purpose: string;
  model: string;
}

function vertexConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLOUD_PROJECT?.trim() &&
      (isGoogleImpersonationConfigured() ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
        process.env.GOOGLE_CLOUD_ACCESS_TOKEN?.trim()),
  );
}

export function getVideoGenerationProviderStatuses(): VideoGenerationProviderStatus[] {
  return [
    {
      id: 'minimax-h3-colab',
      label: 'MiniMax H3 / Google Colab',
      configured: Boolean(process.env.MINIMAX_H3_RUNNER_PATH?.trim()),
      purpose: 'Reference-image animation through an external Google Colab runner (source remains outside this MIT repository)',
    },
    {
      id: 'vertex-veo-3.1',
      label: 'Vertex AI · Veo 3.1',
      configured: vertexConfigured(),
      purpose: `Google Cloud image-to-video provider for selected scenes (${process.env.VERTEX_VIDEO_MODEL?.trim() || 'veo-3.1-fast-generate-001'})`,
    },
  ];
}

export function getVoiceGenerationProviderStatuses(): VoiceGenerationProviderStatus[] {
  return [
    {
      id: 'vertex-gemini-tts',
      label: 'Vertex AI · Gemini 3.1 Flash TTS',
      configured: vertexConfigured(),
      purpose: 'Natural Traditional-Chinese narration for Puxin scenes',
      model: process.env.VERTEX_TTS_MODEL?.trim() || 'gemini-3.1-flash-tts-preview',
    },
  ];
}
