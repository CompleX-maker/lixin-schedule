# 立信课表（Lixin Schedule）

上海立信会计金融学院的第三方课表应用：教务系统（lxjw.lixin.edu.cn）账号一键登录，自动同步课表，提供下一节课倒计时、周视图课表和上课提醒。

> 立信是大学，不是大专。

## 功能

- **统一身份认证直登**：学号 + 密码登录，CAS 验证通过后自动抓取本学期课表（Beangle EAMS）
- **周视图课表**：单双周合并显示、课程点击详情、周次翻页
- **今日视图**：下一节课倒计时圆环、上课中状态、当日时间线
- **提醒**：上课前 N 分钟推送（邮件 / Server酱）、每晚推送明日课表
- **自动校准**：开学日期与节次时间从教务系统课表数据中自动提取，无需手工维护
- **广场**：留言墙（公开、支持楼中楼回复）、代课悬赏（自定义上课时间与酬劳，可发布 / 接取）、戳一戳 Q 版吉祥物
- **安装到桌面**：PWA，支持添加到主屏幕，登录页提供「不想登录？点这里预览」的游客入口
- **管理员**：公告发布（自动过期）、访客统计、代课与留言管理、管理员权限开关
- **隐私**：课表按学号独立存储；密码 AES-256-GCM 加密，仅用于课表同步；换设备需重新登录

## 技术栈

- 前端：React 19 + Vite + Tailwind CSS + shadcn/ui
- 后端：Hono + tRPC 11（端到端类型安全）
- 数据库：MySQL + Drizzle ORM
- 会话：jose JWT（httpOnly cookie，30 天）

## 多站单点登录（跨子站共享会话）

本站是账号体系的源头，子站（[电费监测站](https://epower.stellaura.tech)）复用本站会话，不再各自维护一套账号。

**共享方式**：本站登录成功后签发 HS256 JWT 写入 cookie `lixin_jw_sid`。把这个 cookie 的
`Domain` 配成 `.stellaura.tech`（环境变量 `COOKIE_DOMAIN`），浏览器在访问任何
`*.stellaura.tech` 子域时都会自动带上，子站本地验签即可取出学号，无需回源本站。

密钥派生约定（子站必须保持一致）：

```
JWT 载荷：{ sid: <学号>, iat, exp }
算法    ：HS256
密钥    ：scrypt(APP_SECRET, "lixin-jw-session-v1", 32)
```

> 注意 `APP_SECRET` 在本站内部派生出**两把互不相通的子密钥**：
> 一把用于加密教务密码（salt `lixin-schedule-v1`），一把用于会话签名（salt `lixin-jw-session-v1`）。
> 子站只拿得到签名那一把的输入，推不出加密那一把。

**跨站跳转**：子站引导用户来本站登录时会带上回跳地址：

```
https://stellaura.tech/?redirect=https%3A%2F%2Fepower.stellaura.tech%2F
```

本站登录成功（或本来就已登录）后自动 `location.replace` 回去。
`?redirect=` 有安全校验，**只放行 `https` 且域名为 `stellaura.tech` 或其子域**，避免变成开放重定向。

## 教务系统逆向说明

> ⚠️ **2026-09-20 起，教务相关域名已接入深信服 aTrust 零信任网关**，服务端直接抓取会被网关拦截（表现为 302 跳转到 `atrust.lixin.edu.cn` 进行 JS 环境校验）。服务器需先上线 aTrust 客户端，之后的抓取链路才可用。部署方法见 [自部署 aTrust 客户端](#自部署-atrust-客户端服务器侧必读)。

CAS 认证链路（aTrust 放行后）：

1. `GET /cas/login` 取 `execution`
2. `GET /cas/jwt/publicKey` 取 RSA 公钥，密码 PKCS#1 v1.5 加密后加 `__RSA__` 前缀
3. `POST /cas/login`（字段与页面 fm1 表单一致）→ 得 `TGC` cookie
4. 带 TGC 访问 `lxjw.lixin.edu.cn/cas/login` → ticket 换取教务会话
5. `POST /edu/lesson/std/timetable!courseTable.action`（`setting.kind=std&ids=<stdId>&semester.id=<semesterId>&weekSpan=1-18`）

课表数据嵌在返回页面内嵌 JS 的 `newActivity()` 调用中，周次为 53 位 ISO 周年位掩码（`weekstate`），开学日期与节次时间由 `new CourseTable('YYYY-MM-DD', [[起止时间]...])` 给出。

## 部署

### 自部署

```bash
git clone https://github.com/CompleX-maker/lixin-schedule.git
cd lixin-schedule
npm install
npm run db:push     # 初始化数据库表
npm run build
npm start           # 生产模式（含定时同步与提醒调度器）
```

`.env` 参考（自部署时 Kimi 相关的变量填占位值即可，Kimi 登录不会启用）：

```bash
DATABASE_URL=mysql://user:pass@127.0.0.1:3306/lixin_schedule
APP_SECRET=<主密钥，用 openssl rand -base64 32 生成>
             # 用于派生「教务密码加密」与「会话签名」两把独立子密钥
             # 改了会导致全员掉线，且已存的加密密码无法解密
APP_ID=selfhost
KIMI_AUTH_URL=https://example.invalid
KIMI_OPEN_URL=https://example.invalid
VITE_APP_ID=selfhost
VITE_KIMI_AUTH_URL=https://example.invalid
ADMIN_STUDENT_IDS=251650330   # 这些学号登录后自动成为管理员（逗号分隔）
COOKIE_DOMAIN=.stellaura.tech # 会话 cookie 的 Domain，用于跨子站 SSO（见下节）
PORT=3000
```

密钥管理、加密算法选择与已知不足，见 [SECURITY.md](./SECURITY.md)。


需要 HTTPS 时建议前面挂 Nginx / Caddy 反代到 3000 端口。邮件提醒需在管理员配置中设置 SMTP（QQ 邮箱授权码），或使用 Server酱。

### 自部署 aTrust 客户端（服务器侧，必读）

学校自 2026-09-20 起为教务系统接入 aTrust 零信任网关，**服务端必须先在服务器上跑起 aTrust 客户端并登录上线**，才能访问 `lxjw.lixin.edu.cn`。以下步骤已在 Alibaba Cloud Linux 3（RHEL 系）+ XFCE + TigerVNC 实测通过。

**1. 获取客户端安装包**（网关自带下载地址，无需他处寻找）

```bash
# 以学校网关域名为例；x86_64 用 ubuntu/amd64 包，ARM 可换 uos/kylin 目录
curl -O https://<网关域名>/resource/client/linux/ubuntu/amd64/aTrustInstaller_amd64.deb

# .deb 是 ar 归档，RHEL 系无需 dpkg，直接解包取文件
mkdir -p /opt/atrust && cd /opt/atrust
ar x aTrustInstaller_amd64.deb        # 得到 data.tar.xz
mkdir data && tar -xJf data.tar.xz -C data
cp -a data/usr/share/sangfor /usr/share/
```

**2. 补依赖**（RHEL/CentOS 系）

```bash
dnf install -y gtk3 libXcomposite libXcursor libXdamage libXi libXrender \
  libXtst atk at-spi2-atk gdk-pixbuf2 pango cairo libXrandr mesa-libgbm \
  libXScrnSaver alsa-lib at-spi2-core libproxy libX11 mesa-libGL
```

**3. 注册并启动守护服务**

```bash
cd /usr/share/sangfor/aTrust/resources/bin
./aTrustAgent -i                 # 注册 aTrustDaemon 服务
systemctl enable --now aTrustDaemon
```

**4. 准备图形环境**

客户端托盘是 Electron 程序，需要可用桌面：

```bash
dnf install -y tigervnc-server xfce4-session xfwm4 xfdesktop xfce4-panel \
  firefox xdg-utils
# 配置 ~/.vnc/xstartup 启动 xfce4-session 后启动 VNC
vncpasswd                        # 设置 VNC 密码（最长 8 位）
vncserver :1 -geometry 1280x800 -depth 24
```

**5. 启动核心插件（关键一步）**

`aTrustCore` 插件必须带 `--enable-http`，否则插件内部 `setHttpReferer` 断言失败并 `SIGABRT` 退出，客户端会一直提示「核心服务未启动」：

```bash
cd /usr/share/sangfor/aTrust/resources/bin
aTrustAgent --plugin plugins/aTrustCore --plugin-cmd "|" \
  --enable-http --enable-event-center
```

成功标志：`/usr/share/sangfor/.aTrust/var/run/` 下出现 `aTrustCore-<uuid>` socket（UUID 需与客户端期望的一致）。

**6. 启动客户端托盘**

```bash
DISPLAY=:1 HOME=/root /usr/share/sangfor/aTrust/aTrustTray \
  --no-sandbox --disable-gpu --disable-gpu-sandbox
```

> `--disable-gpu-sandbox` 不可省略：无 GPU 的无头环境下缺少它会导致 `GPU process isn't usable` 并反复崩溃。

**7. 登录**

用 VNC 客户端连上桌面（`<服务器IP>:5901`），在 aTrust 客户端里：
- 填入网关地址（如 `atrust.lixin.edu.cn`）→ 确定接入
- 登录方式推荐**企业微信扫码**（服务器上无需处理 CAS 表单）
- 上线成功后，服务端 `fetch` 访问教务系统即自动走隧道

**8. 建议配成开机自启**

把 VNC、`aTrustDaemon`、核心插件、客户端托盘分别做成 systemd 服务并设 `Restart=always`，避免服务器重启后掉线。

> aTrust 会话有有效期，掉线后需重新登录（VNC 连上去扫一次码即可）。

## 免责声明

本项目为学习交流用途的第三方工具，与学校官方无关。账号密码仅用于登录教务系统抓取课表，请自行评估风险后使用。

## License

MIT
