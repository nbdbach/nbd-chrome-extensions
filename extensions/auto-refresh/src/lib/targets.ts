/**
 * A "target" is a tab this extension is refreshing.
 *
 * Targets live in chrome.storage.session, keyed by tab id. Tab ids do not
 * survive a browser restart — but alarms do — so the two can disagree and must
 * be reconciled rather than trusted. Everything here is pure so that
 * reconciliation is testable without a browser.
 */

import { normalizeCadence } from './cadence.js';

export const ALARM_PREFIX = 'refresh:';

export interface Target {
  readonly tabId: number;
  readonly cadenceSeconds: number;
  readonly bypassCache: boolean;
  /** Epoch ms of the next expected refresh, for the popup countdown. */
  readonly nextRefreshAt: number;
}

export type TargetMap = Readonly<Record<string, Target>>;

export function alarmName(tabId: number): string {
  return `${ALARM_PREFIX}${tabId}`;
}

export function tabIdFromAlarmName(name: string): number | null {
  if (!name.startsWith(ALARM_PREFIX)) return null;
  const raw = name.slice(ALARM_PREFIX.length);
  if (!/^\d+$/.test(raw)) return null;
  const tabId = Number.parseInt(raw, 10);
  return Number.isSafeInteger(tabId) ? tabId : null;
}

/** Storage is untrusted input: it survives upgrades and can hold older shapes. */
export function parseTargets(value: unknown): TargetMap {
  if (typeof value !== 'object' || value === null) return {};
  const out: Record<string, Target> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const candidate = raw as Partial<Record<keyof Target, unknown>>;
    const tabId = candidate.tabId;
    if (typeof tabId !== 'number' || !Number.isSafeInteger(tabId)) continue;
    if (String(tabId) !== key) continue;
    out[key] = {
      tabId,
      cadenceSeconds: normalizeCadence(candidate.cadenceSeconds),
      bypassCache: candidate.bypassCache === true,
      nextRefreshAt: typeof candidate.nextRefreshAt === 'number' ? candidate.nextRefreshAt : 0,
    };
  }
  return out;
}

export function withTarget(targets: TargetMap, target: Target): TargetMap {
  return { ...targets, [String(target.tabId)]: target };
}

export function withoutTarget(targets: TargetMap, tabId: number): TargetMap {
  const next = { ...targets };
  delete next[String(tabId)];
  return next;
}

export function getTarget(targets: TargetMap, tabId: number): Target | undefined {
  return targets[String(tabId)];
}

export interface Reconciliation {
  /** Targets whose tab is gone. */
  readonly staleTabIds: readonly number[];
  /** Alarm names with no surviving target, including malformed ones. */
  readonly alarmsToClear: readonly string[];
  /** Targets that survived but have no alarm backing them. */
  readonly alarmsToCreate: readonly number[];
}

/**
 * Work out the difference between what we think we are refreshing, what tabs
 * actually exist, and what alarms Chrome is actually holding.
 *
 * Called on startup and install. Treat divergence as normal, not an error:
 * alarms outlive the session state that explains them.
 */
export function reconcile(
  targets: TargetMap,
  openTabIds: readonly number[],
  existingAlarmNames: readonly string[],
): Reconciliation {
  const open = new Set(openTabIds);
  const staleTabIds: number[] = [];
  const survivingTabIds = new Set<number>();

  for (const target of Object.values(targets)) {
    if (open.has(target.tabId)) {
      survivingTabIds.add(target.tabId);
    } else {
      staleTabIds.push(target.tabId);
    }
  }

  const alarmsToClear: string[] = [];
  const alarmedTabIds = new Set<number>();

  for (const name of existingAlarmNames) {
    const tabId = tabIdFromAlarmName(name);
    if (tabId === null) continue; // not ours — leave it alone
    if (survivingTabIds.has(tabId)) {
      alarmedTabIds.add(tabId);
    } else {
      alarmsToClear.push(name);
    }
  }

  const alarmsToCreate = [...survivingTabIds].filter((tabId) => !alarmedTabIds.has(tabId));

  return { staleTabIds, alarmsToClear, alarmsToCreate };
}
