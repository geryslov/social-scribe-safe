import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-primary/20 bg-background/50 px-4 py-2 text-base font-mono ring-offset-background",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "placeholder:text-muted-foreground/60 placeholder:font-sans",
          "focus-visible:outline-none focus-visible:border-primary/50 focus-visible:shadow-[0_0_15px_hsl(var(--primary)/0.2),inset_0_0_10px_hsl(var(--primary)/0.05)]",
          "hover:border-primary/30 transition-all duration-200",
          "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
