// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '../player/useKeyboardShortcuts';

function makeOptions() {
  return {
    toggle: vi.fn(),
    rewind: vi.fn(),
    forward: vi.fn(),
    toggleLoop: vi.fn(),
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
  let options: ReturnType<typeof makeOptions>;

  beforeEach(() => {
    options = makeOptions();
  });

  describe('Space', () => {
    it('calls toggle', () => {
      renderHook(() => useKeyboardShortcuts(options));
      pressKey('Space');
      expect(options.toggle).toHaveBeenCalledOnce();
    });
  });

  describe('ArrowLeft', () => {
    it('calls rewind', () => {
      renderHook(() => useKeyboardShortcuts(options));
      pressKey('ArrowLeft');
      expect(options.rewind).toHaveBeenCalledOnce();
    });
  });

  describe('ArrowRight', () => {
    it('calls forward', () => {
      renderHook(() => useKeyboardShortcuts(options));
      pressKey('ArrowRight');
      expect(options.forward).toHaveBeenCalledOnce();
    });
  });

  describe('KeyL', () => {
    it('calls toggleLoop', () => {
      renderHook(() => useKeyboardShortcuts(options));
      pressKey('KeyL');
      expect(options.toggleLoop).toHaveBeenCalledOnce();
    });
  });

  describe('Escape', () => {
    it('does nothing (chunk mode removed)', () => {
      renderHook(() => useKeyboardShortcuts(options));
      pressKey('Escape');
      expect(options.toggle).not.toHaveBeenCalled();
      expect(options.rewind).not.toHaveBeenCalled();
    });
  });

  describe('input guard', () => {
    it('ignores Space when focus is inside an INPUT', () => {
      renderHook(() => useKeyboardShortcuts(options));
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
      expect(options.toggle).not.toHaveBeenCalled();
      document.body.removeChild(input);
    });

    it('ignores Space when focus is inside a TEXTAREA', () => {
      renderHook(() => useKeyboardShortcuts(options));
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
      expect(options.toggle).not.toHaveBeenCalled();
      document.body.removeChild(textarea);
    });

    it('ignores keys when target is contentEditable', () => {
      renderHook(() => useKeyboardShortcuts(options));
      const div = document.createElement('div');
      div.contentEditable = 'true';
      document.body.appendChild(div);
      // Dispatch from the element so event.target is correctly set (bubbles to window)
      div.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
      expect(options.toggle).not.toHaveBeenCalled();
      document.body.removeChild(div);
    });
  });

  describe('unhandled keys', () => {
    it('ignores unrelated keys', () => {
      renderHook(() => useKeyboardShortcuts(options));
      pressKey('KeyA');
      pressKey('Enter');
      pressKey('Tab');
      expect(options.toggle).not.toHaveBeenCalled();
      expect(options.rewind).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('removes event listener on unmount', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      const { unmount } = renderHook(() => useKeyboardShortcuts(options));
      unmount();
      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      removeSpy.mockRestore();
    });
  });
});
