'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';
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
    structure: false,
    breakdown: false,
    translation: false,
  });
  const [studyGuide, setStudyGuide] = useState<StudyGuideContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function fetchStudyGuide() {
      try {
        setIsLoading(true);
        setErrorMessage(null);
        const nextStudyGuide = await loadStudyGuide(studyGuideUrl);

        if (!isCancelled) {
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
        <p className="text-sm text-muted">Chunk {chunk.chunkIndex + 1}</p>
        <h1 className="text-2xl font-bold text-ink">Study</h1>
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

      {isLoading ? (
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
                  {hasDistinctReading(item.reading ?? undefined, item.japanese) && <p className="text-sm text-muted">{item.reading}</p>}
                  <p className="text-sm text-ink">{item.meaning}</p>
                </li>
              ))}
            </ul>
          )}
        </StudySection>

        <StudySection
          title="Structure"
          isOpen={openSections.structure}
          onToggle={() => toggleSection('structure')}
        >
          {!studyGuide ? (
            <p className="text-sm text-muted">Structure notes will appear here.</p>
          ) : (
            <ul className="space-y-3">
              {studyGuide.structures.map((item) => (
                <li key={item.id} className="space-y-1">
                  <p className="text-sm font-semibold text-ink font-jp">{item.pattern}</p>
                  {hasDistinctReading(item.reading ?? undefined, item.pattern) && <p className="text-sm text-muted">{item.reading}</p>}
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
