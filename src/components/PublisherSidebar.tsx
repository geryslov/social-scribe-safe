import { useState } from 'react';
import { Post } from '@/types/post';
import { Users, ChevronRight, Plus, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
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
      <div className="w-72 flex-shrink-0 bg-card/40 backdrop-blur-xl border-r border-border/40 h-[calc(100vh-73px)] overflow-y-auto">
        <div className="p-5">
          <div className="flex items-center justify-between mb-4 px-1">
            <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2">
              <span className="w-6 h-px bg-gradient-to-r from-transparent via-muted-foreground/30 to-transparent" />
              Publishers
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
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
                  ? "bg-primary/10 border border-primary/20 shadow-lg shadow-black/20"
                  : "hover:bg-secondary/60 border border-transparent hover:border-border/50"
              )}
            >
              <div className={cn(
                "w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 shadow-md",
                selectedPublisher === null
                  ? "bg-primary text-primary-foreground shadow-lg shadow-black/30"
                  : "bg-secondary group-hover:bg-secondary/80"
              )}>
                <Users className={cn(
                  "h-5 w-5 transition-transform duration-300 group-hover:scale-110",
                  selectedPublisher === null ? "text-primary-foreground" : "text-muted-foreground"
                )} />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">All Publishers</p>
                <p className="text-xs text-muted-foreground">{totalPosts} posts total</p>
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
                    isSelected
                      ? "bg-primary/10 border border-primary/20 shadow-lg shadow-black/20"
                      : "hover:bg-secondary/60 border border-transparent hover:border-border/50"
                  )}
                  style={{ animationDelay: `${index * 0.04}s` }}
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
                        isSelected && "shadow-lg shadow-black/30"
                      )}
                    />
                    <div className="flex-1 min-w-0 text-left">
                      <p className="font-semibold text-sm truncate group-hover:text-foreground transition-colors">{publisher.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{publisher.posts.length} posts</span>
                        {doneCount > 0 && (
                          <span className="flex items-center gap-1 text-success">
                            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                            {doneCount}
                          </span>
                        )}
                        {scheduledCount > 0 && (
                          <span className="flex items-center gap-1 text-info">
                            <span className="w-1.5 h-1.5 rounded-full bg-info" />
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
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
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
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-background/80 to-transparent" />
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
