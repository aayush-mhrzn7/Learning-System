import type { EditorDocument } from "@/db/schema";
import type { ClaimFlag } from "@/components/claim-flags";

export type DirectoryItem = {
  id: string;
  name: string;
  parentId: string | null;
};

export type NoteSummary = {
  id: string;
  directoryId: string;
  title: string;
  status: "draft" | "published";
  updatedAt: string;
};

export type NoteDetail = NoteSummary & {
  content: EditorDocument;
  plainText: string;
  editedSincePublish: boolean;
  factCheckIncomplete: boolean;
  publishedAt: string | null;
};

export type ChecklistItem = {
  id: string;
  noteId: string;
  text: string;
  ticked: boolean;
};

export type NotePayload = {
  note: NoteDetail;
  claims: ClaimFlag[];
  checklist: ChecklistItem[];
};

export type TreePayload = {
  directories: DirectoryItem[];
  notes: NoteSummary[];
};
