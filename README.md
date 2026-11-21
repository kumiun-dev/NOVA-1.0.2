# NOVA 1.0.2 客户切割版

NOVA 是面向外贸团队的 CRM 与业务协作系统。本仓库提供部署在客户自有服务器上的独立版本。

## 产品预览

![NOVA 登录页面](docs/screenshots/login.png)

## 主要功能

- 客户资料、销售跟进看板和业务转化概览
- WhatsApp、Facebook、Instagram、LinkedIn 等渠道消息工作台
- 客户管理员配置公司社媒服务 Key，员工共享服务配置并分别绑定账号
- 每位用户独立配置邮箱和 Gmail
- `/team` 员工管理、密码重置和模块授权，团队业务数据隔离
- 产品与报价、知识库、AI 助手、海关统计
- AI 获客搜索 NOVA 主站共享采集库；主站更新数据后重新搜索即可
- WhatsApp 通过 NOVA 主站授权中转服务接入

## Logo

品牌 Logo：`public/nova-logo.png`。登录页图标：`public/favicon.svg`。

## 部署概要

详细步骤参见 [SELF-HOSTING.md](SELF-HOSTING.md)。需要 Linux、Docker Compose、公网 HTTPS 域名和 NOVA 签发的域名授权码。容器默认端口为 3000，Compose 绑定 `127.0.0.1:3000`，请由 Nginx/Caddy 等反向代理接入 HTTPS。

```bash
cp .env.example .env
# 编辑 NOVA_DOMAIN 等配置
# 按 SELF-HOSTING.md 设置授权及首次管理员信息
docker compose up -d --build
```

## 版本边界和注意事项

- 本版固定为客户自有服务器模式，不含平台管理、授权签发、共享库管理、主站社媒中转或主站密钥。
- 仅 WhatsApp 授权中转和 AI 获客搜索使用 NOVA 主站服务；邮件、客户数据及社媒服务凭据由客户实例管理。
- WhatsApp 和社媒真实收发需要主站接口已部署，且客户站点公网 HTTPS 回调可达。模拟验证不等于生产账号验收。
- 共享采集资料是企业名录，不代表企业当前采购意向。
- 升级前备份 `.env`、数据库和持久化卷；保留 `nova_data`。
- 本项目采用 [MIT License](LICENSE)，允许复制、修改、安装使用、再分发及商用；再分发时请保留版权与许可证文本。
- MIT 许可仅覆盖本仓库中由版权方有权授权的内容；第三方依赖及素材仍按各自许可证或条款使用。

## 技术栈

Next.js 15、React 19、TypeScript、SQLite、Docker Compose、Node.js 22。


