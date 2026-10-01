export type VideoGenerationProviderId = 'minimax-h3-colab' | 'veo-3.1';

export interface VideoGenerationProviderStatus {
  id: VideoGenerationProviderId;
  label: string;
  configured: boolean;
  purpose: string;
}

export function getVideoGenerationProviderStatuses(): VideoGenerationProviderStatus[] {
  return [
    {
      id: 'minimax-h3-colab',
      label: 'MiniMax H3 / Google Colab',
      configured: Boolean(process.env.MINIMAX_H3_RUNNER_PATH?.trim()),
      purpose: 'Reference-image animation for selected scenes',
    },
    {
      id: 'veo-3.1',
      label: 'Veo 3.1',
      configured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      purpose: 'Optional cloud image-to-video provider',
    },
  ];
}
