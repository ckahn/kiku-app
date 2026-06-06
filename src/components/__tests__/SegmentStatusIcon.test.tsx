// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SegmentStatusIcon from '../SegmentStatusIcon';
import { STUDY_STATUS_LABELS } from '@/lib/episodeStudyStatus';

describe('SegmentStatusIcon', () => {
  it('renders nothing for "new" (the default state)', () => {
    const { container } = render(<SegmentStatusIcon status="new" />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each(['studying', 'learned'] as const)(
    'renders an accessible icon for "%s"',
    (status) => {
      render(<SegmentStatusIcon status={status} />);
      expect(screen.getByRole('img', { name: STUDY_STATUS_LABELS[status] })).toBeInTheDocument();
    }
  );
});
