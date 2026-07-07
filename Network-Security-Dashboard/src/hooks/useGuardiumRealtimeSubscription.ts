import { useEffect } from 'react';
import { supabase } from '../lib/supabase/client';
import { useAlertsStore } from '../stores/alertsStore';
import type { NetworkAlert } from '../lib/database.types';

/**
 * useGuardiumRealtimeSubscription
 *
 * Layout-effect hook that opens a single Supabase Realtime WebSocket on the
 * `guardium_fabric_stream` publication channel. Every INSERT / UPDATE against
 * the `network_alerts` table is immediately pushed into the Zustand alertsStore,
 * which serves as the single source of truth for:
 *   - the DECEPTION OPS & ENTROPY RADAR workspace
 *   - the entropy gauge + line chart
 *   - the blast-radius topology canvas
 */
export function useGuardiumRealtimeSubscription() {
  useEffect(() => {
    const store = useAlertsStore.getState();

    // 1. Bootstrap: fetch the most recent 30 alerts so the chart has
    //    instant data before any WebSocket messages arrive.
    supabase
      .from('network_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data, error }) => {
        if (!error && data && data.length > 0) {
          store.loadInitial(data as NetworkAlert[]);
        }
      });

    // 2. Subscribe to the dedicated Realtime publication channel.
    //    The publication was created by the `add_dashboard_metrics_tables_and_publication`
    //    migration and has REPLICA IDENTITY FULL set on both tables.
    const channel = supabase
      .channel('guardium-fabric-stream')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'network_alerts',
        },
        (payload) => {
          const row = payload.new as NetworkAlert;
          useAlertsStore.getState().pushAlert(row);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'network_alerts',
        },
        (payload) => {
          const changes = payload.new as Partial<NetworkAlert>;
          useAlertsStore.getState().updateAlert(payload.new.id, changes);
        },
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Guardium] Realtime channel subscribed');
        }
        if (status === 'CHANNEL_ERROR') {
          console.error('[Guardium] Realtime channel error', err);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
