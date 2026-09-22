# Provenance

Every fact the Tethys device profile and the patch series rest on, with the
source it came from and a checksum of the exact bytes read. If a value below is
disputed, this file is where to look first — and if a source has moved or
changed, the checksum will say so.

Retrieved: **2026-09-22**.

---

## 1. The AOSP platform constants

Neither file is included in this repository. They are AOSP sources, Apache-2.0
licensed, fetched here for reference only; only the constant *values* — bare
facts — are recorded below.

### `system/netd/include/Fwmark.h`

- URL: `https://android.googlesource.com/platform/system/netd/+/refs/heads/main/include/Fwmark.h?format=TEXT`
- sha256: `a1f53b84d4a9bc72c63bf503ad68b4b20f9339d63ec8f24e4e65a6fff2f9da6a`
- lines: 55
- local copy: `research/aosp/Fwmark.h` (not committed to the fork)

The 32-bit mark, as the union declares it — this is the whole netd socket-mark
contract in one struct:

| field | bits | width |
|---|---|---|
| `netId` | 0–15 | 16 |
| `explicitlySelected` | 16 | 1 |
| `protectedFromVpn` | 17 | 1 |
| `permission` | 18–19 | 2 |
| `uidBillingDone` | 20 | 1 |
| `reserved` | 21–28 | 8 |
| `vendor` | 29–30 | 2 |
| `ingress_cpu_wakeup` | 31 | 1 |

Also declared: `FWMARK_NET_ID_MASK = 0xffff`, and a static assertion that the
entire mark fits in 32 bits.

**Why this matters to us.** The plan's phase 3 §19 asks where a mark may be held
without colliding with netd. This table answers it: `netId` (16 bits) is the
enormous shared field, `reserved` (8 bits, 21–28) is unused by netd today, and
`vendor` (2 bits) is explicitly set aside for vendor use. The hazard is named in
the declaration itself — `reserved` is reserved *for AOSP's future*, so a mark
placed there can be taken away by a platform update. Collision policy, not just
collision space, is the real question.

**Also required:** the `permission : 2` field is typed by an enum in a sibling
header, so `Fwmark.h` does not stand alone. That header was fetched rather than
assumed — see §2.

### `system/netd/server/RouteController.h`

- URL: `https://android.googlesource.com/platform/system/netd/+/refs/heads/main/server/RouteController.h?format=TEXT`
- sha256: `98cad8dbb9c0e859cfa0b8cc704121f9dcd883d2d49d649ca9e1ae301426b113`
- lines: 259
- local copy: `research/aosp/RouteController.h` (not committed to the fork)

The `RULE_PRIORITY_*` ladder, verbatim from the `clang-format off` block:

| priority | rule | |
|---:|---|---|
| 10000 | `RULE_PRIORITY_VPN_OVERRIDE_SYSTEM` | |
| 11000 | `RULE_PRIORITY_VPN_OVERRIDE_OIF` | |
| 12000 | `RULE_PRIORITY_VPN_OUTPUT_TO_LOCAL` | |
| **13000** | **`RULE_PRIORITY_SECURE_VPN`** | ← the critical rule |
| 14000 | `RULE_PRIORITY_PROHIBIT_NON_VPN` | |
| 15000 | `RULE_PRIORITY_UID_EXPLICIT_NETWORK` | |
| 16000 | `RULE_PRIORITY_EXPLICIT_NETWORK` | |
| 17000 | `RULE_PRIORITY_OUTPUT_INTERFACE` | |
| 18000 | `RULE_PRIORITY_LEGACY_SYSTEM` | |
| 19000 | `RULE_PRIORITY_LEGACY_NETWORK` | |
| 20000 | `RULE_PRIORITY_LOCAL_NETWORK` | |
| 21000 | `RULE_PRIORITY_TETHERING` | |
| 22000 | `RULE_PRIORITY_UID_IMPLICIT_NETWORK` | |
| 23000 | `RULE_PRIORITY_IMPLICIT_NETWORK` | |
| 24000 | `RULE_PRIORITY_BYPASSABLE_VPN_NO_LOCAL_EXCLUSION` | |
| 25000 | `RULE_PRIORITY_UID_LOCAL_ROUTES` | |
| 26000 | `RULE_PRIORITY_LOCAL_ROUTES` | |
| 27000 | `RULE_PRIORITY_BYPASSABLE_VPN_LOCAL_EXCLUSION` | |
| 28000 | `RULE_PRIORITY_VPN_FALLTHROUGH` | |
| 29000 | `RULE_PRIORITY_UID_DEFAULT_NETWORK` | |
| 30000 | `RULE_PRIORITY_UID_DEFAULT_UNREACHABLE` | |
| 31000 | `RULE_PRIORITY_DEFAULT_NETWORK` | |
| 32000 | `RULE_PRIORITY_UNREACHABLE` | |

**Two claims in the plan were inference. They are now citations.**

1. The plan's phase 3 names **13000** as the rule an in-place update must never
   destroy. `RULE_PRIORITY_SECURE_VPN = 13000` — confirmed from source.
2. The upstream android patch cites an Android behaviour at rule **20000**.
   `RULE_PRIORITY_LOCAL_NETWORK = 20000` — confirmed from source.

**Not yet known (must be probed, not assumed):** which of these rules a Pixel 6
Pro running its current Android build actually *has installed*. The header
declares what netd may install; `ip rule show` reports what it did. The device
profile records the expectation and names the probe; only the probe is truth.

---

## 2. `system/netd/include/Permission.h`

- URL: `https://android.googlesource.com/platform/system/netd/+/refs/heads/main/include/Permission.h?format=TEXT`
- sha256: `c3763af97dc0a35e4bceaf233bf5a217641f5dcc031813e8e84f5be04d055ae7`
- lines: 54
- local copy: `research/aosp/Permission.h` (not committed to the fork)

Fetched because `Fwmark.h`'s `permission : 2` field is typed by this enum, and
the two-bit value decides the privilege a marked socket claims. Three values:

| value | name | meaning, as the header states it |
|---:|---|---|
| `0x0` | `PERMISSION_NONE` | no special permission held, or none required — regular networks and apps |
| `0x1` | `PERMISSION_NETWORK` | privileged networks and the apps that may touch them |
| `0x3` | `PERMISSION_SYSTEM` | system apps — **includes `PERMISSION_NETWORK`** |

**Why this matters to us.** The mark carries a *privilege level*, not a label.
`PERMISSION_SYSTEM` is the assertion that the socket belongs to a UID below
`FIRST_APPLICATION_UID`. A daemon that wears that bit while running as an
ordinary app UID is not merely mislabelled — it is claiming system standing to
netd. Any mark Tethys writes must keep `permission` at `PERMISSION_NONE` unless
system standing is genuinely held, and that is a rule to be enforced in code,
not remembered.

---

## 3. The device: Google Pixel 6 Pro

Source: Wikipedia, *Pixel 6* and *Google Tensor*. Secondary sources, quoted as
such — they are good enough to seed a profile, not to settle a dispute with a
device in hand.

| fact | value |
|---|---|
| codename | `raven` — **not confirmed this session**; the profile probes `ro.product.device` |
| released | 2021-10-28 (US), shipped with Android 12 |
| SoC | Google Tensor, first generation |
| CPU topology | 2 large + 2 medium + 4 small cores ("2+2+4") |
| architecture | ARM64 |
| RAM | 12 GB |
| battery | 5003 mAh |
| display | 6.7", 3120×1440 LTPO OLED, 120 Hz variable |
| security coprocessor | Titan M2 |
| support window | originally 3 OS / 5 security years, later extended to five OS years, "extending to 2026" |

**Deliberately absent.** The CPU's core names and clock rates, the GPU model,
and the kernel version are **not** recorded, because they were not read from a
source this session. The profile marks each as `PROBE`. A spec sheet assembled
from memory is exactly the kind of artefact that looks authoritative and is
wrong in one detail nobody checks.

---

## 4. The upstream android patch

- File: `research/android-patch.patch`
- sha256: `ecea489aca21f8d3da39d2e96f84ae953a629e864cc3200d5b696019ba4af234`
- size: 2 433 lines, 53 unique file blocks
- commit: `d6a741131b0d5010797bd737ca3bd7c02f8cb511`
- subject: `feat: android modifications`
- author: Anas `<135501348+anasfanani@users.noreply.github.com>`
- date: 2026-07-13
- tailscale range: `v1.98.5 → v1.98.8`
- base commit named in the patch: `96b8d62ed1f5d1474b52052c1c0e6a38ca6935b5`

The squash header names ten original commits. **They are not recoverable from a
squash**, so the twelve-patch series in `patches/` is a regrouping by *concern*
and is documented as such in `patches/MANIFEST.md`. Anyone who needs the
author's true commit boundaries must ask the upstream author or find the
pre-squash branch; this repository will not pretend to have reconstructed them.
