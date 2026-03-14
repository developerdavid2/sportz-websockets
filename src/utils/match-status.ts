import { MATCH_STATUS } from "../validation/matches.js";

type MatchStatus = (typeof MATCH_STATUS)[keyof typeof MATCH_STATUS];

interface Match {
  startTime: string | Date;
  endTime: string | Date;
  status: MatchStatus;
}

export function getMatchStatus(
  startTime: string | Date,
  endTime: string | Date,
  now: Date = new Date(),
): MatchStatus | null {
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  if (now < start) return MATCH_STATUS.SCHEDULED;
  if (now >= end) return MATCH_STATUS.FINISHED;

  return MATCH_STATUS.LIVE;
}

export async function syncMatchStatus(
  match: Match,
  updateStatus: (status: MatchStatus) => Promise<void>,
): Promise<MatchStatus> {
  const nextStatus = getMatchStatus(match.startTime, match.endTime);

  if (!nextStatus) {
    return match.status;
  }

  if (match.status !== nextStatus) {
    await updateStatus(nextStatus);
    match.status = nextStatus;
  }

  return match.status;
}
