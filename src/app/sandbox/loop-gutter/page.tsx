import type { Metadata } from 'next';
import LoopGutterMock from './LoopGutterMock';

// Throwaway UX sandbox for the loop-range gutter interaction. Not linked from
// the app; visit /sandbox/loop-gutter directly. Safe to delete wholesale.
export const metadata: Metadata = {
  title: 'Loop gutter mock',
  robots: { index: false, follow: false },
};

export default function LoopGutterSandboxPage() {
  return <LoopGutterMock />;
}
