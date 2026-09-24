import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Send,
  ExternalLink,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Smartphone,
  AlertCircle,
} from "lucide-react";

/**
 * Server酱 SendKey 配置区
 *
 * 设计目标：**让不会用的人也能配上**
 *   - 三步图文说明，第一步直接给跳转链接
 *   - 一键「测试推送」，立刻知道成没成功（这是最关键的反馈）
 *   - 格式实时校验，填错当场提示
 */
export function ServerChanField({
  value,
  onChange,
  savedKey,
}: {
  value: string;
  onChange: (v: string) => void;
  savedKey: string;
}) {
  const [showHelp, setShowHelp] = useState(false);

  const test = trpc.schedule.testServerChan.useMutation({
    onSuccess: () => toast.success("推送已发送，去微信看看收到没～"),
    onError: (e) => toast.error(e.message, { duration: 6000 }),
  });

  const trimmed = value.trim();
  // 与后端 sendKeyKind 保持一致
  const looksTurbo = /^SCT[a-zA-Z0-9]+$/i.test(trimmed) && trimmed.length >= 20;
  const looksSc3 = /^sctp\d+t/i.test(trimmed);
  const valid = looksTurbo || looksSc3;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="sct" className="flex items-center gap-1.5">
          <Smartphone className="h-3.5 w-3.5" />
          微信推送（Server酱）
        </Label>
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          className="flex items-center gap-0.5 text-[11px] text-primary hover:underline"
        >
          {showHelp ? "收起" : "怎么获取？"}
          {showHelp ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>
      </div>

      {/* 图文说明 */}
      {showHelp && (
        <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-[11px] leading-relaxed">
          <p className="font-medium">三步搞定，之后上课提醒直接进微信</p>
          <ol className="space-y-1.5">
            <li className="flex items-start gap-1.5">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-medium text-primary">
                1
              </span>
              <span>
                打开{" "}
                <a
                  href="https://sct.ftqq.com"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 font-medium text-primary underline"
                >
                  sct.ftqq.com
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>{" "}
                ，用<b>微信扫码</b>登录
              </span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-medium text-primary">
                2
              </span>
              <span>
                进入「<b>SendKey</b>」页面，点复制
              </span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-medium text-primary">
                3
              </span>
              <span>
                粘贴到下面，点「<b>测试推送</b>」确认收到
              </span>
            </li>
          </ol>
          <p className="flex items-start gap-1 rounded bg-background/70 px-2 py-1 text-muted-foreground">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              SendKey 是 <b>SCT</b> 开头的一长串。注意不要复制成 Server酱³ 的
              Key（那个以 sctp 开头，只能推到它自己的 APP）
            </span>
          </p>
        </div>
      )}

      <Input
        id="sct"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="SCTxxxxxxxxxxxxxxxxxxxxx"
        autoComplete="off"
        spellCheck={false}
        className={
          trimmed && !valid
            ? "border-destructive/60 focus-visible:ring-destructive/30"
            : ""
        }
      />

      {/* 实时格式反馈 */}
      {trimmed && !valid && (
        <p className="flex items-center gap-1 text-[11px] text-destructive">
          <AlertCircle className="h-3 w-3" />
          格式不对：应该是 SCT 开头的长串，你填的只有 {trimmed.length} 位
        </p>
      )}
      {valid && (
        <p className="flex items-center gap-1 text-[11px] text-emerald-600">
          <CheckCircle2 className="h-3 w-3" />
          格式正确{looksSc3 ? "（检测到 Server酱³，将走官方入口）" : ""}
        </p>
      )}

      {/* 测试按钮 */}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full text-xs"
        disabled={test.isPending || (!value.trim() && !savedKey)}
        onClick={() => test.mutate({ key: value.trim() || undefined })}
      >
        <Send className="mr-1.5 h-3 w-3" />
        {test.isPending ? "发送中…" : "测试推送"}
      </Button>
      <p className="text-[11px] text-muted-foreground">
        点一下会往你微信发条测试消息，收到就说明配置好了
      </p>
    </div>
  );
}
