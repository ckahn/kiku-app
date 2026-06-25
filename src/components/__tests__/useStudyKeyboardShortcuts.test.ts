// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStudyKeyboardShortcuts } from '../player/useStudyKeyboardShortcuts';

function makeOptions(overrides: Partial<Parameters<typeof useStudyKeyboardShortcuts>[0]> = {}) {
  return {
    togglePlay: vi.fn(),
    toggleLoop: vi.fn(),
    prevHref: '/prev',
    nextHref: '/next',
    navigate: vi.fn(),
    ...overrides,
  };
}

function pressKey(code: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
}

describe('useStudyKeyboardShortcuts', () => {
  let options: ReturnType<typeof makeOptions>;

  beforeEach(() => {
    options = makeOptions();
  });

  describe('play/stop toggle', () => {
    it('Space calls togglePlay', () => {
      renderHook(() => useStudyKeyboardShortcuts(options));
      pressKey('Space');
      expect(options.togglePlay).toHaveBeenCalledOnce();
    });

    it('KeyM calls togglePlay', () => {
      renderHook(() => useStudyKeyboardShortcuts(options));
      pressKey('KeyM');
      expect(options.togglePlay).toHaveBeenCalledOnce();
    });
  });

  describe('loop toggle', () => {
    it('KeyL calls toggleLoop', () => {
      renderHook(() => useStudyKeyboardShortcuts(options));
      pressKey('KeyL');
      expect(options.toggleLoop).toHaveBeenCalledOnce();
    });
  });

  describe('previous segment navigation', () => {
    it('ArrowLeft navigates to prevHref', () => {
      renderHook(() => useStudyKeyboardShortcuts(options));
      pressKey('ArrowLeft');
      expect(options.navigate).toHaveBeenCalledWith('/prev');
    });

    it('KeyJ navigates to prevHref', () => {
      renderHook(() => useStudyKeyboardShortcuts(options));
      pressKey('KeyJ');
      expect(options.navigate).toHaveBeenCalledWith('/prev');
    });

    it('ArrowLeft does nothing when prevHref is absent', () => {
      renderHook(() => useStudyKeyboardShortcuts(makeOptions({ prevHref: undefined })));
      pressKey('ArrowLeft');
      expect(options.navigate).not.toHaveBeenCalled();
    });

    it('KeyJ does nothing when prevHref is absent', () => {
      renderHook(() => useStudyKeyboardShortcuts(makeOptions({ prevHref: undefined })));
      pressKey('KeyJ');
      expect(options.navigate).not.toHaveBeenCalled();
    });
  });

  describe('next segment navigation', () => {
    it('ArrowRight navigates to nextHref', () => {
      renderHook(() => useStudyKeyboardShortcuts(options));
      pressKey('ArrowRight');
      expect(options.navigate).toHaveBeenCalledWith('/next');
    });

    it('KeyK navigates to nextHref', () => {
      renderHook(() => useStudyKeyboardShortcuts(options));
      pressKey('KeyK');
      expect(options.navigate).toHaveBeenCalledWith('/next');
    });

    it('ArrowRight does nothing when nextHref is absent', () => {
      renderHook(() => useStudyKeyboardShortcuts(makeOptions({ nextHref: undefined })));
      pressKey('ArrowRight');
      expect(options.navigate).not.toHaveBeenCalled();
    });

    it('KeyK does nothing when nextHref is absent', () => {
      renderHook(() => useStudyKeyboardShortcuts(makeOptions({ nextHref: undefined })));
      pressKey('KeyK');
      expect(options.navigate).not.toHaveBeenCalled();
    });
  });

  describe('input guard', () => {
    it('ignores Space when focus is inside an INPUT', () => {
      renderHook(() => useStudyKeyboardShortcuts(options));
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
      expect(options.togglePlay).not.toHaveBeenCalled();
      document.body.removeChild(input);
    });

    it('ignores Space when focus is inside a TEXTAREA', () => {
      renderHook(() => useStudyKeyboardShortcuts(options));
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
      expect(options.togglePlay).not.toHaveBeenCalled();
      document.body.removeChild(textarea);
    });

    it('ignores keys when target is contentEditable', () => {
      renderHook(() => useStudyKeyboardShortcuts(options));
      const div = document.createElement('div');
      div.contentEditable = 'true';
      document.body.appendChild(div);
      div.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
      expect(options.togglePlay).not.toHaveBeenCalled();
      document.body.removeChild(div);
    });
  });

  describe('unhandled keys', () => {
    it('ignores unrelated keys', () => {
      renderHook(() => useStudyKeyboardShortcuts(options));
      pressKey('KeyA');
      pressKey('Enter');
      pressKey('Tab');
      expect(options.togglePlay).not.toHaveBeenCalled();
      expect(options.toggleLoop).not.toHaveBeenCalled();
      expect(options.navigate).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('removes event listener on unmount', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      const { unmount } = renderHook(() => useStudyKeyboardShortcuts(options));
      unmount();
      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      removeSpy.mockRestore();
    });
  });
});
