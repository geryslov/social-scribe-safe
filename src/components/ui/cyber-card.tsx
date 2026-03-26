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
          "rounded-xl overflow-hidden transition-all duration-300",
          // Variants
          variant === 'default' && "bg-card border border-border",
          variant === 'elevated' && "bg-card border border-border/80 shadow-sm",
          variant === 'stat' && "bg-gradient-to-br from-primary/[0.03] to-transparent bg-card border border-border",
          // Glow effect
          glow && "shadow-sm",
          // Hover
          "hover:border-primary/30 hover:shadow-md",
          className
        )}
        {...props}
      >
        {children}
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
      "text-sm font-semibold tracking-wide text-muted-foreground",
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
