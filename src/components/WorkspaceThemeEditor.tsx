import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export interface WorkspaceTheme {
  primaryColor?: string;
  accentColor?: string;
  buttonBgColor?: string;
  buttonTextColor?: string;
  navButtonColor?: string;
}

interface WorkspaceThemeEditorProps {
  theme: WorkspaceTheme;
  onChange: (theme: WorkspaceTheme) => void;
}

const colorPresets = [
  { label: 'Violet', value: '#8B5CF6' },
  { label: 'Blue', value: '#3B82F6' },
  { label: 'Teal', value: '#14B8A6' },
  { label: 'Green', value: '#22C55E' },
  { label: 'Orange', value: '#F97316' },
  { label: 'Pink', value: '#EC4899' },
  { label: 'Red', value: '#EF4444' },
];

const buttonBgPresets = [
  { label: 'Gradient Purple', value: 'linear-gradient(135deg, #8B5CF6, #6366F1)' },
  { label: 'Gradient Blue', value: 'linear-gradient(135deg, #3B82F6, #06B6D4)' },
  { label: 'Gradient Orange', value: 'linear-gradient(135deg, #F97316, #EF4444)' },
  { label: 'Gradient Pink', value: 'linear-gradient(135deg, #EC4899, #8B5CF6)' },
  { label: 'Gradient Teal', value: 'linear-gradient(135deg, #14B8A6, #22C55E)' },
  { label: 'Solid Violet', value: '#8B5CF6' },
  { label: 'Solid Blue', value: '#3B82F6' },
];

const textColorPresets = [
  { label: 'White', value: '#FFFFFF' },
  { label: 'Cyan', value: '#06B6D4' },
  { label: 'Yellow', value: '#FACC15' },
  { label: 'Lime', value: '#84CC16' },
  { label: 'Pink', value: '#F472B6' },
  { label: 'Dark', value: '#1F2937' },
];

const navButtonPresets = [
  { label: 'Orange Fire', value: 'linear-gradient(135deg, #FF6B35, #E85D04)' },
  { label: 'Purple Glow', value: 'linear-gradient(135deg, #8B5CF6, #6366F1)' },
  { label: 'Blue Ocean', value: 'linear-gradient(135deg, #3B82F6, #06B6D4)' },
  { label: 'Pink Sunset', value: 'linear-gradient(135deg, #EC4899, #F97316)' },
  { label: 'Emerald', value: 'linear-gradient(135deg, #10B981, #22C55E)' },
  { label: 'Red Alert', value: 'linear-gradient(135deg, #EF4444, #DC2626)' },
  { label: 'Gold', value: 'linear-gradient(135deg, #F59E0B, #FACC15)' },
  { label: 'Dark', value: 'linear-gradient(135deg, #374151, #1F2937)' },
];

export function WorkspaceThemeEditor({ theme, onChange }: WorkspaceThemeEditorProps) {
  const handlePrimaryChange = (color: string) => {
    onChange({ ...theme, primaryColor: color });
  };

  const handleAccentChange = (color: string) => {
    onChange({ ...theme, accentColor: color });
  };

  const handleButtonBgChange = (value: string) => {
    onChange({ ...theme, buttonBgColor: value });
  };

  const handleButtonTextChange = (color: string) => {
    onChange({ ...theme, buttonTextColor: color });
  };

  const handleNavButtonChange = (value: string) => {
    onChange({ ...theme, navButtonColor: value });
  };

  const isValidHex = (color: string) => /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
  const isGradient = (value: string) => value?.startsWith('linear-gradient');

  const handleHexInput = (value: string, setter: (color: string) => void) => {
    let hex = value.trim();
    if (hex && !hex.startsWith('#')) {
      hex = '#' + hex;
    }
    if (isValidHex(hex) || hex === '' || hex === '#') {
      setter(hex);
    }
  };

  const currentButtonBg = theme.buttonBgColor || 'linear-gradient(135deg, #8B5CF6, #6366F1)';
  const currentButtonText = theme.buttonTextColor || '#FFFFFF';
  const currentNavButton = theme.navButtonColor || 'linear-gradient(135deg, #FF6B35, #E85D04)';

  return (
    <div className="space-y-6">
      {/* Primary Color */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Primary Color</Label>
        <div className="flex items-center gap-2">
          <Input
            type="color"
            value={theme.primaryColor || '#8B5CF6'}
            onChange={(e) => handlePrimaryChange(e.target.value)}
            className="h-10 w-10 p-1 cursor-pointer border-0 rounded-lg"
          />
          <Input
            type="text"
            value={theme.primaryColor || '#8B5CF6'}
            onChange={(e) => handleHexInput(e.target.value, handlePrimaryChange)}
            placeholder="#8B5CF6"
            className="w-24 font-mono text-sm"
          />
          <div className="flex gap-1.5 flex-wrap flex-1">
            {colorPresets.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => handlePrimaryChange(preset.value)}
                className="h-7 w-7 rounded-lg border-2 border-transparent hover:border-white/50 hover:scale-110 transition-all shadow-sm"
                style={{ backgroundColor: preset.value }}
                title={preset.label}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Accent Color */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Accent Color</Label>
        <div className="flex items-center gap-2">
          <Input
            type="color"
            value={theme.accentColor || '#5DA9FF'}
            onChange={(e) => handleAccentChange(e.target.value)}
            className="h-10 w-10 p-1 cursor-pointer border-0 rounded-lg"
          />
          <Input
            type="text"
            value={theme.accentColor || '#5DA9FF'}
            onChange={(e) => handleHexInput(e.target.value, handleAccentChange)}
            placeholder="#5DA9FF"
            className="w-24 font-mono text-sm"
          />
          <div className="flex gap-1.5 flex-wrap flex-1">
            {colorPresets.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => handleAccentChange(preset.value)}
                className="h-7 w-7 rounded-lg border-2 border-transparent hover:border-white/50 hover:scale-110 transition-all shadow-sm"
                style={{ backgroundColor: preset.value }}
                title={preset.label}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Button Background */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Button Background</Label>
        <div className="grid grid-cols-4 gap-2">
          {buttonBgPresets.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => handleButtonBgChange(preset.value)}
              className={`h-10 rounded-lg border-2 transition-all hover:scale-105 ${
                currentButtonBg === preset.value 
                  ? 'border-white shadow-lg ring-2 ring-white/30' 
                  : 'border-transparent hover:border-white/30'
              }`}
              style={{ background: preset.value }}
              title={preset.label}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="color"
            value={isGradient(currentButtonBg) ? '#8B5CF6' : currentButtonBg}
            onChange={(e) => handleButtonBgChange(e.target.value)}
            className="h-10 w-10 p-1 cursor-pointer border-0 rounded-lg"
          />
          <Input
            type="text"
            value={isGradient(currentButtonBg) ? '' : currentButtonBg}
            onChange={(e) => handleHexInput(e.target.value, handleButtonBgChange)}
            placeholder="Custom #hex"
            className="w-32 font-mono text-sm"
          />
        </div>
      </div>

      {/* Button Text Color */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Button Text Color</Label>
        <div className="flex gap-2 flex-wrap">
          {textColorPresets.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => handleButtonTextChange(preset.value)}
              className={`h-9 px-4 rounded-lg border-2 text-xs font-semibold transition-all hover:scale-105 ${
                currentButtonText === preset.value 
                  ? 'border-white shadow-lg ring-2 ring-white/30' 
                  : 'border-border/50 hover:border-white/30'
              }`}
              style={{ 
                backgroundColor: preset.value === '#1F2937' ? '#1F2937' : 'transparent',
                color: preset.value,
                textShadow: preset.value === '#FFFFFF' ? '0 0 4px rgba(0,0,0,0.5)' : 'none'
              }}
              title={preset.label}
            >
              Aa
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="color"
            value={currentButtonText}
            onChange={(e) => handleButtonTextChange(e.target.value)}
            className="h-10 w-10 p-1 cursor-pointer border-0 rounded-lg"
          />
          <Input
            type="text"
            value={currentButtonText}
            onChange={(e) => handleHexInput(e.target.value, handleButtonTextChange)}
            placeholder="#FFFFFF"
            className="w-24 font-mono text-sm"
          />
        </div>
      </div>

      {/* Navigation Button Color */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Top Bar Navigation (Active Tab)</Label>
        <p className="text-xs text-muted-foreground">Color for active navigation tabs in the header</p>
        <div className="grid grid-cols-4 gap-2">
          {navButtonPresets.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => handleNavButtonChange(preset.value)}
              className={`h-10 rounded-lg border-2 transition-all hover:scale-105 ${
                currentNavButton === preset.value 
                  ? 'border-white shadow-lg ring-2 ring-white/30' 
                  : 'border-transparent hover:border-white/30'
              }`}
              style={{ background: preset.value }}
              title={preset.label}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="color"
            value={isGradient(currentNavButton) ? '#FF6B35' : currentNavButton}
            onChange={(e) => handleNavButtonChange(e.target.value)}
            className="h-10 w-10 p-1 cursor-pointer border-0 rounded-lg"
          />
          <Input
            type="text"
            value={isGradient(currentNavButton) ? '' : currentNavButton}
            onChange={(e) => handleHexInput(e.target.value, handleNavButtonChange)}
            placeholder="Custom #hex"
            className="w-32 font-mono text-sm"
          />
        </div>
      </div>

      {/* Live Preview */}
      <div className="p-5 rounded-xl border border-border/50 bg-gradient-to-br from-background to-secondary/30 space-y-4">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Live Preview</p>
        
        {/* Nav Preview */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Navigation Bar</p>
          <div className="flex items-center gap-1 bg-secondary/50 p-1.5 rounded-xl w-fit">
            <button
              type="button"
              className="px-4 py-2 rounded-lg text-sm font-medium text-white shadow-lg"
              style={{ 
                background: currentNavButton,
                boxShadow: `0 4px 20px ${isGradient(currentNavButton) ? 'rgba(255, 107, 53, 0.5)' : currentNavButton}40`
              }}
            >
              Active
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground"
            >
              Inactive
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <div 
              className="h-10 w-10 rounded-lg shadow-md"
              style={{ backgroundColor: theme.primaryColor || '#8B5CF6' }}
            />
            <div 
              className="h-10 w-10 rounded-lg shadow-md"
              style={{ backgroundColor: theme.accentColor || '#5DA9FF' }}
            />
          </div>
          <div 
            className="h-10 flex-1 rounded-lg shadow-md"
            style={{ 
              background: `linear-gradient(135deg, ${theme.primaryColor || '#8B5CF6'} 0%, ${theme.accentColor || '#5DA9FF'} 100%)` 
            }}
          />
        </div>

        <div className="flex gap-3">
          <Button
            type="button"
            className="flex-1 h-11 font-semibold shadow-lg transition-all hover:scale-[1.02]"
            style={{ 
              background: currentButtonBg,
              color: currentButtonText,
            }}
          >
            Primary Action
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-11 font-semibold"
            style={{ 
              borderColor: theme.primaryColor || '#8B5CF6',
              color: theme.primaryColor || '#8B5CF6',
            }}
          >
            Secondary
          </Button>
        </div>
      </div>
    </div>
  );
}
