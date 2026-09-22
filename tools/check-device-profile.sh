#!/bin/sh
# Tethys · device-profile verifier
#
# devices/*.env says, in its own header, that it is sourced by the build
# pipeline. A claim like that is worth exactly as much as the mechanism that
# checks it - so this is that mechanism. Three things are proven here, and not
# one of them by trusting the prose:
#
#   1. INERT. A profile that runs commands when sourced is a program wearing a
#      config's name - the same law the module's config.env obeys. Each profile
#      is sourced with an EMPTY PATH under `set -u`, so any external command, and
#      any reference to an undefined variable, fails the check on the spot.
#
#   2. AGREED. The profile's build keys must match what the build ACTUALLY does:
#      the NDK version android.sh pins, the CGO decision the workflow makes, the
#      arch matrix the workflow builds, and the profile's own ABI. The day these
#      drift, the profile becomes a document of what someone once intended, and
#      nothing announces it. That is the whole failure this file exists to catch.
#
#   3. HONEST ABOUT PROVENANCE. Every PROBE-marked value is printed with the key
#      it belongs to, so a default can never be read as a measurement.
#
# Usage:  sh tools/check-device-profile.sh [repo-root]
# Exit:   0 = every check passed, 1 = at least one failed.

set -u

_here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
_root=${1:-$(CDPATH= cd -- "$_here/.." && pwd)}

pass=0
fail=0

ok()   { pass=$((pass + 1)); printf '  ok    %s\n' "$1"; }
bad()  { fail=$((fail + 1)); printf '  FAIL  %s\n' "$1"; }
info() { printf '        %s\n' "$1"; }

check() {  # $1 = label, $2 = expected, $3 = actual
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (expected [$2], got [$3])"; fi
}

# The profile is POSIX sh, so the shell IS the parser. It is sourced in a
# subshell with `set -a` so every assignment is exported and read straight back -
# no second implementation of "what is a value" is introduced here, because a
# second implementation is the drift this file exists to prevent.
profile_get() {  # $1 = profile, $2 = key
  _pg=$( ( set -eu; set -a; . "$1" >/dev/null 2>&1; eval "printf '%s' \"\${$2-}\"" ) 2>/dev/null )
  printf '%s' "$_pg"
}

printf 'Tethys device-profile verifier\n'
printf '  root: %s\n\n' "$_root"

set -- "$_root"/devices/*.env
if [ ! -f "$1" ]; then
  bad "no device profiles found under $_root/devices"
  printf '\n%d passed, %d failed\n' "$pass" "$fail"
  exit 1
fi

for _p in "$@"; do
  printf 'profile: %s\n' "$(basename "$_p")"

  # ---- 1. inert when sourced -----------------------------------------------
  # An empty PATH means a profile that shells out cannot find its command, and
  # `set -u` means a profile that leans on someone else's variable is caught
  # rather than silently expanding to nothing.
  _empty=$(mktemp -d) || exit 1
  if ( set -eu; PATH="$_empty"; . "$_p" ) >/dev/null 2>&1; then
    ok "sources with an empty PATH and set -u (no commands, no undefined refs)"
  else
    bad "runs commands, or references an undefined variable, when sourced"
  fi
  rmdir "$_empty" 2>/dev/null

  # ---- 2. complete ---------------------------------------------------------
  # The keys the BUILD reads. Absent, they export empty and fail in silence,
  # which is the one failure mode a build must never have.
  _missing=""
  for _k in TETHYS_PROFILE_ID TETHYS_PROFILE_LABEL TETHYS_ABI_PRIMARY \
            TETHYS_GOARCH TETHYS_BUILD_ABIS TETHYS_GOARM64 TETHYS_CGO \
            TETHYS_NDK_VERSION TETHYS_PROBE_KEYS; do
    [ -n "$(profile_get "$_p" "$_k")" ] || _missing="$_missing $_k"
  done
  check "declares every build key" "" "$_missing"

  # ---- 3. agreed with the build -------------------------------------------
  # (a) The NDK: read out of the patch that CREATES android.sh, so the source of
  #     truth is the script itself rather than a copy of its constant.
  _patch="$_root/patches/0001-build-and-tooling.patch"
  if [ -r "$_patch" ]; then
    _ndk=$(sed -n 's/^+NDK_VERSION="\(.*\)"$/\1/p' "$_patch" | head -n1)
    if [ -n "$_ndk" ]; then
      check "NDK version matches android.sh's pinned $_ndk" \
        "$_ndk" "$(profile_get "$_p" TETHYS_NDK_VERSION)"
    else
      bad "could not read NDK_VERSION out of patch 0001 - this check cannot run"
    fi
  else
    bad "patch 0001 not readable - the NDK check cannot run"
  fi

  _wf="$_root/.github/workflows/build-android.yml"
  if [ -r "$_wf" ]; then
    # (b) CGO: android.sh exports CGO_ENABLED=1 unless it is told --nocgo, so the
    #     workflow's own invocation is what the profile must agree with. The flag
    #     must be read from the INVOCATION, never from the file: this workflow's
    #     header DOCUMENTS `--nocgo` in prose, and a check that cannot tell a
    #     documented flag from a passed one reports the opposite of the truth -
    #     as this one did on its first run.
    if sed 's/#.*//' "$_wf" | grep -q -- '--nocgo'; then _ci_cgo=0; else _ci_cgo=1; fi
    check "CGO agrees with the workflow (no --nocgo => CGO_ENABLED=1)" \
      "$_ci_cgo" "$(profile_get "$_p" TETHYS_CGO)"

    # (c) GOARCH: a profile for an arch the pipeline does not build describes a
    #     device that can never be served by a tag.
    _matrix=$(sed -n 's/^ *arch: \[\(.*\)\]$/\1/p' "$_wf" | tr -d ' ' | tr ',' ' ')
    if [ -n "$_matrix" ]; then
      _goarch=$(profile_get "$_p" TETHYS_GOARCH)
      _in=no
      for _a in $_matrix; do [ "$_a" = "$_goarch" ] && _in=yes; done
      check "the profile's GOARCH ($_goarch) is one the workflow builds" \
        "yes" "$_in"
    else
      bad "could not read the arch matrix out of the workflow - this check cannot run"
    fi
  else
    bad "no workflow at $_wf - the agreement checks cannot run"
  fi

  # (d) A profile that contradicts ITSELF is worse than a silent one: an ABI the
  #     declared GOARCH cannot produce would install a payload the device cannot
  #     execute, and nothing downstream would question it.
  case "$(profile_get "$_p" TETHYS_GOARCH)" in
    arm64) _want_abi=arm64-v8a ;;
    arm)   _want_abi=armeabi-v7a ;;
    amd64) _want_abi=x86_64 ;;
    *)     _want_abi="" ;;
  esac
  if [ -n "$_want_abi" ]; then
    check "the primary ABI matches GOARCH ($_want_abi)" \
      "$_want_abi" "$(profile_get "$_p" TETHYS_ABI_PRIMARY)"
  else
    bad "unrecognised TETHYS_GOARCH - cannot check the ABI against it"
  fi

  # ---- 4. honest about provenance -----------------------------------------
  # The marker may sit anywhere in the trailing comment - "# PROBE - confirm
  # with: uname -r" and "# daemon priority; PROBE on real device" are both
  # PROBE-marked, and a detector anchored to the start of the comment silently
  # misses the second kind. A value that goes unreported is a default that gets
  # read as a measurement, which is the whole failure this section prevents.
  _probes=$(sed -n 's/^\([A-Z_][A-Z0-9_]*\)="[^"]*".*#[^#]*PROBE.*$/\1/p' "$_p")
  _n=$(printf '%s\n' "$_probes" | grep -c .)
  if [ "$_n" -gt 0 ]; then
    ok "$_n value(s) marked PROBE - defaults to be REPLACED by measurement:"
    for _k in $_probes; do
      info "$_k=$(profile_get "$_p" "$_k")"
    done
  else
    bad "marks no value PROBE - is every one of them measured?"
  fi

  printf '\n'
done

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
exit 0
