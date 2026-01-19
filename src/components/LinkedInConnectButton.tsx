import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Linkedin, Check, Loader2, Unlink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface LinkedInConnectButtonProps {
  publisherId: string;
  isConnected: boolean;
  onConnectionChange: () => void;
}

export function LinkedInConnectButton({ 
  publisherId, 
  isConnected, 
  onConnectionChange 
}: LinkedInConnectButtonProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  useEffect(() => {
    // Listen for OAuth callback messages
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'linkedin-auth-success') {
        setIsConnecting(false);
        toast.success('LinkedIn connected successfully!');
        onConnectionChange();
      } else if (event.data?.type === 'linkedin-auth-error') {
        setIsConnecting(false);
        toast.error(event.data.error || 'Failed to connect LinkedIn');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onConnectionChange]);

  const handleConnect = () => {
    setIsConnecting(true);
    
    // Get the edge function URL - don't include return_url to keep state small
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const authUrl = `${supabaseUrl}/functions/v1/linkedin-auth/start?publisher_id=${publisherId}`;
    
    // Open popup for OAuth
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    
    const popup = window.open(
      authUrl,
      'linkedin-auth',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
    );

    // Check if popup was blocked
    if (!popup) {
      setIsConnecting(false);
      toast.error('Popup blocked. Please allow popups for this site.');
      return;
    }

    // Poll for popup close (in case user closes it manually)
    const pollTimer = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollTimer);
        setIsConnecting(false);
      }
    }, 500);
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    setShowDisconnectDialog(false);

    try {
      const { error } = await supabase.functions.invoke('linkedin-auth/disconnect', {
        body: { publisherId },
      });

      if (error) throw error;

      toast.success('LinkedIn disconnected');
      onConnectionChange();
    } catch (error) {
      console.error('Failed to disconnect:', error);
      toast.error('Failed to disconnect LinkedIn');
    } finally {
      setIsDisconnecting(false);
    }
  };

  if (isConnected) {
    return (
      <>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-sm text-success">
            <Check className="h-4 w-4" />
            <span>LinkedIn Connected</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
            onClick={() => setShowDisconnectDialog(true)}
            disabled={isDisconnecting}
          >
            {isDisconnecting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Unlink className="h-3 w-3" />
            )}
          </Button>
        </div>

        <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
          <AlertDialogContent className="bg-card border border-border">
            <AlertDialogHeader>
              <AlertDialogTitle>Disconnect LinkedIn?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the LinkedIn connection for this publisher. 
                You'll need to reconnect to publish directly to LinkedIn.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDisconnect}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Disconnect
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2 border-[#0077b5]/30 text-[#0077b5] hover:bg-[#0077b5]/10"
      onClick={handleConnect}
      disabled={isConnecting}
    >
      {isConnecting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Linkedin className="h-4 w-4" />
      )}
      {isConnecting ? 'Connecting...' : 'Connect LinkedIn'}
    </Button>
  );
}
