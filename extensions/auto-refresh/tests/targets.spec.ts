import { describe, expect, it } from 'vitest';
import { DEFAULT_CADENCE_SECONDS, MIN_CADENCE_SECONDS } from '../src/lib/cadence.js';
import {
  type Target,
  type TargetMap,
  alarmName,
  getTarget,
  parseTargets,
  reconcile,
  tabIdFromAlarmName,
  withTarget,
  withoutTarget,
} from '../src/lib/targets.js';

function target(tabId: number, overrides: Partial<Target> = {}): Target {
  return {
    tabId,
    cadenceSeconds: 60,
    bypassCache: false,
    nextRefreshAt: 0,
    ...overrides,
  };
}

function mapOf(...targets: Target[]): TargetMap {
  return Object.fromEntries(targets.map((t) => [String(t.tabId), t]));
}

describe('alarm names', () => {
  it('round-trips a tab id', () => {
    expect(tabIdFromAlarmName(alarmName(42))).toBe(42);
  });

  it.each(['', 'refresh:', 'refresh:abc', 'refresh:-1', 'refresh:1.5', 'other:1', 'refresh1'])(
    'rejects %o',
    (name) => {
      expect(tabIdFromAlarmName(name)).toBeNull();
    },
  );
});

describe('parseTargets', () => {
  it('accepts a well-formed map', () => {
    const parsed = parseTargets({ '7': target(7, { cadenceSeconds: 300, bypassCache: true }) });
    expect(parsed['7']).toEqual(target(7, { cadenceSeconds: 300, bypassCache: true }));
  });

  it.each([undefined, null, 'nope', 42])('returns empty for %o', (value) => {
    expect(parseTargets(value)).toEqual({});
  });

  it('drops entries whose key disagrees with the tab id', () => {
    expect(parseTargets({ '9': target(7) })).toEqual({});
  });

  it('drops entries with no usable tab id', () => {
    expect(parseTargets({ a: { tabId: 'a' }, b: null, c: {} })).toEqual({});
  });

  it('repairs an out-of-range cadence rather than dropping the target', () => {
    const parsed = parseTargets({ '1': { tabId: 1, cadenceSeconds: 2 } });
    expect(parsed['1']?.cadenceSeconds).toBe(MIN_CADENCE_SECONDS);
  });

  it('defaults a missing cadence', () => {
    const parsed = parseTargets({ '1': { tabId: 1 } });
    expect(parsed['1']?.cadenceSeconds).toBe(DEFAULT_CADENCE_SECONDS);
  });

  it('treats a non-true bypassCache as false', () => {
    const parsed = parseTargets({ '1': { tabId: 1, bypassCache: 'yes' } });
    expect(parsed['1']?.bypassCache).toBe(false);
  });
});

describe('add and remove', () => {
  it('adds without mutating the original', () => {
    const before = mapOf(target(1));
    const after = withTarget(before, target(2));
    expect(Object.keys(before)).toEqual(['1']);
    expect(Object.keys(after).sort()).toEqual(['1', '2']);
  });

  it('removes without mutating the original', () => {
    const before = mapOf(target(1), target(2));
    const after = withoutTarget(before, 1);
    expect(Object.keys(before).sort()).toEqual(['1', '2']);
    expect(Object.keys(after)).toEqual(['2']);
  });

  it('removing an absent tab is a no-op', () => {
    expect(withoutTarget(mapOf(target(1)), 99)).toEqual(mapOf(target(1)));
  });

  it('looks up by tab id', () => {
    expect(getTarget(mapOf(target(5)), 5)?.tabId).toBe(5);
    expect(getTarget(mapOf(target(5)), 6)).toBeUndefined();
  });
});

describe('reconcile', () => {
  it('does nothing when state, tabs and alarms agree', () => {
    const result = reconcile(mapOf(target(1)), [1], [alarmName(1)]);
    expect(result).toEqual({ staleTabIds: [], alarmsToClear: [], alarmsToCreate: [] });
  });

  it('drops a target whose tab is gone and clears its alarm', () => {
    const result = reconcile(mapOf(target(1), target(2)), [2], [alarmName(1), alarmName(2)]);
    expect(result.staleTabIds).toEqual([1]);
    expect(result.alarmsToClear).toEqual([alarmName(1)]);
    expect(result.alarmsToCreate).toEqual([]);
  });

  it('recreates an alarm for a target that survived without one', () => {
    const result = reconcile(mapOf(target(3)), [3], []);
    expect(result.alarmsToCreate).toEqual([3]);
    expect(result.staleTabIds).toEqual([]);
  });

  it('clears an orphan alarm with no target at all', () => {
    const result = reconcile({}, [1], [alarmName(1)]);
    expect(result.alarmsToClear).toEqual([alarmName(1)]);
  });

  it('leaves alarms belonging to other code alone', () => {
    const result = reconcile({}, [], ['someone-elses-alarm']);
    expect(result.alarmsToClear).toEqual([]);
  });

  it('handles the browser-restart case: alarms survive, tab ids do not', () => {
    // Alarms persisted from the previous session; the tabs they referenced are
    // gone and the new session has different tab ids entirely.
    const result = reconcile(
      mapOf(target(11), target(12)),
      [900, 901],
      [alarmName(11), alarmName(12)],
    );
    expect([...result.staleTabIds].sort()).toEqual([11, 12]);
    expect([...result.alarmsToClear].sort()).toEqual([alarmName(11), alarmName(12)].sort());
    expect(result.alarmsToCreate).toEqual([]);
  });
});
