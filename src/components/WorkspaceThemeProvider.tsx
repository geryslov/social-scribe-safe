import { useEffect } from 'react';
import { useWorkspace } from '@/hooks/useWorkspace';

interface WorkspaceTheme {
  primaryColor?: string;
  accentColor?: string;
}

// Convert hex to HSL values for CSS variables
function hexToHSL(hex: string): string {
  // Remove # if present
  hex = hex.replace('#', '');
  
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function WorkspaceThemeProvider({ children }: { children: React.ReactNode }) {
  const { currentWorkspace } = useWorkspace();

  useEffect(() => {
    const root = document.documentElement;
    const theme = currentWorkspace?.theme as WorkspaceTheme | undefined;

    if (theme?.primaryColor) {
      const primaryHSL = hexToHSL(theme.primaryColor);
      // Create lighter/darker variants for better visibility
      const hslParts = primaryHSL.split(' ');
      const h = hslParts[0];
      const s = hslParts[1];
      const l = parseInt(hslParts[2]);
      
      // Create variants with good contrast
      const primaryLight = `${h} ${s} ${Math.min(l + 15, 85)}%`;
      const primaryDark = `${h} ${s} ${Math.max(l - 15, 25)}%`;
      const primaryMuted = `${h} ${parseInt(s) * 0.6}% ${l}%`;
      
      root.style.setProperty('--workspace-primary', theme.primaryColor);
      root.style.setProperty('--workspace-primary-hsl', primaryHSL);
      root.style.setProperty('--workspace-primary-light', primaryLight);
      root.style.setProperty('--workspace-primary-dark', primaryDark);
      root.style.setProperty('--workspace-primary-muted', primaryMuted);
      
      // Update all primary-related CSS variables
      root.style.setProperty('--primary', primaryHSL);
      root.style.setProperty('--accent', primaryHSL);
      root.style.setProperty('--ring', primaryHSL);
      root.style.setProperty('--sidebar-primary', primaryHSL);
      root.style.setProperty('--sidebar-ring', primaryHSL);
      
      // Card and border styling with workspace color
      root.style.setProperty('--card-accent', `${h} ${s} ${Math.max(l - 45, 10)}%`);
      root.style.setProperty('--border-accent', `${h} ${parseInt(s) * 0.5}% ${Math.min(l + 5, 50)}%`);
      
      // Update scrollbar and glow effects via CSS
      root.style.setProperty('--glow-color', theme.primaryColor);
    } else {
      // Reset to default Electric Violet
      root.style.setProperty('--workspace-primary', '#8B5CF6');
      root.style.setProperty('--workspace-primary-hsl', '262 83% 66%');
      root.style.setProperty('--workspace-primary-light', '262 83% 81%');
      root.style.setProperty('--workspace-primary-dark', '262 83% 51%');
      root.style.setProperty('--workspace-primary-muted', '262 50% 66%');
      root.style.setProperty('--primary', '262 83% 66%');
      root.style.setProperty('--accent', '262 83% 66%');
      root.style.setProperty('--ring', '262 83% 66%');
      root.style.setProperty('--sidebar-primary', '262 83% 66%');
      root.style.setProperty('--sidebar-ring', '262 83% 66%');
      root.style.setProperty('--card-accent', '262 83% 21%');
      root.style.setProperty('--border-accent', '262 42% 71%');
      root.style.setProperty('--glow-color', '#8B5CF6');
    }

    if (theme?.accentColor) {
      const accentHSL = hexToHSL(theme.accentColor);
      root.style.setProperty('--workspace-accent', theme.accentColor);
      root.style.setProperty('--workspace-accent-hsl', accentHSL);
      root.style.setProperty('--info', accentHSL);
    } else {
      // Reset to default Cool Blue
      root.style.setProperty('--workspace-accent', '#5DA9FF');
      root.style.setProperty('--workspace-accent-hsl', '212 100% 68%');
      root.style.setProperty('--info', '212 100% 68%');
    }
  }, [currentWorkspace]);

  return <>{children}</>;
}
