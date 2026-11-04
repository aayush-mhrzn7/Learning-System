import { z } from "zod";

export const idSchema = z.uuid();

export const directoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: z.uuid().nullable().optional(),
});

export const directoryUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    parentId: z.uuid().nullable().optional(),
  })
  .refine(
    (value) => value.name !== undefined || value.parentId !== undefined,
    { message: "Nothing to update" },
  );

export const directoryDeleteSchema = z.object({
  confirmation: z.string().trim().min(1, "Type the directory name to confirm"),
});

export function directoryDeleteMatchSchema(expectedName: string) {
  return directoryDeleteSchema.superRefine((value, ctx) => {
    if (value.confirmation !== expectedName) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmation"],
        message: "Name does not match",
      });
    }
  });
}

export const noteCreateSchema = z.object({
  directoryId: z.uuid(),
  title: z.string().trim().min(1).max(200).default("Untitled"),
  kind: z.enum(["writing", "visualize"]).default("writing"),
});

export const editorDocumentSchema = z.object({
  type: z.literal("doc"),
  content: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const noteUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    directoryId: z.uuid().optional(),
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
