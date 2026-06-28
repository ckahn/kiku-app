const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  // target.contentEditable is 'true'/'false'/'inherit' in browsers, but
  // jsdom may return a boolean. String() normalises both cases.
  const ce = String((target as HTMLElement & { contentEditable: unknown }).contentEditable);
  return INPUT_TAGS.has(target.tagName) || target.isContentEditable || ce === 'true';
}

export function hasModifier(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey || e.altKey;
}
