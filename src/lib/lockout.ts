/**
 * Sign-in lockout (BUILD_SPEC 7.2): 5 failed sign-ins within 15 minutes lock the account for
 * 15 minutes from the last of them. Pure, so the rule is tested on its own.
 *
 * Only failures since the last successful sign-in or password change count, and attempts made
 * while locked don't count, so a lock can't be stretched forever by repeated tries.
 */
export const LOCK_AFTER_FAILURES = 5;
export const LOCK_MINUTES = 15;
const WINDOW_MS = LOCK_MINUTES * 60_000;

/** When the lock ends, or null if these failures don't lock the account. Order doesn't matter. */
export function lockedUntil(failures: readonly Date[]): Date | null {
  if (failures.length < LOCK_AFTER_FAILURES) return null;
  const recent = [...failures].sort((a, b) => b.getTime() - a.getTime()).slice(0, LOCK_AFTER_FAILURES);
  const newest = recent[0]!.getTime();
  const oldest = recent[recent.length - 1]!.getTime();
  return newest - oldest < WINDOW_MS ? new Date(newest + WINDOW_MS) : null;
}

/** True while `until` is in the future. */
export const isLocked = (until: Date | null, now: Date = new Date()): until is Date => until !== null && now < until;
