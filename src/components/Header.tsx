import { Flame, LogOut, LogIn, FileText, LayoutDashboard, BarChart3, Building2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useDocuments } from '@/hooks/useDocuments';
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher';
import { useWorkspace } from '@/hooks/useWorkspace';

interface WorkspaceTheme {
  primaryColor?: string;
  accentColor?: string;
}

export function Header() {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { documents } = useDocuments();
  const { currentWorkspace } = useWorkspace();

  const theme = currentWorkspace?.theme as WorkspaceTheme | undefined;
  const primaryColor = theme?.primaryColor || '#7C3AED';

  const documentsInReview = documents?.filter(doc => doc.status === 'in_review').length || 0;

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const navItems = [
    { path: '/', label: 'Posts', icon: LayoutDashboard, badge: 0 },
    { path: '/analytics', label: 'Analytics', icon: BarChart3, badge: 0 },
    { path: '/documents', label: 'Documents', icon: FileText, badge: documentsInReview },
    ...(isAdmin ? [{ path: '/admin', label: 'Admin', icon: Flame, badge: 0 }] : []),
  ];

  return (
    <header
      className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/30"
      style={{ boxShadow: '0 1px 0 hsl(var(--border) / 0.3)' }}
    >
      <a href="#main-content" className="skip-to-content">Skip to content</a>

      <div className="px-5 h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div
            className="flex items-center gap-2.5 cursor-pointer group"
            onClick={() => navigate('/')}
          >
            {currentWorkspace?.logoUrl ? (
              <img
                src={currentWorkspace.logoUrl}
                alt={currentWorkspace.name || 'Workspace'}
                className="h-10 w-auto max-w-[160px] object-contain transition-transform group-hover:scale-105"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <>
                <div
                  className="h-8 w-8 rounded-lg flex items-center justify-center transition-all group-hover:scale-105"
                  style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--warm)))' }}
                >
                  <Building2 className="h-4 w-4 text-white" />
                </div>
                <span className="text-base font-display font-extrabold tracking-tight hidden sm:block">
                  ThoughtOS
                </span>
              </>
            )}
          </div>

          {/* Workspace Switcher */}
          {user && <WorkspaceSwitcher />}

          {/* Navigation */}
          <nav aria-label="Main navigation" className="flex items-center gap-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path ||
                               (item.path !== '/' && location.pathname.startsWith(item.path));
              const hasNotification = item.badge > 0;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 relative",
                    isActive
                      ? "bg-foreground/10 text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
                    hasNotification && !isActive && "text-primary"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                  {hasNotification && (
                    <span className="h-4 w-4 text-white text-[10px] font-bold rounded-full bg-warm flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin && (
            <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-warm/10 text-warm font-semibold">
              <Flame className="h-3 w-3" />
              Admin
            </div>
          )}

          {user ? (
            <div className="flex items-center gap-2 bg-foreground/5 rounded-full pl-1 pr-2.5 py-0.5">
              <div className="h-6 w-6 rounded-full bg-gradient-to-br from-primary/80 to-warm/80 flex items-center justify-center">
                <span className="text-[10px] font-bold text-white">{user.email?.charAt(0).toUpperCase()}</span>
              </div>
              <span className="text-xs text-muted-foreground max-w-28 truncate">{user.email}</span>
              <button
                onClick={handleSignOut}
                className="h-6 w-6 rounded-full hover:bg-foreground/10 flex items-center justify-center transition-colors"
              >
                <LogOut className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/auth')}
              className="gap-2 text-muted-foreground hover:text-foreground hover:bg-secondary"
            >
              <LogIn className="h-4 w-4" />
              Admin Login
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
