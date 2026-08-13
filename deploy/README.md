# Ubuntu 24.04：GitHub + 子域名部署

本应用作为第三个独立实例运行：Nginx 只按子域名转发到 `127.0.0.1:3103`，不会占用公网端口，也不会覆盖服务器已有的两个站点。若 `3103` 已被使用，请换一个空闲端口。

## 1. 部署前确认

安装服务器依赖：

```bash
sudo apt update
sudo apt install -y git nginx nodejs npm curl
node --version
```

Node.js 版本需为 18 或更高。如果系统仓库提供的版本低于 18，请先通过 NodeSource 或 nvm 安装较新的 LTS 版本。

在应用服务器检查现有端口和 Nginx 域名：

```bash
sudo ss -ltnp
sudo nginx -T 2>/dev/null | grep -E 'server_name|proxy_pass'
```

在域名 DNS 控制台新增一条 A 记录：

```text
抽奖子域名 -> 39.96.54.176
```

本项目使用 `mh.bcmty.cn`。等待 DNS 生效后可用 `dig +short mh.bcmty.cn` 检查。

## 2. 让服务器读取 GitHub

仓库 `shiqi4712/manghe` 是公开仓库，不需要 GitHub 账号、令牌或 Deploy Key。若服务器不能连接 `github.com:443`，可使用 GitHub 官方 `codeload.github.com` 归档地址。

首次拉取代码：

```bash
sudo mkdir -p /var/www
sudo chown "$USER":www-data /var/www
mkdir /var/www/surprise-draw
curl -fL --retry 3 --connect-timeout 15 \
  https://codeload.github.com/shiqi4712/manghe/tar.gz/refs/heads/main \
  | tar -xz --strip-components=1 -C /var/www/surprise-draw
cd /var/www/surprise-draw
npm ci --omit=dev
```

GitHub 仓库为 `shiqi4712/manghe`。正式发布分支使用 `main`。

## 3. 配置阿里云 RDS MySQL 和环境变量

现有数据库名称与账号均为 `manghe`。RDS 公网地址已经写入 `.env.example`，白名单只允许应用服务器公网出口 IP `39.96.54.176/32`。在 RDS 的 `manghe` 数据库执行 `database/schema.sql`；脚本只创建业务数据表，不创建数据库或数据库账号。

首次运行配置脚本会创建 `.env` 后停止：

```bash
cd /var/www/surprise-draw
sudo bash deploy/configure-server.sh mh.bcmty.cn 3103
sudo nano .env
```

确认 `DB_HOST`、`DB_NAME`、`DB_USER`，只在服务器 `.env` 中填写真实 `DB_PASSWORD`，并生成会话密钥：

```bash
openssl rand -hex 32
```

把输出填入 `TOKEN_SECRET`。不要把 `.env` 提交到 GitHub。

## 4. 启动独立实例和子域名

填写 `.env` 后再次运行：

```bash
sudo bash deploy/configure-server.sh mh.bcmty.cn 3103
sudo systemctl status surprise-draw --no-pager
curl http://127.0.0.1:3103/api/health
```

配置 HTTPS：

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d mh.bcmty.cn
```

最终访问地址：

```text
学生端：https://mh.bcmty.cn/
管理端：https://mh.bcmty.cn/admin.html
```

## 5. 后续从 GitHub 更新

推送新版本到 GitHub 后，在服务器执行：

```bash
cd /var/www/surprise-draw
sudo BRANCH=main bash deploy/update-from-github.sh
```

脚本在 Git checkout 中使用 fast-forward 更新；归档部署则继续从 GitHub 官方 `codeload` 下载。随后安装锁定依赖、检查代码、重启独立服务并检查 `/api/health`。服务器的 `.env` 和 `node_modules` 不会被归档覆盖。

## 故障检查

```bash
sudo journalctl -u surprise-draw -n 100 --no-pager
sudo nginx -t
sudo systemctl status surprise-draw --no-pager
curl -i http://127.0.0.1:3103/api/health
```
