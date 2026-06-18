import { useState } from 'react';
import { useWorkspaceMembers } from '@/hooks/useWorkspaces';
import { useWorkspacePermissions } from '@/hooks/useWorkspacePermissions';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Trash2, Lock, Copy, Check, Sparkles, Send, UserPlus, Eye, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const ROLE_DESCRIPTIONS: Record<string, { label: string; perms: string[] }> = {
  owner: {
    label: 'Owner',
    perms: ['Full access', 'Manage members & roles', 'Edit workspace', 'Generate AI', 'Assign posts', 'Publish to LinkedIn'],
  },
  admin: {
    label: 'Admin',
    perms: ['Manage members & roles', 'Edit workspace', 'Generate AI', 'Assign posts', 'Publish to LinkedIn'],
  },
  creator: {
    label: 'Creator',
    perms: ['Generate AI', 'Assign posts', 'Publish to LinkedIn'],
  },
  member: {
    label: 'Member',
    perms: ['View posts, documents, analytics', 'Read-only'],
  },
};

interface Props {
  workspaceId: string;
  inviteToken?: string | null;
  inviteEnabled: boolean;
}

export function WorkspaceMembersTab({ workspaceId, inviteToken, inviteEnabled }: Props) {
  const { can } = useWorkspacePermissions();
  const { members, isLoading, updateMemberRole, removeMember } = useWorkspaceMembers(workspaceId);
  const [copied, setCopied] = useState(false);

  const inviteUrl = inviteToken ? `${window.location.origin}/join/${inviteToken}` : '';

  const copyInvite = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    toast.success('Invite link copied');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Invite link */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Share2 className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold">Invite link</h4>
          {!can.invite && <Lock className="h-3 w-3 text-muted-foreground" />}
        </div>
        {!inviteEnabled ? (
          <p className="text-xs text-muted-foreground">
            Invite link is currently disabled. Turn it on in the General tab to share with new members.
          </p>
        ) : inviteUrl ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 text-xs font-mono">
              {inviteUrl}
            </code>
            <Button size="sm" variant="outline" onClick={copyInvite} disabled={!can.invite} className="gap-1.5">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No invite token yet — save the workspace once to generate one.</p>
        )}
        {!can.invite && (
          <p className="text-[11px] text-muted-foreground">Only workspace owners and admins can share the invite link.</p>
        )}
      </div>

      {/* Members list */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" />
          Members ({members.length})
        </h4>

        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-lg border divide-y">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {emails[m.userId] || `${m.userId.slice(0, 8)}…`}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Joined {new Date(m.createdAt).toLocaleDateString()} · via {m.joinedVia}
                  </p>
                </div>

                {can.manageWorkspace ? (
                  <Select
                    value={m.role}
                    onValueChange={(role) => updateMemberRole.mutate({ memberId: m.id, role })}
                  >
                    <SelectTrigger className="h-8 w-[120px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">Owner</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="creator">Creator</SelectItem>
                      <SelectItem value="member">Member (read-only)</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-xs text-muted-foreground capitalize">{m.role}</span>
                )}

                {can.manageWorkspace && m.role !== 'owner' && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm('Remove this member from the workspace?')) {
                        removeMember.mutate(m.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Role legend */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">What each role can do</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(['owner', 'admin', 'creator', 'member'] as const).map((r) => {
            const info = ROLE_DESCRIPTIONS[r];
            const icon = r === 'member' ? Eye : r === 'creator' ? Sparkles : r === 'admin' ? Send : UserPlus;
            const Icon = icon;
            return (
              <div key={r} className={cn('rounded-lg border p-3 space-y-1.5', r === 'member' && 'bg-muted/30')}>
                <div className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-semibold">{info.label}</span>
                </div>
                <ul className="text-[11px] text-muted-foreground space-y-0.5 list-disc list-inside">
                  {info.perms.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
