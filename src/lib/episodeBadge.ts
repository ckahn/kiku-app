type BadgeVariant = 'error' | 'warning' | 'neutral' | 'info' | 'success';

export type EpisodeBadge = {
  variant: BadgeVariant;
  label: string;
};

type EpisodeStatusFields = {
  status: 'uploaded' | 'transcribing' | 'chunking' | 'ready' | 'error';
  studyStatus: 'new' | 'studying' | 'learned';
};

export function getEpisodeBadge(ep: EpisodeStatusFields): EpisodeBadge {
  if (ep.status === 'error') return { variant: 'error', label: 'Error' };
  if (ep.status !== 'ready') return { variant: 'warning', label: 'Processing…' };

  switch (ep.studyStatus) {
    case 'studying': return { variant: 'info', label: 'Studying' };
    case 'learned':  return { variant: 'success', label: 'Learned' };
    default:         return { variant: 'neutral', label: 'New' };
  }
}
