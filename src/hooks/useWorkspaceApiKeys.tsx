import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useWorkspace } from './useWorkspace';
import { useAuth } from './useAuth';

export interface WorkspaceApiKey {
  id: string;
  workspace_id: string;
  service_name: string;
  key_hint: string | null;
  is_valid: boolean | null;
  last_validated_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useWorkspaceApiKeys() {
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: apiKeys = [], isLoading } = useQuery({
    queryKey: ['workspace-api-keys', currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace) return [];

      // Select everything except the encrypted key itself
      const { data, error } = await supabase
        .from('workspace_api_keys')
        .select('id, workspace_id, service_name, key_hint, is_valid, last_validated_at, created_at, updated_at')
        .eq('workspace_id', currentWorkspace.id)
        .order('service_name');

      if (error) throw error;
      return data as WorkspaceApiKey[];
    },
    enabled: !!currentWorkspace,
  });

  const upsertApiKey = useMutation({
    mutationFn: async (data: { service_name: string; api_key: string }) => {
      if (!currentWorkspace) throw new Error('No workspace selected');

      // Validate the token via edge function before saving
      const { data: validation, error: vErr } = await supabase.functions.invoke('validate-api-key', {
        body: { service: data.service_name, api_key: data.api_key },
      });
      if (vErr) throw new Error(vErr.message);
      if (!validation?.valid) {
        throw new Error(validation?.error || 'Token validation failed');
      }

      const keyHint = '...' + data.api_key.slice(-4);

      const { error } = await supabase
        .from('workspace_api_keys')
        .upsert(
          {
            workspace_id: currentWorkspace.id,
            service_name: data.service_name,
            api_key_encrypted: data.api_key,
            key_hint: keyHint,
            is_valid: true,
            last_validated_at: new Date().toISOString(),
            created_by: user?.id || null,
          },
          { onConflict: 'workspace_id,service_name' },
        );

      if (error) throw error;
      return validation as { valid: boolean; info?: string };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-api-keys'] });
      toast.success(result?.info ? `API key saved — ${result.info}` : 'API key saved');
    },
    onError: (error) => {
      toast.error('Failed to save API key: ' + error.message);
    },
  });

  const deleteApiKey = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('workspace_api_keys')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-api-keys'] });
      toast.success('API key removed');
    },
    onError: (error) => {
      toast.error('Failed to remove API key: ' + error.message);
    },
  });

  return { apiKeys, isLoading, upsertApiKey, deleteApiKey };
}
