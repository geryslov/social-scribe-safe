import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  FileText, BarChart3, FolderKanban, Sparkles, MessageSquareHeart,
  ShieldCheck, HelpCircle, PanelLeftClose, PanelLeftOpen,
  Search, Bell, ChevronDown, Check,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type NavItemDef = { to: string; icon: any; label: string; match: (path: string) => boolean };

const NAV: NavItemDef[] = [
  { to: '/', icon: FileText, label: 'Posts', match: (p) => p === '/' || p.startsWith('/publisher') },
  { to: '/analytics', icon: BarChart3, label: 'Analytics', match: (p) => p.startsWith('/analytics') },
  { to: '/documents', icon: FolderKanban, label: 'Documents', match: (p) => p.startsWith('/documents') },
  { to: '/intelligence', icon: Sparkles, label: 'Intelligence', match: (p) => p.startsWith('/intelligence') },
  { to: '/engagement', icon: MessageSquareHeart, label: 'Engage', match: (p) => p.startsWith('/engagement') },
];

const CRUMBS: { pattern: RegExp; crumbs: { label: string; to?: string }[] }[] = [
  { pattern: /^\/$/, crumbs: [{ label: 'Posts' }] },
  { pattern: /^\/analytics/, crumbs: [{ label: 'Analytics' }] },
  { pattern: /^\/documents\/[^/]+/, crumbs: [{ label: 'Documents', to: '/documents' }, { label: 'Editor' }] },
  { pattern: /^\/documents/, crumbs: [{ label: 'Documents' }] },
  { pattern: /^\/intelligence/, crumbs: [{ label: 'Intelligence' }] },
  { pattern: /^\/engagement/, crumbs: [{ label: 'Engage', to: '/engagement' }, { label: 'Activity' }] },
  { pattern: /^\/admin/, crumbs: [{ label: 'Admin' }] },
  { pattern: /^\/publisher/, crumbs: [{ label: 'Posts', to: '/' }, { label: 'Publisher' }] },
];

function getCrumbs(pathname: string) {
  const match = CRUMBS.find((c) => c.pattern.test(pathname));
  return match?.crumbs ?? [{ label: 'ThoughtOS' }];
}

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="min-h-screen w-full flex bg-[#F7F8FB] text-[#171923] font-sans antialiased">
      <SideNav collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar />
        <main id="main-content" className="flex-1 min-w-0 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SideNav({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { isAdmin } = useAuth();
  const { pathname } = useLocation();
  const width = collapsed ? 64 : 248;

  return (
    <aside
      style={{ width }}
      className="hidden md:flex flex-col flex-shrink-0 bg-white border-r border-[#E5E7ED] transition-[width] duration-200 sticky top-0 h-screen z-20"
      aria-label="Primary navigation"
    >
      <div className="h-16 flex items-center px-4 border-b border-[#E5E7ED]">
        <WorkspaceSelector collapsed={collapsed} />
      </div>

      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto" aria-label="Main">
        {NAV.map((it) => (
          <NavItem
            key={it.to}
            to={it.to}
            icon={it.icon}
            label={it.label}
            active={it.match(pathname)}
            collapsed={collapsed}
          />
        ))}
      </nav>

      <div className="border-t border-[#E5E7ED] py-3 px-2 space-y-0.5">
        {isAdmin && (
          <NavItem
            to="/admin"
            icon={ShieldCheck}
            label="Admin"
            active={pathname.startsWith('/admin')}
            collapsed={collapsed}
          />
        )}
        <NavItem to="#" icon={HelpCircle} label="Help" collapsed={collapsed} />
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          className="w-full flex items-center gap-3 px-3 h-9 rounded-lg text-[#667085] hover:text-[#171923] hover:bg-[#F7F8FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40 transition-colors"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed && <span className="text-sm">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

function NavItem({
  to, icon: Icon, label, active, collapsed,
}: { to: string; icon: any; label: string; active?: boolean; collapsed: boolean }) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        'flex items-center gap-3 px-3 h-9 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40',
        active
          ? 'bg-[#F4F0FF] text-[#7C3AED] font-medium'
          : 'text-[#3F4657] hover:bg-[#F7F8FB] hover:text-[#171923]',
      )}
    >
      <Icon className={cn('h-4 w-4 flex-shrink-0', active && 'text-[#7C3AED]')} />
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#7C3AED]" />}
    </Link>
  );
}

function WorkspaceSelector({ collapsed }: { collapsed: boolean }) {
  const { currentWorkspace, setCurrentWorkspace } = useWorkspace();
  const { workspaces } = useWorkspaces();
  const initials = (currentWorkspace?.name || 'W')
    .split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex items-center gap-2.5 rounded-lg hover:bg-[#F7F8FB] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40 w-full h-10 px-2',
          collapsed && 'justify-center px-0',
        )}
        aria-label="Switch workspace"
      >
        {currentWorkspace?.logoUrl ? (
          <img
            src={currentWorkspace.logoUrl}
            alt={currentWorkspace.name}
            className="h-8 w-8 rounded-lg object-cover flex-shrink-0 border border-[#E5E7ED] bg-white"
          />
        ) : (
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#7C3AED] to-[#5B21B6] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
            {initials}
          </div>
        )}
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-sm font-semibold truncate">{currentWorkspace?.name || 'Workspace'}</div>
              <div className="text-[11px] text-[#667085] truncate">Workspace</div>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-[#667085]" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-[#667085]">
          Workspaces
        </DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.id} onClick={() => setCurrentWorkspace(w)} className="gap-2">
            {w.logoUrl ? (
              <img src={w.logoUrl} alt="" className="h-5 w-5 rounded object-cover flex-shrink-0 border border-[#E5E7ED]" />
            ) : (
              <div className="h-5 w-5 rounded bg-gradient-to-br from-[#7C3AED] to-[#5B21B6] flex-shrink-0" />
            )}
            <span className="flex-1 truncate">{w.name}</span>
            {w.id === currentWorkspace?.id && <Check className="h-3.5 w-3.5 text-[#7C3AED]" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TopBar() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const crumbs = getCrumbs(pathname);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const initials = (user?.email || '?').slice(0, 2).toUpperCase();

  return (
    <header className="h-16 bg-white border-b border-[#E5E7ED] flex items-center px-6 gap-4 sticky top-0 z-10">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm min-w-0">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-2 min-w-0">
            {c.to ? (
              <Link to={c.to} className="text-[#667085] hover:text-[#171923] transition-colors truncate">
                {c.label}
              </Link>
            ) : (
              <span className="text-[#171923] font-medium truncate">{c.label}</span>
            )}
            {i < crumbs.length - 1 && <span className="text-[#CFD2DA]">/</span>}
          </span>
        ))}
      </nav>

      <div className="flex-1" />

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="hidden md:flex items-center gap-2 h-9 px-3 w-[280px] rounded-lg border border-[#E5E7ED] bg-[#F7F8FB] hover:bg-white hover:border-[#CFD2DA] text-[#667085] text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40"
        aria-label="Open global search"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search</span>
        <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 h-5 rounded border border-[#E5E7ED] bg-white text-[10px] font-mono text-[#667085]">⌘K</kbd>
      </button>

      <button
        type="button"
        aria-label="Notifications"
        className="h-9 w-9 rounded-lg border border-[#E5E7ED] bg-white hover:bg-[#F7F8FB] text-[#667085] hover:text-[#171923] flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40"
      >
        <Bell className="h-4 w-4" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="User menu"
          className="h-9 w-9 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#5B21B6] text-white text-xs font-bold flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40"
        >
          {initials}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => supabase.auth.signOut()}>Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {searchOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#171923]/40 flex items-start justify-center pt-24"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="w-[560px] rounded-[14px] border border-[#E5E7ED] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 h-12 border-b border-[#E5E7ED]">
              <Search className="h-4 w-4 text-[#667085]" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search profiles, posts, comments…"
                className="flex-1 bg-transparent outline-none text-sm"
                aria-label="Search"
              />
              <kbd className="text-[10px] font-mono text-[#667085]">ESC</kbd>
            </div>
            <div className="p-4 text-sm text-[#667085]">Start typing to search.</div>
          </div>
        </div>
      )}
    </header>
  );
}
