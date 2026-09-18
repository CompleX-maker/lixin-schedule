# 立信课表（Lixin Schedule）

上海立信会计金融学院的第三方课表应用：教务系统（lxjw.lixin.edu.cn）账号一键登录，自动同步课表，提供下一节课倒计时、周视图课表和上课提醒。

> 立信是大学，不是大专。

## 功能

- **统一身份认证直登**：学号 + 密码登录，CAS 验证通过后自动抓取本学期课表（Beangle EAMS）
- **周视图课表**：单双周合并显示、课程点击详情、周次翻页
- **今日视图**：下一节课倒计时圆环、上课中状态、当日时间线
- **提醒**：上课前 N 分钟推送（邮件 / Server酱）、每晚推送明日课表
- **自动校准**：开学日期与节次时间从教务系统课表数据中自动提取，无需手工维护
- **隐私**：课表按学号独立存储；密码 AES-256-GCM 加密，仅用于课表同步；换设备需重新登录

## 技术栈

- 前端：React 19 + Vite + Tailwind CSS + shadcn/ui
- 后端：Hono + tRPC 11（端到端类型安全）
- 数据库：MySQL + Drizzle ORM
- 会话：jose JWT（httpOnly cookie，30 天）

## 教务系统逆向说明

登录链路（纯 CAS，无 aTrust）：

1. `GET /cas/login` 取 `execution`
2. `GET /cas/jwt/publicKey` 取 RSA 公钥，密码 PKCS#1 v1.5 加密后加 `__RSA__` 前缀
3. `POST /cas/login`（字段与页面 fm1 表单一致）→ 得 `TGC` cookie
4. 带 TGC 访问 `lxjw.lixin.edu.cn/cas/login` → ticket 换取教务会话
5. `POST /edu/lesson/std/timetable!courseTable.action`（`setting.kind=std&ids=<stdId>&semester.id=<semesterId>&weekSpan=1-18`）

课表数据嵌在返回页面内嵌 JS 的 `newActivity()` 调用中，周次为 53 位 ISO 周年位掩码（`weekstate`），开学日期与节次时间由 `new CourseTable('YYYY-MM-DD', [[起止时间]...])` 给出。

## 部署

```bash
npm install
cp .env.example .env   # 配置 DATABASE_URL / APP_SECRET 等
npm run db:push
npm run build
npm start              # 生产模式（含定时同步与提醒调度器）
```

邮件提醒需在管理员配置中设置 SMTP（QQ 邮箱授权码），或使用 Server酱。

## 免责声明

本项目为学习交流用途的第三方工具，与学校官方无关。账号密码仅用于登录教务系统抓取课表，请自行评估风险后使用。

## License

MIT
