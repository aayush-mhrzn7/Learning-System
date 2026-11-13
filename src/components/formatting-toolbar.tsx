"use client";

import type { Editor } from "@tiptap/react";
import {
  Bold,
  BetweenHorizonalEnd,
  BetweenHorizonalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
  Table,
  Trash2,
  Unlink,
} from "lucide-react";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function FormattingToolbar({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const inTable = editor.isActive("table");

  function openLinkDialog() {
    setLinkValue(editor.getAttributes("link").href ?? "");
    setLinkOpen(true);
  }

  function saveLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = linkValue.trim();
    if (!value) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkOpen(false);
      return;
    }
    const href = /^(https?:\/\/|mailto:|tel:)/i.test(value)
      ? value
      : `https://${value}`;
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href })
      .run();
    setLinkOpen(false);
  }

  const tools = [
    {
      label: "Bold (⌘B)",
      icon: Bold,
      active: editor.isActive("bold"),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: "Italic (⌘I)",
      icon: Italic,
      active: editor.isActive("italic"),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: "Strikethrough",
      icon: Strikethrough,
      active: editor.isActive("strike"),
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      label: "Inline code",
      icon: Code2,
      active: editor.isActive("code"),
      run: () => editor.chain().focus().toggleCode().run(),
    },
    {
      label: "Heading 1",
      icon: Heading1,
      active: editor.isActive("heading", { level: 1 }),
      run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: "Heading 2",
      icon: Heading2,
      active: editor.isActive("heading", { level: 2 }),
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "Heading 3",
      icon: Heading3,
      active: editor.isActive("heading", { level: 3 }),
      run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      label: "Heading 4",
      icon: Heading4,
      active: editor.isActive("heading", { level: 4 }),
      run: () => editor.chain().focus().toggleHeading({ level: 4 }).run(),
    },
    {
      label: "Heading 5",
      icon: Heading5,
      active: editor.isActive("heading", { level: 5 }),
      run: () => editor.chain().focus().toggleHeading({ level: 5 }).run(),
    },
    {
      label: "Heading 6",
      icon: Heading6,
      active: editor.isActive("heading", { level: 6 }),
      run: () => editor.chain().focus().toggleHeading({ level: 6 }).run(),
    },
    {
      label: "Bullet list",
      icon: List,
      active: editor.isActive("bulletList"),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Numbered list",
      icon: ListOrdered,
      active: editor.isActive("orderedList"),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "Blockquote",
      icon: Quote,
      active: editor.isActive("blockquote"),
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: "Insert table",
      icon: Table,
      active: inTable,
      run: () =>
        editor
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
  ];

  const tableTools = [
    {
      label: "Add column before",
      icon: BetweenVerticalStart,
      run: () => editor.chain().focus().addColumnBefore().run(),
    },
    {
      label: "Add column after",
      icon: BetweenVerticalEnd,
      run: () => editor.chain().focus().addColumnAfter().run(),
    },
    {
      label: "Delete column",
      icon: Trash2,
      run: () => editor.chain().focus().deleteColumn().run(),
    },
    {
      label: "Add row before",
      icon: BetweenHorizonalStart,
      run: () => editor.chain().focus().addRowBefore().run(),
    },
    {
      label: "Add row after",
      icon: BetweenHorizonalEnd,
      run: () => editor.chain().focus().addRowAfter().run(),
    },
    {
      label: "Delete row",
      icon: Trash2,
      run: () => editor.chain().focus().deleteRow().run(),
    },
  ];

  return (
    <>
      <div className="flex h-11 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border px-2 sm:h-10 sm:px-4">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Button
              key={tool.label}
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7",
                tool.active && "bg-accent text-foreground",
              )}
              onClick={tool.run}
              title={tool.label}
              aria-label={tool.label}
            >
              <Icon size={14} />
            </Button>
          );
        })}
        {inTable
          ? tableTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Button
                  key={tool.label}
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={tool.run}
                  title={tool.label}
                  aria-label={tool.label}
                >
                  <Icon size={14} />
                </Button>
              );
            })
          : null}
        <span className="mx-1 h-4 w-px bg-border" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-7 w-7",
            editor.isActive("link") && "bg-accent text-foreground",
          )}
          onClick={openLinkDialog}
          title="Add or edit link"
          aria-label="Add or edit link"
        >
          <LinkIcon size={14} />
        </Button>
        {editor.isActive("link") ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() =>
              editor.chain().focus().extendMarkRange("link").unsetLink().run()
            }
            title="Remove link"
            aria-label="Remove link"
          >
            <Unlink size={14} />
          </Button>
        ) : null}
        <span className="ml-auto hidden font-mono text-[12px] text-muted-foreground md:block">
          Markdown shortcuts supported
        </span>
      </div>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <form onSubmit={saveLink}>
            <DialogHeader>
              <DialogTitle>Add link</DialogTitle>
              <DialogDescription>
                Select text first, then enter a URL. Pasted URLs are linked
                automatically.
              </DialogDescription>
            </DialogHeader>
            <div className="px-5 py-5">
              <Input
                autoFocus
                value={linkValue}
                onChange={(event) => setLinkValue(event.target.value)}
                placeholder="https://example.com"
                inputMode="url"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setLinkOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Apply link</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
