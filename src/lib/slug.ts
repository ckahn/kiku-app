// TODO: pure-Japanese (or other non-ASCII) names produce an empty slug — surface a client-side validation message instead of relying on the API 400.
export function toSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
