// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '../player/useKeyboardShortcuts';
import type { PlayerControls } from '../player/usePlayer';

function makeControls(): PlayerControls {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    toggle: vi.fn(),
    seek: vi.fn(),
    rewind: vi.fn(),
    forward: vi.fn(),
    toggleLoop: vi.fn(),
    restart: vi.fn(),
    focusChunk: vi.fn(),
    unfocusChunk: vi.fn(),
    toggleFurigana: vi.fn(),
  };
}

function pressKey(code: string, target?: EventTarget) {
  const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
  if (target) {
    Object.defineProperty(event, 'target', { value: target, enumerable: true });
  }
  window.dispatchEvent(event);
  return event;
}

describe('useKeyboardShortcuts', () => {
  let controls: PlayerControls;

  beforeEach(() => {
    controls = makeControls();
  });

  describe('Space', () => {
    it('calls controls.toggle', () => {
      renderHook(() => useKeyboardShortcuts({ controls, mode: 'global' }));
      pressKey('Space');
      expect(controls.toggle).toHaveBeenCalledOnce();
    });
  });

  describe('ArrowLeft', () => {
    it('calls controls.rewind', () => {
      renderHook(() => useKeyboardShortcuts({ controls, mode: 'global' }));
      pressKey('ArrowLeft');
      expect(controls.rewind).toHaveBeenCalledOnce();
    });
  });

  describe('ArrowRight', () => {
    it('calls controls.forward', () => {
      renderHook(() => useKeyboardShortcuts({ controls, mode: 'global' }));
      pressKey('ArrowRight');
      expect(controls.forward).toHaveBeenCalledOnce();
    });
  });

  describe('KeyL', () => {
    it('calls controls.toggleLoop', () => {
      renderHook(() => useKeyboardShortcuts({ controls, mode: 'global' }));
      pressKey('KeyL');
      expect(controls.toggleLoop).toHaveBeenCalledOnce();
    });
  });

  describe('Escape', () => {
    it('calls controls.unfocusChunk when in chunk mode', () => {
      renderHook(() => useKeyboardShortcuts({ controls, mode: 'chunk' }));
      pressKey('Escape');
      expect(controls.unfocusChunk).toHaveBeenCalledOnce();
    });

    it('does not call unfocusChunk in global mode', () => {
      renderHook(() => useKeyboardShortcuts({ controls, mode: 'global' }));
      pressKey('Escape');
      expect(controls.unfocusChunk).not.toHaveBeenCalled();
    });
  });

  describe('input guard', () => {
    it('ignores Space when focus is inside an INPUT', () => {
      renderHook(() => useKeyboardShortcuts({ controls, mode: 'global' }));
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
      expect(controls.toggle).not.toHaveBeenCalled();
      document.body.removeChild(input);
    });

    it('ignores Space when focus is inside a TEXTAREA', () => {
      renderHook(() => useKeyboardShortcuts({ controls, mode: 'global' }));
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
      expect(controls.toggle).not.toHaveBeenCalled();
      document.body.removeChild(textarea);
    });

    it('ignores keys when target is contentEditable', () => {
      renderHook(() => useKeyboardShortcuts({ controls, mode: 'global' }));
      const div = document.createElement('div');
      div.contentEditable = 'true';
      document.body.appendChild(div);
      // Dispatch from the element so event.target is correctly set (bubbles to window)
      div.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
      expect(controls.toggle).not.toHaveBeenCalled();
      document.body.removeChild(div);
    });
  });

  describe('unhandled keys', () => {
    it('ignores unrelated keys', () => {
      renderHook(() => useKeyboardShortcuts({ controls, mode: 'global' }));
      pressKey('KeyA');
      pressKey('Enter');
      pressKey('Tab');
      expect(controls.toggle).not.toHaveBeenCalled();
      expect(controls.rewind).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('removes event listener on unmount', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      const { unmount } = renderHook(() =>
        useKeyboardShortcuts({ controls, mode: 'global' }),
      );
      unmount();
      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      removeSpy.mockRestore();
    });
  });
});
