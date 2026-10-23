/** Blob URLs inherit their creator's origin; WebKit reports these local reads as requests. */
export function isExternalRequest(requestUrl: string, applicationUrl: string): boolean {
  const target = new URL(requestUrl);
  if (target.protocol === 'data:') return false;
  return target.origin !== new URL(applicationUrl).origin;
}
