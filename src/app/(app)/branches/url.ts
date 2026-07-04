// Small helper so the date/month nav controls and the tab switcher can each
// update their own query param without clobbering the others (e.g.
// switching the date shouldn't reset which tab or month is selected).
export function withParam(current: URLSearchParams, key: string, value: string): string {
  const next = new URLSearchParams(current.toString());
  next.set(key, value);
  return next.toString();
}
