/**
 * Owns all scheduling and all persisted state.
 *
 * MV3 terminates this worker aggressively, so nothing here may keep state in a
 * module-level variable. Every handler reads from chrome.storage on wake. If
 * you find yourself caching something between events, that is the bug.
 */

import { normalizeCadence, toAlarmPeriodMinutes } from '../lib/cadence.js';
import { isRequest, type Request, type TargetState } from '../lib/messages.js';
import {
  alarmName,
  getTarget,
  parseTargets,
  reconcile,
  tabIdFromAlarmName,
  withTarget,
  withoutTarget,
  type TargetMap,
} from '../lib/targets.js';

const TARGETS_KEY = 'targets';
const BADGE_COLOR = '#2f6f4f';
const BADGE_TEXT = '●';

async function readTargets(): Promise<TargetMap> {
  const stored = await chrome.storage.session.get(TARGETS_KEY);
  return parseTargets(stored[TARGETS_KEY]);
}

async function writeTargets(targets: TargetMap): Promise<void> {
  await chrome.storage.session.set({ [TARGETS_KEY]: targets });
}

/** A tab can vanish between reading state and painting its badge. */
async function setBadge(tabId: number, enabled: boolean): Promise<void> {
  try {
    await chrome.action.setBadgeText({ tabId, text: enabled ? BADGE_TEXT : '' });
    if (enabled) {
      await chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR });
    }
  } catch {
    // Tab is gone. Nothing to paint, nothing to fix.
  }
}

async function scheduleAlarm(tabId: number, cadenceSeconds: number): Promise<void> {
  const periodInMinutes = toAlarmPeriodMinutes(cadenceSeconds);
  await chrome.alarms.create(alarmName(tabId), {
    periodInMinutes,
    delayInMinutes: periodInMinutes,
  });
}

async function enableTarget(
  tabId: number,
  cadenceSeconds: number,
  bypassCache: boolean,
): Promise<TargetState> {
  const cadence = normalizeCadence(cadenceSeconds);
  const nextRefreshAt = Date.now() + cadence * 1000;
  const targets = await readTargets();

  await writeTargets(
    withTarget(targets, { tabId, cadenceSeconds: cadence, bypassCache, nextRefreshAt }),
  );
  await scheduleAlarm(tabId, cadence);
  await setBadge(tabId, true);

  return { enabled: true, cadenceSeconds: cadence, bypassCache, nextRefreshAt };
}

async function disableTarget(tabId: number): Promise<void> {
  const targets = await readTargets();
  await writeTargets(withoutTarget(targets, tabId));
  await chrome.alarms.clear(alarmName(tabId));
  await setBadge(tabId, false);
}

async function readState(tabId: number): Promise<TargetState | null> {
  const target = getTarget(await readTargets(), tabId);
  if (!target) return null;
  return {
    enabled: true,
    cadenceSeconds: target.cadenceSeconds,
    bypassCache: target.bypassCache,
    nextRefreshAt: target.nextRefreshAt,
  };
}

async function handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  const tabId = tabIdFromAlarmName(alarm.name);
  if (tabId === null) return; // not ours

  const targets = await readTargets();
  const target = getTarget(targets, tabId);
  if (!target) {
    // The alarm outlived its state — expected after a restart, not an error.
    await chrome.alarms.clear(alarm.name);
    return;
  }

  try {
    await chrome.tabs.reload(tabId, { bypassCache: target.bypassCache });
  } catch {
    // Tab closed or otherwise unreachable. Stop refreshing it.
    await disableTarget(tabId);
    return;
  }

  // Re-read rather than reusing the map from before the await: the user may
  // have disabled this tab while the reload was in flight, and writing the
  // stale map would silently resurrect it.
  const current = await readTargets();
  const live = getTarget(current, tabId);
  if (!live) return;

  await writeTargets(
    withTarget(current, {
      ...live,
      nextRefreshAt: Date.now() + live.cadenceSeconds * 1000,
    }),
  );
}

/**
 * Alarms persist across browser restarts; tab ids do not. On startup the two
 * disagree, and the disagreement is routine. Resolve it rather than trusting
 * either side.
 */
async function runReconcile(): Promise<void> {
  const targets = await readTargets();
  const tabs = await chrome.tabs.query({});
  const openTabIds = tabs.map((tab) => tab.id).filter((id): id is number => typeof id === 'number');
  const alarms = await chrome.alarms.getAll();

  const { staleTabIds, alarmsToClear, alarmsToCreate } = reconcile(
    targets,
    openTabIds,
    alarms.map((alarm) => alarm.name),
  );

  let next = targets;
  for (const tabId of staleTabIds) {
    next = withoutTarget(next, tabId);
  }
  await writeTargets(next);

  for (const name of alarmsToClear) {
    await chrome.alarms.clear(name);
  }

  for (const tabId of alarmsToCreate) {
    const target = getTarget(next, tabId);
    if (!target) continue;
    await scheduleAlarm(tabId, target.cadenceSeconds);
    await setBadge(tabId, true);
  }
}

async function handleRequest(request: Request): Promise<TargetState | null> {
  switch (request.type) {
    case 'getState':
      return readState(request.tabId);
    case 'enable':
      return enableTarget(request.tabId, request.cadenceSeconds, request.bypassCache);
    case 'disable':
      await disableTarget(request.tabId);
      return null;
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  void handleAlarm(alarm);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void disableTarget(tabId);
});

chrome.runtime.onStartup.addListener(() => {
  void runReconcile();
});

chrome.runtime.onInstalled.addListener(() => {
  void runReconcile();
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isRequest(message)) return false;
  void handleRequest(message).then(sendResponse, () => sendResponse(null));
  return true; // response is async
});
