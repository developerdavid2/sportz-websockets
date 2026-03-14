import { z } from "zod";

// --------------------------------------------------------------------------
// listCommentaryQuerySchema
// --------------------------------------------------------------------------

export const listCommentaryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

// --------------------------------------------------------------------------
// createCommentarySchema
// --------------------------------------------------------------------------

export const createCommentarySchema = z.object({
  minute: z.coerce.number().int().nonnegative(),
  sequence: z.coerce.number().int().nonnegative(),
  period: z.string().min(1, { message: "period is required" }),
  eventType: z.string().min(1, { message: "eventType is required" }),
  actor: z.string().optional(),
  team: z.string().optional(),
  message: z.string().min(1, { message: "message is required" }),
  metadata: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});
