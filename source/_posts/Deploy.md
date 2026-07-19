---
title: 'Deploy: 在 CentOS 9 上使用宝塔与 Docker Compose 部署 .NET 10 WebAPI 和 MySQL'
cover: /img/bg/deploy-cover.webp
abbrlink: d7k2m9x4
date: 2026-07-19 16:31:49
categories:
  - .NET
tags:
  - Docker Compose
  - .NET
  - MySQL
  - CentOS
  - 宝塔
  - Nginx
  - Docker
  - 部署
  - ASP.NET Core
glossary:
  DockerCompose:
    title: Docker Compose
    brief: Docker 官方编排工具，通过 YAML 文件定义多容器应用的服务、网络与数据卷，实现一键启动整套微服务栈。
  Nginx:
    title: Nginx
    brief: 高性能反向代理与 Web 服务器，常用于静态资源托管、负载均衡与 HTTPS 终止。
  MySQL:
    title: MySQL
    brief: 开源关系型数据库管理系统，内建 InnoDB 存储引擎与事务支持，广泛应用于 Web 应用后端数据持久化。
  Docker:
    title: Docker
    brief: 容器化平台，通过操作系统级虚拟化将应用及其依赖打包为轻量级容器，实现环境隔离与一致交付。
  DNS:
    title: DNS
    brief: 域名系统，将人类可读的域名解析为机器可路由的 IP 地址，是互联网寻址的基础设施。
  EFCore:
    title: Entity Framework Core
    brief: .NET 生态下的轻量级 ORM，支持 LINQ 查询翻译为数据库原生 SQL，提供 Code-First 迁移与幂等 SQL 生成能力。
  HTTPS:
    title: HTTPS
    brief: 基于 TLS 加密的 HTTP 协议扩展，确保客户端与服务器之间的数据传输安全与完整性，默认使用 443 端口。
  DataGrip:
    title: DataGrip
    brief: JetBrains 出品的多引擎数据库管理 IDE，支持 MySQL、PostgreSQL 等多种数据库的可视化管理与 SQL 编写。
  SSH:
    title: SSH
    brief: 安全外壳协议，用于加密远程登录与数据传输，是运维人员连接 Linux 服务器的标准方式。
  ASPNETCore:
    title: ASP.NET Core
    brief: .NET 生态下的开源 Web 框架，跨平台、高性能，支持依赖注入、配置管理与中间件管道。
  反向代理:
    title: 反向代理
    brief: 位于服务器端的代理层，接收客户端请求并将其转发给后端服务，常用于负载均衡、SSL 终止与请求路由。
---

本文记录如何将 ArturiaLink WebAPI 与 [[MySQL]] 部署到 CentOS 9。WebAPI 使用本地预编译的 DLL，服务器只负责构建运行时镜像；域名、[[HTTPS]] 和[[反向代理]]由宝塔 [[Nginx]] 管理。

整体访问链路如下：

```
桌面客户端
  -> https://short.arturia.cn
  -> 宝塔 Nginx（HTTPS/443）
  -> 127.0.0.1:5045
  -> WebAPI 容器:8080
  -> [[Docker]] 内部网络
  -> MySQL 容器:3306
```

这种方式不会影响服务器上已有的 OpenList、思源、AllinSSL、RabbitMQ 等其他 [[Docker]] 服务。

## ✦ ArturiaLink 首次部署步骤 (Initial Deployment)

### ✦ 配置域名解析 (DNS Configuration)

在域名 [[DNS]] 控制台添加：

```
记录类型：A
主机记录：short
记录值：服务器公网 IP
```

最终域名：

```
short.arturia.cn
```

等待 [[DNS]] 生效：

```
ping short.arturia.cn
```

确认返回服务器公网 IP。

### ✦ 上传部署包 (Upload Deployment Package)

本地部署包位于：

```
D:\E\PersonalProjects\Arturia.ShortLink\arturialink-deploy.tar.gz
```

在宝塔"文件"中：

1. 进入 `/www/wwwroot`。
2. 上传 `arturialink-deploy.tar.gz`。
3. 打开宝塔终端。

执行：

```
mkdir -p /www/wwwroot/arturialink

tar -xzf /www/wwwroot/arturialink-deploy.tar.gz \
  -C /www/wwwroot/arturialink

cd /www/wwwroot/arturialink
ls -la
```

应看到：

```
Dockerfile
.dockerignore
compose.yaml
.env.example
publish/server/
publish/migrations.sql
```

### ✦ 创建生产配置 (Production Configuration)

执行：

```
cd /www/wwwroot/arturialink
cp .env.example .env
chmod 600 .env
```

生成三个不同的随机值：

```
openssl rand -hex 24
openssl rand -hex 24
openssl rand -hex 32
```

记录这三个结果，然后通过宝塔文件编辑器打开：

```
/www/wwwroot/arturialink/.env
```

填写：

```
MYSQL_DATABASE=arturia_link
MYSQL_USER=arturia
MYSQL_PASSWORD=第一个随机值
MYSQL_ROOT_PASSWORD=第二个随机值

AUTHENTICATION_TOKEN=第三个随机值
PUBLIC_BASE_URL=https://short.arturia.cn/
```

不要修改变量名称，也不要把 `.env` 上传到 Git。

### ✦ 检查服务器环境 (Server Environment Check)

执行：

```
docker --version
docker compose version
```

确认 `5045` 没有被其他服务占用：

```
ss -lntp | grep ':5045'
```

没有输出表示端口可用。

验证 [[DockerCompose]] 配置：

```
cd /www/wwwroot/arturialink
docker compose --profile migration config --quiet
```

没有输出且退出码为 0 表示配置正确。

### ✦ 构建 WebAPI 镜像 (Build WebAPI Image)

执行：

```
docker compose build --pull webapi
```

构建完成后检查镜像：

```
docker image ls arturialink-server
```

应看到：

```
arturialink-server   local
```

服务器不会编译源码，只会把 `publish/server` 中的 DLL 放入 [[ASPNETCore]] Runtime 镜像。

### ✦ 启动 MySQL (Start MySQL)

执行：

```
docker compose up -d mysql
docker compose ps
```

等待 [[MySQL]] 状态变为 `healthy`：

```
docker compose logs --tail=100 mysql
```

正常状态类似：

```
arturialink-mysql-1   running (healthy)
```

[[MySQL]] 没有向公网映射 `3306`。

### ✦ 执行数据库迁移 (Database Migration)

执行：

```
docker compose run --rm migrate
```

命令正常退出后验证：

```
docker compose exec -T mysql sh -c \
  'MYSQL_PWD="$MYSQL_PASSWORD" mysql \
  --user="$MYSQL_USER" \
  --database="$MYSQL_DATABASE" \
  --execute="SELECT MigrationId FROM __EFMigrationsHistory;"'
```

应看到：

```
20260705065426_InitialCreate
```

### ✦ 启动 WebAPI (Start WebAPI)

执行：

```
docker compose up -d webapi
docker compose ps
```

查看日志：

```
docker compose logs --tail=100 webapi
```

读取 `.env` 并测试本机接口：

```
set -a
. ./.env
set +a

curl -i \
  -H "Authorization: Bearer $AUTHENTICATION_TOKEN" \
  -H "X-Forwarded-Proto: https" \
  http://127.0.0.1:5045/api/v1/health
```

预期返回 HTTP 200：

```
{"success":true,"code":200,"message":"健康检查成功。","data":null}
```

### ✦ 配置宝塔反向代理 (Reverse Proxy Configuration)

在宝塔中：

1. 打开"网站"。
2. 点击"添加站点"。
3. 域名填写 `short.arturia.cn`。
4. 不创建数据库。
5. PHP 版本选择"纯静态"。
6. 创建站点。

进入该站点的"[[反向代理]]"：

```
代理名称：ArturiaLink
目标 URL：http://127.0.0.1:5045
发送域名：$host
```

保存后检查 [[Nginx]] 配置中包含：

```
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

如果没有 `X-Forwarded-Proto`，手动加入后保存并重载 [[Nginx]]。

### ✦ 开启 HTTPS (Enable HTTPS)

进入宝塔站点的"SSL"：

1. 选择 Let's Encrypt。
2. 勾选 `short.arturia.cn`。
3. 申请证书。
4. 证书部署成功后开启"强制 [[HTTPS]]"。

服务器安全组和宝塔防火墙只需开放：

```
80
443
SSH 端口
宝塔管理端口
```

不要向公网开放：

```
3306
5045
8080
```

### ✦ 最终验证 (Final Verification)

执行：

```
curl -i \
  -H "Authorization: Bearer $AUTHENTICATION_TOKEN" \
  https://short.arturia.cn/api/v1/health
```

再检查：

```
docker compose ps
docker compose logs --tail=100 webapi
docker compose logs --tail=100 mysql
```

最终应满足：

- `mysql` 为 `healthy`。
- `webapi` 为运行中。
- 公网健康接口返回 HTTP 200。
- `short.arturia.cn/{slug}` 可以执行短链跳转。
- OpenList、思源、AllinSSL、RabbitMQ 等其他容器保持运行。
- 不执行 `docker compose down -v` 或 `docker system prune --volumes`。

## ✦ 部署包中的 Arturia.Core.dll (Why Arturia.Core.dll in Deployment Package)

ArturiaLink.Server 在开发阶段通过 `ProjectReference` 引用 `Arturia.Core`。执行 `dotnet publish` 后，项目依赖会自动被复制到发布目录：

```
publish/server/
├── ArturiaLink.Server.dll
├── Arturia.Core.dll
├── appsettings.json
└── 其他运行时依赖
```

服务器不需要上传 `Arturia.Core` 源码，也不需要安装 .NET SDK。Dockerfile 会将整个 `publish/server` 目录复制到 [[ASPNETCore]] Runtime 镜像。

WebAPI 最终托管在三个位置：

```
服务器发布文件：/www/wwwroot/arturialink/publish/server/
Docker 镜像：arturialink-server:local
容器运行目录：/app
```

真正提供 HTTP 服务的是 WebAPI 容器。宝塔 [[Nginx]] 只负责域名、[[HTTPS]] 和[[反向代理]]。

## ✦ 生产配置与敏感值 (Production Configuration & Secrets)

生产环境设置了：

```
ASPNETCORE_ENVIRONMENT=Production
```

因此程序以 `appsettings.json` 为基础配置，不会加载 `appsettings.Development.json`。

数据库连接字符串、认证 Token 和公开域名通过 [[DockerCompose]] 环境变量覆盖配置：

```
ConnectionStrings__Dev: ...
Authentication__Token: ...
ShortLink__PublicBaseUrl: ...
```

双下划线 `__` 对应 .NET 配置中的层级分隔符。例如：

```
Authentication__Token
```

等价于：

```
{
  "Authentication": {
    "Token": "..."
  }
}
```

### ✦ .env 的值可以自己填写吗 (Can .env Values Be Custom)

可以。`openssl rand` 只是为了生成强随机值，并不是必须使用它生成的内容。

建议：

- 数据库密码至少 24 个随机字符。
- root 密码和普通数据库密码必须不同。
- Token 至少 32 个随机字符。
- Token 不要与任何数据库密码相同。
- 优先使用字母、数字、下划线和短横线。
- 避免空格、中文、`#` 和 `$`。

脱敏示例：

```
MYSQL_DATABASE=arturia_link
MYSQL_USER=arturia
MYSQL_PASSWORD=CHANGE_ME_DATABASE_PASSWORD
MYSQL_ROOT_PASSWORD=CHANGE_ME_DIFFERENT_ROOT_PASSWORD

AUTHENTICATION_TOKEN=CHANGE_ME_RANDOM_TOKEN_AT_LEAST_32_CHARACTERS
PUBLIC_BASE_URL=https://short.arturia.cn/
```

普通字母数字值不需要添加双引号：

```
MYSQL_PASSWORD=CHANGE_ME_DATABASE_PASSWORD
```

如果密码包含空格、`#`、`$` 等特殊字符，会涉及 dotenv 和 Compose 的解析、转义规则。最简单可靠的方式是只使用安全随机字符集。

需要特别注意：[[MySQL]] 数据卷首次初始化后，再修改 `.env` 中的密码，并不会自动修改数据库中已经创建的用户密码。

## ✦ WebAPI 地址配置 (WebAPI Address Configuration)

桌面客户端正式环境应该使用：

```
.AddArturiaHttp(options =>
    options.BaseAddress = "https://short.arturia.cn")
```

不需要填写服务器 IP，也不需要添加 `:7025`。标准 [[HTTPS]] 默认使用 `443`：

```
https://short.arturia.cn
  -> 服务器 443
  -> 宝塔 Nginx
  -> 127.0.0.1:5045
  -> WebAPI 容器 8080
```

开发和生产环境可以分别配置：

```
#if DEBUG
.AddArturiaHttp(options =>
    options.BaseAddress = "http://localhost:5045")
#else
.AddArturiaHttp(options =>
    options.BaseAddress = "https://short.arturia.cn")
#endif
```

只有网站明确监听非标准 [[HTTPS]] 端口时，才需要在域名后添加端口号。

## ✦ MySQL 地址解析 (MySQL Address Resolution)

WebAPI 和 [[MySQL]] 在同一个 [[DockerCompose]] 网络中。WebAPI 使用 [[Docker]] DNS 服务名连接：

```
Server=mysql
Port=3306
```

这里的 `mysql` 来自 `compose.yaml` 中的服务名称：

```
services:
  mysql:
    image: mysql:8.4.10
```

不要查询并写死 [[MySQL]] 容器的内部 IP。容器重建后，内部 IP 可能变化，而服务名 `mysql` 会保持有效。

默认情况下 [[MySQL]] 没有配置 `ports`，所以：

- WebAPI 可以通过 `mysql:3306` 访问。
- 本地电脑不能通过 `short.arturia.cn:3306` 访问。
- 公网扫描无法直接访问数据库。
- 服务器防火墙无需开放 `3306`。

在服务器上进入数据库可以执行：

```
cd /www/wwwroot/arturialink

docker compose exec mysql \
  mysql -u arturia -p arturia_link
```

然后输入 `.env` 中的 `MYSQL_PASSWORD`。

## ✦ 使用 DataGrip 安全访问 MySQL (Secure DataGrip Access to MySQL)

如果确实需要在本地使用 [[DataGrip]] 管理生产数据库，可以采用：

```
DataGrip
  -> SSH：<服务器公网IP>:<SSH端口>
  -> 服务器本机：127.0.0.1:3307
  -> MySQL 容器：3306
```

不要直接向公网开放 [[MySQL]] 的 `3306`。

### ✦ 按需添加本机端口映射 (Add Local Port Mapping)

在 `compose.yaml` 的 `mysql` 服务中增加：

```
  mysql:
    image: mysql:8.4.10
    restart: unless-stopped
    ports:
      - "127.0.0.1:3307:3306"
    environment:
      MYSQL_DATABASE: ${MYSQL_DATABASE:?Set MYSQL_DATABASE in .env}
      MYSQL_USER: ${MYSQL_USER:?Set MYSQL_USER in .env}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD:?Set MYSQL_PASSWORD in .env}
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:?Set MYSQL_ROOT_PASSWORD in .env}
```

这里的含义是：

```
服务器本机 127.0.0.1:3307
  -> MySQL 容器 3306
```

因为只绑定 `127.0.0.1`，公网不能直接访问 `3307`。

应用配置：

```
cd /www/wwwroot/arturialink

docker compose config --quiet
docker compose up -d mysql
docker compose ps
```

确认监听范围：

```
ss -lntp | grep 3307
```

应看到类似：

```
127.0.0.1:3307
```

不要写成：

```
ports:
  - "3306:3306"
```

这可能将数据库暴露到公网。

### ✦ 配置 DataGrip 数据库连接 (DataGrip Database Connection)

在"常规"页面填写 [[MySQL]] 信息：

```
主机：127.0.0.1
端口：3307
用户：arturia
密码：.env 中的 MYSQL_PASSWORD
数据库：arturia_link
```

日常操作不要使用 root 用户。

### ✦ 配置 DataGrip SSH 隧道 (DataGrip SSH Tunnel)

在"[[SSH]]/SSL"页面启用 [[SSH]] 隧道，并填写服务器登录信息：

```
SSH 主机：<服务器公网IP>
SSH 端口：<服务器实际SSH端口>
SSH 用户：<Linux登录用户>
身份验证：SSH密码或私钥
```

这里填写的是 CentOS 登录信息，不是 [[MySQL]] 信息。

两套凭据的作用完全不同：

| 类型  | 主机             | 端口        | 用户              |
| ----- | ---------------- | ----------- | ----------------- |
| SSH   | `<服务器公网IP>` | `<SSH端口>` | `<Linux登录用户>` |
| MySQL | `127.0.0.1`      | `3307`      | `arturia`         |

如果把 [[SSH]] 配置写成下面这样：

```
SSH 主机：127.0.0.1
SSH 端口：3307
SSH 用户：arturia
```

[[DataGrip]] 会尝试在本地电脑上寻找 [[SSH]] 服务，最终得到：

```
Connection refused
```

可以先在本地终端验证 [[SSH]]：

```
ssh -p <SSH端口> <Linux登录用户>@<服务器公网IP>
```

[[SSH]] 测试通过后，再测试 [[DataGrip]] 数据库连接。

## ✦ WebAPI 日志存储 (WebAPI Log Storage)

ArturiaLink.Server 同时启用了控制台日志和文件日志。

### ✦ Docker 控制台日志 (Docker Console Logs)

查看最近 200 行：

```
cd /www/wwwroot/arturialink
docker compose logs --tail=200 webapi
```

持续跟踪：

```
docker compose logs -f webapi
```

生产环境最低日志等级为 `Information`。普通运行日志通常通过这里查看。

### ✦ 文件日志 (File Logs)

容器内路径：

```
/app/logs/app/       # Warning 和 Error
/app/logs/fatal/     # Fatal/Critical
```

查看日志文件：

```
docker compose exec webapi find /app/logs -type f
```

查看普通错误日志：

```
docker compose exec webapi \
  sh -c 'tail -n 100 /app/logs/app/*.log'
```

查看致命错误日志：

```
docker compose exec webapi \
  sh -c 'tail -n 100 /app/logs/fatal/*.log'
```

[[DockerCompose]] 使用命名卷持久化日志：

```
volumes:
  - arturialink-logs:/app/logs
```

查询宿主机存储位置：

```
docker volume inspect arturialink_arturialink-logs
```

通常位于：

```
/var/lib/docker/volumes/arturialink_arturialink-logs/_data
```

文件日志按天滚动，默认保留最近 7 个文件。重建 WebAPI 容器不会删除命名卷中的日志。

## ✦ 数据库迁移与数据安全 (Migration & Data Safety)

正常的 [[EFCore]] 增量迁移不会默认清空数据库。它只会执行迁移脚本中定义的结构变更，例如：

```
创建新表
添加字段
创建索引
修改字段类型
```

但以下操作可能导致数据丢失：

```
DROP TABLE
DROP COLUMN
缩短字段长度
修改为不兼容的数据类型
删除后重建表
```

因此上线前必须检查生成的 `publish/migrations.sql`，并先备份生产数据库。

### ✦ 执行迁移前备份 (Pre-Migration Backup)

```
cd /www/wwwroot/arturialink

docker compose exec -T mysql sh -c \
  'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' \
  > arturia-link-backup-$(date +%Y%m%d-%H%M%S).sql
```

确认备份文件存在且不是空文件：

```
ls -lh arturia-link-backup-*.sql
```

再执行迁移：

```
docker compose run --rm migrate
```

迁移服务使用 `__EFMigrationsHistory` 判断哪些迁移已经执行。重复运行幂等迁移脚本不会重复创建已应用的迁移。

数据库数据保存在命名卷：

```
arturialink_arturialink-mysql-data
```

以下操作不会删除数据库数据：

```
docker compose restart mysql
docker compose down
docker compose up -d
docker compose up -d --force-recreate mysql
```

以下命令可能删除数据库卷，生产服务器禁止执行：

```
docker compose down -v
docker system prune --volumes
```

## ✦ WebAPI 更新流程 (WebAPI Update Workflow)

更新流程仍然是：

```
本地编译发布
  -> 生成部署文件
  -> 上传服务器
  -> 备份数据库
  -> 重建 WebAPI 镜像
  -> 执行新迁移
  -> 重启 WebAPI
  -> 验证
```

### ✦ Windows 本地重新发布 (Local Republish on Windows)

在项目根目录执行：

```
Remove-Item publish\server `
  -Recurse `
  -Force `
  -ErrorAction SilentlyContinue

dotnet publish src\server\ArturiaLink.Server `
  --configuration Release `
  --output publish\server `
  /p:UseAppHost=false

Remove-Item publish\server\appsettings.Development*.json `
  -Force `
  -ErrorAction SilentlyContinue
```

检查发布结果：

```
Test-Path publish\server\ArturiaLink.Server.dll
Test-Path publish\server\Arturia.Core.dll
Test-Path publish\server\appsettings.Development.json
```

预期：

```
True
True
False
```

如果新增了 [[EFCore]] 迁移，重新生成幂等 SQL：

```
dotnet ef migrations script `
  --idempotent `
  --project src\server\ArturiaLink.Server `
  --startup-project src\server\ArturiaLink.Server `
  --output publish\migrations.sql
```

### ✦ 重新生成上传包 (Regenerate Upload Package)

```
tar -czf arturialink-deploy.tar.gz `
  Dockerfile `
  .dockerignore `
  compose.yaml `
  .env.example `
  publish/server `
  publish/migrations.sql
```

不要把本地 `.env` 放进部署包。

### ✦ 上传服务器 (Upload to Server)

先在服务器备份数据库：

```
cd /www/wwwroot/arturialink

docker compose exec -T mysql sh -c \
  'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' \
  > arturia-link-backup-$(date +%Y%m%d-%H%M%S).sql
```

通过宝塔上传新部署包。注意保护服务器已有的 `.env`，不要用 `.env.example` 覆盖它。

解压更新文件：

```
tar -xzf /www/wwwroot/arturialink-deploy.tar.gz \
  -C /www/wwwroot/arturialink
```

### ✦ 重建并更新 WebAPI (Rebuild & Update WebAPI)

```
cd /www/wwwroot/arturialink

docker compose --profile migration config --quiet
docker compose build webapi
docker compose run --rm migrate
docker compose up -d --no-deps webapi
```

查看状态和日志：

```
docker compose ps
docker compose logs --tail=100 webapi
docker compose logs --tail=100 mysql
```

验证接口：

```
set -a
. ./.env
set +a

curl -i \
  -H "Authorization: Bearer $AUTHENTICATION_TOKEN" \
  https://short.arturia.cn/api/v1/health
```

更新 WebAPI 镜像和容器不会删除 [[MySQL]] 数据卷。

## ✦ 常见问题排查 (Troubleshooting)

### ✦ 域名无法访问 (Domain Unreachable)

检查 [[DNS]]：

```
ping short.arturia.cn
```

检查 [[Nginx]]：

```
curl -I https://short.arturia.cn
```

检查 WebAPI 本机端口：

```
curl -i \
  -H "Authorization: Bearer <生产Token>" \
  -H "X-Forwarded-Proto: https" \
  http://127.0.0.1:5045/api/v1/health
```

如果本机正常而域名异常，重点检查宝塔[[反向代理]]和 [[HTTPS]] 配置。

### ✦ WebAPI 容器启动失败 (WebAPI Container Startup Failure)

```
docker compose ps
docker compose logs --tail=200 webapi
```

常见原因包括：

```
.env 缺少变量
数据库密码错误
MySQL 尚未 healthy
PUBLIC_BASE_URL 格式错误
发布目录缺少 ArturiaLink.Server.dll
```

### ✦ MySQL 容器启动失败 (MySQL Container Startup Failure)

```
docker compose ps
docker compose logs --tail=200 mysql
```

检查配置解析：

```
docker compose --profile migration config --quiet
```

不要把完整的 `docker compose config` 输出发布到公开场合，因为展开后的内容可能包含密码和 Token。

### ✦ DataGrip 无法连接 (DataGrip Connection Failure)

依次验证：

```
1. DataGrip 能否通过 SSH 登录服务器
2. 服务器是否监听 127.0.0.1:3307
3. MySQL 容器是否 healthy
4. DataGrip 是否使用 arturia 数据库用户
5. 密码是否与服务器 .env 中的 MYSQL_PASSWORD 一致
```

服务器检查命令：

```
ss -lntp | grep 3307
docker compose ps
docker compose exec mysql \
  mysql -u arturia -p arturia_link
```

### ✦ 修改 .env 后没有生效 (.env Changes Not Applied)

重新创建对应容器：

```
docker compose up -d --force-recreate webapi
```

如果修改的是 [[MySQL]] 初始化密码，单纯重建容器不会修改持久化数据卷中已有的数据库账号密码，需要在 [[MySQL]] 内执行密码修改语句。

## ✦ 安全检查清单 (Security Checklist)

部署完成后应满足：

- WebAPI 只绑定 `127.0.0.1:5045`。
- [[MySQL]] 默认不映射宿主机端口。
- [[DataGrip]] 映射仅绑定 `127.0.0.1:3307`。
- 公网只开放 `80`、`443`、[[SSH]] 和必要的宝塔端口。
- `.env` 权限为 `600`。
- `.env` 不进入 Git 或部署压缩包。
- 数据库用户和 root 使用不同密码。
- API Token 与数据库密码不同。
- 更新和迁移前完成数据库备份。
- 不执行 `docker compose down -v`。
- 不执行 `docker system prune --volumes`。
