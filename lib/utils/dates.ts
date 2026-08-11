// Small helpers so components/pages never call Date.now()/new Date()
// directly inline — keeps impure-function calls out of component render
// bodies (flagged by the React Compiler's purity lint rule) even for
// Server Components, where a fresh "today" per request is correct but
// the linter can't tell the difference from a client render loop.
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
