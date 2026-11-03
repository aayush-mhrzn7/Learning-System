import { z } from "zod";

export const idSchema = z.uuid();

export const directoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: z.uuid().nullable().optional(),
});

export const directoryUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const noteCreateSchema = z.object({
  directoryId: z.uuid(),
  title: z.string().trim().min(1).max(200).default("Untitled"),
});

export const editorDocumentSchema = z.object({
  type: z.literal("doc"),
  content: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const noteUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    content: editorDocumentSchema.optional(),
    plainText: z.string().max(500_000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export const checklistUpdateSchema = z.object({
  ticked: z.boolean(),
});

export const searchSchema = z.object({
  q: z.string().trim().min(1).max(200),
});
