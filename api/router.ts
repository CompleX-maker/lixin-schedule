import { announcementRouter } from "./announcement-router";
import { authRouter } from "./auth-router";
import { createRouter, publicQuery } from "./middleware";
import { scheduleRouter } from "./schedule-router";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  announcement: announcementRouter,
  auth: authRouter,
  schedule: scheduleRouter,
});

export type AppRouter = typeof appRouter;
