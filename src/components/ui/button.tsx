import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.95] active:shadow-inner",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-b from-primary to-primary/90 text-primary-foreground border border-primary/20 shadow-[0_4px_16px_hsl(var(--primary)/0.3),inset_0_1px_0_rgba(255,255,255,0.15)] hover:shadow-[0_8px_32px_hsl(var(--primary)/0.4),inset_0_1px_0_rgba(255,255,255,0.2)] hover:-translate-y-0.5 active:from-accent active:to-accent/90 active:shadow-[0_0_20px_hsl(var(--accent)/0.5),inset_0_2px_4px_rgba(0,0,0,0.2)]",
        destructive: "bg-gradient-to-b from-destructive to-destructive/90 text-destructive-foreground border border-destructive/20 shadow-[0_4px_16px_hsl(var(--destructive)/0.3)] hover:shadow-[0_8px_24px_hsl(var(--destructive)/0.4)] hover:-translate-y-0.5 active:from-destructive/80 active:to-destructive/70 active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]",
        outline: "border-2 border-primary/40 bg-transparent text-primary hover:bg-primary/10 hover:border-primary hover:shadow-[0_0_20px_hsl(var(--primary)/0.15)] active:bg-accent active:text-accent-foreground active:border-accent active:shadow-[0_0_16px_hsl(var(--accent)/0.4)]",
        secondary: "bg-gradient-to-b from-secondary to-secondary/80 text-secondary-foreground border border-border shadow-sm hover:shadow-md hover:border-primary/20 active:from-primary/10 active:to-primary/5 active:border-primary/40",
        ghost: "text-muted-foreground hover:text-foreground hover:bg-secondary/80 active:bg-accent/20 active:text-accent",
        link: "text-primary underline-offset-4 hover:underline font-medium active:text-accent",
        glow: "bg-gradient-to-b from-primary via-primary to-primary/85 text-primary-foreground border border-white/10 shadow-[0_0_20px_hsl(var(--primary)/0.4),0_4px_24px_hsl(var(--primary)/0.3),inset_0_1px_0_rgba(255,255,255,0.2)] hover:shadow-[0_0_32px_hsl(var(--primary)/0.5),0_8px_40px_hsl(var(--primary)/0.35),inset_0_1px_0_rgba(255,255,255,0.25)] hover:-translate-y-1 active:from-accent active:via-accent active:to-accent/85 active:shadow-[0_0_28px_hsl(var(--accent)/0.6),inset_0_2px_4px_rgba(0,0,0,0.2)]",
        neon: "bg-transparent text-primary border-2 border-primary shadow-[0_0_12px_hsl(var(--primary)/0.3),inset_0_0_12px_hsl(var(--primary)/0.1)] hover:bg-primary hover:text-white hover:shadow-[0_0_24px_hsl(var(--primary)/0.5),0_0_48px_hsl(var(--primary)/0.25)] active:bg-accent active:border-accent active:shadow-[0_0_32px_hsl(var(--accent)/0.6),0_0_64px_hsl(var(--accent)/0.3)]",
      },
      size: {
        default: "h-11 px-6 py-2.5",
        sm: "h-9 rounded-lg px-4 text-xs",
        lg: "h-13 rounded-xl px-8 text-base",
        icon: "h-10 w-10 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
