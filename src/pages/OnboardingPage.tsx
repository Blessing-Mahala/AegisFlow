import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useNavigate } from 'react-router-dom';
import { Shield, Plus, LogIn } from 'lucide-react';

export default function OnboardingPage() {
  const [teamName, setTeamName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [mode, setMode] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const createTeam = useAuthStore((s) => s.createTeam);
  const joinTeam = useAuthStore((s) => s.joinTeam);
  const navigate = useNavigate();

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await createTeam(teamName);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      navigate('/');
    }
  };

  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await joinTeam(joinCode);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      navigate('/');
    }
  };

  if (!mode) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <div className="text-center mb-8">
            <Shield className="w-16 h-16 text-accent mx-auto mb-4" />
            <h1 className="text-2xl font-heading font-bold text-foreground">
              Welcome to Network Security Dashboard
            </h1>
            <p className="text-foreground/60 mt-2">
              Get started by creating a new team or joining an existing one
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => setMode('create')}
              className="flex flex-col items-center gap-3 p-8 bg-secondary border border-border rounded-xl hover:border-accent/50 transition-all duration-200 cursor-pointer group"
            >
              <Plus className="w-10 h-10 text-accent group-hover:scale-110 transition-transform duration-200" />
              <div className="text-center">
                <h3 className="font-heading font-semibold text-foreground">Create a Team</h3>
                <p className="text-sm text-foreground/60 mt-1">
                  Set up a new team and invite members
                </p>
              </div>
            </button>

            <button
              onClick={() => setMode('join')}
              className="flex flex-col items-center gap-3 p-8 bg-secondary border border-border rounded-xl hover:border-accent/50 transition-all duration-200 cursor-pointer group"
            >
              <LogIn className="w-10 h-10 text-accent group-hover:scale-110 transition-transform duration-200" />
              <div className="text-center">
                <h3 className="font-heading font-semibold text-foreground">Join a Team</h3>
                <p className="text-sm text-foreground/60 mt-1">
                  Join an existing team with a team ID
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'create') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Plus className="w-12 h-12 text-accent mx-auto mb-4" />
            <h1 className="text-2xl font-heading font-bold text-foreground">Create a Team</h1>
          </div>

          <form onSubmit={handleCreateTeam} className="bg-secondary border border-border rounded-xl p-6 space-y-4">
            {error && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg p-3">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="teamName" className="block text-sm font-medium text-foreground/80 mb-1">
                Team Name
              </label>
              <input
                id="teamName"
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-accent transition-colors duration-200"
                placeholder="e.g., Security Operations"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2.5 bg-accent text-black font-semibold rounded-lg hover:opacity-90 transition-all duration-200 cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Team'}
            </button>

            <button
              type="button"
              onClick={() => setMode(null)}
              className="w-full px-4 py-2 text-foreground/60 hover:text-foreground transition-colors duration-200 cursor-pointer"
            >
              Back
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <LogIn className="w-12 h-12 text-accent mx-auto mb-4" />
          <h1 className="text-2xl font-heading font-bold text-foreground">Join a Team</h1>
        </div>

        <form onSubmit={handleJoinTeam} className="bg-secondary border border-border rounded-xl p-6 space-y-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg p-3">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="joinCode" className="block text-sm font-medium text-foreground/80 mb-1">
              Team ID
            </label>
            <input
              id="joinCode"
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-accent transition-colors duration-200"
              placeholder="Paste the team ID here"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2.5 bg-accent text-black font-semibold rounded-lg hover:opacity-90 transition-all duration-200 cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Joining...' : 'Join Team'}
          </button>

          <button
            type="button"
            onClick={() => setMode(null)}
            className="w-full px-4 py-2 text-foreground/60 hover:text-foreground transition-colors duration-200 cursor-pointer"
          >
            Back
          </button>
        </form>
      </div>
    </div>
  );
}
