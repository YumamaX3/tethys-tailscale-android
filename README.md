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
  split-android-patch.mjs   the regenerator (declarative, deterministic)
  patch-groups.json         group definitions consumed by the splitter
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

**Open debt, named rather than hidden:** `devices/pixel6pro.env` carries both
build-time and runtime keys, while the module carries its own runtime defaults in
`config.env`. The two are *reconciled by hand today*. A CI step that emits the
profile's runtime keys into the module zip — or proves the two agree — is owed.
Until it exists, treat the module's `config.env` as the runtime authority and
this profile as the build authority, and change a runtime value in **both**.

## Attribution and licence

Tailscale is **BSD-3-Clause**. The Android modifications recreated here are the
work of **Anas** (@anasfanani) in
Magisk-Tailscale, and the patch
series below is a regrouping of that work, not original authorship. The
recreation tooling in `tools/` is BSD-3-Clause, matching the upstream licence.
