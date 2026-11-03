"use client";

import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
export const ContextMenuPortal = ContextMenuPrimitive.Portal;

export function ContextMenuContent({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPortal>
      <ContextMenuPrimitive.Content
        className={cn(
          "z-[120] min-w-44 overflow-hidden rounded-[8px] border border-[#262626] bg-[#111] p-1 shadow-[0_16px_40px_rgba(0,0,0,0.55)] outline-none",
          className,
        )}
        {...props}
      />
    </ContextMenuPortal>
  );
}

export function ContextMenuItem({
  className,
  inset,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Item> & { inset?: boolean }) {
  return (
    <ContextMenuPrimitive.Item
      className={cn(
        "flex h-8 cursor-default select-none items-center gap-2 rounded-[5px] px-2.5 text-[12.5px] leading-[1.2] tracking-[-0.01em] text-[#ccc] outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-[#1a1a1a] data-[highlighted]:text-white",
        inset && "pl-8",
        className,
      )}
      {...props}
    />
  );
}

export function ContextMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}
