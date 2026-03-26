import { useWorkspace } from '@/hooks/useWorkspace';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Building2, ChevronDown, Check, Settings, FlaskConical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function WorkspaceSwitcher() {
  const { currentWorkspace, workspaces, switchWorkspace } = useWorkspace();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  if (workspaces.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground hover:bg-primary/5 border border-transparent hover:border-primary/20 transition-all"
        >
          <Building2 className="h-4 w-4" />
          <span className="max-w-32 truncate font-medium">{currentWorkspace?.name || 'Select Workspace'}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="start" 
        className="w-56 bg-card border-border shadow-lg"
      >
        {workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            onClick={() => switchWorkspace(workspace.id)}
            className="gap-2 text-foreground hover:bg-secondary cursor-pointer"
          >
            {workspace.isTestWorkspace ? (
              <FlaskConical className="h-4 w-4 text-warning" />
            ) : (
              <div className="h-5 w-5 rounded gradient-bg flex items-center justify-center flex-shrink-0">
                <Building2 className="h-3 w-3 text-white" />
              </div>
            )}
            <span className="flex-1 truncate">{workspace.name}</span>
            {currentWorkspace?.id === workspace.id && (
              <div className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
            )}
          </DropdownMenuItem>
        ))}
        
        {isAdmin && (
          <>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onClick={() => navigate('/admin')}
              className="gap-2 text-foreground hover:bg-secondary cursor-pointer"
            >
              <Settings className="h-4 w-4 text-muted-foreground" />
              Manage Workspaces
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
