import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_4px_16px_hsl(var(--primary)/0.35)] hover:shadow-[0_8px_28px_hsl(var(--primary)/0.45)] hover:-translate-y-1 hover:scale-[1.02]",
        destructive: "bg-destructive text-destructive-foreground shadow-md hover:bg-destructive/90 hover:shadow-lg",
        outline: "border-2 border-primary/30 bg-background text-primary hover:bg-primary hover:text-white hover:border-primary hover:shadow-[0_4px_20px_hsl(var(--primary)/0.3)]",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:shadow-md",
        ghost: "hover:bg-secondary hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        glow: "bg-primary text-primary-foreground shadow-[0_4px_20px_hsl(var(--primary)/0.4),0_8px_32px_hsl(var(--primary)/0.25)] hover:shadow-[0_8px_32px_hsl(var(--primary)/0.5),0_16px_48px_hsl(var(--primary)/0.3)] hover:-translate-y-1 hover:scale-[1.02]",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 rounded-md px-4 text-xs",
        lg: "h-12 rounded-lg px-8 text-base",
        icon: "h-10 w-10",
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
