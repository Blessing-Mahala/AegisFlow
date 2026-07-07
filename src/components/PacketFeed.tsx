import { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { useAppStore } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase/client';
import type { Tables } from '../lib/database.types';
import { Search, Filter, MousePointer2 } from 'lucide-react';

type Packet = Tables<'packets'>;

const PROTOCOL_COLORS: Record<string, string> = {
  TCP: 'text-blue-400',
  UDP: 'text-purple-400',
  ICMP: 'text-amber-400',
  DNS: 'text-green-400',
  HTTP: 'text-cyan-400',
  HTTPS: 'text-emerald-400',
  ARP: 'text-rose-400',
  OTHER: 'text-gray-400',
};

export default function PacketFeed() {
  const {
    selectedSensorId,
    selectedPacket,
    packets,
    setPackets,
    setSelectedPacket,
    protocolFilter,
    setProtocolFilter,
    ipFilter,
    setIpFilter,
    setCopilotOpen,
  } = useAppStore();
  const { profile } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [ipInput, setIpInput] = useState('');

  // Load initial packets
  useEffect(() => {
    if (!profile?.team_id || !selectedSensorId) return;

    setLoading(true);
    const loadPackets = async () => {
      let query = supabase
        .from('packets')
        .select('*')
        .eq('team_id', profile.team_id!)
        .eq('sensor_id', selectedSensorId)
        .order('captured_at', { ascending: false })
        .limit(100);

      if (protocolFilter) {
        query = query.eq('protocol', protocolFilter);
      }

      const { data } = await query;
      if (data) setPackets(data);
      setLoading(false);
    };

    loadPackets();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('packets-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'packets',
          filter: `team_id=eq.${profile.team_id!}`,
        },
        (payload) => {
          const newPacket = payload.new as Packet;
          if (newPacket.sensor_id === selectedSensorId) {
            useAppStore.getState().addPacket(newPacket);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.team_id, selectedSensorId, protocolFilter, setPackets]);

  const handleRowClick = useCallback(
    (packet: Packet) => {
      setSelectedPacket(packet);
      setCopilotOpen(true);
    },
    [setSelectedPacket, setCopilotOpen]
  );

  // Filter by IP
  const filteredPackets = ipFilter
    ? packets.filter(
        (p) =>
          String(p.src_ip).includes(ipFilter) || String(p.dst_ip).includes(ipFilter)
      )
    : packets;

  const handleIpFilter = () => {
    setIpFilter(ipInput.trim() || null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Filters bar */}
      <div className="flex items-center gap-3 p-3 border-b border-border flex-wrap">
        {/* Protocol filter */}
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-foreground/50" />
          <select
            value={protocolFilter ?? ''}
            onChange={(e) => setProtocolFilter(e.target.value || null)}
            className="bg-background border border-border rounded-lg px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent transition-colors duration-200"
          >
            <option value="">All Protocols</option>
            <option value="TCP">TCP</option>
            <option value="UDP">UDP</option>
            <option value="ICMP">ICMP</option>
            <option value="DNS">DNS</option>
            <option value="HTTP">HTTP</option>
            <option value="HTTPS">HTTPS</option>
            <option value="ARP">ARP</option>
            <option value="OTHER">OTHER</option>
          </select>
        </div>

        {/* IP filter */}
        <div className="flex items-center gap-1.5 flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 text-foreground/50 shrink-0" />
          <input
            type="text"
            value={ipInput}
            onChange={(e) => setIpInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleIpFilter()}
            placeholder="Filter by IP..."
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent transition-colors duration-200"
          />
          {ipFilter && (
            <button
              onClick={() => {
                setIpFilter(null);
                setIpInput('');
              }}
              className="text-xs text-foreground/50 hover:text-foreground transition-colors duration-200 cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        <span className="text-xs text-foreground/50 ml-auto">
          {filteredPackets.length} packets
        </span>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[auto_1fr_1fr_auto_auto] gap-2 px-3 py-2 text-xs font-medium text-foreground/60 uppercase tracking-wider border-b border-border bg-muted/30">
        <span>Time</span>
        <span>Source IP</span>
        <span>Dest IP</span>
        <span>Protocol</span>
        <span>Size</span>
      </div>

      {/* Packet rows */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredPackets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-foreground/50">
            <MousePointer2 className="w-8 h-8 mb-2" />
            <p className="text-sm">No packets found</p>
            <p className="text-xs mt-1">
              {protocolFilter || ipFilter ? 'Try adjusting your filters' : 'Waiting for sensor data...'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {filteredPackets.map((packet) => {
              const isSelected = selectedPacket?.id === packet.id;
              return (
                <button
                  key={packet.id}
                  onClick={() => handleRowClick(packet)}
                  className={`w-full grid grid-cols-[auto_1fr_1fr_auto_auto] gap-2 px-3 py-2.5 text-sm text-left transition-all duration-150 cursor-pointer hover:bg-muted/50 ${
                    isSelected
                      ? 'bg-accent/10 border-l-2 border-l-accent'
                      : 'border-l-2 border-l-transparent'
                  }`}
                >
                  <span className="font-mono-custom text-xs text-foreground/60 whitespace-nowrap">
                    {format(new Date(packet.captured_at), 'HH:mm:ss')}
                  </span>
                  <span className="font-mono-custom text-xs text-foreground truncate">
                    {String(packet.src_ip)}
                  </span>
                  <span className="font-mono-custom text-xs text-foreground truncate">
                    {String(packet.dst_ip)}
                  </span>
                  <span className={`font-mono-custom text-xs font-semibold ${PROTOCOL_COLORS[packet.protocol] ?? 'text-gray-400'}`}>
                    {packet.protocol}
                  </span>
                  <span className="font-mono-custom text-xs text-foreground/70 text-right whitespace-nowrap">
                    {packet.payload_size}B
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
