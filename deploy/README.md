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

例如 `draw.example.com`。等待 DNS 生效后可用 `dig +short draw.example.com` 检查。

## 2. 让服务器读取 GitHub

公开仓库可直接使用 HTTPS 地址。私有仓库建议为服务器创建只读 Deploy Key，并把公钥添加到 GitHub 仓库的 **Settings > Deploy keys**：

```bash
ssh-keygen -t ed25519 -f ~/.ssh/surprise_draw_deploy -C surprise-draw-server
cat ~/.ssh/surprise_draw_deploy.pub
```

为该密钥建立独立 GitHub 主机别名，避免影响服务器其他仓库：

```sshconfig
Host github-surprise-draw
  HostName github.com
  User git
  IdentityFile ~/.ssh/surprise_draw_deploy
  IdentitiesOnly yes
```

保存为 `~/.ssh/config` 后设置权限并验证连接：

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/config ~/.ssh/surprise_draw_deploy
chmod 644 ~/.ssh/surprise_draw_deploy.pub
ssh -T git@github-surprise-draw
```

首次拉取代码：

```bash
sudo mkdir -p /var/www
sudo chown "$USER":www-data /var/www
git clone --branch main git@github-surprise-draw:shiqi4712/manghe.git /var/www/surprise-draw
cd /var/www/surprise-draw
npm ci --omit=dev
```

GitHub 仓库为 `shiqi4712/manghe`。正式发布分支使用 `main`。

## 3. 配置 MySQL 和环境变量

在独立 MySQL 执行 `database/schema.sql`，并只允许应用服务器私网 IP `172.24.10.24` 访问 `3306`。

首次运行配置脚本会创建 `.env` 后停止：

```bash
cd /var/www/surprise-draw
sudo bash deploy/configure-server.sh draw.example.com 3103
sudo nano .env
```

填写真实的 `DB_HOST`、`DB_NAME`、`DB_USER`、`DB_PASSWORD`，并生成会话密钥：

```bash
openssl rand -hex 32
```

把输出填入 `TOKEN_SECRET`。不要把 `.env` 提交到 GitHub。

## 4. 启动独立实例和子域名

填写 `.env` 后再次运行：

```bash
sudo bash deploy/configure-server.sh draw.example.com 3103
sudo systemctl status surprise-draw --no-pager
curl http://127.0.0.1:3103/api/health
```

配置 HTTPS：

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d draw.example.com
```

最终访问地址：

```text
学生端：https://draw.example.com/
管理端：https://draw.example.com/admin.html
```

## 5. 后续从 GitHub 更新

推送新版本到 GitHub 后，在服务器执行：

```bash
cd /var/www/surprise-draw
sudo BRANCH=main bash deploy/update-from-github.sh
```

脚本只接受 fast-forward 更新，随后安装锁定依赖、检查代码、重启独立服务并检查 `/api/health`。服务器的 `.env` 不在 Git 中，不会被更新覆盖。

## 故障检查

```bash
sudo journalctl -u surprise-draw -n 100 --no-pager
sudo nginx -t
sudo systemctl status surprise-draw --no-pager
curl -i http://127.0.0.1:3103/api/health
```
