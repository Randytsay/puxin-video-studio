import { describe, expect, it } from 'vitest';
import { findPresetScene, findPuxinStoryPreset } from '@/lib/puxin/story-presets';

describe('Puxin story presets', () => {
  it('maps the water-kettle folder to a 15-scene narration plan', () => {
    const preset = findPuxinStoryPreset('水壺');
    expect(preset).not.toBeNull();
    expect(preset?.scenes).toHaveLength(15);
    expect(preset?.scenes.reduce((sum, scene) => sum + scene.duration, 0)).toBeGreaterThan(60);
  });

  it('maps source filename plus panel to the correct narration', () => {
    const preset = findPuxinStoryPreset('水壺');
    expect(findPresetScene(preset, '03.png', 'top')?.narration).toContain('怎麼讓它安靜');
    expect(findPresetScene(preset, '08.png', 'single')?.narration).toContain('先不添柴');
  });

  it('does not apply the preset to unrelated story folders', () => {
    expect(findPuxinStoryPreset('洗碗')).toBeNull();
  });
});
