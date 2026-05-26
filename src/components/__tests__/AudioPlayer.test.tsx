// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AudioPlayer from '../player/AudioPlayer';
import type { UsePlayerReturn } from '../player/usePlayer';
import { initialPlayerState } from '../player/playerReducer';

function makePlayer(overrides: Partial<UsePlayerReturn['state']> = {}, extras: Partial<Omit<UsePlayerReturn, 'state'>> = {}): UsePlayerReturn {
  const controls = {
    play: vi.fn(),
    pause: vi.fn(),
    toggle: vi.fn(),
    seek: vi.fn(),
    rewind: vi.fn(),
    forward: vi.fn(),
    toggleLoop: vi.fn(),
    restart: vi.fn(),
    seekToChunk: vi.fn(),
  };
  return {
    state: { ...initialPlayerState, ...overrides },
    dispatch: vi.fn(),
    controls,
    isLoading: false,
    durationSec: 120,
    playbackError: null,
    clearPlaybackError: vi.fn(),
    ...extras,
  };
}

describe('AudioPlayer', () => {
  it('renders the play button when paused', () => {
    const player = makePlayer({ isPlaying: false });
    render(<AudioPlayer player={player} />);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('renders the pause button when playing', () => {
    const player = makePlayer({ isPlaying: true });
    render(<AudioPlayer player={player} />);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('clicking play button calls controls.play', () => {
    const player = makePlayer({ isPlaying: false });
    render(<AudioPlayer player={player} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(player.controls.play).toHaveBeenCalledOnce();
  });

  it('clicking pause button calls controls.pause', () => {
    const player = makePlayer({ isPlaying: true });
    render(<AudioPlayer player={player} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(player.controls.pause).toHaveBeenCalledOnce();
  });

  it('clicking rewind calls controls.rewind', () => {
    const player = makePlayer();
    render(<AudioPlayer player={player} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rewind 5 seconds' }));
    expect(player.controls.rewind).toHaveBeenCalledOnce();
  });

  it('clicking forward calls controls.forward', () => {
    const player = makePlayer();
    render(<AudioPlayer player={player} />);
    fireEvent.click(screen.getByRole('button', { name: 'Forward 5 seconds' }));
    expect(player.controls.forward).toHaveBeenCalledOnce();
  });

  it('clicking restart calls controls.restart', () => {
    const player = makePlayer();
    render(<AudioPlayer player={player} />);
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
    expect(player.controls.restart).toHaveBeenCalledOnce();
  });

  it('loop button has aria-pressed=false when not looping', () => {
    const player = makePlayer({ isLooping: false });
    render(<AudioPlayer player={player} />);
    const loopBtn = screen.getByRole('button', { name: 'Toggle loop' });
    expect(loopBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('loop button has aria-pressed=true when looping', () => {
    const player = makePlayer({ isLooping: true });
    render(<AudioPlayer player={player} />);
    const loopBtn = screen.getByRole('button', { name: 'Toggle loop' });
    expect(loopBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking loop button calls controls.toggleLoop', () => {
    const player = makePlayer();
    render(<AudioPlayer player={player} />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle loop' }));
    expect(player.controls.toggleLoop).toHaveBeenCalledOnce();
  });

  it('scrubber change dispatches seek with the new value', () => {
    const player = makePlayer();
    render(<AudioPlayer player={player} />);
    const slider = screen.getByRole('slider', { name: 'Playback position' });
    fireEvent.change(slider, { target: { value: '45' } });
    expect(player.controls.seek).toHaveBeenCalledWith(45);
  });

  it('uses player.durationSec for slider max', () => {
    const player = makePlayer({}, { durationSec: 120 });
    render(<AudioPlayer player={player} />);
    const slider = screen.getByRole('slider', { name: 'Playback position' });
    expect(slider).toHaveAttribute('max', '120');
  });

  it('shows a loading indicator and hides the scrubber when isLoading is true', () => {
    const player = makePlayer({}, { isLoading: true });
    render(<AudioPlayer player={player} />);
    expect(screen.getByText(/Loading audio/i)).toBeInTheDocument();
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('disables player controls when isLoading is true', () => {
    const player = makePlayer({}, { isLoading: true });
    render(<AudioPlayer player={player} />);
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rewind 5 seconds' })).toBeDisabled();
  });

  it('renders a playback error message when audio fails', () => {
    const player = makePlayer();
    player.playbackError = 'Could not play this episode audio.';
    render(<AudioPlayer player={player} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not play this episode audio.');
  });

  it('clicking the dismiss button calls clearPlaybackError', () => {
    const player = makePlayer();
    player.playbackError = 'Could not play this episode audio.';
    render(<AudioPlayer player={player} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss error' }));
    expect(player.clearPlaybackError).toHaveBeenCalledOnce();
  });
});
