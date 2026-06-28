// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEpisodeKeyboardShortcuts } from '../player/useEpisodeKeyboardShortcuts';

function makeOptions() {
  return {
    toggle: vi.fn(),
    rewind: vi.fn(),
    forward: vi.fn(),
    toggleLoop: vi.fn(),
    restart: vi.fn(),
    shiftLoopEndpoint: vi.fn(),
  };
}

function pressKey(code: string, target?: EventTarget, shiftKey = false, modifiers: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {}) {
  const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, shiftKey, ...modifiers });
  if (target) {
    Object.defineProperty(event, 'target', { value: target, enumerable: true });
  }
  window.dispatchEvent(event);
  return event;
}

describe('useEpisodeKeyboardShortcuts', () => {
  let options: ReturnType<typeof makeOptions>;

  beforeEach(() => {
    options = makeOptions();
  });

  describe('Space', () => {
    it('calls toggle', () => {
      renderHook(() => useEpisodeKeyboardShortcuts(options));
      pressKey('Space');
      expect(options.toggle).toHaveBeenCalledOnce();
    });
  });

  describe('ArrowLeft', () => {
    it('calls rewind', () => {
      renderHook(() => useEpisodeKeyboardShortcuts(options));
      pressKey('ArrowLeft');
      expect(options.rewind).toHaveBeenCalledOnce();
    });
  });

  describe('ArrowRight', () => {
    it('calls forward', () => {
      renderHook(() => useEpisodeKeyboardShortcuts(options));
      pressKey('ArrowRight');
      expect(options.forward).toHaveBeenCalledOnce();
    });
  });

  describe('KeyL', () => {
    it('calls toggleLoop', () => {
      renderHook(() => useEpisodeKeyboardShortcuts(options));
      pressKey('KeyL');
      expect(options.toggleLoop).toHaveBeenCalledOnce();
    });
  });

  describe('letter shortcuts', () => {
    it('KeyJ calls rewind', () => {
      renderHook(() => useEpisodeKeyboardShortcuts(options));
      pressKey('KeyJ');
      expect(options.rewind).toHaveBeenCalledOnce();
    });

    it('KeyK calls forward', () => {
      renderHook(() => useEpisodeKeyboardShortcuts(options));
      pressKey('KeyK');
      expect(options.forward).toHaveBeenCalledOnce();
    });

    it('KeyH calls restart', () => {
      renderHook(() => useEpisodeKeyboardShortcuts(options));
      pressKey('KeyH');
      expect(options.restart).toHaveBeenCalledOnce();
    });

    it('KeyM calls toggle', () => {
      renderHook(() => useEpisodeKeyboardShortcuts(options));
      pressKey('KeyM');
      expect(options.toggle).toHaveBeenCalledOnce();
    });
  });

  describe('loop range keyboard shortcuts', () => {
    it('[ calls shiftLoopEndpoint(start, earlier)', () => {
      renderHook(() => useEpisodeKeyboardShortcuts(options));
      pressKey('BracketLeft');
      expect(options.shiftLoopEndpoint).toHaveBeenCalledWith('start', 'earlier');
    });

    it('{ (Shift+[) calls shiftLoopEndpoint(start, later)', () => {
      renderHook(() => useEpisodeKeyboardShortcuts(options));
      pressKey('BracketLeft', undefined, true);
      expect(options.shiftLoopEndpoint).toHaveBeenCalledWith('start', 'later');
    });

    it('] calls shiftLoopEndpoint(end, later)', () => {
      renderHook(() => useEpisodeKeyboardShortcuts(options));
      pressKey('BracketRight');
      expect(options.shiftLoopEndpoint).toHaveBeenCalledWith('end', 'later');
    });

    it('} (Shift+]) calls shiftLoopEndpoint(end, earlier)', () => {
      renderHook(() => useEpisodeKeyboardShortcuts(options));
      pressKey('BracketRight', undefined, true);
      expect(options.shiftLoopEndpoint).toHaveBeenCalledWith('end', 'earlier');
    });
  });

  describe('Escape', () => {
    it('does nothing (segment mode removed)', () => {
      renderHook(() => useEpisodeKeyboardShortcuts(options));
      pressKey('Escape');
      expect(options.toggle).not.toHaveBeenCalled();
      expect(options.rewind).not.toHaveBeenCalled();
    });
  });

  describe('modifier key guard', () => {
    it('ignores KeyL with Ctrl held (e.g. Ctrl+L for address bar)', () => {
      renderHook(() => useEpisodeKeyboardShortcuts(options));
      pressKey('KeyL', undefined, false, { ctrlKey: true });
      expect(options.toggleLoop).not.toHaveBeenCalled();
    });

    it('ignores KeyL with Meta held (e.g. Cmd+L)', () => {
      renderHook(() => useEpisodeKeyboardShortcuts(options));
      pressKey('KeyL', undefined, false, { metaKey: true });
      expect(options.toggleLoop).not.toHaveBeenCalled();
    });

    it('ignores Space with Alt held', () => {
      renderHook(() => useEpisodeKeyboardShortcuts(options));
      pressKey('Space', undefined, false, { altKey: true });
      expect(options.toggle).not.toHaveBeenCalled();
    });
  });

  describe('input guard', () => {
    it('ignores Space when focus is inside an INPUT', () => {
      renderHook(() => useEpisodeKeyboardShortcuts(options));
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
      expect(options.toggle).not.toHaveBeenCalled();
      document.body.removeChild(input);
    });

    it('ignores Space when focus is inside a TEXTAREA', () => {
      renderHook(() => useEpisodeKeyboardShortcuts(options));
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
      expect(options.toggle).not.toHaveBeenCalled();
      document.body.removeChild(textarea);
    });

    it('ignores keys when target is contentEditable', () => {
      renderHook(() => useEpisodeKeyboardShortcuts(options));
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
      renderHook(() => useEpisodeKeyboardShortcuts(options));
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
      const { unmount } = renderHook(() => useEpisodeKeyboardShortcuts(options));
      unmount();
      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      removeSpy.mockRestore();
    });
  });
});
