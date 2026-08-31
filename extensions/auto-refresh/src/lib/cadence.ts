/**
 * Cadence = the interval between refreshes, expressed as a whole number and a
 * unit ("10 minutes"), and stored canonically in seconds.
 *
 * Chrome enforces a 30 second floor on alarm periods in production builds.
 * Unpacked development builds have no floor at all, so anything shorter will
 * appear to work locally and silently degrade once published. The floor is
 * therefore enforced here rather than trusted to testing.
 */

export const MIN_CADENCE_SECONDS = 30;
export const MAX_CADENCE_SECONDS = 24 * 60 * 60;
export const DEFAULT_CADENCE_SECONDS = 60;

export const CADENCE_UNITS = ['seconds', 'minutes', 'hours'] as const;
export type CadenceUnit = (typeof CADENCE_UNITS)[number];

const UNIT_SECONDS: Readonly<Record<CadenceUnit, number>> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
};

export interface Cadence {
  readonly interval: number;
  readonly unit: CadenceUnit;
}

export function isCadenceUnit(value: unknown): value is CadenceUnit {
  return typeof value === 'string' && (CADENCE_UNITS as readonly string[]).includes(value);
}

export function secondsPerUnit(unit: CadenceUnit): number {
  return UNIT_SECONDS[unit];
}

export function toSeconds(cadence: Cadence): number {
  return cadence.interval * UNIT_SECONDS[cadence.unit];
}

/** The largest unit that divides evenly, so 600 reads "10 minutes" not "600 seconds". */
export function fromSeconds(seconds: number): Cadence {
  const value = normalizeCadence(seconds);
  if (value % UNIT_SECONDS.hours === 0)
    return { interval: value / UNIT_SECONDS.hours, unit: 'hours' };
  if (value % UNIT_SECONDS.minutes === 0)
    return { interval: value / UNIT_SECONDS.minutes, unit: 'minutes' };
  return { interval: value, unit: 'seconds' };
}

/**
 * Smallest whole interval in this unit that still clears the 30s floor. In
 * seconds that is 30; in any larger unit, 1.
 */
export function minInterval(unit: CadenceUnit): number {
  return Math.ceil(MIN_CADENCE_SECONDS / UNIT_SECONDS[unit]);
}

export function maxInterval(unit: CadenceUnit): number {
  return Math.floor(MAX_CADENCE_SECONDS / UNIT_SECONDS[unit]);
}

export type CadenceProblem = 'not-a-whole-number' | 'too-short' | 'too-long';

/** Returns null when the pair is usable, otherwise why it is not. */
export function checkCadence(interval: number, unit: CadenceUnit): CadenceProblem | null {
  if (!Number.isInteger(interval) || interval < 1) return 'not-a-whole-number';
  const seconds = interval * UNIT_SECONDS[unit];
  if (seconds < MIN_CADENCE_SECONDS) return 'too-short';
  if (seconds > MAX_CADENCE_SECONDS) return 'too-long';
  return null;
}

export function isValidCadence(seconds: number): boolean {
  return (
    Number.isInteger(seconds) && seconds >= MIN_CADENCE_SECONDS && seconds <= MAX_CADENCE_SECONDS
  );
}

/** Coerce anything (stored values, form input) into a usable cadence in seconds. */
export function normalizeCadence(value: unknown): number {
  const seconds = typeof value === 'number' ? Math.round(value) : Number.NaN;
  if (!Number.isFinite(seconds)) return DEFAULT_CADENCE_SECONDS;
  if (seconds < MIN_CADENCE_SECONDS) return MIN_CADENCE_SECONDS;
  if (seconds > MAX_CADENCE_SECONDS) return MAX_CADENCE_SECONDS;
  return seconds;
}

/** chrome.alarms takes minutes; 30s is 0.5, the smallest value it honours. */
export function toAlarmPeriodMinutes(seconds: number): number {
  return normalizeCadence(seconds) / 60;
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
