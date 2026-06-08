import { useResearchSettings } from '@/hooks/useResearchSettings';
import { useWorkspaceApiKeys } from '@/hooks/useWorkspaceApiKeys';
import { useResearchRuns, ResearchRun } from '@/hooks/useResearchRuns';
import { Publisher } from '@/hooks/usePublishers';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Key, Clock, CheckCircle2, XCircle, Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';

interface ResearchSettingsPanelProps {
  publisher: Publisher;
}

function RunStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <Badge variant="secondary" className="bg-green-100 text-green-700 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
    case 'running':
      return <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-[10px]"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Running</Badge>;
    case 'failed':
      return <Badge variant="secondary" className="bg-red-100 text-red-700 text-[10px]"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
  }
}

export function ResearchSettingsPanel({ publisher }: ResearchSettingsPanelProps) {
  const { settings, isLoading: settingsLoading, upsertSettings } = useResearchSettings();
  const { apiKeys, isLoading: keysLoading, upsertApiKey, deleteApiKey } = useWorkspaceApiKeys();
  const { runs, isLoading: runsLoading } = useResearchRuns(publisher.id);

  const [newKeyService, setNewKeyService] = useState('brave');
  const [newKeyValue, setNewKeyValue] = useState('');

  const handleSaveKey = () => {
    if (!newKeyValue.trim()) return;
    upsertApiKey.mutate(
      { service_name: newKeyService, api_key: newKeyValue.trim() },
      { onSuccess: () => setNewKeyValue('') },
    );
  };

  return (
    <div className="space-y-8">
      {/* Schedule Settings */}
      <section>
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Schedule
        </h3>
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Automatic Research</p>
              <p className="text-xs text-muted-foreground">Run research on a schedule for all publishers in this workspace</p>
            </div>
            <Switch
              checked={settings?.schedule_enabled ?? false}
              onCheckedChange={(enabled) =>
                upsertSettings.mutate({
                  schedule_frequency: settings?.schedule_frequency || 'daily',
                  schedule_enabled: enabled,
                })
              }
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-muted-foreground">Frequency:</label>
            <Select
              value={settings?.schedule_frequency || 'daily'}
              onValueChange={(freq) =>
                upsertSettings.mutate({
                  schedule_frequency: freq,
                  schedule_enabled: settings?.schedule_enabled ?? false,
                })
              }
            >
              <SelectTrigger className="w-[160px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Once daily</SelectItem>
                <SelectItem value="twice_daily">Twice daily</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>
      </section>

      {/* API Keys */}
      <section>
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Key className="h-4 w-4" />
          API Keys
        </h3>
        <Card className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Reddit and Hacker News are free. Add a Brave Search API key to enable web results.
          </p>

          {/* Existing keys */}
          {apiKeys.map((key) => (
            <div key={key.id} className="flex items-center justify-between py-2 border-b last:border-0">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">{key.service_name}</Badge>
                <span className="text-sm text-muted-foreground font-mono">{key.key_hint}</span>
                {key.is_valid ? (
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-500" />
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                onClick={() => deleteApiKey.mutate(key.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}

          {/* Add new key */}
          <div className="flex items-end gap-2 pt-2">
            <div className="w-[120px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Service</label>
              <Select value={newKeyService} onValueChange={setNewKeyService}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="brave">Brave</SelectItem>
                  <SelectItem value="scrapecreators">ScrapeCreators</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">API Key</label>
              <Input
                type="password"
                value={newKeyValue}
                onChange={(e) => setNewKeyValue(e.target.value)}
                placeholder="Paste your API key"
                className="h-8 font-mono text-sm"
              />
            </div>
            <Button size="sm" className="h-8" onClick={handleSaveKey} disabled={!newKeyValue.trim()}>
              Save
            </Button>
          </div>
        </Card>
      </section>

      {/* Research Run History */}
      <section>
        <h3 className="font-semibold text-sm mb-3">Recent Research Runs</h3>
        {runsLoading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No research runs yet for {publisher.name}.</p>
        ) : (
          <div className="space-y-2">
            {runs.map((run: ResearchRun) => (
              <Card key={run.id} className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RunStatusBadge status={run.status} />
                    <span className="text-xs text-muted-foreground">
                      {run.trigger_type === 'scheduled' ? 'Scheduled' : 'Manual'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(run.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {run.items_found} items · {run.sources_used.join(', ') || 'no sources'}
                  </div>
                </div>
                {run.error_message && (
                  <p className="text-xs text-destructive mt-1">{run.error_message}</p>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
