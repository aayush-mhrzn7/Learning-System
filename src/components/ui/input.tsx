import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full border border-border bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-[#555] focus:border-[#555]",
        className,
      )}
      {...props}
    />
  );
}
