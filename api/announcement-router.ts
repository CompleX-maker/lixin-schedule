import { z } from "zod";
import { createRouter, authedQuery, adminQuery } from "./middleware";
import {
  closeAnnouncement,
  createAnnouncement,
  getActiveAnnouncement,
  listAnnouncements,
} from "./queries/announcements";

/** 全站通知（调课提醒）：用户端弹窗展示，管理员发布/关闭，支持定时自动关闭 */
export const announcementRouter = createRouter({
  /** 当前生效的通知（用户端弹窗用，到期自动消失） */
  active: authedQuery.query(async () => {
    return getActiveAnnouncement();
  }),

  /** 管理员：发布通知。ttlHours 为空 = 不自动关闭（只能手动关） */
  publish: adminQuery
    .input(
      z.object({
        title: z.string().trim().min(1, "标题不能为空").max(120),
        content: z.string().trim().min(1, "内容不能为空").max(2000),
        ttlHours: z.number().int().min(1).max(24 * 30).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const id = await createAnnouncement(ctx.user.id, input.title, input.content, input.ttlHours);
      return { id };
    }),

  /** 管理员：立即关闭指定通知 */
  close: adminQuery.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    await closeAnnouncement(input.id);
    return { ok: true };
  }),

  /** 管理员：最近发布的通知列表 */
  list: adminQuery.query(async () => {
    return listAnnouncements(8);
  }),
});
