// Throwaway fake data for the loop-gutter mock. No DB, no audio.

export type MockSegment = {
  readonly id: number;
  readonly startMs: number;
  readonly text: string;
};

const LINES = [
  '今日はいい天気ですね。',
  '駅まで歩いて行きましょうか。',
  'コーヒーを一杯飲みたいです。',
  'この本はとても面白かったです。',
  '週末は何をする予定ですか。',
  '電車が遅れているみたいです。',
  '日本語の勉強を続けています。',
  'もう少しゆっくり話してください。',
  '写真を撮ってもいいですか。',
  'この料理は辛すぎませんか。',
  '明日の会議は何時からですか。',
  '傘を持って来てよかったです。',
  '新しい仕事はどうですか。',
  'その映画はもう見ましたか。',
  'お疲れさまでした、また明日。',
];

// Repeat the lines so the page is comfortably taller than the viewport — needed
// to exercise drag-past-the-edge auto-scroll.
const SEGMENT_COUNT = 24;

export const MOCK_SEGMENTS: readonly MockSegment[] = Array.from(
  { length: SEGMENT_COUNT },
  (_, i) => ({
    id: i + 1,
    startMs: i * 8_000,
    text: LINES[i % LINES.length],
  }),
);

export function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
