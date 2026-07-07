import { create } from 'zustand';

export interface MitigationAlert {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  srcIp: string;
  dstIp: string;
  protocol: string;
  port: number;
  status: 'open' | 'acknowledged' | 'mitigated' | 'dismissed' | 'escalated';
  createdAt: string;
  mitigatedAt?: string;
  actionTaken?: string;
  mitreId?: string;
  mitreTactic?: string;
  /** Chain of custody — SHA-256 hash linking this alert to its predecessor */
  previousHash?: string;
  currentHash?: string;
  hashedAt?: string;
}

export interface TimelineEntry {
  id: string;
  alertId: string;
  action: string;
  details: string;
  timestamp: string;
}

interface MitigationStats {
  totalAlerts: number;
  openCount: number;
  mitigatedCount: number;
  dismissedCount: number;
  escalatedCount: number;
  avgResponseTime: number; // seconds
}

interface MitigationState {
  alerts: MitigationAlert[];
  timeline: TimelineEntry[];
  stats: MitigationStats;

  addAlert: (alert: MitigationAlert) => void;
  mitigateAlert: (alertId: string, action: string) => void;
  dismissAlert: (alertId: string) => void;
  escalateAlert: (alertId: string) => void;
  acknowledgeAlert: (alertId: string) => void;
  undoMitigation: (alertId: string) => void;
  addTimelineEntry: (entry: TimelineEntry) => void;
  recalcStats: () => void;
  loadMockAlerts: (alerts: MitigationAlert[]) => void;
}

function recalcStats(alerts: MitigationAlert[]): MitigationStats {
  const now = Date.now();
  const mitigatedAlerts = alerts.filter((a) => a.status === 'mitigated');
  const totalResponseTime = mitigatedAlerts.reduce((sum, a) => {
    const created = new Date(a.createdAt).getTime();
    const mitigated = a.mitigatedAt ? new Date(a.mitigatedAt).getTime() : now;
    return sum + (mitigated - created) / 1000;
  }, 0);

  return {
    totalAlerts: alerts.length,
    openCount: alerts.filter((a) => a.status === 'open').length,
    mitigatedCount: mitigatedAlerts.length,
    dismissedCount: alerts.filter((a) => a.status === 'dismissed').length,
    escalatedCount: alerts.filter((a) => a.status === 'escalated').length,
    avgResponseTime: mitigatedAlerts.length > 0
      ? Math.round(totalResponseTime / mitigatedAlerts.length)
      : 0,
  };
}

export const useMitigationStore = create<MitigationState>((set) => ({
  alerts: [],
  timeline: [],
  stats: {
    totalAlerts: 0,
    openCount: 0,
    mitigatedCount: 0,
    dismissedCount: 0,
    escalatedCount: 0,
    avgResponseTime: 0,
  },

  addAlert: (alert) =>
    set((state) => {
      const alerts = [alert, ...state.alerts];
      return { alerts, stats: recalcStats(alerts) };
    }),

  mitigateAlert: (alertId, action) =>
    set((state) => {
      const alerts = state.alerts.map((a) =>
        a.id === alertId
          ? {
              ...a,
              status: 'mitigated' as const,
              mitigatedAt: new Date().toISOString(),
              actionTaken: action,
            }
          : a,
      );
      const timeline: TimelineEntry[] = [
        {
          id: `tl-${Date.now()}`,
          alertId,
          action: 'mitigated',
          details: `Mitigated with action: ${action}`,
          timestamp: new Date().toISOString(),
        },
        ...state.timeline,
      ];
      return { alerts, timeline, stats: recalcStats(alerts) };
    }),

  dismissAlert: (alertId) =>
    set((state) => {
      const alerts = state.alerts.map((a) =>
        a.id === alertId ? { ...a, status: 'dismissed' as const } : a,
      );
      const timeline: TimelineEntry[] = [
        {
          id: `tl-${Date.now()}`,
          alertId,
          action: 'dismissed',
          details: 'Alert dismissed as false positive',
          timestamp: new Date().toISOString(),
        },
        ...state.timeline,
      ];
      return { alerts, timeline, stats: recalcStats(alerts) };
    }),

  escalateAlert: (alertId) =>
    set((state) => {
      const alerts = state.alerts.map((a) =>
        a.id === alertId ? { ...a, status: 'escalated' as const } : a,
      );
      const timeline: TimelineEntry[] = [
        {
          id: `tl-${Date.now()}`,
          alertId,
          action: 'escalated',
          details: 'Escalated to senior security team',
          timestamp: new Date().toISOString(),
        },
        ...state.timeline,
      ];
      return { alerts, timeline, stats: recalcStats(alerts) };
    }),

  acknowledgeAlert: (alertId) =>
    set((state) => {
      const alerts = state.alerts.map((a) =>
        a.id === alertId ? { ...a, status: 'acknowledged' as const } : a,
      );
      return { alerts, stats: recalcStats(alerts) };
    }),

  undoMitigation: (alertId) =>
    set((state) => {
      const alerts = state.alerts.map((a) =>
        a.id === alertId
          ? {
              ...a,
              status: 'open' as const,
              mitigatedAt: undefined,
              actionTaken: undefined,
            }
          : a,
      );
      const timeline: TimelineEntry[] = [
        {
          id: `tl-${Date.now()}`,
          alertId,
          action: 'undo',
          details: 'Action undone — alert returned to open',
          timestamp: new Date().toISOString(),
        },
        ...state.timeline,
      ];
      return { alerts, timeline, stats: recalcStats(alerts) };
    }),

  addTimelineEntry: (entry) =>
    set((state) => ({
      timeline: [entry, ...state.timeline],
    })),

  recalcStats: () =>
    set((state) => ({ stats: recalcStats(state.alerts) })),

  loadMockAlerts: (alerts) =>
    set({ alerts, stats: recalcStats(alerts) }),
}));
