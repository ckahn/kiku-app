'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Play, RefreshCw, Repeat, Square } from 'lucide-react';
import type { Chunk } from '@/db/schema';
import type { ApiResponse } from '@/lib/api-response';
import type { StudyGuideContent } from '@/lib/api/types';
import { saveTranscriptRestoreState } from '@/components/player/studyNavigation';

// LLM sometimes echoes kana words as their own reading — skip when redundant
function hasDistinctReading(reading: string | undefined, text: string): boolean {
  return !!reading && reading !== text;
}

interface StudyScreenProps {
  readonly chunk: Pick<
    Chunk,
    'id' | 'chunkIndex' | 'textRaw' | 'textFurigana' | 'furiganaStatus' | 'furiganaWarning' | 'startMs' | 'endMs'
  >;
  readonly totalSegments: number;
  readonly audioUrl: string;
  readonly studyGuideUrl: string;
  readonly backHref: string;
  readonly prevHref?: string;
  readonly nextHref?: string;
}

interface StudySectionProps {
  readonly title: string;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly children: React.ReactNode;
}

function getClientErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unexpected error';
}

function StudySection({ title, isOpen, onToggle, children }: StudySectionProps) {
  return (
    <section className="rounded-lg border border-border bg-surface">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-ink"
        aria-label={title}
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <span>{title}</span>
        <span className="text-muted">{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && <div className="border-t border-border px-4 py-4">{children}</div>}
    </section>
  );
}

async function loadStudyGuide(studyGuideUrl: string): Promise<StudyGuideContent> {
  const response = await fetch(studyGuideUrl);
  const payload = await response.json() as ApiResponse<StudyGuideContent>;

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error ?? 'Could not load the study guide.');
  }

  return payload.data;
}

async function regenerateStudyGuide(studyGuideUrl: string): Promise<StudyGuideContent> {
  const response = await fetch(`${studyGuideUrl}/regenerate`, {
    method: 'POST',
  });
  const payload = await response.json() as ApiResponse<StudyGuideContent>;

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error ?? 'Could not regenerate the study guide.');
  }

  return payload.data;
}

type PlaybackRate = 0.5 | 0.75 | 1;
const PLAYBACK_RATES: PlaybackRate[] = [1, 0.75, 0.5];

export default function StudyScreen({
  chunk,
  totalSegments,
  audioUrl,
  studyGuideUrl,
  backHref,
  prevHref,
  nextHref,
}: StudyScreenProps) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<PlaybackRate>(1);
  const [openSections, setOpenSections] = useState({
    vocabulary: true,
    grammar: false,
    breakdown: false,
    translation: false,
  });
  const [studyGuide, setStudyGuide] = useState<StudyGuideContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const isRegeneratingRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function fetchStudyGuide() {
      try {
        setIsLoading(true);
        setErrorMessage(null);
        const nextStudyGuide = await loadStudyGuide(studyGuideUrl);

        // Don't overwrite a regeneration result that resolved while we were loading.
        if (!isCancelled && !isRegeneratingRef.current) {
          setStudyGuide(nextStudyGuide);
        }
      } catch (error: unknown) {
        if (!isCancelled) {
          setErrorMessage(getClientErrorMessage(error));
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchStudyGuide();

    return () => {
      isCancelled = true;
    };
  }, [studyGuideUrl]);

  async function playFromChunkStart() {
    if (!audioRef.current) {
      return;
    }

    try {
      audioRef.current.currentTime = chunk.startMs / 1000;
      await audioRef.current.play();
      setIsPlaying(true);
    } catch {
      setErrorMessage('Could not play this chunk audio.');
    }
  }

  function stopPlayback() {
    if (!audioRef.current) {
      return;
    }

    audioRef.current.pause();
    audioRef.current.currentTime = chunk.startMs / 1000;
    setIsPlaying(false);
  }

  function handleTimeUpdate() {
    if (!audioRef.current) {
      return;
    }

    const chunkEndTime = chunk.endMs / 1000;
    if (audioRef.current.currentTime >= chunkEndTime) {
      if (isLooping) {
        audioRef.current.currentTime = chunk.startMs / 1000;
      } else {
        stopPlayback();
      }
    }
  }

  function cyclePlaybackRate() {
    const next = PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(playbackRate) + 1) % PLAYBACK_RATES.length];
    if (audioRef.current) {
      audioRef.current.playbackRate = next;
    }
    setPlaybackRate(next);
  }

  function toggleSection(section: keyof typeof openSections) {
    setOpenSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  function handleBack() {
    saveTranscriptRestoreState({ episodeHref: backHref, chunkId: chunk.id });
    router.push(backHref);
  }

  async function handleRegenerateStudyGuide() {
    try {
      isRegeneratingRef.current = true;
      setIsRegenerating(true);
      setErrorMessage(null);
      const nextStudyGuide = await regenerateStudyGuide(studyGuideUrl);
      setStudyGuide(nextStudyGuide);
    } catch (error: unknown) {
      setErrorMessage(getClientErrorMessage(error));
    } finally {
      isRegeneratingRef.current = false;
      setIsRegenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />

      <div>
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink"
        >
          ← Transcript
        </button>
      </div>

      <header className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">Segment {chunk.chunkIndex + 1} of {totalSegments}</p>
          <div className="flex items-center gap-3">
            {prevHref ? (
              <Link href={prevHref} className="text-sm text-muted transition-colors hover:text-ink">
                ← Previous
              </Link>
            ) : (
              <span className="text-sm text-muted/40 select-none">← Previous</span>
            )}
            {nextHref ? (
              <Link href={nextHref} className="text-sm text-muted transition-colors hover:text-ink">
                Next →
              </Link>
            ) : (
              <span className="text-sm text-muted/40 select-none">Next →</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-ink">Study</h1>
          <button
            type="button"
            onClick={handleRegenerateStudyGuide}
            disabled={isLoading || isRegenerating}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerate
          </button>
        </div>
      </header>

      <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="space-y-3">
          <div
            className="text-xl text-ink font-jp leading-loose"
            dangerouslySetInnerHTML={{ __html: chunk.textFurigana }}
          />

          {chunk.furiganaStatus === 'suspect' && (
            <p
              role="alert"
              className="rounded-md bg-warning-subtle px-3 py-2 text-xs text-warning-on-subtle"
            >
              {chunk.furiganaWarning ?? 'This furigana may contain mistakes.'}
            </p>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={isPlaying ? stopPlayback : playFromChunkStart}
                aria-label={isPlaying ? 'Stop audio' : 'Play audio'}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full bg-primary text-white hover:bg-primary-hover transition-colors"
              >
                {isPlaying ? <Square size={18} /> : <Play size={18} />}
              </button>
              <button
                type="button"
                onClick={() => setIsLooping((prev) => !prev)}
                aria-label="Toggle loop"
                aria-pressed={isLooping}
                className={`min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-md transition-colors ${isLooping ? 'bg-primary-subtle text-primary' : 'text-muted hover:text-ink hover:bg-muted/20'}`}
              >
                <Repeat size={16} />
              </button>
              <button
                type="button"
                onClick={cyclePlaybackRate}
                aria-label={`Playback speed: ${playbackRate}×`}
                className={`min-h-[44px] inline-flex items-center justify-center rounded-md px-3 text-xs font-medium transition-colors ${playbackRate !== 1 ? 'bg-primary-subtle text-primary' : 'text-muted hover:text-ink hover:bg-muted/20'}`}
              >
                {playbackRate}×
              </button>
            </div>
            <button
              type="button"
              aria-label={copied ? 'Copied!' : 'Copy segment text'}
              onClick={() => {
                void navigator.clipboard.writeText(chunk.textRaw).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className={`min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-md transition-colors hover:bg-muted/20 ${copied ? 'text-success' : 'text-muted hover:text-ink'}`}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        </div>
      </section>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-lg border border-error-subtle bg-error-subtle px-4 py-3 text-sm text-error-on-subtle"
        >
          {errorMessage}
        </div>
      )}

      {isLoading || isRegenerating ? (
        <div className="flex items-center justify-center py-12" aria-label="Loading study guide">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
        </div>
      ) : (
        <div className="space-y-3">
          <StudySection
            title="Vocabulary"
            isOpen={openSections.vocabulary}
            onToggle={() => toggleSection('vocabulary')}
          >
            {!studyGuide ? (
              <p className="text-sm text-muted">Vocabulary will appear here.</p>
            ) : (
              <ul className="space-y-3">
                {studyGuide.vocabulary.map((item) => (
                  <li key={item.id} className="space-y-1">
                    <p className="text-base font-semibold text-ink font-jp">{item.japanese}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
                      {hasDistinctReading(item.reading ?? undefined, item.japanese) && (
                        <span>{item.reading}</span>
                      )}
                      {item.partOfSpeech && <span>{item.partOfSpeech}</span>}
                    </div>
                    {item.dictionaryForm !== item.japanese && (
                      <p className="text-sm text-muted font-jp">{item.dictionaryForm}</p>
                    )}
                    <p className="text-sm text-ink">{item.meaning}</p>
                  </li>
                ))}
              </ul>
            )}
          </StudySection>

          <StudySection
            title="Grammar"
            isOpen={openSections.grammar}
            onToggle={() => toggleSection('grammar')}
          >
            {!studyGuide ? (
              <p className="text-sm text-muted">Grammar notes will appear here.</p>
            ) : (
              <ul className="space-y-3">
                {studyGuide.structures.map((item) => (
                  <li key={item.id} className="space-y-1">
                    <p className="text-base font-semibold text-ink font-jp">{item.pattern}</p>
                    {hasDistinctReading(item.reading ?? undefined, item.pattern) && (
                      <p className="text-sm text-muted">{item.reading}</p>
                    )}
                    <p className="text-sm text-ink">{item.meaning}</p>
                    {item.note && <p className="text-sm text-muted">{item.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </StudySection>

          <StudySection
            title="Breakdown"
            isOpen={openSections.breakdown}
            onToggle={() => toggleSection('breakdown')}
          >
            {!studyGuide ? (
              <p className="text-sm text-muted">Breakdown notes will appear here.</p>
            ) : (
              <ol className="space-y-3">
                {studyGuide.breakdown
                  .slice()
                  .sort((left, right) => left.order - right.order)
                  .map((item) => (
                    <li key={item.id} className="space-y-1">
                      <p className="text-base font-semibold text-ink font-jp">{item.japanese}</p>
                      <p className="text-sm text-ink">{item.cue}</p>
                    </li>
                  ))}
              </ol>
            )}
          </StudySection>
          <StudySection
            title="English translation"
            isOpen={openSections.translation}
            onToggle={() => toggleSection('translation')}
          >
            {!studyGuide ? (
              <p className="text-sm text-muted">Translation will appear here.</p>
            ) : (
              <p className="text-sm leading-6 text-ink">{studyGuide.translation.fullEnglish}</p>
            )}
          </StudySection>
        </div>
      )}

    </div>
  );
}
