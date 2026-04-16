'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Play, RefreshCw, Square } from 'lucide-react';
import type { Chunk } from '@/db/schema';
import type { ApiResponse } from '@/lib/api-response';
import type { StudyGuideContent } from '@/lib/api/types';

// LLM sometimes echoes kana words as their own reading — skip when redundant
function hasDistinctReading(reading: string | undefined, text: string): boolean {
  return !!reading && reading !== text;
}

interface StudyScreenProps {
  readonly chunk: Pick<
    Chunk,
    'id' | 'chunkIndex' | 'textRaw' | 'textFurigana' | 'furiganaStatus' | 'furiganaWarning' | 'startMs' | 'endMs'
  >;
  readonly audioUrl: string;
  readonly studyGuideUrl: string;
  readonly backHref: string;
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

export default function StudyScreen({
  chunk,
  audioUrl,
  studyGuideUrl,
  backHref,
}: StudyScreenProps) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
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
      stopPlayback();
    }
  }

  function toggleSection(section: keyof typeof openSections) {
    setOpenSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  function handleBack() {
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
        <p className="text-sm text-muted">Segment {chunk.chunkIndex + 1}</p>
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
            className="text-base text-ink font-jp leading-loose"
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

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={isPlaying ? stopPlayback : playFromChunkStart}
              aria-label={isPlaying ? 'Stop audio' : 'Play audio'}
              className="p-2 rounded-full bg-primary text-white hover:bg-primary-hover transition-colors"
            >
              {isPlaying ? <Square size={18} /> : <Play size={18} />}
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
                    <p className="text-sm font-semibold text-ink font-jp">{item.japanese}</p>
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
                    <p className="text-sm font-semibold text-ink font-jp">{item.pattern}</p>
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
                      <p className="text-sm font-semibold text-ink font-jp">{item.japanese}</p>
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
