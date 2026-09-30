import * as React from "react"
import { cn } from "cn"

/**
 * Native textarea wrapper (Base UI has no textarea primitive). React 18 note:
 * forwards the ref explicitly so react-hook-form's register() can attach.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        data-slot="textarea"
        className={cn(
          "min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50",
          className
        )}
        {...props}
        ref={ref}
      />
    )
  }
)

export { Textarea }
