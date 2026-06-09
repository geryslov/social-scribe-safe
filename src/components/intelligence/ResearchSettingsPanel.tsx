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
import { Key, Clock, CheckCircle2, XCircle, Loader2, Trash2, History } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface ResearchSettingsPanelProps {
  publisher: Publisher;
}

function RunStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return (
        <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] gap-1">
          <CheckCircle2 className="h-3 w-3" />Completed
        </Badge>
      );
    case 'running':
      return (
        <Badge variant="secondary" className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />Running
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="secondary" className="bg-red-50 text-red-700 border border-red-200 text-[10px] gap-1">
          <XCircle className="h-3 w-3" />Failed
        </Badge>
      );
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
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-primary" />
          <h3 className="font-display font-semibold text-sm">Schedule</h3>
        </div>
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Automatic Research</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Run research on a schedule for all publishers in this workspace
              </p>
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
          <div className="flex items-center gap-3 pt-2 border-t">
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
              <SelectTrigger className="w-[160px] h-8 focus:ring-primary/30">
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
        <div className="flex items-center gap-2 mb-3">
          <Key className="h-4 w-4 text-primary" />
          <h3 className="font-display font-semibold text-sm">API Keys</h3>
        </div>
        <Card className="p-5 space-y-4">
          <p className="text-xs text-muted-foreground">
            Reddit and HN are free. Add Brave for web search, Apify for LinkedIn post fetching (Engage tab).
          </p>

          {/* Existing keys */}
          {apiKeys.length > 0 && (
            <div className="space-y-2 pt-2">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-[10px] font-semibold uppercase tracking-wider">
                      {key.service_name}
                    </Badge>
                    <span className="text-sm text-muted-foreground font-mono">{key.key_hint}</span>
                    {key.is_valid ? (
                      <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Valid
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-red-50 text-red-700 border border-red-200 text-[10px] gap-1">
                        <XCircle className="h-3 w-3" /> Invalid
                      </Badge>
                    )}
                    {key.last_validated_at && (
                      <span className="text-[10px] text-muted-foreground/50">
                        checked {new Date(key.last_validated_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteApiKey.mutate(key.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add new key */}
          <div className="flex items-end gap-2 pt-3 border-t">
            <div className="w-[120px]">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Service</label>
              <Select value={newKeyService} onValueChange={setNewKeyService}>
                <SelectTrigger className="h-8 focus:ring-primary/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="brave">Brave</SelectItem>
                  <SelectItem value="apify">Apify</SelectItem>
                  <SelectItem value="scrapecreators">ScrapeCreators</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">API Key</label>
              <Input
                type="password"
                value={newKeyValue}
                onChange={(e) => setNewKeyValue(e.target.value)}
                placeholder="Paste your API key"
                className="h-8 font-mono text-sm focus-visible:ring-primary/30"
              />
            </div>
            <Button
              size="sm"
              className="h-8 font-medium"
              onClick={handleSaveKey}
              disabled={!newKeyValue.trim() || upsertApiKey.isPending}
            >
              {upsertApiKey.isPending ? (
                <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Validating</>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </Card>
      </section>

      {/* Research Run History */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <History className="h-4 w-4 text-primary" />
          <h3 className="font-display font-semibold text-sm">Recent Research Runs</h3>
        </div>
        {runsLoading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : runs.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-border rounded-lg">
            <History className="h-6 w-6 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">
              No research runs yet for {publisher.name}.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {runs.map((run: ResearchRun) => (
              <Card key={run.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RunStatusBadge status={run.status} />
                    <Badge variant="outline" className="text-[10px]">
                      {run.trigger_type === 'scheduled' ? 'Scheduled' : 'Manual'}
                    </Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {new Date(run.created_at).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{run.items_found}</span> items
                    {run.sources_used.length > 0 && (
                      <span className="ml-1.5 text-muted-foreground/60">
                        via {run.sources_used.join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                {run.error_message && (
                  <p className="text-xs text-destructive mt-1.5 pl-1">{run.error_message}</p>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
