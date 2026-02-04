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
      <div className="w-72 flex-shrink-0 h-[calc(100vh-73px)] overflow-y-auto bg-card border-r border-border">
        <div className="p-5">
          <div className="flex items-center justify-between mb-4 px-1">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              Publishers
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
              onClick={handleAddPublisher}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="space-y-1">
            {/* All Publishers - Featured Card */}
            <button
              onClick={() => onSelectPublisher(null)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-4 rounded-xl text-left transition-all duration-200 group",
                selectedPublisher === null
                  ? "text-white shadow-lg"
                  : "bg-secondary/50 hover:bg-secondary border border-transparent"
              )}
              style={selectedPublisher === null ? {
                background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))',
                boxShadow: '0 8px 24px hsl(var(--primary) / 0.35)'
              } : {}}
            >
              <div className={cn(
                "w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200",
                selectedPublisher === null
                  ? "bg-white/20 backdrop-blur-sm"
                  : "bg-card text-muted-foreground group-hover:text-primary"
              )}>
                <Users className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className={cn(
                  "font-semibold text-sm",
                  selectedPublisher === null ? "text-white" : "text-foreground"
                )}>All Publishers</p>
                <p className={cn(
                  "text-xs",
                  selectedPublisher === null ? "text-white/70" : "text-muted-foreground"
                )}>{totalPosts} posts total</p>
              </div>
              {selectedPublisher === null && (
                <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              )}
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
                    "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-all duration-200 animate-fade-in group relative",
                    isSelected
                      ? "bg-primary/10 border-l-4 border-l-primary border-y border-r border-primary/20"
                      : "hover:bg-secondary border-l-4 border-l-transparent border border-transparent"
                  )}
                  style={isSelected ? {
                    boxShadow: '0 2px 8px hsl(var(--primary) / 0.1)'
                  } : {}}
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
                        "w-10 h-10 transition-all duration-200",
                        isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-card"
                      )}
                    />
                    <div className="flex-1 min-w-0 text-left">
                      <p className={cn(
                        "font-medium text-sm truncate transition-colors",
                        isSelected ? "text-primary" : "text-foreground"
                      )}>{publisher.name}</p>
                      {(() => {
                        const dbPub = getPublisherByName(publisher.name);
                        if (dbPub?.headline) {
                          return (
                            <p className="text-xs text-muted-foreground truncate">{dbPub.headline}</p>
                          );
                        }
                        return null;
                      })()}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{publisher.posts.length} posts</span>
                        {doneCount > 0 && (
                          <span className="flex items-center gap-1 text-success">
                            <span className="w-1.5 h-1.5 rounded-full bg-success" />
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
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground hover:bg-secondary"
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
