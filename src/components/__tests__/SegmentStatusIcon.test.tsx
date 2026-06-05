// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SegmentStatusIcon from '../SegmentStatusIcon';
import { STUDY_STATUS_VALUES, STUDY_STATUS_LABELS } from '@/lib/episodeStudyStatus';

describe('SegmentStatusIcon', () => {
  it.each(STUDY_STATUS_VALUES)('renders an accessible icon for "%s"', (status) => {
    render(<SegmentStatusIcon status={status} />);
    expect(screen.getByRole('img', { name: STUDY_STATUS_LABELS[status] })).toBeInTheDocument();
  });
});
