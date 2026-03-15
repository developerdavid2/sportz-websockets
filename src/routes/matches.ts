import { Router } from "express";
import {
  createMatchSchema,
  listMatchesQuerySchema,
} from "../validation/matches.js";
import { db } from "../db/db.js";
import { matches } from "../db/schema.js";
import { getMatchStatus } from "../utils/match-status.js";
import { desc, eq } from "drizzle-orm";

export const matchRouter = Router();
const MAX_LIMIT = 100;
matchRouter.get("/", async (req, res) => {
  const parsed = listMatchesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid query,",
      details: parsed.error.issues,
    });
  }

  const limit = Math.min(parsed.data.limit ?? 50, MAX_LIMIT);

  try {
    const data = await db
      .select()
      .from(matches)
      .orderBy(desc(matches.createdAt))
      .limit(limit);

    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: "Failed to list" });
  }
});

matchRouter.post("/", async (req, res) => {
  const parsed = createMatchSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid payload,",
      details: parsed.error.issues,
    });
  }
  const {
    data: { startTime, endTime, homeScore, awayScore },
  } = parsed;

  try {
    const [event] = await db
      .insert(matches)
      .values({
        ...parsed.data,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        homeScore: homeScore ?? 0,
        awayScore: awayScore ?? 0,
        status: getMatchStatus(startTime, endTime) ?? "scheduled",
      })
      .returning();

    const broadCastMatchCreated = res.app.locals.broadCastMatchCreated;
    if (broadCastMatchCreated) {
      try {
        broadCastMatchCreated(event);
      } catch (broadcastError) {
        console.error("Failed to broadcast match_created", broadcastError);
      }
    }
    res.status(200).json({ data: event });
  } catch (e) {
    res
      .status(500)
      .json({ error: "Failed to create match", details: JSON.stringify(e) });
  }
});
matchRouter.patch("/:id/score", async (req, res) => {
    const matchId = Number(req.params.id);

    if (!Number.isInteger(matchId)) {
        return res.status(400).json({ error: "Invalid match ID" });
    }

    const { homeScore, awayScore } = req.body;

    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) {
        return res.status(400).json({ error: "homeScore and awayScore must be integers" });
    }

    try {
        const [updated] = await db
            .update(matches)
            .set({ homeScore, awayScore })
            .where(eq(matches.id, matchId))
            .returning();

        if (!updated) {
            return res.status(404).json({ error: "Match not found" });
        }

        res.status(200).json({ data: updated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to update score" });
    }
});