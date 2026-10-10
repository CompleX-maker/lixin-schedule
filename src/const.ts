/**
 * 全站常量与备案信息
 *
 * 备案号为空字符串时不渲染对应项，方便更换域名 / 备案号时平滑过渡。
 */

export const LOGIN_PATH = "/login";

/** 项目开源仓库地址（页脚入口） */
export const GITHUB_URL = "https://github.com/CompleX-maker/lixin-schedule";

/* ------------------------------------------------------------------ *
 * 备案信息
 *
 * 依据《互联网信息服务管理办法》与《计算机信息网络国际联网安全保护管理办法》：
 *   - ICP 备案号：必须展示在页面底部，并链接到工信部备案系统
 *   - 公安联网备案号：同样需展示在底部，并链接到公安备案平台
 * 两类备案号任一为空时，对应的那一行不渲染。
 * ------------------------------------------------------------------ */

/** ICP 备案号（工信部） */
export const ICP_LICENSE = "冀ICP备2026041541号";

/** 工信部备案查询地址 */
export const ICP_URL = "https://beian.miit.gov.cn/";

/**
 * 公安联网备案号
 *
 * 目前尚未办理，留空即可 —— 页脚不会显示这一项。
 * 办下来后填入形如「冀公网安备1306XXXXXXXX号」即可自动展示。
 */
export const POLICE_LICENSE = "";

/** 公安备案查询地址 */
export const POLICE_URL = "https://beian.mps.gov.cn/";
