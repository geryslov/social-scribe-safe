import { Flame, LogOut, LogIn, User, FileText, LayoutDashboard } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { useNavigate, useLocation } from 'react-router-dom';
import membraneLogo from '@/assets/membrane-logo.jpg';
import { cn } from '@/lib/utils';

export function Header() {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const navItems = [
    { path: '/', label: 'Posts', icon: LayoutDashboard },
    { path: '/documents', label: 'Documents', icon: FileText },
  ];

  return (
    <header className="bg-[hsl(234_40%_10%)] border-b border-white/10 sticky top-0 z-50">
      <div className="px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
              <img 
                src={membraneLogo} 
                alt="Membrane" 
                className="h-12 w-auto rounded"
              />
            </div>

            {/* Navigation */}
            <nav className="flex items-center gap-1">
              {navItems.map(item => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path || 
                                 (item.path !== '/' && location.pathname.startsWith(item.path));
                return (
                  <Button
                    key={item.path}
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(item.path)}
                    className={cn(
                      "gap-2 transition-all text-white/70 hover:text-white hover:bg-white/10",
                      isActive && "bg-primary text-white hover:bg-primary/90"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                );
              })}
            </nav>
          </div>
          
          <div className="flex items-center gap-3">
            {isAdmin && (
              <div className="flex items-center gap-2 text-xs text-white/80 bg-white/10 px-3 py-1.5 rounded-full">
                <Flame className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium">Admin</span>
              </div>
            )}
            
            {user ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-xs text-white/60">
                  <User className="h-3.5 w-3.5" />
                  <span className="max-w-32 truncate">{user.email}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSignOut}
                  className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/auth')}
                className="gap-2 text-white/70 hover:text-white hover:bg-white/10"
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
