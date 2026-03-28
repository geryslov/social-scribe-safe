import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Button } from '@/components/ui/button';
import {
  Building2,
  Plus,
  Copy,
  Users,
  ExternalLink,
  FlaskConical,
  Check,
  Loader2,
  Settings,
  Flame,
  Shield,
  Link2,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { CreateWorkspaceModal } from '@/components/CreateWorkspaceModal';
import { WorkspaceEditModal } from '@/components/WorkspaceEditModal';
import { Workspace } from '@/types/workspace';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { isAdmin, isLoading: authLoading } = useAuth();
  const { workspaces, publisherCounts, isLoading } = useWorkspaces();
  const { switchWorkspace, currentWorkspace } = useWorkspace();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyInviteLink = async (workspace: { id: string; inviteToken: string }) => {
    const link = `${window.location.origin}/join/${workspace.inviteToken}`;
    await navigator.clipboard.writeText(link);
    setCopiedId(workspace.id);
    toast.success('Invite link copied');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const totalPublishers = Object.values(publisherCounts).reduce((a, b) => a + b, 0);
  const activeInvites = workspaces.filter(w => w.inviteEnabled).length;

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading workspaces...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center max-w-sm">
            <div className="w-20 h-20 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-6">
              <Shield className="h-10 w-10 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
            <p className="text-muted-foreground mb-6">You need admin privileges to access the workspace management panel.</p>
            <Button variant="outline" onClick={() => navigate('/')} className="gap-2">
              <ArrowRight className="h-4 w-4" />
              Go to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main id="main-content" className="max-w-6xl mx-auto px-8 py-8">

        {/* Page Header */}
        <div className="flex items-start justify-between mb-10">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-xl bg-primary">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
                Workspaces
              </h1>
            </div>
            <p className="text-muted-foreground mt-2 ml-[52px]">
              Manage workspaces, publishers, and invite links
            </p>
          </div>
          <Button
            onClick={() => setShowCreateModal(true)}
            className="gap-2 bg-primary text-white hover:bg-primary/90 rounded-xl h-11 px-5"
          >
            <Plus className="h-4 w-4" />
            New Workspace
          </Button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <div className="bg-card border border-border rounded-xl p-5 hover:border-primary/20 transition-colors">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{workspaces.length}</p>
                <p className="text-xs text-muted-foreground">Workspaces</p>
              </div>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-5 hover:border-primary/20 transition-colors">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-accent/10">
                <Users className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{totalPublishers}</p>
                <p className="text-xs text-muted-foreground">Total Publishers</p>
              </div>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-5 hover:border-primary/20 transition-colors">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-success/10">
                <Link2 className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{activeInvites}</p>
                <p className="text-xs text-muted-foreground">Active Invite Links</p>
              </div>
            </div>
          </div>
        </div>

        {/* Workspace Grid */}
        {workspaces.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-2xl p-16 text-center">
            <div className="w-24 h-24 rounded-3xl bg-primary flex items-center justify-center mx-auto mb-6">
              <Building2 className="h-12 w-12 text-white" />
            </div>
            <h3 className="text-xl font-bold mb-2">Create your first workspace</h3>
            <p className="text-muted-foreground max-w-md mx-auto mb-8">
              Workspaces let you organize publishers, manage content, and track analytics for different teams or brands.
            </p>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="gap-2 bg-primary text-white hover:bg-primary/90 rounded-xl h-11 px-6"
            >
              <Plus className="h-4 w-4" />
              Create Workspace
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workspaces.map((workspace) => {
              const isActive = currentWorkspace?.id === workspace.id;
              const pubCount = publisherCounts[workspace.id] || 0;

              return (
                <div
                  key={workspace.id}
                  className={cn(
                    "group relative bg-card border rounded-2xl overflow-hidden transition-all duration-300",
                    isActive
                      ? "border-primary/40 shadow-sm"
                      : "border-border hover:border-primary/30 hover:shadow-sm"
                  )}
                >
                  {/* Top gradient accent */}
                  <div className="h-1 w-full bg-primary" />

                  {/* Active indicator */}
                  {isActive && (
                    <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-medium px-2.5 py-1 rounded-full">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      Active
                    </div>
                  )}

                  {/* Test badge */}
                  {workspace.isTestWorkspace && !isActive && (
                    <div className="absolute top-4 right-4">
                      <div className="flex items-center gap-1 bg-warning/10 text-warning text-xs font-medium px-2 py-1 rounded-full">
                        <FlaskConical className="h-3 w-3" />
                        Test
                      </div>
                    </div>
                  )}

                  <div className="p-6">
                    {/* Logo + Name */}
                    <div className="flex items-start gap-4 mb-4">
                      {workspace.logoUrl ? (
                        <img
                          src={workspace.logoUrl}
                          alt={workspace.name}
                          className="h-14 w-14 rounded-xl object-cover ring-1 ring-border"
                        />
                      ) : (
                        <div className="h-14 w-14 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
                          <Building2 className="h-7 w-7 text-white" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 pt-1">
                        <h3 className="text-lg font-bold truncate">{workspace.name}</h3>
                        {workspace.companyName && (
                          <p className="text-sm text-muted-foreground truncate">{workspace.companyName}</p>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    {workspace.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-5">
                        {workspace.description}
                      </p>
                    )}

                    {/* Stats row */}
                    <div className="flex items-center gap-3 mb-5">
                      <div className="flex items-center gap-1.5 bg-primary/10 px-3 py-1.5 rounded-full">
                        <Users className="h-3.5 w-3.5 text-primary" />
                        <span className="text-sm font-semibold text-foreground">{pubCount}</span>
                        <span className="text-xs text-muted-foreground">publisher{pubCount !== 1 ? 's' : ''}</span>
                      </div>
                      {workspace.inviteEnabled && (
                        <div className="flex items-center gap-1.5 bg-success/10 px-3 py-1.5 rounded-full">
                          <Link2 className="h-3.5 w-3.5 text-success" />
                          <span className="text-xs text-success font-medium">Invite active</span>
                        </div>
                      )}
                    </div>

                    {/* Divider */}
                    <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent mb-5" />

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 gap-2 bg-primary text-white hover:bg-primary/90 rounded-lg h-9"
                        onClick={() => {
                          switchWorkspace(workspace.id);
                          navigate('/');
                        }}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Enter Workspace
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 w-9 p-0 rounded-lg hover:border-primary/30"
                        onClick={() => setEditingWorkspace(workspace)}
                        aria-label={`Settings for ${workspace.name}`}
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-9 w-9 p-0 rounded-lg transition-colors",
                          copiedId === workspace.id
                            ? "border-success/50 bg-success/10"
                            : "hover:border-primary/30"
                        )}
                        onClick={() => copyInviteLink(workspace)}
                        disabled={!workspace.inviteEnabled}
                        aria-label={`Copy invite link for ${workspace.name}`}
                      >
                        {copiedId === workspace.id ? (
                          <Check className="h-3.5 w-3.5 text-success" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Create New Card */}
            <button
              onClick={() => setShowCreateModal(true)}
              className="group border-2 border-dashed border-border rounded-2xl p-6 flex flex-col items-center justify-center gap-4 min-h-[280px] hover:border-primary/40 hover:bg-primary/[0.02] transition-all duration-300 cursor-pointer"
            >
              <div className="w-14 h-14 rounded-xl bg-secondary/80 group-hover:bg-primary/10 flex items-center justify-center transition-colors duration-300">
                <Plus className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors duration-300" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-muted-foreground group-hover:text-foreground transition-colors">New Workspace</p>
                <p className="text-xs text-muted-foreground mt-1">Add another team or brand</p>
              </div>
            </button>
          </div>
        )}
      </main>

      <CreateWorkspaceModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
      />

      {editingWorkspace && (
        <WorkspaceEditModal
          workspace={editingWorkspace}
          open={!!editingWorkspace}
          onOpenChange={(open) => !open && setEditingWorkspace(null)}
        />
      )}
    </div>
  );
}
