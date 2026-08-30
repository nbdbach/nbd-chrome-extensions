/**
 * Cadence = the interval between refreshes, always in whole seconds.
 *
 * Chrome enforces a 30 second floor on alarm periods in production builds.
 * Unpacked development builds have no floor at all, so anything shorter will
 * appear to work locally and silently degrade once published. The floor is
 * therefore enforced here rather than trusted to testing.
 */

export const MIN_CADENCE_SECONDS = 30;
export const MAX_CADENCE_SECONDS = 24 * 60 * 60;
export const DEFAULT_CADENCE_SECONDS = 60;

export const CADENCE_PRESETS_SECONDS: readonly number[] = [30, 60, 120, 300, 600, 900, 1800, 3600];

export function isValidCadence(seconds: number): boolean {
  return (
    Number.isInteger(seconds) && seconds >= MIN_CADENCE_SECONDS && seconds <= MAX_CADENCE_SECONDS
  );
}

/** Coerce anything (stored values, form input) into a usable cadence. */
export function normalizeCadence(value: unknown): number {
  const seconds = typeof value === 'number' ? Math.round(value) : Number.NaN;
  if (!Number.isFinite(seconds)) return DEFAULT_CADENCE_SECONDS;
  if (seconds < MIN_CADENCE_SECONDS) return MIN_CADENCE_SECONDS;
  if (seconds > MAX_CADENCE_SECONDS) return MAX_CADENCE_SECONDS;
  return seconds;
}

/** chrome.alarms takes minutes; 30s is 0.5, which is the smallest value honored. */
export function toAlarmPeriodMinutes(seconds: number): number {
  return normalizeCadence(seconds) / 60;
}

export type CadenceUnit = 'seconds' | 'minutes' | 'hours';

export interface CadenceLabel {
  /** Key into _locales — the popup resolves it, so this stays pure. */
  readonly unit: CadenceUnit;
  readonly count: number;
}

/** Pick the largest unit that divides evenly, so 300 reads "5 min" not "300 sec". */
export function cadenceLabel(seconds: number): CadenceLabel {
  const value = normalizeCadence(seconds);
  if (value % 3600 === 0) return { unit: 'hours', count: value / 3600 };
  if (value % 60 === 0) return { unit: 'minutes', count: value / 60 };
  return { unit: 'seconds', count: value };
}

/** Whole seconds remaining until `at`, floored at zero. */
export function secondsUntil(at: number, now: number): number {
  return Math.max(0, Math.ceil((at - now) / 1000));
}

export type RemainingLabel =
  | { readonly kind: 'seconds'; readonly value: number }
  | { readonly kind: 'clock'; readonly value: string };

/** Under a minute reads "45s"; longer reads "4:32", which needs no translation. */
export function formatRemaining(seconds: number): RemainingLabel {
  const total = Math.max(0, Math.floor(seconds));
  if (total < 60) return { kind: 'seconds', value: total };
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return { kind: 'clock', value: `${minutes}:${String(rest).padStart(2, '0')}` };
}
