import { GITHUB_URL } from "@/const";
import { Github, Star } from "lucide-react";

/** 页脚 GitHub 入口 + 署名 */
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
    </footer>
  );
}
