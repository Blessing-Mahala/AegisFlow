import { create } from 'zustand';
import type { NetworkAlert } from '../lib/database.types';

/** Maximum rolling log cache — keeps rendering rapid */
const MAX_ALERTS = 100;

export interface AlertFeedEntry {
  /** Unique DB row ID */
  id: string;
  /** Full row from the `network_alerts` table */
  row: NetworkAlert;
  /** High-resolution timestamp of when *we* received it (ms) */
  receivedAt: number;
}

interface AlertsState {
  /** Ordered newest-first rolling cache of network alerts */
  feed: AlertFeedEntry[];

  /** Whether the current entropy is critically high (> 7.2 bits/byte) */
  criticalAlertMode: boolean;

  /** How many times `payload_entropy > 7.2` has been observed this session */
  highEntropyCount: number;

  /** Latest computed entropy value (from latest alert with payload_entropy) */
  currentEntropy: number;

  /** Entropy history for the LineChart (last 60 ticks) */
  entropyHistory: { t: number; v: number }[];
  entropyTickRef: number;

  // ── Actions ──────────────────────────────────────────────

  /** Ingest a fresh row from the Realtime WebSocket */
  pushAlert: (row: NetworkAlert) => void;

  /** Update an existing alert in-place (for UPDATE events) */
  updateAlert: (id: string, changes: Partial<NetworkAlert>) => void;

  /** Bulk-load initial state from a REST fetch */
  loadInitial: (rows: NetworkAlert[]) => void;

  /** Manually reset critical mode */
  clearCriticalMode: () => void;
}

export const useAlertsStore = create<AlertsState>((set, get) => ({
  feed: [],
  criticalAlertMode: false,
  highEntropyCount: 0,
  currentEntropy: 0,
  entropyHistory: [],
  entropyTickRef: 0,

  pushAlert: (row) => {
    const tick = get().entropyTickRef + 1;
    const entropy = row.payload_entropy ?? null;

    const isCritical = entropy !== null && entropy > 7.2;

    set((state) => {
      const entry: AlertFeedEntry = {
        id: row.id,
        row,
        receivedAt: Date.now(),
      };

      const feed = [entry, ...state.feed].slice(0, MAX_ALERTS);

      const highEntropyCount = state.highEntropyCount + (isCritical ? 1 : 0);

      const currentEntropy = entropy !== null ? entropy : state.currentEntropy;

      const entropyHistory = [
        ...state.entropyHistory,
        { t: tick, v: currentEntropy },
      ].slice(-60);

      return {
        feed,
        highEntropyCount,
        criticalAlertMode: isCritical || state.criticalAlertMode,
        currentEntropy,
        entropyHistory,
        entropyTickRef: tick,
      };
    });

    // Auto-clear critical mode after 8 seconds if no new high entropy arrives
    if (isCritical) {
      setTimeout(() => {
        const latest = get().feed[0];
        if (!latest || (latest.row.payload_entropy ?? 0) <= 7.2) {
          set({ criticalAlertMode: false });
        }
      }, 8_000);
    }
  },

  updateAlert: (id, changes) => {
    set((state) => {
      const feed = state.feed.map((entry) =>
        entry.id === id ? { ...entry, row: { ...entry.row, ...changes } } : entry
      );

      // Re-check critical mode on updates
      const latestWithEntropy = feed.find(
        (e) => (e.row.payload_entropy ?? 0) > 7.2
      );
      const criticalAlertMode = latestWithEntropy !== undefined;

      return { feed, criticalAlertMode };
    });
  },

  loadInitial: (rows) => {
    const entries: AlertFeedEntry[] = rows.map((row) => ({
      id: row.id,
      row,
      receivedAt: Date.now(),
    }));

    const hasCritical = rows.some((r) => (r.payload_entropy ?? 0) > 7.2);

    const history: { t: number; v: number }[] = [];
    let tick = 0;
    // Build history from newest to oldest for chart, then reverse
    for (const r of rows) {
      if (r.payload_entropy !== null) {
        tick++;
        history.push({ t: tick, v: r.payload_entropy });
      }
    }

    set({
      feed: entries.slice(0, MAX_ALERTS),
      criticalAlertMode: hasCritical,
      currentEntropy: entries[0]?.row.payload_entropy ?? 0,
      entropyHistory: history.slice(-60),
      entropyTickRef: tick,
    });
  },

  clearCriticalMode: () => set({ criticalAlertMode: false }),
}));