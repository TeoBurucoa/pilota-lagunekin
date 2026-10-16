#!/usr/bin/env bash
# Configure GitLab project settings for a GitOps repository.
#
# Applies:
#   3.1 Protect master + require CODEOWNERS approval
#   3.2 Pipelines must succeed
#   3.3 Allow MR author approval (uncheck "Prevent approval by author")
#   3.4 Register Renovate webhook (URL/token required explicitly)
#   3.5 Invite CODEOWNERS [Admin] group as Maintainer
#
# Requirements: bash, curl, jq
#
# Usage:
#   ./configure-gitlab-gitops.sh \
#     --repo https://gitlab.example.com/group/project \
#     --token "$GITLAB_TOKEN" \
#     --renovate-webhook-url "https://renovate.example.com/webhook" \
#     [--renovate-webhook-token "$RENOVATE_HOOK_TOKEN"] \
#     [--branch master] \
#     [--dry-run] \
#     [--skip-webhook] \
#     [--admin-group AZURE/infra_paris/gitops/gitops-admin]

set -euo pipefail

SCRIPT_NAME="$(basename "$0")"

# Access levels (GitLab)
# 0  = No access
# 30 = Developer
# 40 = Maintainer
ACCESS_NO_ONE=0
ACCESS_DEVELOPER=30
ACCESS_MAINTAINER=40

REPO=""
TOKEN=""
GITLAB_URL=""
PROJECT_PATH=""
BRANCH="master"
RENOVATE_WEBHOOK_URL=""
RENOVATE_WEBHOOK_TOKEN=""
ADMIN_GROUP_OVERRIDE=""
DRY_RUN=0
SKIP_WEBHOOK=0

usage() {
  cat <<EOF
Usage: ${SCRIPT_NAME} --repo <url|path> --token <gitlab_token> [options]

Required:
  --repo <url|path>              Project URL or path (e.g. group/subgroup/project)
  --token <token>                GitLab private token / personal access token
                                 (scopes: api). Can also use GITLAB_TOKEN env.

Options:
  --gitlab-url <url>             GitLab base URL (inferred from --repo if URL)
  --branch <name>                Branch to protect (default: master)
  --renovate-webhook-url <url>   Renovate webhook URL (required unless --skip-webhook)
  --renovate-webhook-token <t>   Renovate webhook secret token (optional)
  --admin-group <path>           Override admin group path (skip CODEOWNERS parse)
  --skip-webhook                 Skip Renovate webhook registration
  --dry-run                      Print actions without modifying the project
  -h, --help                     Show this help

Examples:
  ${SCRIPT_NAME} \\
    --repo https://gitlab.company.com/AZURE/my-gitops \\
    --token "\$GITLAB_TOKEN" \\
    --renovate-webhook-url "https://renovate.company.com/hook"

  GITLAB_TOKEN=glpat-xxx ${SCRIPT_NAME} \\
    --repo AZURE/my-gitops \\
    --gitlab-url https://gitlab.company.com \\
    --renovate-webhook-url "\$RENOVATE_WEBHOOK_URL" \\
    --renovate-webhook-token "\$RENOVATE_WEBHOOK_TOKEN"
EOF
}

log()  { printf '==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

urlencode() {
  # Prefer jq @uri; fallback to python
  if command -v jq >/dev/null 2>&1; then
    jq -nr --arg s "$1" '$s|@uri'
  else
    python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
  fi
}

parse_repo() {
  local input="$1"

  if [[ "$input" =~ ^https?:// ]]; then
    # https://host[:port]/group/project[.git]
    local without_scheme="${input#*://}"
    local host_port="${without_scheme%%/*}"
    local path_part="${without_scheme#*/}"
    path_part="${path_part%.git}"
    path_part="${path_part%/}"

    GITLAB_URL="https://${host_port}"
    PROJECT_PATH="${path_part}"
  else
    PROJECT_PATH="${input#/}"
    PROJECT_PATH="${PROJECT_PATH%.git}"
  fi

  [[ -n "$PROJECT_PATH" ]] || die "Could not parse project path from: $input"
}

api() {
  # api METHOD PATH [JSON_BODY]
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local url="${GITLAB_URL}/api/v4${path}"
  local -a curl_args=(
    -sS
    -X "$method"
    -H "PRIVATE-TOKEN: ${TOKEN}"
    -H "Content-Type: application/json"
    -w "\n%{http_code}"
  )

  if [[ "$DRY_RUN" -eq 1 && "$method" != "GET" ]]; then
    info "[dry-run] ${method} ${url}"
    if [[ -n "$body" ]]; then
      info "[dry-run] body: ${body}"
    fi
    printf '%s\n' '{}'
    return 0
  fi

  local response http_code body_json
  if [[ -n "$body" ]]; then
    response="$(curl "${curl_args[@]}" -d "$body" "$url")"
  else
    response="$(curl "${curl_args[@]}" "$url")"
  fi

  http_code="$(printf '%s' "$response" | tail -n1)"
  body_json="$(printf '%s' "$response" | sed '$d')"

  if [[ ! "$http_code" =~ ^2 ]]; then
    die "${method} ${path} failed (HTTP ${http_code}): ${body_json}"
  fi

  printf '%s' "$body_json"
}

api_allow() {
  # Like api(), but accept a list of extra OK codes (e.g. 404).
  # Prints: BODY\nHTTP_CODE on stdout via globals LAST_BODY / LAST_CODE
  local method="$1"
  local path="$2"
  local body="${3:-}"
  shift 3 || true
  local -a ok_codes=("$@")
  local url="${GITLAB_URL}/api/v4${path}"
  local -a curl_args=(
    -sS
    -X "$method"
    -H "PRIVATE-TOKEN: ${TOKEN}"
    -H "Content-Type: application/json"
    -w "\n%{http_code}"
  )

  if [[ "$DRY_RUN" -eq 1 && "$method" != "GET" ]]; then
    info "[dry-run] ${method} ${url}"
    if [[ -n "$body" ]]; then
      info "[dry-run] body: ${body}"
    fi
    LAST_BODY='{}'
    LAST_CODE='200'
    return 0
  fi

  local response
  if [[ -n "$body" ]]; then
    response="$(curl "${curl_args[@]}" -d "$body" "$url")"
  else
    response="$(curl "${curl_args[@]}" "$url")"
  fi

  LAST_CODE="$(printf '%s' "$response" | tail -n1)"
  LAST_BODY="$(printf '%s' "$response" | sed '$d')"

  if [[ "$LAST_CODE" =~ ^2 ]]; then
    return 0
  fi
  local code
  for code in "${ok_codes[@]:-}"; do
    if [[ "$LAST_CODE" == "$code" ]]; then
      return 0
    fi
  done
  die "${method} ${path} failed (HTTP ${LAST_CODE}): ${LAST_BODY}"
}

LAST_BODY=""
LAST_CODE=""

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo)
        REPO="${2:-}"; shift 2 ;;
      --token)
        TOKEN="${2:-}"; shift 2 ;;
      --gitlab-url)
        GITLAB_URL="${2:-}"; shift 2 ;;
      --branch)
        BRANCH="${2:-}"; shift 2 ;;
      --renovate-webhook-url)
        RENOVATE_WEBHOOK_URL="${2:-}"; shift 2 ;;
      --renovate-webhook-token)
        RENOVATE_WEBHOOK_TOKEN="${2:-}"; shift 2 ;;
      --admin-group)
        ADMIN_GROUP_OVERRIDE="${2:-}"; shift 2 ;;
      --skip-webhook)
        SKIP_WEBHOOK=1; shift ;;
      --dry-run)
        DRY_RUN=1; shift ;;
      -h|--help)
        usage; exit 0 ;;
      *)
        die "Unknown argument: $1 (use --help)" ;;
    esac
  done

  TOKEN="${TOKEN:-${GITLAB_TOKEN:-}}"
  [[ -n "$REPO" ]]  || die "--repo is required"
  [[ -n "$TOKEN" ]] || die "--token (or GITLAB_TOKEN) is required"

  parse_repo "$REPO"

  if [[ -z "$GITLAB_URL" ]]; then
    die "--gitlab-url is required when --repo is not a full URL"
  fi
  GITLAB_URL="${GITLAB_URL%/}"

  if [[ "$SKIP_WEBHOOK" -eq 0 ]]; then
    [[ -n "$RENOVATE_WEBHOOK_URL" ]] || die \
      "--renovate-webhook-url is required (or pass --skip-webhook). Do not invent the URL."
  fi
}

# ---------------------------------------------------------------------------
# 3.1 Protected branch + CODEOWNERS approval
# ---------------------------------------------------------------------------
protect_master_branch() {
  local encoded_project encoded_branch
  encoded_project="$(urlencode "$PROJECT_PATH")"
  encoded_branch="$(urlencode "$BRANCH")"

  log "3.1 Protect branch '${BRANCH}' (merge: Developer+, push: No one, CODEOWNERS approval)"

  api_allow GET "/projects/${encoded_project}/protected_branches/${encoded_branch}" "" 404

  local payload
  payload="$(jq -n \
    --arg name "$BRANCH" \
    --argjson merge "$ACCESS_DEVELOPER" \
    --argjson push "$ACCESS_NO_ONE" \
    '{
      name: $name,
      push_access_level: $push,
      merge_access_level: $merge,
      allow_force_push: false,
      code_owner_approval_required: true
    }')"

  if [[ "$LAST_CODE" == "404" ]]; then
    info "Branch not protected yet — creating protection"
    api POST "/projects/${encoded_project}/protected_branches" "$payload" >/dev/null
  else
    info "Branch already protected — recreating with expected rules"
    # Unprotect then protect: most portable across GitLab versions
    if [[ "$DRY_RUN" -eq 0 ]]; then
      api DELETE "/projects/${encoded_project}/protected_branches/${encoded_branch}" >/dev/null || true
    else
      info "[dry-run] DELETE /projects/${encoded_project}/protected_branches/${encoded_branch}"
    fi
    api POST "/projects/${encoded_project}/protected_branches" "$payload" >/dev/null
  fi

  # Verify
  if [[ "$DRY_RUN" -eq 1 ]]; then
    info "[dry-run] skip verification"
    return 0
  fi

  local result
  result="$(api GET "/projects/${encoded_project}/protected_branches/${encoded_branch}")"
  local codeowners
  codeowners="$(printf '%s' "$result" | jq -r '.code_owner_approval_required')"
  if [[ "$codeowners" != "true" ]]; then
    die "code_owner_approval_required is not true (got: ${codeowners}). Premium/Ultimate may be required."
  fi
  info "OK: ${BRANCH} protected, code_owner_approval_required=true"
}

# ---------------------------------------------------------------------------
# 3.2 Pipelines must succeed
# ---------------------------------------------------------------------------
enable_pipelines_must_succeed() {
  local encoded_project
  encoded_project="$(urlencode "$PROJECT_PATH")"

  log "3.2 Enable 'Pipelines must succeed'"

  local payload
  payload="$(jq -n '{only_allow_merge_if_pipeline_succeeds: true}')"
  api PUT "/projects/${encoded_project}" "$payload" >/dev/null

  if [[ "$DRY_RUN" -eq 1 ]]; then
    return 0
  fi

  local result
  result="$(api GET "/projects/${encoded_project}")"
  local flag
  flag="$(printf '%s' "$result" | jq -r '.only_allow_merge_if_pipeline_succeeds')"
  [[ "$flag" == "true" ]] || die "only_allow_merge_if_pipeline_succeeds is not true"
  info "OK: only_allow_merge_if_pipeline_succeeds=true"
}

# ---------------------------------------------------------------------------
# 3.3 Allow author approval (= uncheck Prevent approval by author)
# ---------------------------------------------------------------------------
allow_author_approval() {
  local encoded_project
  encoded_project="$(urlencode "$PROJECT_PATH")"

  log "3.3 Allow MR author to approve (disable 'Prevent approval by author')"

  # merge_requests_author_approval=true  => author CAN approve
  # (UI "Prevent approval by author" unchecked)
  local payload
  payload="$(jq -n '{merge_requests_author_approval: true}')"

  # Prefer approval_settings endpoint (newer); fallback to project approvals
  api_allow PUT "/projects/${encoded_project}/approval_settings" "$payload" 404
  if [[ "$LAST_CODE" == "404" ]]; then
    info "approval_settings unavailable — falling back to /approvals"
    api POST "/projects/${encoded_project}/approvals" "$payload" >/dev/null
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    return 0
  fi

  api_allow GET "/projects/${encoded_project}/approval_settings" "" 404
  local flag=""
  if [[ "$LAST_CODE" == "200" ]]; then
    flag="$(printf '%s' "$LAST_BODY" | jq -r '.merge_requests_author_approval')"
  else
    flag="$(api GET "/projects/${encoded_project}/approvals" | jq -r '.merge_requests_author_approval')"
  fi

  [[ "$flag" == "true" ]] || die "merge_requests_author_approval is not true (got: ${flag})"
  info "OK: merge_requests_author_approval=true (Prevent approval by author unchecked)"
}

# ---------------------------------------------------------------------------
# 3.4 Renovate webhook
# ---------------------------------------------------------------------------
register_renovate_webhook() {
  local encoded_project
  encoded_project="$(urlencode "$PROJECT_PATH")"

  if [[ "$SKIP_WEBHOOK" -eq 1 ]]; then
    log "3.4 Skip Renovate webhook (--skip-webhook)"
    return 0
  fi

  log "3.4 Register Renovate webhook"

  local hooks existing_id
  hooks="$(api GET "/projects/${encoded_project}/hooks")"
  existing_id="$(printf '%s' "$hooks" | jq -r --arg u "$RENOVATE_WEBHOOK_URL" '
    map(select(.url == $u)) | first | .id // empty
  ')"

  local payload
  payload="$(jq -n \
    --arg url "$RENOVATE_WEBHOOK_URL" \
    --arg token "$RENOVATE_WEBHOOK_TOKEN" \
    '{
      url: $url,
      name: "renovate",
      description: "Renovate dependency updates (push + merge request events)",
      push_events: true,
      merge_requests_events: true,
      enable_ssl_verification: true,
      issues_events: false,
      confidential_issues_events: false,
      tag_push_events: false,
      note_events: false,
      job_events: false,
      pipeline_events: false,
      wiki_page_events: false,
      deployment_events: false,
      releases_events: false
    } + (if $token != "" then {token: $token} else {} end)')"

  if [[ -n "$existing_id" ]]; then
    info "Webhook already exists (id=${existing_id}) — updating"
    api PUT "/projects/${encoded_project}/hooks/${existing_id}" "$payload" >/dev/null
  else
    info "Creating webhook → ${RENOVATE_WEBHOOK_URL}"
    api POST "/projects/${encoded_project}/hooks" "$payload" >/dev/null
  fi

  info "OK: Renovate webhook configured (push + merge_request events)"
}

# ---------------------------------------------------------------------------
# 3.5 Invite CODEOWNERS [Admin] group as Maintainer
# ---------------------------------------------------------------------------
fetch_codeowners() {
  local encoded_project encoded_path ref
  encoded_project="$(urlencode "$PROJECT_PATH")"
  encoded_path="$(urlencode "CODEOWNERS")"
  ref="$(urlencode "$BRANCH")"

  api_allow GET "/projects/${encoded_project}/repository/files/${encoded_path}/raw?ref=${ref}" "" 404
  if [[ "$LAST_CODE" == "404" ]]; then
    # try default branch / root variants
    api_allow GET "/projects/${encoded_project}/repository/files/${encoded_path}/raw" "" 404
  fi
  if [[ "$LAST_CODE" == "404" ]]; then
    return 1
  fi
  printf '%s' "$LAST_BODY"
}

parse_admin_group_from_codeowners() {
  local content="$1"
  # Match section header [Admin] or [Admin][N], then first @group on following lines
  # until next section header.
  printf '%s\n' "$content" | awk '
    BEGIN { in_admin=0 }
    /^[[:space:]]*\[Admin\]/ { in_admin=1; next }
    /^[[:space:]]*\[[^]]+\]/ {
      if (in_admin) exit
    }
    in_admin && /@/ {
      if (match($0, /@[A-Za-z0-9_./-]+/)) {
        g = substr($0, RSTART+1, RLENGTH-1)
        print g
        exit
      }
    }
  '
}

invite_admin_group() {
  local encoded_project group_path encoded_group
  encoded_project="$(urlencode "$PROJECT_PATH")"

  log "3.5 Invite CODEOWNERS [Admin] group as Maintainer"

  if [[ -n "$ADMIN_GROUP_OVERRIDE" ]]; then
    group_path="${ADMIN_GROUP_OVERRIDE#@}"
    info "Using --admin-group override: ${group_path}"
  else
    local codeowners
    if ! codeowners="$(fetch_codeowners)"; then
      die "CODEOWNERS not found on branch '${BRANCH}'. Pass --admin-group explicitly."
    fi
    group_path="$(parse_admin_group_from_codeowners "$codeowners")"
    [[ -n "$group_path" ]] || die \
      "Could not find [Admin] group in CODEOWNERS. Pass --admin-group explicitly."
    info "Parsed from CODEOWNERS [Admin]: @${group_path}"
  fi

  encoded_group="$(urlencode "$group_path")"
  local group_json group_id
  group_json="$(api GET "/groups/${encoded_group}")"
  group_id="$(printf '%s' "$group_json" | jq -r '.id')"
  [[ "$group_id" != "null" && -n "$group_id" ]] || die "Group not found: ${group_path}"

  # Already shared?
  local project_json already
  project_json="$(api GET "/projects/${encoded_project}")"
  already="$(printf '%s' "$project_json" | jq -r --argjson gid "$group_id" '
    .shared_with_groups // [] | map(select(.group_id == $gid)) | first // empty
    | if . == null or . == "" then empty
      else "\(.group_access_level)"
      end
  ')"

  if [[ -n "$already" ]]; then
    if [[ "$already" == "$ACCESS_MAINTAINER" ]]; then
      info "OK: group already shared as Maintainer (access_level=${already})"
      return 0
    fi
    info "Group shared with access_level=${already} — updating to Maintainer (${ACCESS_MAINTAINER})"
    # Delete share then recreate (update endpoint varies by version)
    if [[ "$DRY_RUN" -eq 0 ]]; then
      api DELETE "/projects/${encoded_project}/share/${group_id}" >/dev/null || true
    else
      info "[dry-run] DELETE /projects/${encoded_project}/share/${group_id}"
    fi
  fi

  local payload
  payload="$(jq -n \
    --argjson group_id "$group_id" \
    --argjson group_access "$ACCESS_MAINTAINER" \
    '{group_id: $group_id, group_access: $group_access}')"

  api POST "/projects/${encoded_project}/share" "$payload" >/dev/null
  info "OK: @${group_path} invited as Maintainer"
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print_summary() {
  local encoded_project
  encoded_project="$(urlencode "$PROJECT_PATH")"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "Dry-run complete — no changes applied"
    return 0
  fi

  log "Summary"
  local project branch approvals hooks
  project="$(api GET "/projects/${encoded_project}")"
  api_allow GET "/projects/${encoded_project}/protected_branches/$(urlencode "$BRANCH")" "" 404
  branch="$LAST_BODY"
  api_allow GET "/projects/${encoded_project}/approval_settings" "" 404
  if [[ "$LAST_CODE" == "200" ]]; then
    approvals="$LAST_BODY"
  else
    approvals="$(api GET "/projects/${encoded_project}/approvals")"
  fi
  hooks="$(api GET "/projects/${encoded_project}/hooks")"

  jq -n \
    --argjson project "$project" \
    --argjson branch "${branch:-null}" \
    --argjson approvals "$approvals" \
    --argjson hooks "$hooks" \
    --arg renovate_url "$RENOVATE_WEBHOOK_URL" \
    --arg branch_name "$BRANCH" \
    '{
      project: $project.path_with_namespace,
      web_url: $project.web_url,
      branch_protection: {
        branch: $branch_name,
        protected: ($branch != null),
        code_owner_approval_required: ($branch.code_owner_approval_required // false)
      },
      pipelines_must_succeed: $project.only_allow_merge_if_pipeline_succeeds,
      author_can_approve: $approvals.merge_requests_author_approval,
      renovate_webhook_present: (
        if $renovate_url == "" then null
        else ($hooks | map(select(.url == $renovate_url)) | length > 0)
        end
      ),
      shared_with_groups: ($project.shared_with_groups // [])
    }'
}

main() {
  need_cmd curl
  need_cmd jq

  parse_args "$@"

  log "GitLab: ${GITLAB_URL}"
  log "Project: ${PROJECT_PATH}"
  [[ "$DRY_RUN" -eq 1 ]] && warn "Dry-run mode enabled"

  # Resolve project exists
  local encoded_project
  encoded_project="$(urlencode "$PROJECT_PATH")"
  local project
  project="$(api GET "/projects/${encoded_project}")"
  info "Resolved: $(printf '%s' "$project" | jq -r '.path_with_namespace') (id=$(printf '%s' "$project" | jq -r '.id'))"

  protect_master_branch
  enable_pipelines_must_succeed
  allow_author_approval
  register_renovate_webhook
  invite_admin_group
  print_summary

  log "Done."
}

main "$@"
