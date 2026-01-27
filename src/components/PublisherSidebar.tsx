import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Post } from '@/types/post';
import { Users, ChevronRight, Plus, Pencil, Trash2, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { PublisherAvatar } from '@/components/PublisherAvatar';
import { PublisherModal } from '@/components/PublisherModal';
import { usePublishers, Publisher } from '@/hooks/usePublishers';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface PublisherWithPosts {
  name: string;
  role: string;
  linkedinUrl: string;
  posts: Post[];
}

interface PublisherSidebarProps {
  publishers: PublisherWithPosts[];
  selectedPublisher: string | null;
  onSelectPublisher: (name: string | null) => void;
}

export function PublisherSidebar({ publishers, selectedPublisher, onSelectPublisher }: PublisherSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const totalPosts = publishers.reduce((acc, p) => acc + p.posts.length, 0);
  const { getPublisherByName, deletePublisher } = usePublishers();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPublisher, setEditingPublisher] = useState<Publisher | null>(null);
  const [deleteConfirmPublisher, setDeleteConfirmPublisher] = useState<string | null>(null);

  const handleAddPublisher = () => {
    setEditingPublisher(null);
    setIsModalOpen(true);
  };

  const handleEditPublisher = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const publisher = getPublisherByName(name);
    if (publisher) {
      setEditingPublisher(publisher);
      setIsModalOpen(true);
    }
  };

  const handleDeleteClick = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const publisherWithPosts = publishers.find(p => p.name === name);
    if (publisherWithPosts && publisherWithPosts.posts.length > 0) {
      toast.error(`Cannot delete "${name}" - they have ${publisherWithPosts.posts.length} post${publisherWithPosts.posts.length > 1 ? 's' : ''}. Delete or reassign their posts first.`);
      return;
    }
    setDeleteConfirmPublisher(name);
  };

  const handleConfirmDelete = () => {
    if (deleteConfirmPublisher) {
      deletePublisher.mutate(deleteConfirmPublisher);
      if (selectedPublisher === deleteConfirmPublisher) {
        onSelectPublisher(null);
      }
      setDeleteConfirmPublisher(null);
    }
  };

  return (
    <>
      <div 
        className="w-72 flex-shrink-0 h-[calc(100vh-73px)] overflow-y-auto"
        style={{
          background: '#0A0824',
          borderRight: '1px solid rgba(255, 255, 255, 0.06)'
        }}
      >
        <div className="p-5">
          <div className="flex items-center justify-between mb-4 px-1">
            <h2 className="text-[10px] font-bold text-[#A5A7C8] uppercase tracking-[0.2em] flex items-center gap-2">
              <span className="w-6 h-px bg-gradient-to-r from-transparent via-[#A5A7C8]/30 to-transparent" />
              Publishers
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-[#A5A7C8] hover:text-white hover:bg-white/10"
              onClick={handleAddPublisher}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="space-y-2">
            {/* All Publishers */}
            <button
              onClick={() => onSelectPublisher(null)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all duration-300 group",
                selectedPublisher === null
                  ? "shadow-lg"
                  : "hover:bg-[#15114A]"
              )}
              style={selectedPublisher === null ? {
                background: 'rgba(139, 92, 246, 0.15)',
                border: '1px solid rgba(139, 92, 246, 0.3)'
              } : {
                border: '1px solid transparent'
              }}
            >
              <div className={cn(
                "w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 shadow-md",
                selectedPublisher === null
                  ? "bg-gradient-to-br from-[#8B5CF6] to-[#7C3AED] shadow-lg"
                  : "bg-[#15114A] group-hover:bg-[#1B1760]"
              )}
              style={selectedPublisher === null ? {
                boxShadow: '0 0 20px rgba(139, 92, 246, 0.4)'
              } : {}}>
                <Users className={cn(
                  "h-5 w-5 transition-transform duration-300 group-hover:scale-110",
                  selectedPublisher === null ? "text-white" : "text-[#A5A7C8]"
                )} />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm text-white">All Publishers</p>
                <p className="text-xs text-[#A5A7C8]">{totalPosts} posts total</p>
              </div>
            </button>
            
            {/* Publisher List */}
            {publishers.map((publisher, index) => {
              const doneCount = publisher.posts.filter(p => p.status === 'done').length;
              const scheduledCount = publisher.posts.filter(p => p.status === 'scheduled').length;
              const isSelected = selectedPublisher === publisher.name;
              
              return (
                <div
                  key={publisher.name}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all duration-300 animate-fade-in group relative",
                    !isSelected && "hover:bg-[#15114A]"
                  )}
                  style={isSelected ? {
                    background: 'rgba(139, 92, 246, 0.15)',
                    border: '1px solid rgba(139, 92, 246, 0.3)'
                  } : {
                    border: '1px solid transparent'
                  }}
                >
                  <button
                    onClick={() => onSelectPublisher(publisher.name)}
                    className="flex items-center gap-3 flex-1 min-w-0"
                  >
                    <PublisherAvatar 
                      name={publisher.name} 
                      size="md" 
                      editable={true}
                      className={cn(
                        "w-11 h-11 transition-all duration-300 shadow-md",
                        isSelected && "shadow-lg shadow-primary/30"
                      )}
                    />
                    <div className="flex-1 min-w-0 text-left">
                      <p className="font-semibold text-sm truncate text-white group-hover:text-white transition-colors">{publisher.name}</p>
                      {(() => {
                        const dbPub = getPublisherByName(publisher.name);
                        if (dbPub?.headline) {
                          return (
                            <p className="text-xs text-[#A5A7C8] truncate">{dbPub.headline}</p>
                          );
                        }
                        return null;
                      })()}
                      <div className="flex items-center gap-2 text-xs text-[#A5A7C8]">
                        <span>{publisher.posts.length} posts</span>
                        {doneCount > 0 && (
                          <span className="flex items-center gap-1 text-[#6EE7B7]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#6EE7B7] animate-pulse" />
                            {doneCount}
                          </span>
                        )}
                        {scheduledCount > 0 && (
                          <span className="flex items-center gap-1 text-[#5DA9FF]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#5DA9FF]" />
                            {scheduledCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                  
                  {/* Actions dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-[#A5A7C8] hover:text-white hover:bg-white/10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/publisher/${encodeURIComponent(publisher.name)}`);
                      }}>
                        <BarChart3 className="h-4 w-4 mr-2" />
                        Analytics
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => handleEditPublisher(publisher.name, e as any)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={(e) => handleDeleteClick(publisher.name, e as any)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Bottom gradient fade */}
        <div 
          className="pointer-events-none absolute bottom-0 left-0 w-72 h-20"
          style={{
            background: 'linear-gradient(to top, #0A0824 0%, transparent 100%)'
          }}
        />
      </div>

      <PublisherModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        publisher={editingPublisher}
      />

      <AlertDialog open={!!deleteConfirmPublisher} onOpenChange={() => setDeleteConfirmPublisher(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Publisher</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirmPublisher}"? This will not delete their posts, but they will no longer appear in the publisher list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}