import { useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePublishers } from '@/hooks/usePublishers';

interface PublisherAvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  editable?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'w-8 h-8 text-sm',
  md: 'w-12 h-12 text-lg',
  lg: 'w-16 h-16 text-2xl',
};

export function PublisherAvatar({ name, size = 'md', editable = false, className }: PublisherAvatarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { getPublisherByName, uploadAvatar } = usePublishers();

  const publisher = getPublisherByName(name);
  const avatarUrl = publisher?.avatar_url;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return;
    }

    setIsUploading(true);
    try {
      await uploadAvatar.mutateAsync({ publisherName: name, file });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleClick = () => {
    if (editable && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div
      className={cn(
        'relative rounded-2xl overflow-hidden flex items-center justify-center font-bold',
        sizeClasses[size],
        editable && 'cursor-pointer group',
        !avatarUrl && 'gradient-bg glow-primary text-primary-foreground',
        className
      )}
      onClick={handleClick}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          className="w-full h-full object-cover"
        />
      ) : (
        <span>{name.charAt(0).toUpperCase()}</span>
      )}

      {editable && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <div className={cn(
            'absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity',
            isUploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}>
            {isUploading ? (
              <Loader2 className="h-5 w-5 text-white animate-spin" />
            ) : (
              <Camera className="h-5 w-5 text-white" />
            )}
          </div>
        </>
      )}
    </div>
  );
}
