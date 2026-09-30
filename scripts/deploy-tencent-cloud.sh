#!/usr/bin/env bash
#
# Tencent Cloud deployment wizard for PoliceMate.
# Generated from the /wizard template.
#

set -euo pipefail

if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  BOLD=$(tput bold); DIM=$(tput dim); RESET=$(tput sgr0)
  BLUE=$(tput setaf 4); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3); RED=$(tput setaf 1)
else
  BOLD=""; DIM=""; RESET=""; BLUE=""; GREEN=""; YELLOW=""; RED=""
fi

TOTAL_STAGES=0
_STAGE_INDEX=0
ENV_FILE="${ENV_FILE:-.env.tencent-cloud-deploy}"
WRITTEN_ENV=()
WRITTEN_SECRET=()
SKIPPED=()

_clear() {
  [[ -t 1 ]] || return 0
  if command -v tput >/dev/null 2>&1; then tput clear; else printf '\033[2J\033[3J\033[H'; fi
}

banner() {
  _clear
  printf '\n%s%s  %s%s\n' "$BOLD" "$BLUE" "$1" "$RESET"
  printf '%s  共 %s 个步骤%s\n\n' "$DIM" "$TOTAL_STAGES" "$RESET"
  printf '%s  本向导会逐步提示你完成操作，并记录你输入的配置。%s\n' "$DIM" "$RESET"
  printf '  你可以随时按 Ctrl-C 停止，之后重新运行；已保存的配置会自动复用。\n'
  pause "准备开始吗？"
}

stage() {
  _clear
  _STAGE_INDEX=$((_STAGE_INDEX + 1))
  printf '\n%s%s▸ 第 %s/%s 步 · %s%s\n' \
    "$BOLD" "$BLUE" "$_STAGE_INDEX" "$TOTAL_STAGES" "$1" "$RESET"
}

say()  { printf '  %s\n' "$1"; }
step() { printf '  %s•%s %s\n' "$BLUE" "$RESET" "$1"; }
note() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
warn() { printf '  %s⚠ %s%s\n' "$YELLOW" "$1" "$RESET"; }

open_url() {
  local url="$1"
  printf '  %s↗ opening%s %s\n' "$GREEN" "$RESET" "$url"
  { if   command -v wslview      >/dev/null 2>&1; then wslview "$url"
    elif command -v explorer.exe >/dev/null 2>&1; then explorer.exe "$url"
    elif command -v xdg-open     >/dev/null 2>&1; then xdg-open "$url"
    elif command -v open         >/dev/null 2>&1; then open "$url"
    else warn "无法自动打开浏览器，请手动访问：$url"; fi
  } >/dev/null 2>&1 || warn "无法自动打开浏览器，请手动访问：$url"
}

pause() {
  printf '  %s%s%s ' "$DIM" "${1:-按回车继续}" "$RESET"
  read -r _ || true
}

confirm() {
  local reply=""
  printf '  %s? %s [y/N] ' "$YELLOW" "$1"
  read -r reply || true
  [[ "$reply" =~ ^[Yy] ]]
}

_existing() {
  [[ -f "$ENV_FILE" ]] || return 1
  local line; line=$(grep -E "^${1}=" "$ENV_FILE" | tail -n1) || return 1
  printf '%s' "${line#*=}"
}

ask() {
  local key="$1" prompt="$2" current input
  current=$(_existing "$key" || true)
  if [[ -n "$current" ]]; then
    printf '  %s%s%s %s[直接回车保留当前值]%s ' "$BOLD" "$prompt" "$RESET" "$DIM" "$RESET"
  else
    printf '  %s%s%s ' "$BOLD" "$prompt" "$RESET"
  fi
  read -r input || true
  [[ -z "$input" && -n "$current" ]] && input="$current"
  printf -v "$key" '%s' "$input"
}

ask_secret() {
  local key="$1" prompt="$2" current input
  current=$(_existing "$key" || true)
  if [[ -n "$current" ]]; then
    printf '  %s%s%s %s[直接回车保留当前值]%s ' "$BOLD" "$prompt" "$RESET" "$DIM" "$RESET"
  else
    printf '  %s%s%s ' "$BOLD" "$prompt" "$RESET"
  fi
  read -rs input || true
  printf '\n'
  [[ -z "$input" && -n "$current" ]] && input="$current"
  printf -v "$key" '%s' "$input"
}

write_env() {
  local key="$1" value="$2" tmp
  touch "$ENV_FILE"
  tmp=$(mktemp)
  grep -vE "^${key}=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$ENV_FILE"
  WRITTEN_ENV+=("$key")
  printf '  %s✓ wrote%s %s → %s\n' "$GREEN" "$RESET" "$key" "$ENV_FILE"
}

set_secret() {
  local name="$1" value="$2"
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    if printf '%s' "$value" | gh secret set "$name" >/dev/null 2>&1; then
      WRITTEN_SECRET+=("$name")
      printf '  %s✓ set%s GitHub secret %s\n' "$GREEN" "$RESET" "$name"
      return
    fi
  fi
  SKIPPED+=("GitHub 密钥 $name（请手动执行：gh secret set $name）")
  warn "未设置 GitHub 密钥 $name——gh 尚未登录或不可用，请稍后手动设置"
}

set_var() {
  local name="$1" value="$2"
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    if gh variable set "$name" --body "$value" >/dev/null 2>&1; then
      printf '  %s✓ set%s GitHub variable %s\n' "$GREEN" "$RESET" "$name"
      return
    fi
  fi
  SKIPPED+=("GitHub 变量 $name")
  warn "未设置 GitHub 变量 $name——gh 尚未登录或不可用，请稍后手动设置"
}

finish() {
  _clear
  printf '\n%s%s  ✓ 部署向导完成%s\n' "$BOLD" "$GREEN" "$RESET"
  (( ${#WRITTEN_ENV[@]} ))    && note "已将 ${#WRITTEN_ENV[@]} 项配置写入 $ENV_FILE：${WRITTEN_ENV[*]}"
  (( ${#WRITTEN_SECRET[@]} )) && note "已设置 ${#WRITTEN_SECRET[@]} 项 GitHub 密钥：${WRITTEN_SECRET[*]}"
  if (( ${#SKIPPED[@]} )); then
    printf '\n'; warn "仍需手动完成："
    for s in "${SKIPPED[@]}"; do note "  - $s"; done
  fi
  printf '\n'
}

# ──────────────────────────────────────────────────────────────────────────
# STAGES
# ──────────────────────────────────────────────────────────────────────────

TOTAL_STAGES=6
ENV_FILE="${ENV_FILE:-.env.tencent-cloud-deploy}"
REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$REPO_ROOT"

require_value() {
  local name="$1" value="$2"
  if [[ -z "${value// }" ]]; then
    warn "$name 不能为空。"
    exit 1
  fi
}

validate_domain() {
  [[ "$1" =~ ^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$ ]]
}

shell_quote() { printf '%q' "$1"; }

banner "PoliceMate · 腾讯云部署"

stage "腾讯云服务器与安全组"
say "目标服务器需要是可以通过 SSH 连接的 Ubuntu/Debian CVM。本向导会安装 Node.js 24、Nginx、systemd 服务和 Certbot。"
open_url "https://console.cloud.tencent.com/cvm/instance/index"
step "在 CVM 控制台找到公网 IPv4 地址，并确认实例正在运行。"
ask SERVER_HOST "服务器公网 IPv4 地址："
ask SSH_USER "SSH 用户名（默认 ubuntu）："
SSH_USER="${SSH_USER:-ubuntu}"
ask SSH_PORT "SSH 端口（默认 22）："
SSH_PORT="${SSH_PORT:-22}"
ask SSH_KEY_PATH "SSH 私钥路径（留空则使用 SSH agent 或默认密钥）："
require_value "SERVER_HOST" "$SERVER_HOST"
[[ "$SSH_PORT" =~ ^[0-9]+$ ]] || { warn "SSH 端口必须是数字。"; exit 1; }
if [[ -n "$SSH_KEY_PATH" && ! -f "$SSH_KEY_PATH" ]]; then
  warn "找不到私钥文件：$SSH_KEY_PATH"
  exit 1
fi
write_env SERVER_HOST "$SERVER_HOST"
write_env SSH_USER "$SSH_USER"
write_env SSH_PORT "$SSH_PORT"
write_env SSH_KEY_PATH "$SSH_KEY_PATH"
step "打开实例安全组，允许入站 TCP 22（建议只允许你的公网 IP）、80 和 443 端口。"
pause "安全组规则保存后按回车继续。"

SSH_ARGS=(-p "$SSH_PORT" -o ConnectTimeout=10 -o ServerAliveInterval=30)
SCP_ARGS=(-P "$SSH_PORT" -o ConnectTimeout=10)
if [[ -n "$SSH_KEY_PATH" ]]; then
  SSH_ARGS+=(-i "$SSH_KEY_PATH")
  SCP_ARGS+=(-i "$SSH_KEY_PATH")
fi
SSH_TARGET="${SSH_USER}@${SERVER_HOST}"
step "正在测试 SSH 连接。首次连接可能需要确认主机指纹，或输入私钥密码。"
ssh "${SSH_ARGS[@]}" "$SSH_TARGET" 'printf "connected: %s@%s\n" "$(id -un)" "$(hostname)"'

stage "域名与 DNS"
say "HTTPS 是发布要求。请准备一个 A 记录指向本服务器的域名或子域名。"
say "如果 CVM 位于中国大陆，请在提供公网网站服务前确认域名已完成所需 ICP 备案。"
open_url "https://console.cloud.tencent.com/cns"
step "如果服务器位于中国大陆，请在腾讯云备案控制台确认域名备案状态。"
open_url "https://console.cloud.tencent.com/beian"
ask DOMAIN "部署域名（不含 https://，例如 app.example.com）："
ask CERTBOT_EMAIL "用于接收证书到期提醒的邮箱："
require_value "DOMAIN" "$DOMAIN"
require_value "CERTBOT_EMAIL" "$CERTBOT_EMAIL"
validate_domain "$DOMAIN" || { warn "请输入有效的完整域名。"; exit 1; }
[[ "$CERTBOT_EMAIL" == *@*.* ]] || { warn "请输入有效的邮箱地址。"; exit 1; }
write_env DOMAIN "$DOMAIN"
write_env CERTBOT_EMAIL "$CERTBOT_EMAIL"
step "创建或更新 A 记录：$DOMAIN → $SERVER_HOST。"
pause "DNS 记录保存并等待解析生效后按回车继续。"
RESOLVED_IPS=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u | paste -sd, - || true)
if [[ -z "$RESOLVED_IPS" ]]; then
  warn "DNS 尚未解析。记录公开生效前，Certbot 申请证书会失败。"
  confirm "仍要继续吗？" || exit 1
elif [[ ",$RESOLVED_IPS," != *",$SERVER_HOST,"* ]]; then
  warn "$DOMAIN 当前解析到 $RESOLVED_IPS，而不是 $SERVER_HOST。"
  confirm "仍要继续吗？" || exit 1
else
  note "DNS 已解析到 $SERVER_HOST。"
fi

stage "实际服务信息"
say "以下信息会显示在产品的“使用与数据说明”页面。必须填写真实信息，占位内容会阻断受控试行发布。"
ask PM_SERVICE_PROVIDER "实际服务提供者/运营主体："
ask PM_SERVICE_CONTACT "实际试行反馈联系人/渠道："
ask PM_DATA_PROCESSING_STATEMENT "数据处理说明（单行）："
ask PM_TECHNICAL_LOGGING_BOUNDARY "技术日志边界（单行）："
require_value "PM_SERVICE_PROVIDER" "$PM_SERVICE_PROVIDER"
require_value "PM_SERVICE_CONTACT" "$PM_SERVICE_CONTACT"
require_value "PM_DATA_PROCESSING_STATEMENT" "$PM_DATA_PROCESSING_STATEMENT"
require_value "PM_TECHNICAL_LOGGING_BOUNDARY" "$PM_TECHNICAL_LOGGING_BOUNDARY"
write_env PM_SERVICE_PROVIDER "$PM_SERVICE_PROVIDER"
write_env PM_SERVICE_CONTACT "$PM_SERVICE_CONTACT"
write_env PM_DATA_PROCESSING_STATEMENT "$PM_DATA_PROCESSING_STATEMENT"
write_env PM_TECHNICAL_LOGGING_BOUNDARY "$PM_TECHNICAL_LOGGING_BOUNDARY"
warn "当前仓库仍使用确定性的 fixture 分析提供者。生产部署会保持“案情分析”关闭，仅启用“文书范例”。"

stage "本地验证与发布打包"
for command in npm tar ssh scp curl; do
  command -v "$command" >/dev/null 2>&1 || { warn "本机缺少命令：$command"; exit 1; }
done
step "正在运行类型检查、服务端测试和生产版 H5 构建。"
npm run typecheck
npm test
npm run build
RELEASE_ID=$(date -u +%Y%m%dT%H%M%SZ)-$(git rev-parse --short HEAD 2>/dev/null || echo local)
ARCHIVE=$(mktemp "${TMPDIR:-/tmp}/policymate-${RELEASE_ID}.XXXXXX.tar.gz")
trap 'rm -f "${ARCHIVE:-}"' EXIT
step "正在打包当前代码，排除密钥、依赖和测试产物。"
tar \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='*/node_modules' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='apps/web/dist' \
  --exclude='test-results' \
  --exclude='playwright-report' \
  --exclude='.browser-deps' \
  -czf "$ARCHIVE" .
REMOTE_ARCHIVE="/tmp/policymate-${RELEASE_ID}.tar.gz"
scp "${SCP_ARGS[@]}" "$ARCHIVE" "${SSH_TARGET}:${REMOTE_ARCHIVE}"
note "已上传发布包 $RELEASE_ID。"

stage "安装并启动 PoliceMate"
say "接下来将在服务器上使用 sudo 安装系统软件，创建 /opt/policymate，写入 /etc/policymate/policymate.env，并启动 systemd 服务。"
confirm "确认继续修改服务器吗？" || exit 1
REMOTE_ELEVATE="sudo"
[[ "$SSH_USER" == "root" ]] && REMOTE_ELEVATE=""
REMOTE_ENV=(
  "DOMAIN=$(shell_quote "$DOMAIN")"
  "CERTBOT_EMAIL=$(shell_quote "$CERTBOT_EMAIL")"
  "RELEASE_ID=$(shell_quote "$RELEASE_ID")"
  "REMOTE_ARCHIVE=$(shell_quote "$REMOTE_ARCHIVE")"
  "PM_SERVICE_PROVIDER=$(shell_quote "$PM_SERVICE_PROVIDER")"
  "PM_SERVICE_CONTACT=$(shell_quote "$PM_SERVICE_CONTACT")"
  "PM_DATA_PROCESSING_STATEMENT=$(shell_quote "$PM_DATA_PROCESSING_STATEMENT")"
  "PM_TECHNICAL_LOGGING_BOUNDARY=$(shell_quote "$PM_TECHNICAL_LOGGING_BOUNDARY")"
)
REMOTE_COMMAND="$REMOTE_ELEVATE env ${REMOTE_ENV[*]} bash -s"
ssh "${SSH_ARGS[@]}" "$SSH_TARGET" "$REMOTE_COMMAND" <<'REMOTE_SCRIPT'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl xz-utils nginx certbot python3-certbot-nginx

install_node_24() {
  local machine node_arch sums tarball tmp
  machine=$(uname -m)
  case "$machine" in
    x86_64) node_arch=x64 ;;
    aarch64|arm64) node_arch=arm64 ;;
    *) echo "不支持的 CPU 架构：$machine" >&2; exit 1 ;;
  esac
  sums=$(curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt)
  tarball=$(printf '%s\n' "$sums" | awk -v arch="$node_arch" '$2 ~ ("linux-" arch "\\.tar\\.xz$") {print $2; exit}')
  [[ -n "$tarball" ]] || { echo "找不到最新的 Node.js 24 安装包" >&2; exit 1; }
  tmp=$(mktemp -d)
  curl -fsSL "https://nodejs.org/dist/latest-v24.x/$tarball" -o "$tmp/$tarball"
  printf '%s\n' "$sums" | grep "  $tarball$" > "$tmp/SHASUMS256.txt"
  (cd "$tmp" && sha256sum -c SHASUMS256.txt)
  rm -rf /opt/node-v24
  install -d /opt/node-v24
  tar -xJf "$tmp/$tarball" -C /opt/node-v24 --strip-components=1
  ln -sfn /opt/node-v24/bin/node /usr/local/bin/node
  ln -sfn /opt/node-v24/bin/npm /usr/local/bin/npm
  ln -sfn /opt/node-v24/bin/npx /usr/local/bin/npx
  ln -sfn /opt/node-v24/bin/corepack /usr/local/bin/corepack
  rm -rf "$tmp"
}

if ! command -v node >/dev/null 2>&1 || [[ "$(node --version)" != v24.* ]]; then
  install_node_24
fi
node --version
npm --version

id policemate >/dev/null 2>&1 || useradd --system --home-dir /opt/policymate --create-home --shell /usr/sbin/nologin policemate
install -d -o policemate -g policemate /opt/policymate/releases /etc/policymate
RELEASE_DIR="/opt/policymate/releases/$RELEASE_ID"
rm -rf "$RELEASE_DIR"
install -d -o policemate -g policemate "$RELEASE_DIR"
tar -xzf "$REMOTE_ARCHIVE" -C "$RELEASE_DIR"
rm -f "$REMOTE_ARCHIVE"
chown -R policemate:policemate "$RELEASE_DIR"

runuser -u policemate -- env HOME=/opt/policymate PATH=/usr/local/bin:/usr/bin:/bin bash -lc "cd '$RELEASE_DIR' && npm ci && npm run build"
ln -sfn "$RELEASE_DIR" /opt/policymate/current
chown -h policemate:policemate /opt/policymate/current

env_escape() {
  local value=$1
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  printf '%s' "$value"
}
cat > /etc/policymate/policymate.env <<EOF
NODE_ENV=production
PM_HOST=127.0.0.1
PM_SERVER_PORT=8787
PM_WEB_DIST=/opt/policymate/current/apps/web/dist
PM_MASTER_SWITCH=on
PM_ANALYSIS_ENABLED=off
PM_DOCUMENTS_ENABLED=on
PM_ENABLE_TEST_CONTROLS=0
PM_ALLOWED_ORIGINS="https://$(env_escape "$DOMAIN")"
PM_SERVICE_PROVIDER="$(env_escape "$PM_SERVICE_PROVIDER")"
PM_SERVICE_CONTACT="$(env_escape "$PM_SERVICE_CONTACT")"
PM_DATA_PROCESSING_STATEMENT="$(env_escape "$PM_DATA_PROCESSING_STATEMENT")"
PM_TECHNICAL_LOGGING_BOUNDARY="$(env_escape "$PM_TECHNICAL_LOGGING_BOUNDARY")"
EOF
chmod 600 /etc/policymate/policymate.env

cat > /etc/systemd/system/policymate.service <<'EOF'
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
EOF

cat > /etc/nginx/sites-available/policymate <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    client_max_body_size 128k;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 10s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }

    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy no-referrer always;
    add_header X-Frame-Options DENY always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
}
EOF
ln -sfn /etc/nginx/sites-available/policymate /etc/nginx/sites-enabled/policymate
rm -f /etc/nginx/sites-enabled/default

systemctl daemon-reload
systemctl enable --now policemate
sleep 2
curl -fsS http://127.0.0.1:8787/api/v1/health >/dev/null
nginx -t
systemctl enable --now nginx
systemctl reload nginx

if ! certbot --nginx --non-interactive --agree-tos --redirect -m "$CERTBOT_EMAIL" -d "$DOMAIN"; then
  echo "Certbot 申请证书失败。HTTP 服务仍在运行；请修复 DNS 或安全组访问后执行：" >&2
  echo "  sudo certbot --nginx --redirect -m '$CERTBOT_EMAIL' -d '$DOMAIN'" >&2
  exit 42
fi

systemctl reload nginx
systemctl --no-pager --full status policemate | sed -n '1,18p'
curl -fsS "https://$DOMAIN/api/v1/health"
REMOTE_SCRIPT

stage "公网验证与交接"
step "正在从本机检查公网 HTTPS 健康检查接口。"
curl --fail --show-error --silent --max-time 20 "https://${DOMAIN}/api/v1/health"
printf '\n'
step "正在打开已部署的网站。"
open_url "https://${DOMAIN}"
say "请检查首页、“文书范例”和“使用与数据说明”。在真实 Dify 适配层完成前，“案情分析”应显示为不可用。"
note "查看服务器日志：ssh ${SSH_TARGET} 'sudo journalctl -u policemate -f'"
note "重启服务：    ssh ${SSH_TARGET} 'sudo systemctl restart policemate'"
note "检查 Nginx：   ssh ${SSH_TARGET} 'sudo nginx -t'"
note "部署配置已保存在本地 $ENV_FILE，该文件已加入 Git 忽略列表。"

finish
