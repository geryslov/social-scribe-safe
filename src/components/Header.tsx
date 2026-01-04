import { Flame, LogOut, LogIn, User, FileText, LayoutDashboard } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { useNavigate, useLocation } from 'react-router-dom';
import membraneLogo from '@/assets/membrane-logo.jpg';
import { cn } from '@/lib/utils';
import { useDocuments } from '@/hooks/useDocuments';

export function Header() {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { documents } = useDocuments();

  const documentsInReview = documents?.filter(doc => doc.status === 'in_review').length || 0;

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const navItems = [
    { path: '/', label: 'Posts', icon: LayoutDashboard, badge: 0 },
    { path: '/documents', label: 'Documents', icon: FileText, badge: documentsInReview },
  ];

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-50">
      <div className="px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
              <img 
                src={membraneLogo} 
                alt="Membrane" 
                className="h-12 w-auto"
              />
            </div>

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
                      "gap-2 transition-all relative",
                      isActive && "bg-primary/10 text-primary",
                      hasNotification && !isActive && "text-yellow-600"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                    {hasNotification && (
                      <span className="absolute -top-1 -right-1 h-5 w-5 bg-yellow-500 text-yellow-950 text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
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
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 px-3 py-1.5 rounded-full">
                <Flame className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium">Admin</span>
              </div>
            )}
            
            {user ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                  <span className="max-w-32 truncate">{user.email}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSignOut}
                  className="h-8 w-8"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/auth')}
                className="gap-2"
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
