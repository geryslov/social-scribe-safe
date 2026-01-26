import { FileText, Image, Video, Link2, FileIcon } from 'lucide-react';
import { PostType } from '@/types/post';
import { cn } from '@/lib/utils';

interface PostTypeBadgeProps {
  type: PostType | null | undefined;
  className?: string;
}

const typeConfig: Record<PostType, { icon: typeof FileText; label: string; color: string }> = {
  text: { icon: FileText, label: 'Text', color: 'text-muted-foreground bg-muted' },
  image: { icon: Image, label: 'Image', color: 'text-blue-400 bg-blue-500/10' },
  video: { icon: Video, label: 'Video', color: 'text-purple-400 bg-purple-500/10' },
  link: { icon: Link2, label: 'Link', color: 'text-green-400 bg-green-500/10' },
  document: { icon: FileIcon, label: 'Doc', color: 'text-orange-400 bg-orange-500/10' },
};

export function PostTypeBadge({ type, className }: PostTypeBadgeProps) {
  if (!type) return null;

  const config = typeConfig[type] || typeConfig.text;
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase',
        config.color,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}
