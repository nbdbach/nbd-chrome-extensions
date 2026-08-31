import { describe, expect, it } from 'vitest';
import {
  CADENCE_UNITS,
  DEFAULT_CADENCE_SECONDS,
  MAX_CADENCE_SECONDS,
  MIN_CADENCE_SECONDS,
  type CadenceUnit,
  checkCadence,
  formatRemaining,
  fromSeconds,
  isCadenceUnit,
  isValidCadence,
  maxInterval,
  minInterval,
  normalizeCadence,
  secondsPerUnit,
  secondsUntil,
  toAlarmPeriodMinutes,
  toSeconds,
} from '../src/lib/cadence.js';

describe('units', () => {
  it('offers seconds, minutes and hours', () => {
    expect(CADENCE_UNITS).toEqual(['seconds', 'minutes', 'hours']);
  });

  it.each(CADENCE_UNITS)('recognises %s', (unit) => {
    expect(isCadenceUnit(unit)).toBe(true);
  });

  it.each(['Seconds', 'days', '', null, 60])('rejects %o as a unit', (value) => {
    expect(isCadenceUnit(value)).toBe(false);
  });

  it('converts each unit to seconds', () => {
    expect(secondsPerUnit('seconds')).toBe(1);
    expect(secondsPerUnit('minutes')).toBe(60);
    expect(secondsPerUnit('hours')).toBe(3600);
  });
});

describe('toSeconds', () => {
  it('multiplies interval by unit', () => {
    expect(toSeconds({ interval: 10, unit: 'minutes' })).toBe(600);
    expect(toSeconds({ interval: 45, unit: 'seconds' })).toBe(45);
    expect(toSeconds({ interval: 2, unit: 'hours' })).toBe(7200);
  });
});

describe('fromSeconds', () => {
  it('picks the largest unit that divides evenly', () => {
    expect(fromSeconds(45)).toEqual({ interval: 45, unit: 'seconds' });
    expect(fromSeconds(600)).toEqual({ interval: 10, unit: 'minutes' });
    expect(fromSeconds(7200)).toEqual({ interval: 2, unit: 'hours' });
  });

  it('falls back to minutes when hours do not divide evenly', () => {
    expect(fromSeconds(5400)).toEqual({ interval: 90, unit: 'minutes' });
  });

  it('round-trips anything the user can enter', () => {
    for (const unit of CADENCE_UNITS) {
      for (const interval of [minInterval(unit), 3, 10, maxInterval(unit)]) {
        if (checkCadence(interval, unit) !== null) continue;
        expect(toSeconds(fromSeconds(toSeconds({ interval, unit })))).toBe(
          toSeconds({ interval, unit }),
        );
      }
    }
  });

  it('repairs an out-of-range stored value rather than showing nonsense', () => {
    expect(fromSeconds(2)).toEqual({ interval: 30, unit: 'seconds' });
  });
});

describe('bounds per unit', () => {
  it('needs 30 seconds, but only 1 of any larger unit', () => {
    expect(minInterval('seconds')).toBe(30);
    expect(minInterval('minutes')).toBe(1);
    expect(minInterval('hours')).toBe(1);
  });

  it('caps at 24 hours however it is expressed', () => {
    expect(maxInterval('seconds')).toBe(MAX_CADENCE_SECONDS);
    expect(maxInterval('minutes')).toBe(1440);
    expect(maxInterval('hours')).toBe(24);
  });
});

describe('checkCadence', () => {
  it('accepts the example from the feature request', () => {
    expect(checkCadence(10, 'minutes')).toBeNull();
  });

  it('accepts exactly the floor and exactly the cap', () => {
    expect(checkCadence(30, 'seconds')).toBeNull();
    expect(checkCadence(24, 'hours')).toBeNull();
  });

  it('rejects anything under the 30 second floor Chrome enforces', () => {
    expect(checkCadence(10, 'seconds')).toBe('too-short');
    expect(checkCadence(29, 'seconds')).toBe('too-short');
  });

  it('rejects anything over 24 hours', () => {
    expect(checkCadence(25, 'hours')).toBe('too-long');
    expect(checkCadence(1441, 'minutes')).toBe('too-long');
  });

  it.each([0, -1, 1.5, Number.NaN, Infinity])('rejects %o as an interval', (interval) => {
    expect(checkCadence(interval, 'minutes')).toBe('not-a-whole-number');
  });

  it('never contradicts minInterval or maxInterval', () => {
    for (const unit of CADENCE_UNITS as readonly CadenceUnit[]) {
      expect(checkCadence(minInterval(unit), unit)).toBeNull();
      expect(checkCadence(maxInterval(unit), unit)).toBeNull();
      expect(checkCadence(minInterval(unit) - 1, unit)).not.toBeNull();
      expect(checkCadence(maxInterval(unit) + 1, unit)).toBe('too-long');
    }
  });
});

describe('normalizeCadence', () => {
  it('clamps rather than throws, so a bad stored value cannot brick a tab', () => {
    expect(normalizeCadence(1)).toBe(MIN_CADENCE_SECONDS);
    expect(normalizeCadence(-100)).toBe(MIN_CADENCE_SECONDS);
    expect(normalizeCadence(MAX_CADENCE_SECONDS + 1)).toBe(MAX_CADENCE_SECONDS);
  });

  it('falls back to the default for junk', () => {
    for (const junk of [undefined, null, 'sixty', Number.NaN, Infinity, {}]) {
      expect(normalizeCadence(junk)).toBe(DEFAULT_CADENCE_SECONDS);
    }
  });

  it('rounds fractional seconds', () => {
    expect(normalizeCadence(90.4)).toBe(90);
  });
});

describe('isValidCadence', () => {
  it('tracks the same floor as checkCadence', () => {
    expect(isValidCadence(29)).toBe(false);
    expect(isValidCadence(MIN_CADENCE_SECONDS)).toBe(true);
  });
});

describe('toAlarmPeriodMinutes', () => {
  it('converts the floor to the smallest period Chrome honours', () => {
    expect(toAlarmPeriodMinutes(30)).toBe(0.5);
  });

  it('never returns a period Chrome would silently ignore', () => {
    expect(toAlarmPeriodMinutes(1)).toBeGreaterThanOrEqual(0.5);
  });

  it('converts whole minutes and hours', () => {
    expect(toAlarmPeriodMinutes(600)).toBe(10);
    expect(toAlarmPeriodMinutes(3600)).toBe(60);
  });
});

describe('secondsUntil', () => {
  it('counts down and never goes negative when an alarm is late', () => {
    expect(secondsUntil(10_000, 0)).toBe(10);
    expect(secondsUntil(1_000, 9_000)).toBe(0);
  });
});

describe('formatRemaining', () => {
  it('shows bare seconds under a minute', () => {
    expect(formatRemaining(45)).toEqual({ kind: 'seconds', value: 45 });
  });

  it('switches to a clock at a minute, zero-padding the seconds', () => {
    expect(formatRemaining(60)).toEqual({ kind: 'clock', value: '1:00' });
    expect(formatRemaining(272)).toEqual({ kind: 'clock', value: '4:32' });
  });

  it('never renders a negative countdown', () => {
    expect(formatRemaining(-10)).toEqual({ kind: 'seconds', value: 0 });
  });
});
