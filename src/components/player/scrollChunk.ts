export function scrollChunkIntoView(
  chunkId: number,
  options: ScrollIntoViewOptions,
): void {
  requestAnimationFrame(() => {
    const element = document.querySelector<HTMLElement>(
      `[data-chunk-id="${chunkId}"]`,
    );
    element?.scrollIntoView(options);
  });
}
