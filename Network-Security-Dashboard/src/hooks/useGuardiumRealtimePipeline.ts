import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase/client';

export function useGuardiumRealtimePipeline() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [discoveredDevices, setDiscoveredDevices] = useState<any[]>([]);

  useEffect(() => {
    // 1. Initial high-velocity fetch
    const fetchInitialState = async () => {
      const { data: initialAlerts } = await supabase
        .from('network_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (initialAlerts) setAlerts(initialAlerts);
    };
    fetchInitialState();

    // 2. Open live WebSocket channel for ingestion & fraud monitoring
    const channel = supabase
      .channel('guardium_fabric_stream')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'network_alerts' },
        (payload) => {
          setAlerts((prev) => [payload.new, ...prev]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sensors' },
        (payload) => {
          setDiscoveredDevices((prev) => [payload.new, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { alerts, discoveredDevices };
}