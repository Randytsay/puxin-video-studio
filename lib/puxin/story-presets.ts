import type { VideoClip } from '@/src/types';

export interface PuxinStoryPresetScene {
  sourceName: string;
  panel: 'single' | 'top' | 'bottom';
  narration: string;
  duration: number;
  motion?: VideoClip['imageEffect'];
}

export interface PuxinStoryPreset {
  id: string;
  folderNames: string[];
  title: string;
  scenes: PuxinStoryPresetScene[];
}

export const PUXIN_STORY_PRESETS: PuxinStoryPreset[] = [
  {
    id: 'water-kettle',
    folderNames: ['水壺'],
    title: '情緒有解｜水壺的啟示',
    scenes: [
      { sourceName: '01.png', panel: 'top', narration: '那天，我真的快冒煙了。', duration: 3.2, motion: 'zoom' },
      { sourceName: '01.png', panel: 'bottom', narration: '可是師父沒有問我怎麼了，只是看著水壺。', duration: 4.4, motion: 'pan' },
      { sourceName: '02.png', panel: 'top', narration: '工作在催，家人也在問，手機還一直響。', duration: 4.3, motion: 'kenBurns' },
      { sourceName: '02.png', panel: 'bottom', narration: '連坐下來喝口茶，我都覺得是在浪費時間。', duration: 4.6, motion: 'zoomOut' },
      { sourceName: '03.png', panel: 'top', narration: '師父指著水壺問：怎麼讓它安靜？', duration: 4.1, motion: 'pan' },
      { sourceName: '03.png', panel: 'bottom', narration: '我想都沒想：把火關掉啊。', duration: 3.4, motion: 'zoom' },
      { sourceName: '04.png', panel: 'top', narration: '師父沒再說什麼，只看了看水壺。', duration: 3.8, motion: 'kenBurns' },
      { sourceName: '04.png', panel: 'bottom', narration: '又看了看我。那一刻，我突然明白，他好像不是在問水壺。', duration: 5.8, motion: 'zoom' },
      { sourceName: '05.png', panel: 'top', narration: '同事的一句話，我在腦子裡重播了十次。', duration: 4.5, motion: 'pan' },
      { sourceName: '05.png', panel: 'bottom', narration: '明天還沒來，我卻已經先把所有難題怕過一遍。', duration: 5.1, motion: 'kenBurns' },
      { sourceName: '06.png', panel: 'top', narration: '事情，當然還是要處理。', duration: 3.1, motion: 'zoomOut' },
      { sourceName: '06.png', panel: 'bottom', narration: '只是心裡那把一直添柴的火，也可以先被看見。', duration: 4.8, motion: 'zoom' },
      { sourceName: '07.png', panel: 'top', narration: '我把手機放下，讓自己停一下。', duration: 3.7, motion: 'pan' },
      { sourceName: '07.png', panel: 'bottom', narration: '喝了一口茶。這一次，我終於知道茶是什麼味道。', duration: 4.9, motion: 'kenBurns' },
      { sourceName: '08.png', panel: 'single', narration: '壺響時，看看火。心急時，照照心。先不添柴，再看眼前。', duration: 7.0, motion: 'zoomOut' },
    ],
  },
];

export function findPuxinStoryPreset(folderName: string | null | undefined): PuxinStoryPreset | null {
  const normalized = folderName?.trim();
  if (!normalized) return null;
  return PUXIN_STORY_PRESETS.find((preset) => preset.folderNames.includes(normalized)) ?? null;
}

export function findPresetScene(
  preset: PuxinStoryPreset | null,
  sourceName: string,
  panel: PuxinStoryPresetScene['panel'],
): PuxinStoryPresetScene | null {
  if (!preset) return null;
  const normalizedSource = sourceName.trim().toLowerCase();
  return preset.scenes.find((scene) => scene.sourceName.toLowerCase() === normalizedSource && scene.panel === panel) ?? null;
}
