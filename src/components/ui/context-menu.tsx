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
          "z-[120] min-w-40 border border-[#303030] bg-[#101010] p-1 shadow-2xl outline-none",
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
        "flex h-8 cursor-default select-none items-center gap-2 px-2 text-xs text-[#ccc] outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-[#222] data-[highlighted]:text-white",
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
