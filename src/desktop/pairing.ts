import { invoke, isTauri } from '@tauri-apps/api/core';

export const pairingStates = ['idle', 'waiting', 'confirmation_required', 'return_pending', 'completed', 'cancelled', 'expired', 'error', 'unavailable'] as const;
export type PairingStatus = typeof pairingStates[number];
type Action = 'start' | 'status' | 'approve' | 'cancel';
export type PairingClient = (action: Action) => Promise<PairingStatus>;
declare global { interface Window { readonly __SC_PAIRING_DEMO__?: boolean } }

// No URLs, attempt identifiers, identity input, secrets or arbitrary IPC from callers.
export const desktopPairing: PairingClient = async action => {
  if (!isTauri() || window.__SC_PAIRING_DEMO__ !== true) return 'unavailable';
  try {
    const result: unknown = await invoke(`pairing_demo_${action}`);
    return typeof result === 'string' && pairingStates.some(state => state === result)
      ? result as PairingStatus : 'error';
  } catch {
    // Never forward IPC/OS errors or transport payloads into React, logs or storage.
    return action === 'status' ? 'unavailable' : 'error';
  }
};
