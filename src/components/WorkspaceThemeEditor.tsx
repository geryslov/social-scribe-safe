import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export interface WorkspaceTheme {
  primaryColor?: string;
  accentColor?: string;
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

export function WorkspaceThemeEditor({ theme, onChange }: WorkspaceThemeEditorProps) {
  const handlePrimaryChange = (color: string) => {
    onChange({ ...theme, primaryColor: color });
  };

  const handleAccentChange = (color: string) => {
    onChange({ ...theme, accentColor: color });
  };

  const isValidHex = (color: string) => /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);

  const handleHexInput = (value: string, setter: (color: string) => void) => {
    // Auto-add # if missing
    let hex = value.trim();
    if (hex && !hex.startsWith('#')) {
      hex = '#' + hex;
    }
    if (isValidHex(hex) || hex === '' || hex === '#') {
      setter(hex);
    }
  };

  return (
    <div className="space-y-4">
      {/* Primary Color */}
      <div className="space-y-2">
        <Label>Primary Color</Label>
        <div className="flex items-center gap-2">
          <Input
            type="color"
            value={theme.primaryColor || '#8B5CF6'}
            onChange={(e) => handlePrimaryChange(e.target.value)}
            className="h-10 w-10 p-1 cursor-pointer border-0"
          />
          <Input
            type="text"
            value={theme.primaryColor || '#8B5CF6'}
            onChange={(e) => handleHexInput(e.target.value, handlePrimaryChange)}
            placeholder="#8B5CF6"
            className="w-24 font-mono text-sm"
          />
          <div className="flex gap-1 flex-wrap flex-1">
            {colorPresets.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => handlePrimaryChange(preset.value)}
                className="h-6 w-6 rounded-full border border-border/50 hover:scale-110 transition-transform"
                style={{ backgroundColor: preset.value }}
                title={preset.label}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Accent Color */}
      <div className="space-y-2">
        <Label>Accent Color</Label>
        <div className="flex items-center gap-2">
          <Input
            type="color"
            value={theme.accentColor || '#5DA9FF'}
            onChange={(e) => handleAccentChange(e.target.value)}
            className="h-10 w-10 p-1 cursor-pointer border-0"
          />
          <Input
            type="text"
            value={theme.accentColor || '#5DA9FF'}
            onChange={(e) => handleHexInput(e.target.value, handleAccentChange)}
            placeholder="#5DA9FF"
            className="w-24 font-mono text-sm"
          />
          <div className="flex gap-1 flex-wrap flex-1">
            {colorPresets.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => handleAccentChange(preset.value)}
                className="h-6 w-6 rounded-full border border-border/50 hover:scale-110 transition-transform"
                style={{ backgroundColor: preset.value }}
                title={preset.label}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="p-4 rounded-lg border border-border/50 bg-background/50">
        <p className="text-xs text-muted-foreground mb-2">Preview</p>
        <div className="flex items-center gap-3">
          <div 
            className="h-8 w-8 rounded-md"
            style={{ backgroundColor: theme.primaryColor || '#8B5CF6' }}
          />
          <div 
            className="h-8 w-8 rounded-md"
            style={{ backgroundColor: theme.accentColor || '#5DA9FF' }}
          />
          <div 
            className="h-8 flex-1 rounded-md"
            style={{ 
              background: `linear-gradient(135deg, ${theme.primaryColor || '#8B5CF6'} 0%, ${theme.accentColor || '#5DA9FF'} 100%)` 
            }}
          />
        </div>
      </div>
    </div>
  );
}
