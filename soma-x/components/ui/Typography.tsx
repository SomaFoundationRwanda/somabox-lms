import { cva, type VariantProps } from "class-variance-authority";
import { ReactNode, ElementType } from "react";
import { cn } from "@/lib/utils";
import React from "react";


const textVariants = cva("", {
  variants: {
    variant: {
      h1: "text-4xl md:text-5xl font-black tracking-tight",
      h2: "text-3xl md:text-4xl font-bold tracking-tight",
      h3: "text-2xl md:text-3xl font-bold",
      h4: "text-xl md:text-2xl font-bold",
      title: "font-bold text-base md:text-lg",
      titleInv: "font-bold text-base md:text-lg",
      body: "text-[15px] leading-relaxed",
      caption: "text-sm leading-snug",
      label: "text-xs font-bold uppercase tracking-wider",
      muted: "text-sm opacity-70",
      p: "",
    },
    weight: {
      normal: "font-normal",
      medium: "font-medium",
      semibold: "font-semibold",
      bold: "font-bold",
      black: "font-black",
    },
    color: {
      default: "text-slate-900",
      black: "text-black",
      white: "text-white",
      muted: "text-slate-500",
      accent: "text-accent-dark",
      primary: "text-primary-600",
    },
    size: {
      normal: "text-base",
      "sm": "text-sm",
      "md": "text-md",
      "lg": "text-lg",
      "xl": "text-xl",
      "2xl": "text-2xl",
      "3xl": "text-3xl",
    }
  },
  defaultVariants: {
    variant: "p",
    weight: "medium",
    color: "default",
    size: "normal"
  },
});

type TextProps = {
  children: ReactNode;
  className?: string;
  as?: ElementType;
} & VariantProps<typeof textVariants>;

export default function Typography({ children, className, variant, weight, color, size, as }: TextProps) {
  const getComponent = (): ElementType => {
    if (as) return as;
    switch (variant) {
      case "h1": return "h1";
      case "h2": return "h2";
      case "h3": return "h3";
      case "h4": return "h4";
      case "title": return "h2";
      case "titleInv": return "h2";
      case "label": return "span";
      case "caption": return "span";
      case "muted": return "p";
      default: return "p";
    }
  };

  const Component = getComponent();

  // Special case for titleInv legacy color
  const finalColor = variant === "titleInv" && !color ? "white" : color;

  return (
    <Component className={cn(textVariants({ variant, weight, color: finalColor, size }), className)}>
      {children}
    </Component>
  );
}
