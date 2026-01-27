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
          className="gap-2 text-[#C7C9E3] hover:text-white hover:bg-white/10"
        >
          {currentWorkspace?.logoUrl ? (
            <img 
              src={currentWorkspace.logoUrl} 
              alt={currentWorkspace.name}
              className="h-5 w-5 rounded object-cover"
            />
          ) : (
            <Building2 className="h-4 w-4" />
          )}
          <span className="max-w-32 truncate">{currentWorkspace?.name || 'Select Workspace'}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="start" 
        className="w-56"
        style={{
          background: 'rgba(27, 23, 96, 0.95)',
          borderColor: 'rgba(255, 255, 255, 0.1)',
        }}
      >
        {workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            onClick={() => switchWorkspace(workspace.id)}
            className="gap-2 text-[#C7C9E3] hover:text-white hover:bg-white/10 cursor-pointer"
          >
            {workspace.logoUrl ? (
              <img 
                src={workspace.logoUrl} 
                alt={workspace.name}
                className="h-5 w-5 rounded object-cover"
              />
            ) : workspace.isTestWorkspace ? (
              <FlaskConical className="h-4 w-4 text-yellow-400" />
            ) : (
              <Building2 className="h-4 w-4" />
            )}
            <span className="flex-1 truncate">{workspace.name}</span>
            {currentWorkspace?.id === workspace.id && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
        
        {isAdmin && (
          <>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem
              onClick={() => navigate('/admin')}
              className="gap-2 text-[#C7C9E3] hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <Settings className="h-4 w-4" />
              Manage Workspaces
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
