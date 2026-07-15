import { describe, expect, it } from 'vitest';
import manifest from '../manifest';

describe('manifest', () => {
  it('declares required PWA fields', () => {
    const result = manifest();

    expect(result.name).toBe('KIKU');
    expect(result.short_name).toBe('KIKU');
    expect(result.start_url).toBe('/');
    expect(result.display).toBe('standalone');
    expect(result.background_color).toBeTruthy();
    expect(result.theme_color).toBeTruthy();
  });

  it('includes 192 and 512 icons plus a maskable variant', () => {
    const result = manifest();
    const icons = result.icons ?? [];

    expect(icons.some((icon) => icon.sizes === '192x192')).toBe(true);
    expect(icons.some((icon) => icon.sizes === '512x512' && icon.purpose !== 'maskable')).toBe(
      true
    );
    expect(icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable')).toBe(
      true
    );
  });
});
