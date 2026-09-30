# 腾讯云同机部署 PoliceMate 与 Dify

适用环境：Ubuntu Server 22.04 或 24.04 LTS 64 位，4 核 CPU，4 GB 内存，单台腾讯云服务器。
本文供服务器上的 AI 按阶段执行，不是可整段粘贴的一键脚本。执行者先阅读全文，每阶段达到验收条件再继续。需要管理员操作的步骤明确交给服务器所有者。

不要假定发行版版本：先从 `/etc/os-release` 读取实际代号，再据此选择软件源。本文已验证的代号是
`jammy`（22.04）与 `noble`（24.04）；服务器实际版本与文档标题不一致时，以服务器实际版本为准。

本文面向**中国大陆**腾讯云实例，软件源与镜像拉取按国内网络现实处理。境外或已配置可用代理的
服务器可改用官方源，但换源前必须校验密钥指纹（见第 2 节）。

## 0. 部署目标与边界

项目边界以 [CONTEXT.md](../../CONTEXT.md)、[会话隐私与传输安全 ADR](../adr/0004-session-privacy-and-transport-hardening.md) 和 [受控试行门槛 ADR](../adr/0007-controlled-trial-acceptance-and-release-gate.md) 为准。本指南不改变这些产品决策。

当前仓库的 `apps/server/src/index.ts` 按 `PM_PROVIDER_MODE` 装配提供者：`fixture`（开发/测试）
或 `dify`（真实）。生产默认 `dify`，缺少 Dify 地址、应用密钥或允许的工作流版本时失败关闭，
不回退 fixture。真实接入的输入、输出、版本绑定与验收见 [Dify 接入与验收](dify-integration.md)。

本次基础设施部署的目标是：

- PoliceMate 的 H5、后端、文书范例与使用说明通过 HTTPS 可访问。
- Dify 可登录、配置模型、发布 Workflow 并通过 API 完成虚构数据测试。
- 在所有者确认 Dify 工作流契约与留存边界前，PoliceMate 保持 `PM_ANALYSIS_ENABLED=off`。
- “两个服务正常运行”不等于“案情分析已验收启用”，交接时分别报告。

部署 AI 不应为了显示成功而改变 provider 模式、开启测试控制、伪造内容审批或跳过发布门槛。

### 执行规则

- 先盘点已有网站、Docker、systemd 服务、目录与 Git 改动；原有部署存在时转入更新流程。
- 修改配置前备份，保留旧发布目录；只修改本次拥有的文件。不要删除 Nginx 默认站点或其他网站。
- 需要域名、备案、云安全组、模型账号或真实主体信息时向所有者索取，不自行虚构。
- 密钥在服务器本地生成或安全输入，保存到权限 `600` 的配置文件；不要输出完整环境变量、`docker inspect`、渲染后的 Compose 或含密钥的日志到聊天/GitHub。
- 暂停点：内存持续不足、磁盘不足、现有配置冲突、源码验证失败、HTTPS 失败时停止该阶段，报告原因和已修改文件，不把失败包装成部署成功。

## 1. 架构、参数与机器检查

```text
公网 80/443 → 宿主机 Nginx
  app.example.com  → 127.0.0.1:8787 → PoliceMate（systemd）
  dify.example.com → 127.0.0.1:8080 → Dify Nginx（Docker Compose）
                                           → API / worker / 数据库等内部服务
```

域名是示例，执行前换成真实值。Dify 与 PoliceMate 使用独立子域名，不使用 `/dify` 子路径。
4 GB 内存仅适合低并发联调，建议升级到 8 GB 后受控试行。Swap 只缓解瞬时不足，不替代内存。不部署本地大模型，不需要 GPU，不做大量知识库导入；构建 PoliceMate 时暂时停掉 Dify。

记录以下输入，非秘密参数可放到部署交接单：

| 参数 | 说明 |
| --- | --- |
| `PM_DOMAIN` | PoliceMate 完整域名 |
| `DIFY_DOMAIN` | Dify 完整域名 |
| `CERTBOT_EMAIL` | 有效证书通知邮箱 |
| PoliceMate commit | 所有者批准部署的完整提交 SHA |
| Dify tag | 本文配置以 `1.17.1` 为核对基准；执行前查安全公告 |
| 管理 IP | Dify 管理页面允许访问的公网 IPv4/IPv6 |
| 真实服务信息 | 运营主体、反馈渠道、数据处理说明、技术日志边界 |
| 模型供应商 | 账号、模型名称、费用上限与数据处理政策 |

在服务器上先执行只读检查：

```bash
lsb_release -a
uname -m
free -h
swapon --show
df -h /
sudo ss -lntp
sudo systemctl status nginx policemate docker --no-pager
command -v node
command -v docker
```

不存在的服务返回非零是预期，不要因此停止整份检查。检查 `/opt/policymate`、`/opt/dify` 和 `/etc/nginx/sites-enabled`；已有部署先记录版本和备份位置。首次安装建议至少有 25 GB 空闲磁盘，并为镜像、数据和备份预留增长空间。不要把删除数据库、清理卷或更改系统架构当作释放空间的办法。

以下系统安装示例在 `sudo -i` 后的 root shell 执行；使用已有部署账号时调整路径与权限。逐段执行，不把检查命令的预期非零当作安装失败。

```bash
sudo -i
set -euo pipefail
export PM_DOMAIN='app.example.com'
export DIFY_DOMAIN='dify.example.com'
export CERTBOT_EMAIL='实际邮箱'
export PM_COMMIT='所有者批准的完整提交SHA'
export DIFY_TAG='1.17.1'
# 从实际系统读取代号，不要硬编码 jammy
. /etc/os-release
case "${UBUNTU_CODENAME:-}" in
  jammy|noble) export UBUNTU_CODENAME ;;
  *) printf '未验证的 Ubuntu 代号：%s（按发行版文档调整软件源后继续）\n' "${UBUNTU_CODENAME:-未知}" ;;
esac
printf '检测到 %s %s（%s）\n' "${NAME:-}" "${VERSION_ID:-}" "${UBUNTU_CODENAME:-未知}"
```

`UBUNTU_CODENAME` 为空时先确认是否为 Ubuntu，再按发行版说明确定代号；不要在未知代号上
直接套用 `jammy` 源地址。

**版本说明**：`1.17.1` 是编写本文时从官方 Releases 核对的版本，不是永久推荐。执行前查看目标版本的安全公告、最低资源与升级说明；如果换 tag，重新核对 `.env.example`、Compose 服务、端口和密钥变量。不要混用 `main` 分支配置和旧镜像。

### 腾讯云与 DNS（所有者完成）

- 两个域名的 A 记录指向服务器公网 IPv4；有 AAAA 时必须正确指向可用 IPv6，否则移除错误记录。
- 中国大陆实例在提供公网网站服务前确认域名备案及适用要求。
- 安全组仅开放 80/443，SSH 22 限制到管理员 IP；不开放 8080、8787、5001、5003、5432、6379。
- 如果启用 UFW，先保留当前 SSH 端口及管理来源，再配置 HTTP/HTTPS；不要远程贸然重置防火墙。
- Docker 发布端口可能绕过 UFW，因此后面的本机绑定必须落实，安全组只是另一层保护。

**验收**：明确已有服务和可用资源，两个域名正确解析，端口与修改范围无冲突。无域名时可先完成本机部署和 SSH 隧道初始化，但 HTTPS 与对外验收保持未完成。

## 2. 安装系统依赖与 Swap

```bash
apt-get update
apt-get install -y ca-certificates curl gnupg git xz-utils openssl jq nginx certbot python3-certbot-nginx
```

仅当没有可用 Swap、磁盘足够且 `/swapfile` 不存在时创建 4 GB Swap：

```bash
test ! -e /swapfile
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
grep -qE '^/swapfile[[:space:]]' /etc/fstab || printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
swapon --show
free -h
```

已有 Swap 不重复创建；`fallocate` 不适用时按文件系统文档处理。不要重格式化已有 Swap 文件。

腾讯云 Ubuntu 镜像默认带约 2 GB 的 `/swap.img`。Dify 空载常驻接近 4 GB 内存，
2 GB Swap 偏紧，建议把总量补到约 4 GB。已有 Swap 但总量不足时，追加独立文件而不是扩容原文件：

```bash
TOTAL_SWAP_MB=$(awk '/^SwapTotal:/{print int($2/1024)}' /proc/meminfo)
if [ "$TOTAL_SWAP_MB" -lt 3000 ] && [ ! -e /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -qE '^/swapfile[[:space:]]' /etc/fstab || printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
fi
swapon --show
free -h
```

若 `/swap.img` 已在 `/etc/fstab` 中，保持其现状；不要删除或缩小它。

### Docker（国内源，并校验密钥指纹）

已有 Docker 时先检查版本及容器，不卸载或替换正在使用的安装。

`download.docker.com` 在中国大陆常被重置连接，出现 `curl: (35) Recv failure: Connection reset by peer`
或长时间超时。因此优先使用腾讯云镜像源：内网 `mirrors.tencentyun.com` 不消耗公网流量，
不可达时回退公网 `mirrors.cloud.tencent.com`。腾讯云镜像的 GPG 密钥与 Docker 官方密钥
逐字节相同（SHA256 `1500c1f56fa9e26b9b8f42452a553675796ade0807cdce11975eb98170b3a570`，
指纹 `9DC858229FC7DD38854AE2D88D81803C0EBFCD88`）；下面的指纹校验就是换用镜像的
前提，指纹不符立即停止并以官方源排查，不要跳过校验。

```bash
. /etc/os-release
: "${UBUNTU_CODENAME:?未能识别 Ubuntu 代号}"
ARCH=$(dpkg --print-architecture)
install -m 0755 -d /etc/apt/keyrings

DOCKER_MIRROR='https://mirrors.tencentyun.com/docker-ce/linux/ubuntu'
if ! curl -fsSL --retry 3 --retry-connrefused --connect-timeout 10 \
     "$DOCKER_MIRROR/gpg" -o /etc/apt/keyrings/docker.asc; then
  DOCKER_MIRROR='https://mirrors.cloud.tencent.com/docker-ce/linux/ubuntu'
  curl -fsSL --retry 3 --retry-connrefused --connect-timeout 10 \
    "$DOCKER_MIRROR/gpg" -o /etc/apt/keyrings/docker.asc
fi
chmod a+r /etc/apt/keyrings/docker.asc
gpg --show-keys --with-colons /etc/apt/keyrings/docker.asc \
  | awk -F: '/^fpr:/{print $10}' \
  | grep -qx '9DC858229FC7DD38854AE2D88D81803C0EBFCD88'
printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] %s %s stable\n' \
  "$ARCH" "$DOCKER_MIRROR" "$UBUNTU_CODENAME" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker version
docker compose version
```

重新运行时脚本会重新下载密钥并覆盖 `docker.asc`，不会保留损坏的副本；
`apt-get update` 若报签名或 404 错误，说明镜像未同步该代号，回退公网镜像或官方源，
不要用 `[trusted=yes]` 绕过签名。

无法通过任何 Docker 仓库安装时，Ubuntu 24.04 自带的 `docker.io` 与 `docker-compose-v2`
（noble-updates 为 2.40.3，满足 `!override` 所需 2.24.4+）可作为兜底，但版本与本文验证的
组合不同，必须重新核对 Compose 行为后再继续：

```bash
apt-get install -y docker.io docker-compose-v2
docker --version
docker compose version   # 必须 >= 2.24.4
```

本文的 `!override` 需要 **Compose 2.24.4 或更高版本**。Docker 权限等同高权限管理能力，
不要为了方便给无关账号加入 docker 组。所有源都不可达时，先报告网络诊断结果并向所有者索取
代理配置，不要使用来源不明的安装脚本或静态二进制。

### 镜像拉取加速（Dify 必需）

源能装 Docker 不等于能拉镜像：`docker compose pull` 默认访问 Docker Hub，大陆常有超时或限速。
配置腾讯云内网加速器（仅内网可达，因此只适用于腾讯云 CVM）：

```bash
install -d -m 0755 /etc/docker
if [ -s /etc/docker/daemon.json ]; then cp -a /etc/docker/daemon.json "/etc/docker/daemon.json.bak-$(date -u +%Y%m%dT%H%M%SZ)"; fi
cat > /etc/docker/daemon.json <<'JSON'
{
  "registry-mirrors": ["https://mirror.ccs.tencentyun.com"],
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
JSON
python3 -c 'import json;json.load(open("/etc/docker/daemon.json"))'
systemctl restart docker
docker info --format '{{json .RegistryConfig.Mirrors}}'
```

`daemon.json` 必须是合法 JSON，否则 Docker 拒绝启动。已有 `daemon.json` 时先合并已有键，
不要丢弃原有配置；`log-driver` 设为默认值只是显式覆盖后续可能的改动，不影响已有容器。

加速器**只代理 Docker Hub**。Dify 默认配置的 Weaviate 镜像来自 `cr.weaviate.io`，不受加速影响，
大陆可能无法拉取。首次部署务实的做法是把向量库换成同样受 Dify 官方支持的 Qdrant：
它的镜像 `langgenius/qdrant` 在 Docker Hub 上，可被加速器覆盖。切换方式见第 4 节；
向量库在首次部署时更换没有数据迁移问题，不要在生产已有数据后再这样切换。

### Node.js 24

项目运行后端需要 Node.js 24、npm 11，以及开发依赖中的 `tsx`；不要 `npm ci --omit=dev`。已有 Node 符合要求则复用，并在 systemd 中固定实际可执行路径，不能依赖交互 shell 的 nvm。

全新安装可采用项目部署脚本同样的官方二进制校验方式：

```bash
case "$(uname -m)" in
  x86_64) NODE_ARCH=x64 ;;
  aarch64|arm64) NODE_ARCH=arm64 ;;
  *) printf '不支持的架构\n' >&2; exit 1 ;;
esac
NODE_TMP=$(mktemp -d)
curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$NODE_TMP/SHASUMS256.txt"
NODE_TARBALL=$(awk -v arch="$NODE_ARCH" '$2 ~ ("linux-" arch "\\.tar\\.xz$") {print $2; exit}' "$NODE_TMP/SHASUMS256.txt")
test -n "$NODE_TARBALL"
curl -fsSL "https://nodejs.org/dist/latest-v24.x/$NODE_TARBALL" -o "$NODE_TMP/$NODE_TARBALL"
(cd "$NODE_TMP" && grep "  $NODE_TARBALL$" SHASUMS256.txt | sha256sum -c -)
test ! -e /opt/node-v24
install -d /opt/node-v24
tar -xJf "$NODE_TMP/$NODE_TARBALL" -C /opt/node-v24 --strip-components=1
ln -s /opt/node-v24/bin/node /usr/local/bin/node
ln -s /opt/node-v24/bin/npm /usr/local/bin/npm
ln -s /opt/node-v24/bin/npx /usr/local/bin/npx
node --version
npm --version
```

链接或目标已存在时先检查，不覆盖。官方 `latest-v24.x` 可能在两次下载之间更新；校验不匹配时停止，改用已确定的具体版本 URL 重新下载。记录安装后的精确 Node/npm 版本。

**验收**：Docker 正常、Compose 支持 `!override`、Node/npm 版本正确、Swap 状态明确。

## 3. 部署 PoliceMate

以下是首次部署；已有 systemd、环境文件和 `current` 链接时先看第 9 节更新流程。不要在服务器再次运行 `scripts/deploy-tencent-cloud.sh`：那是从开发机通过 SSH 部署的向导，不适合盲目叠加到本流程。

```bash
id policemate >/dev/null 2>&1 || useradd --system --home-dir /opt/policymate --create-home --shell /usr/sbin/nologin policemate
install -d -o policemate -g policemate /opt/policymate/releases
install -d -m 0755 /etc/policymate
RELEASE_ID="$(date -u +%Y%m%dT%H%M%SZ)-${PM_COMMIT:0:12}"
RELEASE_DIR="/opt/policymate/releases/$RELEASE_ID"
runuser -u policemate -- git clone https://github.com/Luczzzz/PoliceMate.git "$RELEASE_DIR"
runuser -u policemate -- git -C "$RELEASE_DIR" checkout --detach "$PM_COMMIT"
runuser -u policemate -- env HOME=/opt/policymate PATH=/usr/local/bin:/usr/bin:/bin bash -c \
  'cd "$1" && npm ci && npm run typecheck && npm test && npm run build' bash "$RELEASE_DIR"
test -s "$RELEASE_DIR/apps/web/dist/index.html"
```

先构建 PoliceMate，再启动 Dify，避免 4 GB 机器同时执行构建与模型任务。仓库转为私有时采用只读部署凭据，不把 token 放进 clone URL 或 shell 历史。类型检查、测试或构建失败均停止发布。

创建 `/etc/policymate/policymate.env`，填入实际信息（示例值不能作为试行记录）：

```dotenv
NODE_ENV=production
PM_HOST=127.0.0.1
PM_SERVER_PORT=8787
PM_WEB_DIST=/opt/policymate/current/apps/web/dist
PM_MASTER_SWITCH=on
PM_PROVIDER_MODE=dify
PM_ANALYSIS_ENABLED=off
PM_DOCUMENTS_ENABLED=on
PM_ENABLE_TEST_CONTROLS=0
PM_DIFY_BASE_URL=https://实际Dify域名/v1
PM_DIFY_API_KEY=实际应用Key
PM_DIFY_WORKFLOW_VERSION=审查通过的工作流版本
PM_ALLOWED_ORIGINS="https://app.example.com"
PM_SERVICE_PROVIDER="真实运营主体"
PM_SERVICE_CONTACT="真实反馈渠道"
PM_DATA_PROCESSING_STATEMENT="与实际部署、模型供应商和留存策略一致的说明"
PM_TECHNICAL_LOGGING_BOUNDARY="核实后的日志边界"
PM_MAX_CONCURRENCY=1
```

该文件使用 systemd `EnvironmentFile` 格式，不写 `export`，不用 shell 插值。真实说明未提供可先做技术部署，但不能通过受控试行门槛；也不能提前声称案情已发送到 Dify。

```bash
chown root:root /etc/policymate/policymate.env
chmod 600 /etc/policymate/policymate.env
ln -s "$RELEASE_DIR" /opt/policymate/current
```

创建 `/etc/systemd/system/policymate.service`：

```ini
[Unit]
Description=PoliceMate controlled-trial web service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=policemate
Group=policemate
WorkingDirectory=/opt/policymate/current
Environment=HOME=/opt/policymate
Environment=PATH=/usr/local/bin:/usr/bin:/bin
EnvironmentFile=/etc/policymate/policymate.env
ExecStart=/usr/local/bin/npm run start -w @policymate/server
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/opt/policymate

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now policemate
systemctl is-active policemate
curl --fail --silent --show-error http://127.0.0.1:8787/api/v1/health
```

健康响应中的 `providerMode` 反映实际选择；生产默认 `dify`，配置不完整时分析失败关闭，
这不是 Dify 连接成功的证据。如果启动后短时间还没监听，检查服务状态后重试，不用固定等待替代检查。

**验收**：本机健康检查 200、H5 构建存在、服务非 root 运行、测试控制关闭、分析开关关闭。

## 4. 部署 Dify

首次部署使用 `/opt/dify`；已有目录时先判断是代码、数据还是旧部署，不覆盖或删除。

```bash
git clone --branch "$DIFY_TAG" --depth 1 https://github.com/langgenius/dify.git /opt/dify
cd /opt/dify/docker
test ! -e .env
cp .env.example .env
chmod 600 .env
```

编辑 `.env`，保留模板其他字段，设置以下非秘密值。两个域名都换成实际值：

```dotenv
CONSOLE_API_URL=https://dify.example.com
CONSOLE_WEB_URL=https://dify.example.com
SERVICE_API_URL=https://dify.example.com
APP_API_URL=https://dify.example.com
APP_WEB_URL=https://dify.example.com
FILES_URL=https://dify.example.com
NEXT_PUBLIC_SOCKET_URL=wss://dify.example.com
NGINX_HTTPS_ENABLED=false
# 向量库：如 Weaviate 镜像无法拉取，改为 qdrant（见下方“向量库镜像可达性”）
VECTOR_STORE=weaviate
SERVER_WORKER_AMOUNT=1
CELERY_WORKER_AMOUNT=1
CELERY_AUTO_SCALE=false
SQLALCHEMY_POOL_SIZE=5
SQLALCHEMY_MAX_OVERFLOW=5
ENABLE_REQUEST_LOGGING=False
DEBUG=false
FLASK_DEBUG=false
```

HTTPS 在宿主机终止，Dify 内部 HTTP 不等于浏览器或 PoliceMate 可以用明文访问。`SERVICE_API_URL` 是主机地址；PoliceMate 的 API 基地址后续才加 `/v1`。保留本 tag 默认数据库和 profile，先不自行裁剪服务；4 GB 启动后无法稳定运行时升级内存，不随意关掉依赖。

### 向量库镜像可达性

Dify 默认使用 Weaviate，其镜像来自 `cr.weaviate.io`；腾讯云加速器只代理 Docker Hub，
对该仓库无效。启动前先单独试拉一次，不要等到 `compose up` 才失败：

```bash
cd /opt/dify/docker
docker pull cr.weaviate.io/semitechnologies/weaviate:$(awk -F: '/weaviate:/{print $3; exit}' docker-compose.yaml)
```

拉取成功则保持 `VECTOR_STORE=weaviate`，无需其他改动。失败时改用 Dify 同样官方支持的
Qdrant：其镜像在 Docker Hub 上，可被加速器覆盖，且切换后除向量数据外行为一致。
首次部署尚无向量数据，此时切换是安全的；已有数据时不要这样换库。

Qdrant 需要三个字段，缺一不可。`QDRANT_URL` 在 Dify 里默认是 `None`，必须显式给出
且使用 Compose 服务名，不能写 `localhost`：

```bash
cd /opt/dify/docker
node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
let text = readFileSync('.env', 'utf8');
if (!/^VECTOR_STORE=/m.test(text)) throw new Error('VECTOR_STORE missing');
text = text.replace(/^VECTOR_STORE=.*$/m, 'VECTOR_STORE=qdrant');
for (const [key, value] of Object.entries({ QDRANT_URL: 'http://qdrant:6333' })) {
  const pattern = new RegExp(`^${key}=.*$`, 'gm');
  if ([...text.matchAll(pattern)].length === 0) text += `${key}=${value}\n`;
  else if ([...text.matchAll(pattern)].length === 1) text = text.replace(pattern, `${key}=${value}`);
  else throw new Error(`Duplicate key: ${key}`);
}
writeFileSync('.env', text, { mode: 0o600 });
console.log('VECTOR_STORE=qdrant configured.');
JS
```

`QDRANT_API_KEY` 由下方的密钥脚本一并生成。切换后在启动校验里确认生效：
`docker compose config --format json` 的 `COMPOSE_PROFILES` 应包含 `qdrant` 而不含 `weaviate`，
且 `qdrant` 服务处于启用状态。不要把两个向量库存 profile 同时打开。

### 首次启动前生成密钥

模板的密码与内部 token 必须替换。以下脚本仅针对尚未初始化的部署执行一次；重跑会更换数据库密码、加密密钥，导致现有数据无法访问。已有部署跳过，按密钥轮换流程处理。脚本只输出完成提示，不输出秘密值。仅在刚 clone、从未启动容器的部署中执行；仓库自带 `volumes` 模板目录，其存在不能证明已初始化。脚本写入初始化标记，已有数据即使丢失标记也不允许重跑：

```bash
cd /opt/dify/docker
test -z "$(docker compose ps -aq)"
test ! -e .policymate-secrets-initialized
node --input-type=module <<'JS'
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.policymate-secrets-initialized')) throw new Error('Already initialized');
let text = readFileSync('.env', 'utf8');
const secret = () => randomBytes(32).toString('hex');
const redis = secret();
const sandbox = secret();
const weaviate = secret();
// 必须已存在且唯一的字段；缺失说明模板与本文不匹配，应核对版本而不是继续。
const mustExist = [
  'SECRET_KEY', 'DB_PASSWORD', 'REDIS_PASSWORD', 'CELERY_BROKER_URL',
  'CODE_EXECUTION_API_KEY', 'SANDBOX_API_KEY', 'PLUGIN_DAEMON_KEY',
  'PLUGIN_DIFY_INNER_API_KEY', 'WEAVIATE_API_KEY',
  'WEAVIATE_AUTHENTICATION_APIKEY_ALLOWED_KEYS',
  'WEAVIATE_AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED',
  'DIFY_AGENT_API_TOKEN', 'DIFY_AGENT_SERVER_SECRET_KEY',
  'DIFY_AGENT_LOCAL_SANDBOX_AUTH_TOKEN',
];
// 模板未提供的字段（如 Qdrant）：缺失时追加，不因模板不同而失败。
const values = {
  SECRET_KEY: secret(), DB_PASSWORD: secret(), REDIS_PASSWORD: redis,
  CELERY_BROKER_URL: `redis://:${redis}@redis:6379/1`,
  CODE_EXECUTION_API_KEY: sandbox, SANDBOX_API_KEY: sandbox,
  PLUGIN_DAEMON_KEY: secret(), PLUGIN_DIFY_INNER_API_KEY: secret(),
  WEAVIATE_API_KEY: weaviate, WEAVIATE_AUTHENTICATION_APIKEY_ALLOWED_KEYS: weaviate,
  WEAVIATE_AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED: 'false',
  DIFY_AGENT_API_TOKEN: secret(), DIFY_AGENT_SERVER_SECRET_KEY: secret(),
  DIFY_AGENT_LOCAL_SANDBOX_AUTH_TOKEN: secret(),
  QDRANT_API_KEY: secret(), QDRANT_URL: 'http://qdrant:6333',
};
for (const [key, value] of Object.entries(values)) {
  const pattern = new RegExp(`^${key}=.*$`, 'gm');
  const found = [...text.matchAll(pattern)].length;
  if (found > 1) throw new Error(`Duplicate key: ${key}`);
  if (found === 1) {
    text = text.replace(pattern, `${key}=${value}`);
  } else if (mustExist.includes(key)) {
    throw new Error(`Missing key: ${key}`);
  } else {
    text += `${text.endsWith('\n') ? '' : '\n'}${key}=${value}\n`;
  }
}
writeFileSync('.env', text, { mode: 0o600 });
writeFileSync('.policymate-secrets-initialized', 'Initial secrets generated; do not rotate by rerunning.\n', { flag: 'wx', mode: 0o600 });
console.log('Initial secrets configured; values not displayed.');
JS
```

新 tag 缺少字段时停止并核对，不删掉校验来“继续安装”。保持插件签名校验开启。备份 `.env` 和持久化数据；丢失 `SECRET_KEY` 可能无法解密已保存的模型凭据。

### 本机端口与日志限制

创建 `/opt/dify/docker/docker-compose.override.yaml`。`!override` 很重要：普通端口合并可能保留原来的 `0.0.0.0:80/443/5003` 映射。

```yaml
x-local-logging: &local-logging
  driver: local
  options:
    max-size: "10m"
    max-file: "3"

services:
  nginx:
    ports: !override
      - "127.0.0.1:8080:80"
    logging: *local-logging
  plugin_daemon:
    ports: !override
      - "127.0.0.1:5003:5003"
    logging: *local-logging
  api:
    logging: *local-logging
  worker:
    logging: *local-logging
  worker_beat:
    logging: *local-logging
```

日志轮转限制磁盘占用，不保证日志不含正文，也不清除 Dify 数据库中的运行记录。如果模板新增其他宿主机端口，逐项核查；不要只检查上面两个服务。

```bash
cd /opt/dify/docker
docker compose config --quiet
docker compose config --format json | jq '{ports: [.services | to_entries[] | select(.value.ports != null) | {service: .key, ports: .value.ports}]}'
docker compose pull
docker compose up -d
docker compose ps
docker stats --no-stream
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' http://127.0.0.1:8080/install
```

`config --quiet` 只验证配置，不输出密钥；上面的 jq 仅投影端口。不要打印完整渲染配置。长时间重启或 unhealthy 时检查本机日志与 OOM；一次性初始化服务正常退出不代表故障。容器无 healthcheck 时用 HTTP 与实际模型请求验证，不能只看 `Up`。

**验收**：运行服务无反复重启、只发布本机端口、HTTP 为 200 或预期重定向、内存稳定。

## 5. 宿主机 Nginx 与 HTTPS

首次配置创建下面两个站点文件；已有同名文件先备份并合并，不覆盖已签发的 TLS 配置。示例中的域名必须替换。创建文件后使用软链接启用站点，不删除其他站点。

`/etc/nginx/sites-available/policymate`：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name app.example.com;
    client_max_body_size 128k;
    access_log off;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 10s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy no-referrer always;
    add_header X-Frame-Options DENY always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
}
```

300 秒覆盖串行事实提取、报告生成及有限重试；应用内部仍应保留 30/90 秒超时。`access_log off` 避免默认日志记录 URL 查询字符串；错误日志和其他代理层仍需核实留存边界。

`/etc/nginx/sites-available/dify`：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name dify.example.com;
    client_max_body_size 20m;
    access_log off;

    location / {
        # 将以下管理 IP 替换为真实值，可添加 IPv6 或可信管理网段。
        allow 127.0.0.1;
        allow ::1;
        allow 管理员公网IP;
        deny all;
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

IP 白名单限制整个 Dify 站点（包括 API），不是只隐藏登录页。管理 IP 未提供时只保留 loopback 白名单，通过 SSH 隧道操作。Dify 不照搬 PoliceMate 的 iframe 禁用头，以免破坏 Dify 自身页面；不添加跨域 `*` 来解决配置错误。

```bash
ln -s /etc/nginx/sites-available/policymate /etc/nginx/sites-enabled/policymate
ln -s /etc/nginx/sites-available/dify /etc/nginx/sites-enabled/dify
nginx -t
systemctl enable --now nginx
systemctl reload nginx
certbot --nginx --non-interactive --agree-tos --redirect -m "$CERTBOT_EMAIL" -d "$PM_DOMAIN"
certbot --nginx --non-interactive --agree-tos --redirect -m "$CERTBOT_EMAIL" -d "$DIFY_DOMAIN"
nginx -t
systemctl reload nginx
certbot renew --dry-run
```

Certbot 的 HTTP-01 验证路径需要公网可达；检查它添加的 challenge 配置，白名单不得阻断验证。无法满足时采用受支持的 DNS-01 验证，不把整个管理站点开放作为永久修复。

```bash
curl --fail --silent --show-error "https://$PM_DOMAIN/api/v1/health"
curl --resolve "$DIFY_DOMAIN:443:127.0.0.1" --silent --show-error --output /dev/null \
  --write-out '%{http_code}\n' "https://$DIFY_DOMAIN/install"
```

后续后端需要长期访问时，可在 `/etc/hosts` 中添加 `127.0.0.1 实际Dify域名`，先检查已有记录，避免重复或冲突。域名仍用于证书验证，API 基地址仍是 HTTPS，不用 `curl -k`。

**验收**：HTTPS 证书有效、HTTP 跳转 HTTPS、PoliceMate 公网健康检查通过、Dify 非管理来源返回 403、证书续期演练通过、已有网站保持可用。

## 6. 初始化 Dify、模型与 Workflow

由授权管理员在 `https://实际Dify域名/install` 创建管理员账号，使用唯一强密码。不要在开放公网的初始化页面上等待管理员注册。AI 可用浏览器工具操作，账号购买、服务条款确认、付款和供应商数据政策由所有者确认。

管理 IP 无法放行时，从管理员电脑转发宿主机 HTTPS：

```bash
ssh -N -L 8443:127.0.0.1:443 ubuntu@服务器地址
```

管理员电脑临时 hosts 将实际 Dify 域名指向 `127.0.0.1`，访问 `https://实际Dify域名:8443/install`，保留正常证书验证。必要时临时调整 Dify 控制台 URL、CORS 到该带端口来源，操作后恢复并删除电脑 hosts 记录。

### 模型配置

1. 在模型供应商设置安装所选供应商的官方/可信插件，保持插件签名校验开启。
2. 填入模型供应商 API Key，选择具体模型并完成连接测试。
3. 设置消费预算和供应商端限额；优先支持结构化输出、中文与长上下文的模型。
4. 只用虚构案情做测试，先验证请求时间是否能满足项目超时要求。

模型供应商 Key 用于 Dify 调模型；Dify 应用 Key 用于 PoliceMate 调工作流。两者不相同。自建 Dify 仍可能把内容发往外部模型供应商，不意味着数据不出服务器。

### 工作流

选择 Workflow 类型，不依赖聊天历史。建议一个应用用 `operation` 区分提取/报告，便于使用当前单个应用 Key；两个应用也可以，但需要后端新增两个独立 Key 配置。完整的节点、代码、Prompt、验收与留档要求见 [Dify 工作流搭建任务](dify-workflow-build.md)；后端侧输入输出契约见 [Dify 接入与验收](dify-integration.md)。

基础设施阶段可以先创建临时 `deployment-smoke-test` Workflow：开始节点的字符串输入 `query` → LLM 节点处理虚构文本 → 输出节点映射为 `result`。发布应用后，从“访问 API/API 文档”页创建应用 Key。该应用仅用于确认模型与 API 可用，不把它当作 PoliceMate 报告应用，也不直接展示它返回的自然语言。

### API 冒烟测试（虚构数据）

以下在服务器 root shell 执行，关闭 shell trace。把临时应用 Key 保存到权限 `600` 的 curl 配置文件中，避免出现在命令行参数。测试结束清理本地临时文件，但 Dify 端记录仍需单独核实。

```bash
set +x
SMOKE_DIR=$(mktemp -d)
chmod 700 "$SMOKE_DIR"
read -r -s -p 'Dify 临时应用 API Key: ' DIFY_SMOKE_KEY
printf '\n'
umask 077
printf 'header = "Authorization: Bearer %s"\n' "$DIFY_SMOKE_KEY" > "$SMOKE_DIR/curl.conf"
unset DIFY_SMOKE_KEY
printf '%s' '{"inputs":{"query":"虚构测试：甲某与乙某发生口角。"},"response_mode":"blocking","user":"deployment-smoke-test"}' > "$SMOKE_DIR/request.json"
curl --config "$SMOKE_DIR/curl.conf" --resolve "$DIFY_DOMAIN:443:127.0.0.1" \
  --fail-with-body --silent --show-error --max-time 120 \
  -H 'Content-Type: application/json' --data-binary @"$SMOKE_DIR/request.json" \
  "https://$DIFY_DOMAIN/v1/workflows/run" --output "$SMOKE_DIR/response.json"
jq -e '.data.status == "succeeded" and (.data.outputs.result != null)' "$SMOKE_DIR/response.json"
rm -f "$SMOKE_DIR/curl.conf" "$SMOKE_DIR/request.json" "$SMOKE_DIR/response.json"
rmdir "$SMOKE_DIR"
```

HTTP 200 不等于工作流成功，需要检查 `data.status` 和输出。请求失败时私下检查响应，不要把原始内容粘贴到 GitHub。发布与编辑草稿分开，API 调用已发布版本。

**验收**：管理员账号已初始化、模型连接成功、已发布工作流 API 成功；记录应用 ID、工作流版本和模型名称，不记录 Key。PoliceMate 案情分析仍保持关闭。

## 7. 数据留存与受控试行门槛

自建 Dify 不自动满足“不保留案情”要求。Workflow 没有聊天状态，也仍可能保存运行输入、节点输出、模型响应和错误信息；还要核实插件、供应商、反向代理、数据库备份和云日志。`ENABLE_REQUEST_LOGGING=False` 不能作为关闭全部持久化的证明。

部署 AI 应提交留存核对表：每个系统记录哪些内容、保存多久、谁能访问、如何删除、是否进入备份、模型供应商是否用于训练、哪些控制已验证与哪些未知。不能编造“关闭会话记录”开关，不能直接删除未知数据库表来实现承诺。

留存边界未核实期间仅用虚构数据联调。实际说明如实记录；是否允许脱敏受控试行由所有者按产品规格和适用数据政策决定。公开 HTTPS 地址并不代表访问者身份得到核验。

PoliceMate 发布门槛：

```bash
cd /opt/policymate/current
set +x
node --env-file=/etc/policymate/policymate.env ./node_modules/tsx/dist/cli.mjs scripts/release-check.ts
node --env-file=/etc/policymate/policymate.env ./node_modules/tsx/dist/cli.mjs scripts/release-acceptance.ts --auto-only
```

在 root shell 中加载权限 `600` 的环境文件；不要把 systemd 文件用 `source` 当作 shell 执行。`--auto-only` 不写报告文件；完整验收会生成报告文件，保留在服务器本地，不从部署目录推送 Git 改动。完整试行门槛还有真实设备、可访问性与角色记录，见 [受控试行验收](../acceptance/controlled-trial-acceptance.md) 和 [人工记录](../acceptance/manual-evidence.md)。自动检查通过不等于正式内容审定或机关授权。

## 8. 最终验收与交接

- [ ] 记录 OS、Node/npm、Docker/Compose、PoliceMate SHA 和 Dify tag/commit。
- [ ] 两站点 HTTPS 正常，证书续期通过，现有网站无回归。
- [ ] 宿主机公网仅暴露批准的 SSH/HTTP/HTTPS；其他入口限 loopback。
- [ ] PoliceMate 健康检查、首页、文书范例、使用与数据说明正常，测试控制关闭。
- [ ] PoliceMate 案情分析关闭待验收，交接单明确 `PM_PROVIDER_MODE` 与工作流版本。
- [ ] Dify 管理来源限制有效，管理员已初始化，供应商连接及 Workflow API 成功。
- [ ] 连续观察至少 15 分钟并执行几次串行虚构请求，无 OOM、反复重启或持续高 Swap。
- [ ] 留存边界、备份位置、恢复步骤、费用限额及未完成试行门槛已记录。

交接只输出域名、非秘密版本、文件路径、健康状态、通过/失败项、遗留任务。当前版本的预期结果是：“PoliceMate 文书功能已部署，Dify 独立可用；真实分析已实现但保持关闭，待工作流契约与留存边界验收”。如果所有者要求完整真实分析上线，按 [Dify 接入与验收](dify-integration.md) 完成门槛后再开启。

## 9. 更新、备份、回滚与紧急停用

### PoliceMate 更新

先记录 `readlink -f /opt/policymate/current` 和环境文件备份。新建独立 release 目录，按第 3 节安装、验证和构建；不要在 current 目录里 `git pull` 后直接重启。4 GB 机器构建前用 `cd /opt/dify/docker && docker compose stop` 暂停 Dify，并记录中断窗口。验证完成后切换 current 链接、重启 PoliceMate、做本机及 HTTPS 健康检查，再启动 Dify。

```bash
# NEW_RELEASE 是已验证的完整路径，先确认无占位值。
test -s "$NEW_RELEASE/apps/web/dist/index.html"
test ! -e /opt/policymate/current.next
ln -s "$NEW_RELEASE" /opt/policymate/current.next
mv -Tf /opt/policymate/current.next /opt/policymate/current
systemctl restart policemate
```

健康检查失败，按同样方式恢复旧链接及兼容环境配置并重启。保留至少一个可回滚 release。重启清空运行内存会话，用户需重新开始，不承诺恢复案情。

### Dify 备份与更新

升级前阅读目标 release 的迁移说明，确认磁盘足够，安排维护窗口并停止整套 Compose。备份 `.env`、初始化标记、override、`envs/` 下实际配置、`volumes/`、精确 Git tag/commit；同时检查 `docker compose config --volumes` 中的具名卷并按 Docker 官方备份方式另行备份。不能假定只备份 PostgreSQL 或只备份工作流 DSL 就能恢复凭据、插件及文件。

停机状态下对数据目录做一致性备份，权限限制并加密异地保存；备份可能含敏感运行内容，留存政策必须涵盖它。先在隔离环境演练恢复，再升级。代码恢复旧 tag 不能撤销数据库迁移；回滚需旧版本配套配置和升级前的一致性数据备份。不要用 `docker compose down -v` 或 `docker system prune --volumes` 作为升级步骤。

停机备份示例（先确认空间足够，并经所有者同意维护窗口）：

```bash
BACKUP_ID=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR="/var/backups/policymate-dify/$BACKUP_ID"
install -d -m 0700 "$BACKUP_DIR"
umask 077
cp -a /etc/policymate/policymate.env "$BACKUP_DIR/policymate.env"
cp -a /etc/systemd/system/policymate.service "$BACKUP_DIR/policymate.service"
cp -a /etc/nginx/sites-available/policymate "$BACKUP_DIR/nginx-policymate"
cp -a /etc/nginx/sites-available/dify "$BACKUP_DIR/nginx-dify"
readlink -f /opt/policymate/current > "$BACKUP_DIR/policymate-release.txt"
cd /opt/dify/docker
git rev-parse HEAD > "$BACKUP_DIR/dify-commit.txt"
docker compose config --volumes > "$BACKUP_DIR/dify-named-volumes.txt"
docker compose stop
tar -czf "$BACKUP_DIR/dify-config-bind-data.tar.gz" \
  .env .policymate-secrets-initialized docker-compose.override.yaml envs volumes
# 此归档不包括具名卷；保持停机，按官方卷备份方式完成它们的备份。
# 全部备份完成后，再重新启动。
docker compose up -d
sha256sum "$BACKUP_DIR/dify-config-bind-data.tar.gz" > "$BACKUP_DIR/SHA256SUMS"
```

归档中的初始化标记只有按本文部署才存在；旧部署没有时调整文件清单，不伪造旧环境。
具名卷可用固定可信工具镜像挂载为只读并打包到该备份目录，逐一记录对应卷名，
执行方式见 [Docker 卷备份与恢复](https://docs.docker.com/engine/storage/volumes/#back-up-restore-or-migrate-data-volumes)。
归档或具名卷备份任一失败，保持维护状态并报告，不开始升级。下载工具镜像可在停机前完成。

恢复时先保留失败部署，选用与备份匹配的 Dify commit 和配置。停止目标 Compose，
将 bind 数据恢复到新部署目录、具名卷恢复到隔离的新卷并调整挂载，然后启动验证。
不要向正在运行的数据库目录解包，也不要在未验证恢复前删除原数据。离机备份使用
经所有者批准的加密方式，并单独保管解密材料；本机明文 root-only 副本不是异地备份。

### 开机恢复

Docker 启用后按 Compose 默认 restart 策略恢复容器。维护窗口内经所有者批准后做一次服务器重启验收，检查 Nginx、PoliceMate 与 Dify 均恢复；不要未经同意直接重启。

### 紧急停用

编辑 `/etc/policymate/policymate.env` 设置 `PM_ANALYSIS_ENABLED=off`，然后 `systemctl restart policemate`；需要停用所有入口时设 `PM_MASTER_SWITCH=off`。其他既有有效文书功能无需因 Dify 故障一起停止。必要时在 Dify 撤销应用 Key 并关闭入口。

## 10. 故障排查

| 现象 | 检查与处理 |
| --- | --- |
| 8080/8787 被占用 | `ss -lntp` 找到归属；调整新服务端口及对应代理，不停止未知服务 |
| Nginx 502 | 检查本机 upstream、systemd/Compose 状态，再检查代理配置 |
| 容器反复退出 | `docker stats --no-stream`、`free -h`、`journalctl -k` 查 OOM；低并发仍不足则升级内存 |
| Compose 不认 `!override` | 升级官方 Compose 到 2.24.4+，不要改成普通 ports 合并 |
| Docker/apt 源连接被重置（curl 35） | 大陆网络对官方源的常见阻断；改用腾讯云镜像并按第 2 节校验密钥指纹 |
| `docker compose pull` 超时或过慢 | 配置 `mirror.ccs.tencentyun.com` 加速；确认加速器只代理 Docker Hub |
| Weaviate 镜像拉取失败 | 按第 4 节切到 Qdrant，并设置 `QDRANT_URL` 与 `QDRANT_API_KEY` |
| apt 报签名或 404 | 镜像未同步该代号；回退公网镜像或官方源，不绕过签名校验 |
| 服务实际版本与文档不同 | 以 `/etc/os-release` 为准，重新核对软件源代号与包名 |
| 插件安装失败 | 查供应商插件来源、签名、Marketplace/GitHub/PyPI 连接与空间，不关闭签名校验 |
| Dify 401 | 使用应用 Key 而非模型 Key，确认应用类型与 Key 未撤销 |
| Dify 403 | 检查管理 IP 白名单；本机用域名解析到 127.0.0.1，避免云公网回流 |
| API 200 但工作流失败 | 检查 `data.status/error`、模型额度、发布版本和 inputs 名称 |
| 登录循环/跨域 | 检查控制台 URL、HTTPS/端口、反向代理头及 Cookie；不直接放开所有 CORS |
| Certbot 失败 | 检查 A/AAAA、80 入站、备案/网络限制、challenge 路径与白名单 |
| npm 启动找不到 tsx | 保留开发依赖；检查 ExecStart 的 Node/npm 路径、WorkingDirectory 与权限 |
| 案情分析不可用 | 检查 `PM_PROVIDER_MODE`、Dify 地址/应用 Key/工作流版本与 Dify 可用性；生产模式不回退 fixture |

本机可查看 `journalctl -u policemate -n 80 --no-pager`、`docker compose logs --tail=80 服务名`、Nginx 错误日志，但日志可能含凭据或运行内容，向外提供前裁剪和脱敏。

## 11. 官方资料

- [Dify Docker Compose 部署](https://docs.dify.ai/en/self-host/deploy/quick-start/docker-compose)
- [Dify 1.17.1 Release](https://github.com/langgenius/dify/releases/tag/1.17.1)
- [该 tag 的 Compose](https://github.com/langgenius/dify/blob/1.17.1/docker/docker-compose.yaml)
- [该 tag 的环境模板](https://github.com/langgenius/dify/blob/1.17.1/docker/.env.example)
- [Dify Workflow API](https://docs.dify.ai/en/api-reference/workflow-runs/run-workflow)
- [Docker Ubuntu 安装](https://docs.docker.com/engine/install/ubuntu/)
- [Compose override 合并规则](https://docs.docker.com/reference/compose-file/merge/)

## 给服务器 AI 的任务

```text
请阅读当前仓库 docs/deployment/tencent-cloud-policymate-dify.md 全文，按阶段在这台腾讯云服务器（4 核、4 GB 内存，发行版以 /etc/os-release 实际值为准）部署 PoliceMate 和 Dify。
先盘点已有服务、端口、目录、内存、Swap 与磁盘，报告修改范围；需要域名、管理 IP、备案、安全组、模型账号和真实服务信息时向我索取。已有服务先备份再合并，不覆盖其他网站。
固定 PoliceMate 提交及 Dify 稳定 tag，先验证再发布，按文档逐阶段验收。
保持 PM_ANALYSIS_ENABLED=off 和 PM_ENABLE_TEST_CONTROLS=0：真实分析已实现但尚未完成工作流契约与留存边界验收，开启前必须完成 [Dify 接入与验收](dify-integration.md) 中的门槛。
Dify 工作流按 [Dify 工作流搭建任务](dify-workflow-build.md) 搭建、发布、导出 DSL 并跑通 `npm run dify:smoke`；只用虚构案情，不输出密钥。
只用虚构数据验证 Dify Workflow API，不将密钥、环境文件或原始内容输出到聊天和 GitHub。
最后提供版本、域名、文件路径、验收结果、备份/回滚方法和未完成项，分别报告基础设施就绪与真实分析接入状态。不要将部署完成等同受控试行获准。
```
