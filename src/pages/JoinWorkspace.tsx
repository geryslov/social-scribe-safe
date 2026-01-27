import { useParams, useNavigate } from 'react-router-dom';
import { useWorkspaceByToken } from '@/hooks/useWorkspaces';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Loader2, Building2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const LinkedInIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
);

export default function JoinWorkspace() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { data: workspace, isLoading: workspaceLoading, error } = useWorkspaceByToken(token || '');
  const [isJoining, setIsJoining] = useState(false);

  // If user is already logged in and workspace exists, redirect to workspace
  useEffect(() => {
    if (user && workspace && !authLoading) {
      // User is logged in, they should be redirected to workspace
      navigate(`/`);
    }
  }, [user, workspace, authLoading, navigate]);

  const handleJoinWithLinkedIn = () => {
    if (!token) return;
    
    setIsJoining(true);
    
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const returnUrl = window.location.origin + '/';
    
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    
    // Include invite token in the SSO request
    const popup = window.open(
      `${supabaseUrl}/functions/v1/linkedin-auth/start-sso?return_url=${encodeURIComponent(returnUrl)}&invite=${encodeURIComponent(token)}`,
      'linkedin-sso',
      `width=${width},height=${height},left=${left},top=${top},popup=1`
    );

    if (!popup) {
      toast.error('Please allow popups to sign in with LinkedIn');
      setIsJoining(false);
      return;
    }

    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        setIsJoining(false);
      }
    }, 500);

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'linkedin-sso-error') {
        toast.error(event.data.error || 'Failed to sign in with LinkedIn');
        setIsJoining(false);
        popup.close();
      }
    };

    window.addEventListener('message', handleMessage);

    setTimeout(() => {
      clearInterval(checkClosed);
      window.removeEventListener('message', handleMessage);
      setIsJoining(false);
    }, 300000);
  };

  if (workspaceLoading || authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="card-elevated p-8">
            <div className="flex items-center justify-center w-16 h-16 mx-auto mb-6 rounded-2xl bg-destructive/10">
              <Users className="h-8 w-8 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Invalid Invite Link</h1>
            <p className="text-muted-foreground mb-6">
              This invite link is invalid or has been disabled. Please contact your workspace administrator for a new link.
            </p>
            <Button onClick={() => navigate('/')} variant="outline">
              Go to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="card-elevated p-8 animate-fade-in">
          {/* Workspace Logo/Icon */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              {workspace.logoUrl ? (
                <img 
                  src={workspace.logoUrl} 
                  alt={workspace.name}
                  className="h-16 w-16 rounded-2xl object-cover"
                />
              ) : (
                <div className="flex items-center justify-center w-16 h-16 rounded-2xl gradient-bg glow-primary">
                  <Building2 className="h-8 w-8 text-primary-foreground" />
                </div>
              )}
            </div>
            <h1 className="text-2xl font-bold mb-2">
              Join <span className="gradient-text">{workspace.name}</span>
            </h1>
            {workspace.companyName && (
              <p className="text-muted-foreground text-sm mb-2">
                {workspace.companyName}
              </p>
            )}
            {workspace.description && (
              <p className="text-muted-foreground">
                {workspace.description}
              </p>
            )}
            {!workspace.description && (
              <p className="text-muted-foreground">
                You've been invited to collaborate on LinkedIn content and analytics.
              </p>
            )}
          </div>

          {/* Join Button */}
          <Button
            onClick={handleJoinWithLinkedIn}
            disabled={isJoining}
            className="w-full h-12 text-base gap-3 bg-[#0A66C2] hover:bg-[#004182] text-white"
          >
            {isJoining ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <LinkedInIcon />
                Join with LinkedIn
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center mt-6">
            By joining, you'll be able to create and manage LinkedIn posts for {workspace.name}.
          </p>

          {/* Already have an account */}
          <div className="mt-6 pt-6 border-t border-border text-center">
            <p className="text-sm text-muted-foreground">
              Already have an account?{' '}
              <button 
                onClick={() => navigate('/auth')}
                className="text-primary hover:underline"
              >
                Sign in
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
