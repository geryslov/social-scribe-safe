import * as React from "react";
import { cn } from "@/lib/utils";

interface CyberCardProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
  variant?: 'default' | 'elevated' | 'stat';
}

const CyberCard = React.forwardRef<HTMLDivElement, CyberCardProps>(
  ({ className, glow = false, variant = 'default', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative rounded-xl overflow-hidden transition-all duration-300",
          // Base styles
          "before:absolute before:inset-0 before:rounded-xl before:pointer-events-none",
          "after:absolute after:inset-0 after:rounded-xl after:pointer-events-none",
          // Corner accents
          "cyber-corners",
          // Variants
          variant === 'default' && "bg-card/50 border border-border/50 backdrop-blur-sm",
          variant === 'elevated' && "bg-primary/5 border border-primary/20 backdrop-blur-sm",
          variant === 'stat' && "bg-gradient-to-br from-primary/10 to-transparent border border-primary/30 backdrop-blur-sm",
          // Glow effect
          glow && "shadow-[0_0_30px_rgba(139,92,246,0.15)]",
          // Hover
          "hover:border-primary/40 hover:shadow-[0_0_40px_rgba(139,92,246,0.2)]",
          className
        )}
        {...props}
      >
        {/* Scanline overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.02] bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(255,255,255,0.03)_2px,rgba(255,255,255,0.03)_4px)]" />
        
        {/* Content */}
        <div className="relative z-10">
          {children}
        </div>
      </div>
    );
  }
);
CyberCard.displayName = "CyberCard";

const CyberCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-5 pb-3", className)}
    {...props}
  />
));
CyberCardHeader.displayName = "CyberCardHeader";

const CyberCardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-sm font-mono font-bold tracking-wide uppercase text-muted-foreground",
      className
    )}
    {...props}
  />
));
CyberCardTitle.displayName = "CyberCardTitle";

const CyberCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-5 pt-0", className)} {...props} />
));
CyberCardContent.displayName = "CyberCardContent";

export { CyberCard, CyberCardHeader, CyberCardTitle, CyberCardContent };
