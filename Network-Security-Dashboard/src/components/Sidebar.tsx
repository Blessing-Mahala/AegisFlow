import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useAppStore } from '../stores/appStore';
import { supabase } from '../lib/supabase/client';
import type { Tables } from '../lib/database.types';
import {
  LayoutDashboard,
  Radio,
  Search,
  FileSearch,
  ShieldAlert,
  Settings,
  LogOut,
  ChevronDown,
  Shield,
  Network,
  BookOpen,
  Radar,
  Bot,
} from 'lucide-react';
type Sensor = Tables<'sensors'>;

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/sensors', label: 'Sensors', icon: Radio },
  { path: '/scanner', label: 'Scanner', icon: Search },
  { path: '/scanner', label: 'System Discovery', icon: Network },
  { path: '/pcap-analyzer', label: 'PCAP Analyzer', icon: FileSearch },
  { path: '/mitigation', label: 'Mitigation', icon: ShieldAlert },
  { path: '/deception-ops', label: 'Deception Ops', icon: Radar },
  { path: '/ai-copilot', label: 'AI Co-Pilot', icon: Bot },
  { path: '/trainee-playbook', label: 'Trainee Playbook', icon: BookOpen },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, signOut } = useAuthStore();
  const { selectedSensorId, setSelectedSensorId, copilotOpen, setCopilotOpen } = useAppStore();
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [sensorDropdownOpen, setSensorDropdownOpen] = useState(false);

  useEffect(() => {
    if (!profile?.team_id) return;

    const loadSensors = async () => {
      const { data } = await supabase
        .from('sensors')
        .select('*')
        .eq('team_id', profile.team_id!);
      if (data) {
        setSensors(data);
        if (data.length > 0 && !selectedSensorId) {
          setSelectedSensorId(data[0].id);
        }
      }
    };

    loadSensors();

    // Subscribe to sensor changes
    const channel = supabase
      .channel('sensors-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sensors',
          filter: `team_id=eq.${profile.team_id}`,
        },
        () => loadSensors()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.team_id, selectedSensorId, setSelectedSensorId]);

  const selectedSensor = sensors.find((s) => s.id === selectedSensorId);
  const isOnline = (sensor: Sensor) => {
    if (!sensor.last_seen) return false;
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    return new Date(sensor.last_seen) > fiveMinAgo;
  };

  return (
    <aside className="w-60 bg-primary border-r border-border flex flex-col h-screen shrink-0">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-accent" />
          <span className="font-heading font-bold text-sm text-foreground truncate">
            {profile?.team_id ? 'NetSec Dashboard' : 'Network Security'}
          </span>
        </div>
        {profile?.team_id && (
          <p className="text-xs text-foreground/50 mt-1 truncate">
            Team: {profile.team_id.slice(0, 8)}...
          </p>
        )}
      </div>

      {/* Sensor Selector */}
      <div className="p-3 border-b border-border">
        <label className="text-xs font-medium text-foreground/60 uppercase tracking-wider mb-2 block">
          Sensor
        </label>
        <div className="relative">
          <button
            onClick={() => setSensorDropdownOpen(!sensorDropdownOpen)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground hover:border-accent/50 transition-colors duration-200 cursor-pointer"
          >
            {selectedSensor ? (
              <span className="flex items-center gap-2 truncate">
                <span className={`status-dot ${isOnline(selectedSensor) ? 'online' : 'offline'}`} />
                <span className="truncate">{selectedSensor.name}</span>
              </span>
            ) : (
              <span className="text-foreground/50">No sensors</span>
            )}
            <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${sensorDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {sensorDropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setSensorDropdownOpen(false)} />
              <div className="absolute top-full left-0 right-0 mt-1 bg-secondary border border-border rounded-lg shadow-lg z-20 py-1 max-h-48 overflow-y-auto">
                {sensors.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-foreground/50">No sensors available</p>
                ) : (
                  sensors.map((sensor) => (
                    <button
                      key={sensor.id}
                      onClick={() => {
                        setSelectedSensorId(sensor.id);
                        setSensorDropdownOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors duration-150 cursor-pointer ${
                        sensor.id === selectedSensorId ? 'bg-muted text-accent' : 'text-foreground'
                      }`}
                    >
                      <span className={`status-dot ${isOnline(sensor) ? 'online' : 'offline'}`} />
                      <span className="truncate">{sensor.name}</span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-foreground/70 hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Co-Pilot toggle */}
      <div className="px-3 pb-1">
        <button
          onClick={() => setCopilotOpen(!copilotOpen)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
            copilotOpen
              ? 'bg-accent/10 text-accent'
              : 'text-foreground/70 hover:bg-muted hover:text-foreground'
          }`}
        >
          <Bot className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left">AI Co-Pilot</span>
          <span className={`w-2 h-2 rounded-full ${copilotOpen ? 'bg-accent' : 'bg-foreground/30'}`} />
        </button>
      </div>

      {/* User info & logout */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center justify-between">
          <span className="text-xs text-foreground/50 truncate">{profile?.email}</span>
          <button
            onClick={() => signOut()}
            className="p-1.5 text-foreground/50 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all duration-200 cursor-pointer"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
