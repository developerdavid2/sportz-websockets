import { z } from "zod";

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

export const MATCH_STATUS = {
  SCHEDULED: "scheduled",
  LIVE: "live",
  FINISHED: "finished",
} as const;

// --------------------------------------------------------------------------
// listMatchesQuerySchema
// --------------------------------------------------------------------------

export const listMatchesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

// --------------------------------------------------------------------------
// matchIdParamSchema
// --------------------------------------------------------------------------

export const matchIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// --------------------------------------------------------------------------
// createMatchSchema
// --------------------------------------------------------------------------

export const createMatchSchema = z
  .object({
    sport: z.string().min(1, { message: "sport is required" }),
    homeTeam: z.string().min(1, { message: "homeTeam is required" }),
    awayTeam: z.string().min(1, { message: "awayTeam is required" }),
    startTime: z.iso.datetime(),
    endTime: z.iso.datetime(),
    homeScore: z.coerce.number().int().nonnegative().optional(),
    awayScore: z.coerce.number().int().nonnegative().optional(),
  })
  .superRefine((data, ctx) => {
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);

    if (end <= start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "endTime must be chronologically after startTime",
      });
    }
  });

// --------------------------------------------------------------------------
// updateScoreSchema
// --------------------------------------------------------------------------

export const updateScoreSchema = z.object({
  homeScore: z.coerce.number().int().nonnegative(),
  awayScore: z.coerce.number().int().nonnegative(),
});

// --------------------------------------------------------------------------
// Inferred types
// --------------------------------------------------------------------------

export type ListMatchesQuery = z.infer<typeof listMatchesQuerySchema>;
export type MatchIdParam = z.infer<typeof matchIdParamSchema>;
export type CreateMatchInput = z.infer<typeof createMatchSchema>;
export type UpdateScoreInput = z.infer<typeof updateScoreSchema>;
