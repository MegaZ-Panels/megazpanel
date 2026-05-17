#!/usr/bin/env bash
# prompts.sh — interactive prompt helpers + validators.
# Source after common.sh.

# ── Colors ───────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  C_RED=$'\033[1;31m'; C_GREEN=$'\033[1;32m'; C_YELLOW=$'\033[1;33m'
  C_BLUE=$'\033[1;34m'; C_CYAN=$'\033[1;36m'; C_BOLD=$'\033[1m'; C_OFF=$'\033[0m'
else
  C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""; C_CYAN=""; C_BOLD=""; C_OFF=""
fi

p_err()  { printf "${C_RED}✗ %s${C_OFF}\n" "$*" >&2; }
p_ok()   { printf "${C_GREEN}✓ %s${C_OFF}\n" "$*"; }
p_info() { printf "${C_CYAN}› %s${C_OFF}\n" "$*"; }
p_warn() { printf "${C_YELLOW}! %s${C_OFF}\n" "$*"; }
p_step() { printf "\n${C_BOLD}${C_BLUE}== %s ==${C_OFF}\n" "$*"; }

show_banner() {
  cat <<'BANNER'
   __  ___                  _____ ___                  __
  /  |/  /__  ___ _____ _  /_  / / _ \___ ____  ___ / /
 / /|_/ / -_) _ `/ _ `/   / /_ / ___/ _ `/ _ \/ -_) /
/_/  /_/\__/\_, /\_,_/_  /___/_/   \_,_/_//_/\__/_/
           /___/
              container management panel — installer
BANNER
}

is_interactive() {
  [[ -t 0 && -t 1 ]]
}

# ── Validators ───────────────────────────────────────────────────────────────
validate_domain() {
  local v="$1"
  if [[ ! "$v" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$ ]]; then
    p_err "not a valid domain: $v"; return 1
  fi
  return 0
}

validate_email() {
  local v="$1"
  if [[ ! "$v" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
    p_err "not a valid email: $v"; return 1
  fi
  return 0
}

validate_password() {
  local v="$1"
  if (( ${#v} < 12 )); then p_err "password must be at least 12 characters"; return 1; fi
  [[ "$v" =~ [a-z] ]] || { p_err "password needs a lowercase letter"; return 1; }
  [[ "$v" =~ [A-Z] ]] || { p_err "password needs an uppercase letter"; return 1; }
  [[ "$v" =~ [0-9] ]] || { p_err "password needs a digit"; return 1; }
  [[ "$v" =~ [^A-Za-z0-9] ]] || { p_err "password needs a symbol"; return 1; }
  return 0
}

validate_db_identifier() {
  local v="$1"
  if [[ ! "$v" =~ ^[A-Za-z][A-Za-z0-9_]{0,62}$ ]]; then
    p_err "must start with a letter and contain only letters, digits, underscores (max 63)"
    return 1
  fi
  return 0
}

validate_telegram_token() {
  local v="$1"
  if [[ ! "$v" =~ ^[0-9]+:[A-Za-z0-9_-]{30,}$ ]]; then
    p_err "telegram token doesn't look right (expected NUMBERS:LETTERS_DASHES)"
    return 1
  fi
  return 0
}

validate_telegram_chat_id() {
  local v="$1"
  if [[ ! "$v" =~ ^-?[0-9]+$ ]]; then
    p_err "telegram chat id must be numeric"; return 1
  fi
  return 0
}

# ── Generators ───────────────────────────────────────────────────────────────
gen_password() {
  # 24 random bytes -> base64 -> filtered. Always meets validate_password.
  local raw
  raw="$(openssl rand -base64 24 | tr -d '\n=' | tr '/+' '_-')"
  # Ensure we have lower, upper, digit, symbol (-_).
  printf '%s' "Aa1!${raw}"
}

# ── Prompting ────────────────────────────────────────────────────────────────
# ask VAR PROMPT [DEFAULT] [VALIDATOR_FN]
ask() {
  local __var="$1" prompt="$2" default="${3:-}" validator="${4:-}" input
  local current="${!__var:-}"
  if [[ -n "$current" ]]; then
    if [[ -n "$validator" ]] && ! "$validator" "$current" >/dev/null 2>&1; then
      p_err "preset \$${__var}=$(printf '%q' "$current") fails validation"
      exit 1
    fi
    p_ok "$prompt: ${C_BOLD}${current}${C_OFF}  (from env)"
    return 0
  fi
  if ! is_interactive; then
    p_err "non-interactive mode but \$${__var} is not set"; exit 1
  fi
  while true; do
    local hint=""
    [[ -n "$default" ]] && hint=" [${C_YELLOW}${default}${C_OFF}]"
    printf "${C_CYAN}? %s${C_OFF}%s: " "$prompt" "$hint"
    IFS= read -r input
    input="${input:-$default}"
    if [[ -z "$input" ]]; then p_err "value is required"; continue; fi
    if [[ -n "$validator" ]] && ! "$validator" "$input"; then continue; fi
    printf -v "$__var" '%s' "$input"
    return 0
  done
}

# ask_password VAR PROMPT [allow_generate=true]
ask_password() {
  local __var="$1" prompt="$2" allow_gen="${3:-true}"
  local current="${!__var:-}"
  if [[ -n "$current" ]]; then
    if ! validate_password "$current" >/dev/null 2>&1; then
      p_err "preset \$${__var} does not meet password policy"; exit 1
    fi
    p_ok "$prompt: ${C_BOLD}(provided via env)${C_OFF}"
    return 0
  fi
  if ! is_interactive; then
    p_err "non-interactive mode but \$${__var} is not set"; exit 1
  fi
  local p1 p2
  while true; do
    if [[ "$allow_gen" == "true" ]]; then
      printf "${C_CYAN}? %s${C_OFF} (blank to auto-generate): " "$prompt"
    else
      printf "${C_CYAN}? %s${C_OFF}: " "$prompt"
    fi
    IFS= read -rs p1; echo
    if [[ -z "$p1" && "$allow_gen" == "true" ]]; then
      p1="$(gen_password)"
      p_ok "  generated (will be shown in summary at end)"
      printf -v "$__var" '%s' "$p1"
      return 0
    fi
    if ! validate_password "$p1"; then continue; fi
    printf "${C_CYAN}? confirm:${C_OFF} "
    IFS= read -rs p2; echo
    if [[ "$p1" != "$p2" ]]; then p_err "passwords do not match"; continue; fi
    printf -v "$__var" '%s' "$p1"
    return 0
  done
}

# confirm PROMPT [default=N]
confirm() {
  local prompt="$1" default="${2:-N}" answer
  local hint="[y/N]"
  [[ "$default" =~ ^[yY] ]] && hint="[Y/n]"
  if ! is_interactive; then
    [[ "$default" =~ ^[yY] ]] && return 0 || return 1
  fi
  while true; do
    printf "${C_CYAN}? %s${C_OFF} %s " "$prompt" "$hint"
    IFS= read -r answer
    answer="${answer:-$default}"
    case "$answer" in
      [yY]|[yY][eE][sS]) return 0 ;;
      [nN]|[nN][oO])     return 1 ;;
      *) p_err "please answer y or n" ;;
    esac
  done
}

# Mask a sensitive value for summary printing.
mask() {
  local v="$1"
  local len=${#v}
  if (( len <= 8 )); then printf '%s' '********'
  else printf '%s%s%s' "${v:0:4}" "$(printf '%*s' $((len - 8)) '' | tr ' ' '*')" "${v: -4}"
  fi
}
