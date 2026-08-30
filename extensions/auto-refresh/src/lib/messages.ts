/** The popup holds no authority: it asks the service worker to act. */

export interface TargetState {
  readonly enabled: boolean;
  readonly cadenceSeconds: number;
  readonly bypassCache: boolean;
  /** Epoch ms, or 0 when disabled. */
  readonly nextRefreshAt: number;
}

export type Request =
  | { readonly type: 'getState'; readonly tabId: number }
  | {
      readonly type: 'enable';
      readonly tabId: number;
      readonly cadenceSeconds: number;
      readonly bypassCache: boolean;
    }
  | { readonly type: 'disable'; readonly tabId: number };

export function isRequest(value: unknown): value is Request {
  if (typeof value !== 'object' || value === null) return false;
  const { type, tabId } = value as { type?: unknown; tabId?: unknown };
  if (typeof tabId !== 'number' || !Number.isSafeInteger(tabId)) return false;
  return type === 'getState' || type === 'enable' || type === 'disable';
}
