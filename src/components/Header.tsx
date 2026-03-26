import { Flame, LogOut, LogIn, User, FileText, LayoutDashboard, BarChart3, Building2 } from 'lucide-react';
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
      className="sticky top-0 z-50 bg-card/80 backdrop-blur-xl border-b border-border/50"
      style={{
        boxShadow: `0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.02)`
      }}
    >
      <a href="#main-content" className="skip-to-content">Skip to content</a>

      <div className="px-8 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div
              className="flex items-center gap-3 cursor-pointer group"
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
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center transition-all group-hover:scale-105 ring-1 ring-primary/20"
                  style={{
                    background: `linear-gradient(135deg, ${primaryColor} 0%, #06B6D4 100%)`,
                    boxShadow: `0 4px 16px ${primaryColor}40`
                  }}
                >
                  <Building2 className="h-5 w-5 text-white" />
                </div>
              )}
            </div>

            {/* Workspace Switcher */}
            {user && <WorkspaceSwitcher />}

            {/* Navigation */}
            <nav aria-label="Main navigation" className="flex items-center gap-2 bg-secondary/50 p-1.5 rounded-xl">
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
                      "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 relative nav-button",
                      "active:scale-[0.95]",
                      isActive
                        ? "text-white shadow-lg scale-[1.02]"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                      hasNotification && !isActive && "text-primary"
                    )}
                    style={isActive ? {
                      background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))',
                      boxShadow: `0 4px 20px hsl(var(--primary) / 0.3), 0 2px 8px rgba(0, 0, 0, 0.15)`,
                    } : undefined}
                  >
                    <Icon className={cn("h-4 w-4", isActive && "drop-shadow-sm")} />
                    <span>{item.label}</span>
                    {hasNotification && (
                      <span
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-md"
                        style={{
                          backgroundColor: '#10B981',
                          boxShadow: '0 2px 8px rgba(16, 185, 129, 0.5)'
                        }}
                      >
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
              <div
                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full"
                style={{
                  background: `${primaryColor}15`,
                  color: primaryColor
                }}
              >
                <Flame className="h-3.5 w-3.5" />
                <span className="font-medium">Admin</span>
              </div>
            )}

            {user ? (
              <div className="flex items-center gap-2 bg-secondary/50 rounded-full px-3 py-1.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                  <span className="max-w-32 truncate">{user.email}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSignOut}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-secondary"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
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
      </div>
    </header>
  );
}
