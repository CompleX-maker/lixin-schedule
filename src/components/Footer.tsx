import { GITHUB_URL, ICP_LICENSE, ICP_URL, POLICE_LICENSE, POLICE_URL } from "@/const";
import { Github, Star } from "lucide-react";

/**
 * 页脚：GitHub 入口 + 署名 + 备案信息
 *
 * 备案号是法规要求必须展示的，且必须可点击跳转到官方查询平台：
 *   - ICP 备案 → 工信部 https://beian.miit.gov.cn/
 *   - 公安联网备案 → https://beian.mps.gov.cn/
 * 未配置的备案号不会渲染（见 src/const.ts）。
 */
export function Footer() {
  return (
    <footer className="flex flex-col items-center justify-center gap-1.5 py-4 text-xs text-muted-foreground">
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors hover:bg-muted"
      >
        <Github className="h-3.5 w-3.5" />
        <span>开源项目</span>
        <span className="inline-flex items-center gap-0.5 text-primary">
          <Star className="h-3 w-3" />
          求个 Star
        </span>
      </a>

      <span className="text-[11px] opacity-70">Designed by 初晓</span>

      {/* 备案信息 */}
      {(ICP_LICENSE || POLICE_LICENSE) && (
        <div className="mt-0.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] opacity-70">
          {ICP_LICENSE && (
            <a
              href={ICP_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="transition-opacity hover:opacity-100 hover:underline"
            >
              {ICP_LICENSE}
            </a>
          )}
          {ICP_LICENSE && POLICE_LICENSE && <span className="opacity-40">·</span>}
          {POLICE_LICENSE && (
            <a
              href={POLICE_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 transition-opacity hover:opacity-100 hover:underline"
            >
              {POLICE_LICENSE}
            </a>
          )}
        </div>
      )}
    </footer>
  );
}
