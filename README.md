# tethys-tailscale-android

A **granular, concern-grouped recreation** of the Android patch series that backs
the Magisk-Tailscale module, pinned to Tailscale **v1.98.8**.

This repository is *not* a mirror of Tailscale's source. It carries the patch
series, the proof that the series is lossless, the provenance of every constant
the device tuning rests on, and the splitter that regenerates all of it.

## What this is, honestly

The upstream project ships its Android changes as **one squashed commit**. A
squash discards the boundaries between concerns: it will not tell you which
lines serve paths, which serve DNS, and which serve the firewall. So this series
is a **regrouping by concern** — reviewed, and documented as a regrouping rather
than presented as a recovery of the author's original commits. The squash header
names ten commits; **they are not recoverable from a squash**, and this
repository does not pretend otherwise.

What *is* machine-proven is that the regroup is **lossless**: every block here is
byte-identical to its block in the upstream squash, verified by sha256 over the
written files, and `git apply --numstat` — a parser this tooling did not write —
agrees on the line totals.

## Layout

```
patches/                 the series, applied in numeric order
  MANIFEST.md            census table, file-to-group map, line accounting
  0001..0012-*.patch     12 patches · 53 files · 78 hunks · +1555/-48
devices/
  pixel6pro.env          the Pixel 6 Pro (raven) build + runtime profile
docs/
  PROVENANCE.md          every constant, its source URL, and the sha256 read
tools/
  split-android-patch.mjs      the regenerator (declarative, deterministic)
  patch-groups.json            group definitions consumed by the splitter
  check-device-profile.sh      proves each profile is inert, complete, and agrees with the build
```

## The series

| # | concern | files | hunks | + | − |
|---|---|---:|---:|---:|---:|
| 0001 | Build & tooling | 4 | 5 | 442 | 0 |
| 0002 | Paths & runtime locations | 6 | 7 | 72 | 17 |
| 0003 | TUN, netstack & netns | 6 | 10 | 132 | 4 |
| 0004 | DNS manager (Android) | 2 | 2 | 112 | 1 |
| 0005 | Routing & firewall | 4 | 14 | 150 | 5 |
| 0006 | Network monitor | 5 | 8 | 24 | 3 |
| 0007 | Hostinfo & OS user | 4 | 5 | 182 | 0 |
| 0008 | CLI & feature knobs | 3 | 3 | 3 | 2 |
| 0009 | Daemon integration | 5 | 5 | 14 | 7 |
| 0010 | SSH & Taildrop | 9 | 14 | 39 | 8 |
| 0011 | Self-update & version gate | 4 | 4 | 375 | 1 |
| 0012 | Web surface | 1 | 1 | 10 | 0 |
| | **total** | **53** | **78** | **1555** | **48** |

Line accounting closes: `2001` new-side and `494` old-side lines, of which
`446` are context — so `446 = 2001 − 1555 = 494 − 48`.

## Applying the series

Against a clean Tailscale **v1.98.8** tree:

```sh
git clone --depth 1 --branch v1.98.8 https://github.com/tailscale/tailscale
cd tailscale
for p in ../patches/0*.patch; do git apply "$p" || { echo "FAILED: $p"; exit 1; }; done
```

Then build for the target device. `scripts/android.sh` is created by patch 0001:

```sh
./scripts/android.sh check                 # vet + build both binaries, android/arm64
./scripts/android.sh build --upx arm64      # CGO on, NDK r27c fetched automatically
./scripts/android.sh build --nocgo arm64    # CGO off — no NDK required
```

The Pixel 6 Pro is `arm64-v8a`, so only the `arm64` target is built. Upstream's
own workflow builds `arm` as well; that half is deliberately dropped here for
this device.

## Regenerating the series

Deterministic and idempotent:

```sh
node tools/split-android-patch.mjs research/android-patch.patch patches
```

Success prints `OK` with the census; any failure exits non-zero with
`FAIL <reason>`. Regenerate whenever the upstream patch is re-synced to a newer
Tailscale release.

## Provenance and the PROBE discipline

`devices/pixel6pro.env` distinguishes three grades, and the distinction is the
point:

| marker | meaning |
|---|---|
| `SEEN` | read from a source this session, with a sha256 recorded in `docs/PROVENANCE.md` |
| `PROBE` | **believed but unverified** — must be confirmed on the device with the named command |
| *(absent)* | not known; deliberately not written down |

A spec sheet assembled from memory is exactly the artefact that looks
authoritative and is wrong in one detail nobody checks. Where a value was not
read from a source this session, it says `PROBE` and names its probe.

Two plan claims that were *inference* are now *citations*: `RULE_PRIORITY_SECURE_VPN
= 13000` and `RULE_PRIORITY_LOCAL_NETWORK = 20000`, both confirmed against
`RouteController.h`. The upstream patch's own fwmark comment — "the lower 0–20
bits are allocated by Android; bits 21–28 are unused" — was **independently
confirmed** against `Fwmark.h`, which was fetched before that comment was read.

## Relationship to the module, and one open debt

The module that consumes this series lives in `tethys-tailscaled-module`. It
needs no copy of this patch series — only the binary this series produces.

**The build half is now wired, and mechanically checked.** The workflow's *Wire
every device profile that builds this arch* step runs
`tools/check-device-profile.sh` and then sources every profile whose
`TETHYS_GOARCH` matches the leg being built, exporting its toolchain knobs into
`$GITHUB_ENV`. So the profile is no longer a document of intent: the NDK version
it names is re-read out of patch 0001, its CGO decision is re-derived from the
workflow's own invocation, its ABI is checked against its own `GOARCH`, and its
arch is checked against the matrix. Any drift fails the run rather than shipping
a silently wrong binary.

`check-device-profile.sh` also proves the profile is **inert** — sourced with an
empty `PATH` under `set -u`, so a profile that shells out, or leans on a variable
defined elsewhere, is caught instead of quietly expanding to nothing. A config
that runs code is a program wearing a config's name.

**The runtime half is not wired, and should not be.** The profile's runtime keys
are the *daemon's* specification (plan M9 power governor, M10 MTU-derived MSS).
The module parses a fixed 18-key schema and deliberately tunes no Go runtime from
the shell: a knob the daemon owns cannot be measured from outside it, so setting
it there would be a guess wearing a setting's name. Nothing in the module repo
reads this file, and the profile's header now says so.

**One debt survives, narrowed.** The profile and the module's `config.env` both
name device-identity keys (`TETHYS_MATCH_*`), and those are still compared by
hand. Proving *those* agree spans two repositories, so the check needs both trees
present — it is owed, and named here rather than left to be rediscovered.

## Attribution and licence

Tailscale is **BSD-3-Clause**. The Android modifications recreated here are the
work of **Anas** (@anasfanani) in
Magisk-Tailscale, and the patch
series below is a regrouping of that work, not original authorship. The
recreation tooling in `tools/` is BSD-3-Clause, matching the upstream licence.
