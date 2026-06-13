/**
 * Lightweight unique ID generator.
 *
 * Produces a short random string suitable for stroke IDs.
 * We intentionally avoid importing a heavy library (nanoid/uuid) to
 * keep the bundle minimal. Collision probability is negligible for our
 * use-case (local, single-session stroke tracking).
 */
export function nanoid(): string {
  // Combine a random base-36 string with a timestamp for uniqueness
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
