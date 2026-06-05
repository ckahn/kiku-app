import { describe, it, expect, vi, beforeEach } from 'vitest';
import studyGuideFixture from '@fixtures/study-guide.json';
import type { StudyGuideContent } from '@/lib/api/types';

const mockWhere = vi.fn();
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));
const mockReturning = vi.fn();
const mockOnConflictDoUpdate = vi.fn(() => ({ returning: mockReturning }));
const mockValues = vi.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
const mockInsert = vi.fn(() => ({ values: mockValues }));

vi.mock('@/db', () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
  },
}));

vi.mock('@/db/schema', () => ({
  studyGuides: {
    id: 'id',
    segmentId: 'segmentId',
    content: 'content',
    version: 'version',
  },
}));

const validStudyGuideFixture = studyGuideFixture as StudyGuideContent;

describe('study guide repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockWhere.mockResolvedValue([]);
    mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
    mockOnConflictDoUpdate.mockReturnValue({ returning: mockReturning });
    mockReturning.mockResolvedValue([]);
    mockInsert.mockReturnValue({ values: mockValues });
  });

  it('returns null when no study guide exists for the segment', async () => {
    const { getStudyGuideBySegmentId } = await import('../study-guides');

    await expect(getStudyGuideBySegmentId(42)).resolves.toBeNull();
  });

  it('returns the stored study guide row for the segment', async () => {
    const row = {
      id: 3,
      segmentId: 42,
      version: 2,
      content: validStudyGuideFixture,
    };
    mockWhere.mockResolvedValueOnce([row]);

    const { getStudyGuideBySegmentId } = await import('../study-guides');

    await expect(getStudyGuideBySegmentId(42)).resolves.toEqual(row);
  });

  it('upserts study guide content keyed by segment id', async () => {
    const row = {
      id: 7,
      segmentId: 42,
      version: 2,
      content: validStudyGuideFixture,
    };
    mockReturning.mockResolvedValueOnce([row]);

    const { saveStudyGuideForSegmentId } = await import('../study-guides');

    await expect(saveStudyGuideForSegmentId(42, validStudyGuideFixture)).resolves.toEqual(row);
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith({
      segmentId: 42,
      content: validStudyGuideFixture,
      version: 2,
    });
    expect(mockOnConflictDoUpdate).toHaveBeenCalled();
  });
});
