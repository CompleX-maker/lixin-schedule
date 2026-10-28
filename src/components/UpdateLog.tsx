import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/** 面向同学的更新日志（不写技术细节，只讲能看到的变化） */
type Entry = {
  date: string;
  title: string;
  emoji?: string;
  items: string[];
  tag?: "新功能" | "优化" | "修复";
};

const ENTRIES: Entry[] = [
  {
    date: "2026-10-28",
    title: "课表一屏看完",
    emoji: "📐",
    tag: "优化",
    items: [
      "课表现在自动铺满一屏：周一到周日、13 节课全在里面，不用上下滑也不用左右滑",
      "屏幕高就松一点、屏幕矮就紧一点，字不会挤成一团",
      "连着 2 节以上的课会直接显示教室，找教室不用再点开",
      "点任意一门课，还是能看完整时间、地点、老师和备注",
    ],
  },
  {
    date: "2026-10-27",
    title: "协作模式来了",
    emoji: "🤝",
    tag: "新功能",
    items: [
      "在「今日」页最下面点「和同学看共同空闲」，就能看到你们**都没课**的时间段，不用再来回问",
      "可以同时带上好几个同学（最多 30 人），一起找大家都空的时间",
      "空闲直接显示成钟点，比如 08:30–10:20，比「第几节」直观",
      "人多了不好约？可以放宽到「容忍 1～2 人有课」，先把大块时间圈出来",
      "学号输错了不要紧，发出去的邀请可以**撤回**重发",
      "对方还没注册也没关系，会给你一条邀请链接，直接发群里让 ta 点开就行",
    ],
  },
  {
    date: "2026-10-27",
    title: "安卓 App 上线",
    emoji: "📱",
    tag: "新功能",
    items: [
      "桌面小组件：不用打开 App 就能看到今天几节课、第几节、在哪上",
      "下载地址固定为 stellaura.tech/download，以后直接在 App 里提示更新",
      "首次打开会问你要不要把课表放到桌面，右上角也有个小圆按钮可以随时添加",
    ],
  },
  {
    date: "2026-10-26",
    title: "课表可以自己改了",
    emoji: "✏️",
    tag: "优化",
    items: [
      "课表里的课可以标成「水课」，标记后不会再占你的空闲时间",
      "调课的同学可以手动改这门课的星期和节次，改过的会显示「已调课」",
      "这些设置只影响你自己看到的空闲计算，不会改动教务数据",
    ],
  },
  {
    date: "2026-10-24",
    title: "一些细节修复",
    emoji: "🔧",
    tag: "修复",
    items: [
      "修好了部分手机上网页顶部被状态栏挡住的问题",
      "优化了打开速度，课程数据会先显示缓存再后台刷新",
    ],
  },
];

const TAG_STYLE: Record<string, string> = {
  新功能: "bg-primary/12 text-primary",
  优化: "bg-emerald-500/12 text-emerald-600",
  修复: "bg-amber-500/15 text-amber-600",
};

/** 页脚里的入口 + 弹层 */
export function UpdateLogEntry() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="text-[11px] opacity-70 underline-offset-2 transition-opacity hover:opacity-100 hover:underline"
        onClick={() => setOpen(true)}
      >
        更新日志
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              className="max-h-[86vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-background p-5 shadow-xl sm:rounded-3xl"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black tracking-tight">更新日志</h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">最近给课表加了什么</p>
                </div>
                <button
                  className="rounded-xl border px-3 py-1.5 text-sm text-muted-foreground"
                  onClick={() => setOpen(false)}
                >
                  关闭
                </button>
              </div>

              <div className="space-y-5">
                {ENTRIES.map((e) => (
                  <article key={e.date + e.title}>
                    <div className="mb-1.5 flex items-center gap-2">
                      {e.emoji && <span className="text-base">{e.emoji}</span>}
                      <h3 className="text-sm font-bold">{e.title}</h3>
                      {e.tag && (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${TAG_STYLE[e.tag]}`}>
                          {e.tag}
                        </span>
                      )}
                      <span className="ml-auto text-[11px] text-muted-foreground">{e.date}</span>
                    </div>
                    <ul className="space-y-1.5 rounded-xl bg-muted/40 p-3 text-[13px] leading-relaxed text-muted-foreground">
                      {e.items.map((t, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary/60" />
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>

              <p className="mt-5 text-center text-[11px] text-muted-foreground">
                有想法或遇到 bug，欢迎在「广场」留言
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
