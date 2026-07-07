import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useAppStore } from '../stores/appStore';
import { supabase } from '../lib/supabase/client';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Activity } from 'lucide-react';

interface DataPoint {
  time: string;
  count: number;
  timestamp: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-secondary border border-border rounded-lg p-3 shadow-lg">
        <p className="text-xs text-foreground/60">{label}</p>
        <p className="text-sm font-semibold text-accent mt-1">
          {payload[0].value} packets
        </p>
      </div>
    );
  }
  return null;
};

export default function TrafficChart() {
  const { profile } = useAuthStore();
  const { selectedSensorId, packets } = useAppStore();
  const [chartData, setChartData] = useState<DataPoint[]>([]);

  useEffect(() => {
    if (!profile?.team_id) return;

    const loadChartData = async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      // Get per-minute packet counts for the last hour
      const { data } = await supabase.rpc('get_packet_counts_per_minute', {
        p_team_id: profile.team_id!,
        p_sensor_id: selectedSensorId ?? null,
        p_since: oneHourAgo,
      });

      if (data) {
        setChartData(
          data.map((d: any) => ({
            time: new Date(d.minute).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            count: d.count,
            timestamp: new Date(d.minute).getTime(),
          }))
        );
      } else {
        // If the RPC doesn't exist, derive from packets in state
        const now = Date.now();
        const buckets: Record<string, number> = {};
        for (let i = 0; i < 60; i++) {
          const bucketTime = new Date(now - (59 - i) * 60 * 1000);
          const key = bucketTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          buckets[key] = 0;
        }

        packets.forEach((p) => {
          const t = new Date(p.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          if (buckets[t] !== undefined) {
            buckets[t]++;
          }
        });

        setChartData(
          Object.entries(buckets).map(([time, count]) => ({ time, count, timestamp: 0 }))
        );
      }
    };

    loadChartData();
  }, [profile?.team_id, selectedSensorId, packets]);

  if (chartData.length === 0) {
    return (
      <div className="bg-secondary border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-accent" />
          <h3 className="font-heading font-semibold text-foreground text-sm">Traffic Volume (Last Hour)</h3>
        </div>
        <div className="h-48 flex items-center justify-center text-foreground/50 text-sm">
          Collecting data...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-secondary border border-border rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-accent" />
        <h3 className="font-heading font-semibold text-foreground text-sm">Traffic Volume (Last Hour)</h3>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.5} />
            <XAxis
              dataKey="time"
              tick={{ fill: 'var(--color-foreground)', fontSize: 11, opacity: 0.6 }}
              axisLine={{ stroke: 'var(--color-border)' }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: 'var(--color-foreground)', fontSize: 11, opacity: 0.6 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="count"
              stroke="var(--color-accent)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: 'var(--color-accent)' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
