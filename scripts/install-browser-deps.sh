#!/usr/bin/env bash
#
# 在没有 root 权限的环境中准备 Playwright Chromium 所需的最小系统库。
#
# 首选方案仍是官方命令（需要 root）：
#   npx playwright install chromium
#   sudo npx playwright install-deps chromium
#
# 本脚本是无法使用 root 时的降级方案：它把少量 .deb 解包到仓库内的
# .browser-deps/，由 playwright.config.ts 在该目录存在时自动设置
# LD_LIBRARY_PATH。该目录已被 .gitignore 忽略。
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work_dir="$repo_root/.browser-deps"
deb_dir="$work_dir/debs"
root_dir="$work_dir/root"
lib_dir="$root_dir/usr/lib/x86_64-linux-gnu"

mkdir -p "$deb_dir" "$root_dir"

packages=(libnspr4 libnss3)
if apt-cache show libasound2t64 >/dev/null 2>&1; then
  packages+=(libasound2t64)
else
  packages+=(libasound2)
fi

(
  cd "$deb_dir"
  apt-get download "${packages[@]}"
  for deb in ./*.deb; do
    dpkg -x "$deb" "$root_dir"
  done
)

echo "浏览器系统库已解包到：$lib_dir"
echo "playwright.config.ts 会在该目录存在时自动设置 LD_LIBRARY_PATH。"
