import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Linkedin, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// LinkedIn icon with proper branding color
const LinkedInIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
);

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
    
    // Get the Supabase URL from environment
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const returnUrl = window.location.origin + '/';
    
    // Open popup for LinkedIn SSO
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

    // Listen for the popup to close or redirect
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        setIsLoading(false);
        // The magic link redirect will handle the session
      }
    }, 500);

    // Also listen for error messages from popup
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'linkedin-sso-error') {
        toast.error(event.data.error || 'Failed to sign in with LinkedIn');
        setIsLoading(false);
        popup.close();
      }
    };

    window.addEventListener('message', handleMessage);

    // Cleanup after 5 minutes
    setTimeout(() => {
      clearInterval(checkClosed);
      window.removeEventListener('message', handleMessage);
      setIsLoading(false);
    }, 300000);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="card-elevated p-8 animate-fade-in">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl gradient-bg glow-primary">
                <Linkedin className="h-7 w-7 text-primary-foreground" />
              </div>
            </div>
            <h1 className="text-2xl font-bold">
              <span className="gradient-text">PostFlow</span>
            </h1>
            <p className="text-muted-foreground mt-2">
              Sign in to manage your LinkedIn posts
            </p>
          </div>

          {/* LinkedIn Sign In Button */}
          <Button
            onClick={handleLinkedInSignIn}
            disabled={isLoading}
            className="w-full h-12 text-base gap-3 bg-[#0A66C2] hover:bg-[#004182] text-white"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <LinkedInIcon />
                Sign in with LinkedIn
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center mt-6">
            By signing in, you'll be able to create and schedule posts for your LinkedIn account.
          </p>
        </div>
      </div>
    </div>
  );
}
