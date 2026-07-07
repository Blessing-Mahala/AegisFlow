import { useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignUpPage';
import OnboardingPage from './pages/OnboardingPage';
import DashboardPage from './pages/DashboardPage';
import SensorsPage from './pages/SensorsPage';
import ScannerPage from './pages/ScannerPage';
import PcapAnalyzerPage from './pages/PcapAnalyzerPage';
import MitigationPage from './pages/MitigationPage';
import SettingsPage from './pages/SettingsPage';
import TraineePlaybookPage from './pages/TraineePlaybookPage';
import DeceptionOpsPage from './pages/DeceptionOpsPage';
import AICoPilotPage from './pages/AICoPilotPage';
import Sidebar from './components/Sidebar';
import AICoPilotPanel from './components/AICoPilotPanel';
import { useAppStore } from './stores/appStore';
import { Loader2 } from 'lucide-react';
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, initialized } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (initialized && !user) {
      navigate('/login');
    }
  }, [initialized, user, navigate]);

  if (!initialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}

function AppLayout() {
  const { copilotOpen } = useAppStore();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex-1 min-w-0 overflow-y-auto">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/sensors" element={<SensorsPage />} />
          <Route path="/scanner" element={<ScannerPage />} />
          <Route path="/pcap-analyzer" element={<PcapAnalyzerPage />} />
          <Route path="/mitigation" element={<MitigationPage />} />
          <Route path="/trainee-playbook" element={<TraineePlaybookPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/deception-ops" element={<DeceptionOpsPage />} />
          <Route path="/ai-copilot" element={<AICoPilotPage />} />
        </Routes>
      </div>
      {copilotOpen && (
        <div className="hidden lg:block">
          <AICoPilotPanel />
        </div>
      )}
    </div>
  );
}

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);
  const initialized = useAuthStore((s) => s.initialized);
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const navigate = useNavigate();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!initialized || !user) return;

    if (!profile?.team_id) {
      navigate('/onboarding');
    } else if (
      window.location.pathname === '/login' ||
      window.location.pathname === '/signup' ||
      window.location.pathname === '/onboarding'
    ) {
      navigate('/');
    }
  }, [initialized, user, profile, navigate]);

  if (!initialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <OnboardingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
