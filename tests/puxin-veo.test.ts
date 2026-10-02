import { describe, expect, it } from 'vitest';
import { chooseVeoDurationSeconds, resolvePuxinImagePath } from '@/lib/puxin/veo';

describe('Puxin Veo helpers', () => {
  it('rounds a scene duration up to a supported Veo duration', () => {
    expect(chooseVeoDurationSeconds(3.2)).toBe(4);
    expect(chooseVeoDurationSeconds(4.4)).toBe(6);
    expect(chooseVeoDurationSeconds(7)).toBe(8);
    expect(chooseVeoDurationSeconds(Number.NaN)).toBe(4);
  });

  it('accepts only imported Puxin scene images', () => {
    expect(resolvePuxinImagePath('/uploads/image/puxin/scene.png')).toContain('/public/uploads/image/puxin/scene.png');
    expect(() => resolvePuxinImagePath('/uploads/image/other.png')).toThrow(/only accepts imported Puxin/i);
    expect(() => resolvePuxinImagePath('/uploads/image/puxin/../../secret.png')).toThrow(/outside/i);
  });
});
