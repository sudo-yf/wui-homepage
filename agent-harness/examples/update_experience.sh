#!/usr/bin/env bash
set -euo pipefail

project_path=${1:?Usage: update_experience.sh /path/to/homepage}

cli-anything-wui-homepage --project "$project_path" experience list
cli-anything-wui-homepage --project "$project_path" --dry-run experience update 1 \
  --role "Research Assistant (RA)" \
  --period "2026.07 - Present"
cli-anything-wui-homepage --project "$project_path" experience update 1 \
  --role "Research Assistant (RA)" \
  --period "2026.07 - Present"
cli-anything-wui-homepage --project "$project_path" site build
