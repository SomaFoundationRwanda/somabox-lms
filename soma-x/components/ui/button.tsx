import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "flex items-center justify-center ring gap-2 whitespace-nowrap h-fit my-auto rounded-md text-ui font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-brand text-on-brand hover:bg-brand ring-brand hover:ring-brand",
        outline:
          "ring-line-strong bg-surface text-brand-fg hover:bg-brand-soft/50",
        error_outline: "bg-danger-soft text-danger-fg hover:bg-danger-soft ring-danger",
        ghost: "ring-0 hover:bg-black/10 transition-colors",
        destructive: "bg-danger text-on-danger hover:bg-danger ring-danger hover:ring-danger",
        success: "bg-success text-on-success hover:bg-success ring-success hover:ring-success",
      },
      shadow: {
        true: "shadow",
        false: "shadow-none",
      },
      size: {
        default: "py-[10px] px-[16px]",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
      width: {
        fit: "w-fit",
        full: "w-full",
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      width: "fit",
      shadow: false,
    },
  }
)

function Button({
  className,
  variant,
  size,
  width,
  shadow,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, width, shadow, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
