import { Router } from "express";

import { commentary } from "../db/schema.js";
import { matchIdParamSchema } from "../validation/matches.js";
import {
  createCommentarySchema,
  listCommentaryQuerySchema,
} from "../validation/commentary.js";
import { db } from "../db/db.js";
import { desc, eq } from "drizzle-orm";

export const commentaryRouter = Router({ mergeParams: true });
const MAX_LIMIT = 100;

// GET /matches/:id/commentary
commentaryRouter.get("/", async (req, res) => {
  // ── 1. Validate route param
  const paramResult = matchIdParamSchema.safeParse(req.params);

  if (!paramResult.success) {
    return res.status(400).json({
      error: "Invalid match ID",
      details: paramResult.error.issues,
    });
  }

  // ── 2. Validate query params
  const queryResult = listCommentaryQuerySchema.safeParse(req.query);

  if (!queryResult.success) {
    return res.status(400).json({
      error: "Invalid query parameters",
      details: queryResult.error.issues,
    });
  }

  // ── 3. Fetch from DB───────
  try {
    const { id: matchId } = paramResult.data;
    const limit = Math.min(queryResult.data.limit ?? MAX_LIMIT, MAX_LIMIT);

    const entries = await db
      .select()
      .from(commentary)
      .where(eq(commentary.matchId, matchId))
      .orderBy(desc(commentary.createdAt))
      .limit(limit);

    return res.status(200).json({ data: entries });
  } catch (error) {
    console.error("Failed to fetch commentary", error);
    return res
      .status(500)
      .json({ error: "Failed to fetch commentary entries" });
  }
});

commentaryRouter.post("/", async (req, res) => {
  // ── 1. Validate route param
  const paramResult = matchIdParamSchema.safeParse(req.params);

  if (!paramResult.success) {
    return res.status(400).json({
      error: "Invalid match ID",
      details: paramResult.error.issues,
    });
  }

  // ── 2. Validate request body
  const bodyResult = createCommentarySchema.safeParse(req.body);

  if (!bodyResult.success) {
    return res.status(400).json({
      error: "Invalid commentary data",
      details: bodyResult.error.issues,
    });
  }

  // ── 3. Insert into DB
  try {
    const { minute, ...rest } = bodyResult.data;

    const [result] = await db
      .insert(commentary)
      .values({
        matchId: paramResult.data.id,
        minute,
        ...rest,
      })
      .returning();
    if (res.app.locals.broadCastCommentary) {
      res.app.locals.broadCastCommentary(result?.matchId, result);
    }

    return res.status(201).json({ data: result });
  } catch (error) {
    console.error("Failed to create commentary", error);
    return res.status(500).json({ error: "Failed to create commentary entry" });
  }
});
