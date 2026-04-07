// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import AudioPlayer from '../player/AudioPlayer';
import type { UsePlayerReturn } from '../player/usePlayer';
import { initialPlayerState } from '../player/playerReducer';

function makePlayer(overrides: Partial<UsePlayerReturn['state']> = {}): UsePlayerReturn {
  const controls = {
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
  return {
    state: { ...initialPlayerState, ...overrides },
    dispatch: vi.fn(),
    audioRef: { current: null },
    controls,
  };
}

const AUDIO_URL = '/api/episodes/1/audio';
const DURATION_MS = 120000; // 2 minutes

describe('AudioPlayer', () => {
  it('renders the play button when paused', () => {
    const player = makePlayer({ isPlaying: false });
    render(<AudioPlayer audioUrl={AUDIO_URL} durationMs={DURATION_MS} player={player} />);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('renders the pause button when playing', () => {
    const player = makePlayer({ isPlaying: true });
    render(<AudioPlayer audioUrl={AUDIO_URL} durationMs={DURATION_MS} player={player} />);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('clicking play button calls controls.play', () => {
    const player = makePlayer({ isPlaying: false });
    render(<AudioPlayer audioUrl={AUDIO_URL} durationMs={DURATION_MS} player={player} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(player.controls.play).toHaveBeenCalledOnce();
  });

  it('clicking pause button calls controls.pause', () => {
    const player = makePlayer({ isPlaying: true });
    render(<AudioPlayer audioUrl={AUDIO_URL} durationMs={DURATION_MS} player={player} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(player.controls.pause).toHaveBeenCalledOnce();
  });

  it('clicking rewind calls controls.rewind', () => {
    const player = makePlayer();
    render(<AudioPlayer audioUrl={AUDIO_URL} durationMs={DURATION_MS} player={player} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rewind 5 seconds' }));
    expect(player.controls.rewind).toHaveBeenCalledOnce();
  });

  it('clicking forward calls controls.forward', () => {
    const player = makePlayer();
    render(<AudioPlayer audioUrl={AUDIO_URL} durationMs={DURATION_MS} player={player} />);
    fireEvent.click(screen.getByRole('button', { name: 'Forward 5 seconds' }));
    expect(player.controls.forward).toHaveBeenCalledOnce();
  });

  it('clicking restart calls controls.restart', () => {
    const player = makePlayer();
    render(<AudioPlayer audioUrl={AUDIO_URL} durationMs={DURATION_MS} player={player} />);
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
    expect(player.controls.restart).toHaveBeenCalledOnce();
  });

  it('loop button has aria-pressed=false when not looping', () => {
    const player = makePlayer({ isLooping: false });
    render(<AudioPlayer audioUrl={AUDIO_URL} durationMs={DURATION_MS} player={player} />);
    const loopBtn = screen.getByRole('button', { name: 'Toggle loop' });
    expect(loopBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('loop button has aria-pressed=true when looping', () => {
    const player = makePlayer({ isLooping: true });
    render(<AudioPlayer audioUrl={AUDIO_URL} durationMs={DURATION_MS} player={player} />);
    const loopBtn = screen.getByRole('button', { name: 'Toggle loop' });
    expect(loopBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking loop button calls controls.toggleLoop', () => {
    const player = makePlayer();
    render(<AudioPlayer audioUrl={AUDIO_URL} durationMs={DURATION_MS} player={player} />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle loop' }));
    expect(player.controls.toggleLoop).toHaveBeenCalledOnce();
  });

  it('scrubber change dispatches seek with the new value', () => {
    const player = makePlayer();
    render(<AudioPlayer audioUrl={AUDIO_URL} durationMs={DURATION_MS} player={player} />);
    const slider = screen.getByRole('slider', { name: 'Playback position' });
    fireEvent.change(slider, { target: { value: '45' } });
    expect(player.controls.seek).toHaveBeenCalledWith(45);
  });

  it('uses durationMs prop for initial slider max', () => {
    const player = makePlayer();
    render(<AudioPlayer audioUrl={AUDIO_URL} durationMs={DURATION_MS} player={player} />);
    const slider = screen.getByRole('slider', { name: 'Playback position' });
    expect(slider).toHaveAttribute('max', '120'); // 120000ms / 1000
  });

  it('updates slider max from audio loadedmetadata when durationMs is 0', () => {
    const player = makePlayer();
    render(<AudioPlayer audioUrl={AUDIO_URL} durationMs={0} player={player} />);
    const slider = screen.getByRole('slider', { name: 'Playback position' });
    expect(slider).toHaveAttribute('max', '0');

    const audio = document.querySelector('audio')!;
    Object.defineProperty(audio, 'duration', { value: 300, configurable: true });
    act(() => {
      fireEvent(audio, new Event('loadedmetadata'));
    });

    expect(slider).toHaveAttribute('max', '300');
  });
});
