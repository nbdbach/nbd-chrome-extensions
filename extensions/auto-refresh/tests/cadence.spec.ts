import { describe, expect, it } from 'vitest';
import {
  CADENCE_PRESETS_SECONDS,
  DEFAULT_CADENCE_SECONDS,
  MAX_CADENCE_SECONDS,
  MIN_CADENCE_SECONDS,
  cadenceLabel,
  formatRemaining,
  isValidCadence,
  normalizeCadence,
  secondsUntil,
  toAlarmPeriodMinutes,
} from '../src/lib/cadence.js';

describe('the 30 second production floor', () => {
  it('rejects anything below it', () => {
    expect(isValidCadence(29)).toBe(false);
    expect(isValidCadence(5)).toBe(false);
  });

  it('accepts exactly the floor', () => {
    expect(isValidCadence(MIN_CADENCE_SECONDS)).toBe(true);
  });

  it('is never violated by a preset', () => {
    for (const preset of CADENCE_PRESETS_SECONDS) {
      expect(preset).toBeGreaterThanOrEqual(MIN_CADENCE_SECONDS);
      expect(isValidCadence(preset)).toBe(true);
    }
  });

  it('clamps rather than throws, so bad stored values cannot brick a tab', () => {
    expect(normalizeCadence(1)).toBe(MIN_CADENCE_SECONDS);
    expect(normalizeCadence(0)).toBe(MIN_CADENCE_SECONDS);
    expect(normalizeCadence(-100)).toBe(MIN_CADENCE_SECONDS);
  });
});

describe('normalizeCadence', () => {
  it('falls back to the default for junk', () => {
    for (const junk of [undefined, null, 'sixty', Number.NaN, Infinity, {}]) {
      expect(normalizeCadence(junk)).toBe(DEFAULT_CADENCE_SECONDS);
    }
  });

  it('rounds fractional seconds', () => {
    expect(normalizeCadence(90.4)).toBe(90);
    expect(normalizeCadence(90.6)).toBe(91);
  });

  it('caps at the maximum', () => {
    expect(normalizeCadence(MAX_CADENCE_SECONDS + 1)).toBe(MAX_CADENCE_SECONDS);
  });
});

describe('toAlarmPeriodMinutes', () => {
  it('converts the floor to the smallest period Chrome honors', () => {
    expect(toAlarmPeriodMinutes(30)).toBe(0.5);
  });

  it('never returns a period Chrome would silently ignore', () => {
    expect(toAlarmPeriodMinutes(1)).toBeGreaterThanOrEqual(0.5);
  });

  it('converts whole minutes and hours', () => {
    expect(toAlarmPeriodMinutes(60)).toBe(1);
    expect(toAlarmPeriodMinutes(3600)).toBe(60);
  });
});

describe('cadenceLabel', () => {
  it('picks the largest unit that divides evenly', () => {
    expect(cadenceLabel(30)).toEqual({ unit: 'seconds', count: 30 });
    expect(cadenceLabel(60)).toEqual({ unit: 'minutes', count: 1 });
    expect(cadenceLabel(300)).toEqual({ unit: 'minutes', count: 5 });
    expect(cadenceLabel(3600)).toEqual({ unit: 'hours', count: 1 });
  });

  it('falls back to minutes when hours do not divide evenly', () => {
    expect(cadenceLabel(5400)).toEqual({ unit: 'minutes', count: 90 });
  });

  it('labels every preset', () => {
    for (const preset of CADENCE_PRESETS_SECONDS) {
      expect(cadenceLabel(preset).count).toBeGreaterThan(0);
    }
  });
});

describe('secondsUntil', () => {
  it('counts down', () => {
    expect(secondsUntil(10_000, 0)).toBe(10);
    expect(secondsUntil(10_000, 9_000)).toBe(1);
  });

  it('never goes negative when an alarm is late', () => {
    expect(secondsUntil(1_000, 9_000)).toBe(0);
  });
});

describe('formatRemaining', () => {
  it('shows bare seconds under a minute', () => {
    expect(formatRemaining(45)).toEqual({ kind: 'seconds', value: 45 });
    expect(formatRemaining(0)).toEqual({ kind: 'seconds', value: 0 });
  });

  it('switches to a clock at a minute, zero-padding the seconds', () => {
    expect(formatRemaining(60)).toEqual({ kind: 'clock', value: '1:00' });
    expect(formatRemaining(272)).toEqual({ kind: 'clock', value: '4:32' });
    expect(formatRemaining(3605)).toEqual({ kind: 'clock', value: '60:05' });
  });

  it('never renders a negative countdown', () => {
    expect(formatRemaining(-10)).toEqual({ kind: 'seconds', value: 0 });
  });
});
