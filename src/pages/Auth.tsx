import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, BarChart3, Users, FileText, Zap } from 'lucide-react';
import { toast } from 'sonner';

const LinkedInIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
);

const features = [
  { icon: BarChart3, title: 'Analytics', desc: 'Track impressions, engagement & growth' },
  { icon: Users, title: 'Multi-Publisher', desc: 'Manage your entire team from one place' },
  { icon: FileText, title: 'Content Pipeline', desc: 'From long-form docs to LinkedIn posts' },
  { icon: Zap, title: 'AI-Powered', desc: 'Smart splitting & rewriting with AI' },
];

export default function Auth() {
  const [isLoading, setIsLoading] = useState(false);
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && !authLoading) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  const handleLinkedInSignIn = () => {
    setIsLoading(true);
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const returnUrl = window.location.origin + '/';
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      `${supabaseUrl}/functions/v1/linkedin-auth/start-sso?return_url=${encodeURIComponent(returnUrl)}`,
      'linkedin-sso',
      `width=${width},height=${height},left=${left},top=${top},popup=1`
    );

    if (!popup) {
      toast.error('Please allow popups to sign in with LinkedIn');
      setIsLoading(false);
      return;
    }

    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        setIsLoading(false);
      }
    }, 500);

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'linkedin-sso-error') {
        toast.error(event.data.error || 'Failed to sign in with LinkedIn');
        setIsLoading(false);
        popup.close();
      }
    };

    window.addEventListener('message', handleMessage);
    setTimeout(() => {
      clearInterval(checkClosed);
      window.removeEventListener('message', handleMessage);
      setIsLoading(false);
    }, 300000);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Brand / Features */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-12"
        style={{
          background: 'linear-gradient(135deg, hsl(230 25% 8%) 0%, hsl(263 40% 12%) 50%, hsl(230 25% 8%) 100%)',
        }}
      >
        {/* Glow orbs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, hsl(263 70% 65% / 0.4) 0%, transparent 70%)' }}
        />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, hsl(189 94% 48% / 0.4) 0%, transparent 70%)' }}
        />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl gradient-bg flex items-center justify-center shadow-lg"
              style={{ boxShadow: '0 0 30px hsl(263 70% 65% / 0.3)' }}
            >
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">ThoughtOS</span>
          </div>
        </div>

        <div className="relative z-10 space-y-6">
          <div>
            <h2 className="text-4xl font-extrabold text-white leading-tight mb-4">
              Your LinkedIn
              <br />
              <span className="gradient-text">Command Center</span>
            </h2>
            <p className="text-lg text-white/60 max-w-md">
              Manage publishers, schedule content, and track analytics — all from one powerful dashboard.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="p-4 rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
                  <Icon className="h-5 w-5 text-primary mb-3" />
                  <h3 className="text-sm font-semibold text-white mb-1">{f.title}</h3>
                  <p className="text-xs text-white/50">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-xs text-white/30">
            Trusted by thought leaders and content teams
          </p>
        </div>
      </div>

      {/* Right Panel - Login */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background relative">
        {/* Subtle background glow */}
        <div className="absolute inset-0 opacity-30"
          style={{
            background: 'radial-gradient(circle at 50% 30%, hsl(263 70% 65% / 0.08) 0%, transparent 60%)'
          }}
        />

        <div className="relative z-10 w-full max-w-sm">
          {/* Mobile logo - only visible on small screens */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 gradient-bg shadow-lg">
              <Sparkles className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">ThoughtOS</h1>
            <p className="text-muted-foreground mt-1 text-sm">Thought Leadership Platform</p>
          </div>

          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
              <p className="text-muted-foreground mt-1">
                Sign in to your workspace
              </p>
            </div>

            <Button
              onClick={handleLinkedInSignIn}
              disabled={isLoading}
              className="w-full h-12 gap-3 bg-[#0A66C2] hover:bg-[#004182] text-white font-medium text-base rounded-xl transition-all hover:shadow-lg hover:shadow-[#0A66C2]/20"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <LinkedInIcon />
                  <span>Continue with LinkedIn</span>
                </>
              )}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="px-3 bg-background text-xs text-muted-foreground">
                  Secured with OAuth 2.0
                </span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              By continuing, you agree to our Terms of Service and Privacy Policy
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
