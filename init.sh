#!/usr/bin/env bash
# 個人健康檢查管理平台 — 開發包 repo 一鍵初始化
# 用法：先在 GitHub 建立「空的」repo（不勾任何初始檔案，建議名稱 health-devkit），
# 然後在本資料夾執行：bash init.sh https://github.com/JJrho/health-devkit.git
set -euo pipefail
REMOTE_URL="${1:?用法: bash init.sh <GitHub 空 repo 的 URL>}"
[ -d .git ] && { echo "錯誤：已是 git repo，中止。"; exit 1; }
git init -b main
git add -A
git commit -m "初次提交：個人健康檢查管理平台開發包 v1.0.0（RATIFIED）——Clarify C1-C22 決議、WBS 三層拆解（6 Epic/20 Feature/24 Sprint）、遵循方法論 v1.2.0"
git remote add origin "$REMOTE_URL"
git push -u origin main
echo ""
echo "✅ 完成。下一步：備妥外部依賴（Supabase 東京/Google OAuth/LLM key/首批知識來源）→ Sprint 1 DOR。"
