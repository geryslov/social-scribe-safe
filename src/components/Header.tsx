import { Flame, LogOut, LogIn, User, FileText, LayoutDashboard, BarChart3 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { useNavigate, useLocation } from 'react-router-dom';
import wisorLogo from '@/assets/wisor-logo.svg';
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
  const primaryColor = theme?.primaryColor || '#8B5CF6';

  const documentsInReview = documents?.filter(doc => doc.status === 'in_review').length || 0;

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const navItems = [
    { path: '/', label: 'Analytics', icon: BarChart3, badge: 0 },
    { path: '/posts', label: 'Posts', icon: LayoutDashboard, badge: 0 },
    { path: '/documents', label: 'Documents', icon: FileText, badge: documentsInReview },
    ...(isAdmin ? [{ path: '/admin', label: 'Admin', icon: Flame, badge: 0 }] : []),
  ];

  return (
    <header 
      className="sticky top-0 z-50 backdrop-blur-xl"
      style={{
        background: 'rgba(27, 23, 96, 0.85)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
      }}
    >
      <div className="px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
              <img 
                src={wisorLogo} 
                alt="Wisor" 
                className="h-8 w-auto"
              />
            </div>

            {/* Workspace Switcher */}
            {user && <WorkspaceSwitcher />}

            {/* Navigation */}
            <nav className="flex items-center gap-1">
              {navItems.map(item => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path || 
                                 (item.path !== '/' && location.pathname.startsWith(item.path));
                const hasNotification = item.badge > 0;
                return (
                  <Button
                    key={item.path}
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(item.path)}
                    className={cn(
                      "gap-2 transition-all relative text-[#C7C9E3] hover:text-white hover:bg-white/10",
                      isActive && "text-white",
                      hasNotification && !isActive && "text-[#6EE7B7]"
                    )}
                    style={isActive ? { 
                      backgroundColor: `${primaryColor}33`,
                    } : undefined}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                    {hasNotification && (
                      <span className="absolute -top-1 -right-1 h-5 w-5 bg-[#6EE7B7] text-[#0E0B2C] text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
                        {item.badge}
                      </span>
                    )}
                  </Button>
                );
              })}
            </nav>
          </div>
          
          <div className="flex items-center gap-3">
            {isAdmin && (
              <div 
                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full"
                style={{
                  background: `${primaryColor}26`,
                  border: `1px solid ${primaryColor}4D`
                }}
              >
                <Flame className="h-3.5 w-3.5" style={{ color: primaryColor }} />
                <span className="font-medium text-white">Admin</span>
              </div>
            )}
            
            {user ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-xs text-[#C7C9E3]">
                  <User className="h-3.5 w-3.5" />
                  <span className="max-w-32 truncate">{user.email}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSignOut}
                  className="h-8 w-8 text-[#C7C9E3] hover:text-white hover:bg-white/10"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/auth')}
                className="gap-2 text-[#C7C9E3] hover:text-white hover:bg-white/10"
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