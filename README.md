# 编程猫惊喜盲盒

生产版为 Node.js + Express + 独立 MySQL 架构，适配 Ubuntu 24.04 应用服务器。

当前学生端无需姓名或 ID 验证，每个浏览器设备仅能抽取一次。传送带使用 7 个独立礼物造型，盲盒名称保持不变；每次扫描固定锁定第 2 个“晴空飞船”礼品，刷新页面也只会显示同一份兑换凭证。

## 页面

- `/`：免登录、单次抽奖、截图兑换凭证
- `/admin.html`：教师管理后台
- `/api/health`：应用与数据库健康检查

## 本地启动

1. 在阿里云 RDS 的 `manghe` 数据库执行 `database/schema.sql`。
2. 复制 `.env.example` 为 `.env`，填写数据库连接和会话密钥。
3. 运行：

```bash
npm ci
npm start
```

应用默认监听独立端口 `127.0.0.1:3103`，由 Nginx 按子域名对外提供访问，不影响同一服务器上的其他实例。

## 管理后台

管理后台及历史学员数据能力仍保留，学生抽奖页面不再依赖学员 ID 或数据库抽奖次数记录。

## 学员导入

后台批量导入每行只要求两列：

```text
BC20260801, 陈一诺
BC20260802, 林子航
```

第三列班级可选。CSV 示例见 `database/students-template.csv`。

## 阿里云 RDS MySQL

`.env.example` 已配置 RDS 地址、数据库名和账号，真实密码只填写在服务器的 `.env`。RDS 白名单仅允许应用服务器公网出口 IP `39.96.54.176/32`，不要向整个互联网开放。

完整的 GitHub 拉取、独立实例、子域名和 HTTPS 部署步骤见 `deploy/README.md`。后续更新使用 `deploy/update-from-github.sh`。

GitHub 仓库：`https://github.com/shiqi4712/manghe`

正式访问域名：`https://mh.bcmty.cn`

## 初始管理员

执行 `database/schema.sql` 后会创建两个管理员账号：`shiqi`（诗琪）和 `yujing`（余婧）。密码以 bcrypt 哈希存储在 MySQL，不会明文保存。上线前请在数据库中替换初始密码哈希。
