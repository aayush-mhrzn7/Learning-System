import { apiFetch } from "@/lib/api";
import type {
  DirectoryItem,
  NoteKind,
  NoteSummary,
  TreePayload,
} from "@/lib/types";

export type TerminalLine =
  | { type: "text"; text: string; tone?: "error" | "muted" | "command" }
  | { type: "entries"; entries: { name: string; dir: boolean }[] };

export type TerminalContext = {
  getTree: () => TreePayload;
  cwd: string | null;
  reload: () => Promise<void>;
  openNote: (id: string) => void;
};

export type TerminalResult = {
  lines: TerminalLine[];
  cwd?: string | null;
  clear?: boolean;
  exit?: boolean;
};

class CommandError extends Error {}

type Entry =
  | { kind: "root" }
  | { kind: "dir"; dir: DirectoryItem }
  | { kind: "note"; note: NoteSummary };

const KIND_EXT: Record<NoteKind, string> = { writing: ".md", visualize: ".viz" };
const EXT_KIND: Record<string, NoteKind> = { ".md": "writing", ".viz": "visualize" };

const text = (value: string, tone?: "error" | "muted"): TerminalLine => ({
  type: "text",
  text: value,
  tone,
});

// ---------- parsing ----------

export function tokenize(input: string): string[] | null {
  const tokens: string[] = [];
  let current = "";
  let started = false;
  let quote: string | null = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charAt(i);
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (ch === "\\" && i + 1 < input.length) {
      current += input.charAt(++i);
      started = true;
    } else if (/\s/.test(ch)) {
      if (started) {
        tokens.push(current);
        current = "";
        started = false;
      }
    } else {
      current += ch;
      started = true;
    }
  }
  if (quote) return null;
  if (started) tokens.push(current);
  return tokens;
}

function parseArgs(args: string[]) {
  const flags = new Set<string>();
  const operands: string[] = [];
  for (const arg of args) {
    if (/^-[a-zA-Z]+$/.test(arg)) for (const f of arg.slice(1)) flags.add(f);
    else operands.push(arg);
  }
  return { flags, operands };
}

// ---------- paths ----------

function fileName(note: NoteSummary) {
  return note.title + KIND_EXT[note.kind];
}

function parseFileName(name: string) {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return null;
  const kind = EXT_KIND[name.slice(dot).toLowerCase()];
  return kind ? { title: name.slice(0, dot), kind } : null;
}

export function pathOf(tree: TreePayload, id: string | null) {
  const names: string[] = [];
  let cursor = id;
  while (cursor) {
    const dir = tree.directories.find((d) => d.id === cursor);
    if (!dir) break;
    names.unshift(dir.name);
    cursor = dir.parentId;
  }
  return "/" + names.join("/");
}

function splitPath(ctx: TerminalContext, path: string) {
  let rest = path;
  let absolute = path.startsWith("/");
  if (path === "~" || path.startsWith("~/")) {
    absolute = true;
    rest = path.slice(1);
  }
  return {
    start: absolute ? null : ctx.cwd,
    segments: rest.split("/").filter(Boolean),
  };
}

function descend(
  tree: TreePayload,
  start: string | null,
  segments: string[],
  original: string,
) {
  let cursor = start;
  for (const segment of segments) {
    if (segment === ".") continue;
    if (segment === "..") {
      cursor = cursor
        ? (tree.directories.find((d) => d.id === cursor)?.parentId ?? null)
        : null;
      continue;
    }
    const matches = tree.directories.filter(
      (d) => d.parentId === cursor && d.name === segment,
    );
    if (matches.length === 0) {
      throw new CommandError(`${original}: no such directory`);
    }
    if (matches.length > 1) {
      throw new CommandError(`${original}: ambiguous, several directories named "${segment}"`);
    }
    cursor = matches[0]!.id;
  }
  return cursor;
}

function resolveDir(ctx: TerminalContext, path: string) {
  const { start, segments } = splitPath(ctx, path);
  return descend(ctx.getTree(), start, segments, path);
}

function splitParent(ctx: TerminalContext, path: string) {
  const { start, segments } = splitPath(ctx, path);
  const name = segments.pop();
  if (!name || name === "." || name === "..") {
    throw new CommandError(`${path}: invalid name`);
  }
  return { parentId: descend(ctx.getTree(), start, segments, path), name };
}

function lookup(ctx: TerminalContext, path: string): Entry {
  const tree = ctx.getTree();
  const { start, segments } = splitPath(ctx, path);
  const last = segments[segments.length - 1];
  if (last === undefined || last === "." || last === "..") {
    const id = descend(tree, start, segments, path);
    const dir = tree.directories.find((d) => d.id === id);
    return dir ? { kind: "dir", dir } : { kind: "root" };
  }
  const parentId = descend(tree, start, segments.slice(0, -1), path);
  const file = parseFileName(last);
  if (file) {
    const notes = tree.notes.filter(
      (n) =>
        n.directoryId === parentId &&
        n.kind === file.kind &&
        n.title === file.title,
    );
    if (notes.length > 1) throw new CommandError(`${path}: ambiguous`);
    if (notes[0]) return { kind: "note", note: notes[0] };
  }
  const dirs = tree.directories.filter(
    (d) => d.parentId === parentId && d.name === last,
  );
  if (dirs.length > 1) throw new CommandError(`${path}: ambiguous`);
  if (dirs[0]) return { kind: "dir", dir: dirs[0] };
  throw new CommandError(`${path}: no such file or directory`);
}

function isInside(tree: TreePayload, id: string | null, ancestorId: string) {
  let cursor = id;
  while (cursor) {
    if (cursor === ancestorId) return true;
    cursor = tree.directories.find((d) => d.id === cursor)?.parentId ?? null;
  }
  return false;
}

function nameTaken(
  tree: TreePayload,
  parentId: string | null,
  name: string,
  note?: { kind: NoteKind; title: string },
) {
  if (note) {
    return tree.notes.some(
      (n) =>
        n.directoryId === parentId &&
        n.kind === note.kind &&
        n.title === note.title,
    );
  }
  return tree.directories.some((d) => d.parentId === parentId && d.name === name);
}

function checkDirName(name: string) {
  if (name.length > 120) throw new CommandError(`${name}: name too long (max 120)`);
}

// ---------- api ----------

async function request<T = unknown>(
  method: string,
  url: string,
  body?: unknown,
): Promise<T> {
  const response = await apiFetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) {
    throw new CommandError(data?.error ?? `request failed (${response.status})`);
  }
  return data as T;
}

// ---------- commands ----------

type Handler = (args: string[], ctx: TerminalContext) => Promise<TerminalResult>;

const done = (...lines: TerminalLine[]): TerminalResult => ({ lines });

function listChildren(tree: TreePayload, parentId: string | null) {
  return {
    dirs: tree.directories
      .filter((d) => d.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name)),
    notes: tree.notes
      .filter((n) => n.directoryId === parentId)
      .sort((a, b) => fileName(a).localeCompare(fileName(b))),
  };
}

const ls: Handler = async (args, ctx) => {
  const { flags, operands } = parseArgs(args);
  const long = flags.has("l");
  const targets = operands.length ? operands : ["."];
  const lines: TerminalLine[] = [];
  const tree = ctx.getTree();

  targets.forEach((target, index) => {
    const entry = lookup(ctx, target);
    if (targets.length > 1) {
      if (index > 0) lines.push(text(""));
      lines.push(text(`${target}:`, "muted"));
    }
    if (entry.kind === "note") {
      lines.push(text(fileName(entry.note)));
      return;
    }
    const { dirs, notes } = listChildren(
      tree,
      entry.kind === "dir" ? entry.dir.id : null,
    );
    if (long) {
      for (const d of dirs) lines.push(text(`d  ${"-".padEnd(9)} ${"".padEnd(11)}${d.name}/`));
      for (const n of notes) {
        const date = new Date(n.updatedAt).toLocaleDateString("en-CA");
        lines.push(text(`-  ${n.status.padEnd(9)} ${date}  ${fileName(n)}`));
      }
    } else if (dirs.length || notes.length) {
      lines.push({
        type: "entries",
        entries: [
          ...dirs.map((d) => ({ name: d.name + "/", dir: true })),
          ...notes.map((n) => ({ name: fileName(n), dir: false })),
        ],
      });
    }
  });
  return { lines };
};

const cd: Handler = async (args, ctx) => {
  const { operands } = parseArgs(args);
  if (operands.length > 1) throw new CommandError("cd: too many arguments");
  const target = operands[0] ?? "/";
  const entry = lookup(ctx, target);
  if (entry.kind === "note") throw new CommandError(`cd: ${target}: not a directory`);
  return { lines: [], cwd: entry.kind === "dir" ? entry.dir.id : null };
};

const pwd: Handler = async (_args, ctx) =>
  done(text(pathOf(ctx.getTree(), ctx.cwd)));

const treeCmd: Handler = async (args, ctx) => {
  const entry = lookup(ctx, args[0] ?? ".");
  if (entry.kind === "note") throw new CommandError(`tree: ${args[0]}: not a directory`);
  const tree = ctx.getTree();
  const rootId = entry.kind === "dir" ? entry.dir.id : null;
  const lines: TerminalLine[] = [
    text(entry.kind === "dir" ? entry.dir.name + "/" : "/"),
  ];
  let dirCount = 0;
  let noteCount = 0;
  const walk = (parentId: string | null, prefix: string) => {
    const { dirs, notes } = listChildren(tree, parentId);
    const items = [
      ...dirs.map((d) => ({ label: d.name + "/", id: d.id })),
      ...notes.map((n) => ({ label: fileName(n), id: null })),
    ];
    items.forEach((item, i) => {
      const last = i === items.length - 1;
      lines.push(text(`${prefix}${last ? "└── " : "├── "}${item.label}`));
      if (item.id) {
        dirCount++;
        walk(item.id, prefix + (last ? "    " : "│   "));
      } else noteCount++;
    });
  };
  walk(rootId, "");
  lines.push(text(`${dirCount} directories, ${noteCount} notes`, "muted"));
  return { lines };
};

const mkdir: Handler = async (args, ctx) => {
  const { flags, operands } = parseArgs(args);
  if (!operands.length) throw new CommandError("mkdir: missing operand");
  for (const operand of operands) {
    if (flags.has("p")) {
      const { start, segments } = splitPath(ctx, operand);
      let parentId = start;
      for (const segment of segments) {
        if (segment === "." || segment === "..") {
          parentId = descend(ctx.getTree(), parentId, [segment], operand);
          continue;
        }
        const existing = ctx
          .getTree()
          .directories.find((d) => d.parentId === parentId && d.name === segment);
        if (existing) {
          parentId = existing.id;
          continue;
        }
        checkDirName(segment);
        const { directory } = await request<{ directory: DirectoryItem }>(
          "POST",
          "/api/directories",
          { name: segment, parentId },
        );
        parentId = directory.id;
        await ctx.reload();
      }
    } else {
      const { parentId, name } = splitParent(ctx, operand);
      checkDirName(name);
      if (nameTaken(ctx.getTree(), parentId, name)) {
        throw new CommandError(`mkdir: ${operand}: already exists`);
      }
      await request("POST", "/api/directories", { name, parentId });
      await ctx.reload();
    }
  }
  return done();
};

const touch: Handler = async (args, ctx) => {
  const { operands } = parseArgs(args);
  if (!operands.length) throw new CommandError("touch: missing file operand");
  for (const operand of operands) {
    const { parentId, name } = splitParent(ctx, operand);
    const file = parseFileName(name);
    if (!file) {
      throw new CommandError(
        `touch: ${name}: use .md for a note or .viz for a visualization`,
      );
    }
    if (!parentId) {
      throw new CommandError(
        `touch: ${operand}: notes live inside a directory, mkdir one and cd into it first`,
      );
    }
    if (file.title.length > 200) throw new CommandError(`touch: ${name}: name too long`);
    if (nameTaken(ctx.getTree(), parentId, name, file)) continue;
    await request("POST", "/api/notes", {
      directoryId: parentId,
      title: file.title,
      kind: file.kind,
    });
    await ctx.reload();
  }
  return done();
};

const rm: Handler = async (args, ctx) => {
  const { flags, operands } = parseArgs(args);
  if (!operands.length) throw new CommandError("rm: missing operand");
  let cwd: string | null | undefined;
  let current = ctx.cwd;
  for (const operand of operands) {
    const entry = lookup(ctx, operand);
    if (entry.kind === "root") throw new CommandError("rm: cannot remove the root");
    if (entry.kind === "note") {
      await request("DELETE", `/api/notes/${entry.note.id}`);
    } else {
      if (!flags.has("r")) {
        throw new CommandError(`rm: ${operand}: is a directory (use rm -r)`);
      }
      const tree = ctx.getTree();
      if (isInside(tree, current, entry.dir.id)) {
        current = entry.dir.parentId;
        cwd = current;
      }
      await request("DELETE", `/api/directories/${entry.dir.id}`, {
        confirmation: entry.dir.name,
      });
    }
    await ctx.reload();
  }
  return {
    lines: [text("Moved to trash. Restore from the Trash page.", "muted")],
    cwd,
  };
};

const mv: Handler = async (args, ctx) => {
  const { operands } = parseArgs(args);
  if (operands.length !== 2) throw new CommandError("usage: mv <source> <destination>");
  const [sourcePath = "", destPath = ""] = operands;
  const source = lookup(ctx, sourcePath);
  if (source.kind === "root") throw new CommandError("mv: cannot move the root");

  let destEntry: Entry | null = null;
  try {
    destEntry = lookup(ctx, destPath);
  } catch {
    destEntry = null;
  }

  let parentId: string | null;
  let name: string;
  if (destEntry && destEntry.kind !== "note") {
    parentId = destEntry.kind === "dir" ? destEntry.dir.id : null;
    name = source.kind === "dir" ? source.dir.name : fileName(source.note);
  } else if (destEntry) {
    throw new CommandError(`mv: ${destPath}: already exists`);
  } else {
    ({ parentId, name } = splitParent(ctx, destPath));
  }

  const tree = ctx.getTree();
  if (source.kind === "note") {
    const file = parseFileName(name);
    if (!file || file.kind !== source.note.kind) {
      throw new CommandError(
        `mv: destination must end in ${KIND_EXT[source.note.kind]}`,
      );
    }
    if (!parentId) throw new CommandError("mv: notes must live inside a directory");
    const patch: { title?: string; directoryId?: string } = {};
    if (file.title !== source.note.title) patch.title = file.title;
    if (parentId !== source.note.directoryId) patch.directoryId = parentId;
    if (!Object.keys(patch).length) return done();
    if (nameTaken(tree, parentId, name, file)) {
      throw new CommandError(`mv: ${name}: already exists there`);
    }
    await request("PATCH", `/api/notes/${source.note.id}`, patch);
  } else {
    checkDirName(name);
    const patch: { name?: string; parentId?: string | null } = {};
    if (name !== source.dir.name) patch.name = name;
    if (parentId !== source.dir.parentId) patch.parentId = parentId;
    if (!Object.keys(patch).length) return done();
    if (nameTaken(tree, parentId, name)) {
      throw new CommandError(`mv: ${name}: already exists there`);
    }
    await request("PATCH", `/api/directories/${source.dir.id}`, patch);
  }
  await ctx.reload();
  return done();
};

const open: Handler = async (args, ctx) => {
  if (!args[0]) throw new CommandError("usage: open <note.md|note.viz>");
  const entry = lookup(ctx, args[0]);
  if (entry.kind !== "note") throw new CommandError(`open: ${args[0]}: not a note`);
  ctx.openNote(entry.note.id);
  return done(text(`Opened ${fileName(entry.note)}`, "muted"));
};

const COMMANDS: Record<
  string,
  { usage: string; description: string; run: Handler }
> = {
  ls: { usage: "ls [-l] [path...]", description: "List directories and notes", run: ls },
  cd: { usage: "cd [path]", description: "Change directory (no argument goes to /)", run: cd },
  pwd: { usage: "pwd", description: "Print the current directory", run: pwd },
  tree: { usage: "tree [path]", description: "Show a directory as a tree", run: treeCmd },
  mkdir: { usage: "mkdir [-p] <path...>", description: "Create directories (-p creates parents)", run: mkdir },
  touch: { usage: "touch <name.md|name.viz>...", description: "Create a markdown note (.md) or visualization (.viz)", run: touch },
  rm: { usage: "rm [-r] <path...>", description: "Move a note, or a directory with -r, to the trash", run: rm },
  mv: { usage: "mv <source> <destination>", description: "Move or rename a note or directory", run: mv },
  open: { usage: "open <note.md|note.viz>", description: "Open a note in the editor", run: open },
};

const BUILTIN_HELP: [string, string][] = [
  ["help [command]", "Show this help"],
  ["clear", "Clear the terminal (Ctrl+L)"],
  ["exit", "Close the terminal (Cmd/Ctrl+J toggles it)"],
];

const help: Handler = async (args) => {
  if (args[0]) {
    const command = COMMANDS[args[0]];
    if (!command) throw new CommandError(`help: no such command: ${args[0]}`);
    return done(text(command.usage), text(command.description, "muted"));
  }
  const rows: [string, string][] = [
    ...Object.values(COMMANDS).map((c): [string, string] => [c.usage, c.description]),
    ...BUILTIN_HELP,
  ];
  const width = Math.max(...rows.map(([usage]) => usage.length)) + 3;
  return done(
    ...rows.map(([usage, description]) => text(usage.padEnd(width) + description)),
    text(""),
    text("Chain commands with &&, e.g. mkdir optics && cd optics. A failure stops the chain.", "muted"),
    text("Paths: / is the root, .. is the parent, quote names with spaces.", "muted"),
    text("Examples: mkdir -p physics/optics · touch physics/notes.md · touch map.viz", "muted"),
  );
};

// Split on `&&` outside quotes and backslash escapes.
function splitChain(input: string): string[] | null {
  const parts: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charAt(i);
    if (quote) {
      if (ch === quote) quote = null;
      current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === "\\" && i + 1 < input.length) {
      current += ch + input.charAt(++i);
    } else if (ch === "&" && input.charAt(i + 1) === "&") {
      parts.push(current);
      current = "";
      i++;
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return quote ? null : parts;
}

/** Runs `a && b && c`, stopping at the first command that fails. */
export async function runCommand(
  input: string,
  ctx: TerminalContext,
): Promise<TerminalResult> {
  const parts = splitChain(input);
  if (!parts) return done(text("Unterminated quote", "error"));
  if (parts.length === 1) return runSingle(input, ctx);
  if (parts.some((part) => !part.trim())) {
    return done(text("Syntax error near &&", "error"));
  }

  const combined: TerminalResult = { lines: [] };
  let cwd = ctx.cwd;
  for (const part of parts) {
    const result = await runSingle(part, { ...ctx, cwd });
    if (result.clear) combined.lines = [];
    combined.lines.push(...result.lines);
    if (result.cwd !== undefined) {
      cwd = result.cwd;
      combined.cwd = result.cwd;
    }
    if (result.clear) combined.clear = true;
    if (result.exit) {
      combined.exit = true;
      break;
    }
    if (result.lines.some((line) => line.type === "text" && line.tone === "error")) {
      break;
    }
  }
  return combined;
}

async function runSingle(
  input: string,
  ctx: TerminalContext,
): Promise<TerminalResult> {
  const tokens = tokenize(input);
  if (!tokens) return done(text("Unterminated quote", "error"));
  if (!tokens.length) return done();
  const [name = "", ...args] = tokens;

  if (name === "clear") return { lines: [], clear: true };
  if (name === "exit") return { lines: [], exit: true };
  if (name === "help") {
    return help(args, ctx).catch((e) => done(text(e.message, "error")));
  }

  const command = COMMANDS[name];
  if (!command) {
    return done(text(`${name}: command not found. Type help for commands.`, "error"));
  }
  try {
    return await command.run(args, ctx);
  } catch (error) {
    if (error instanceof CommandError) return done(text(error.message, "error"));
    return done(text("Something went wrong. Try again.", "error"));
  }
}

// ---------- tab completion ----------

export function complete(input: string, ctx: TerminalContext): string {
  const match = /(?:^|[^\\]) ((?:\\.|[^ ])*)$/.exec(input);
  if (!match) return input;
  const typed = match[1] ?? "";
  const word = typed.replace(/\\(.)/g, "$1");
  const slash = word.lastIndexOf("/");
  const dirPart = slash >= 0 ? word.slice(0, slash + 1) : "";
  const prefix = word.slice(slash + 1);
  let parentId: string | null;
  try {
    parentId = resolveDir(ctx, dirPart || ".");
  } catch {
    return input;
  }
  const { dirs, notes } = listChildren(ctx.getTree(), parentId);
  const candidates = [
    ...dirs.map((d) => d.name + "/"),
    ...notes.map(fileName),
  ].filter((c) => c.startsWith(prefix));
  if (!candidates.length) return input;
  let common = candidates[0] ?? "";
  for (const c of candidates) {
    while (!c.startsWith(common)) common = common.slice(0, -1);
  }
  const completed = (dirPart + common).replace(/ /g, "\\ ");
  return input.slice(0, input.length - typed.length) + completed;
}
