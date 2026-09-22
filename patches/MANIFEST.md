# Patch series manifest

**Source:** `research/android-patch.patch`  
**Source sha256:** `ecea489aca21f8d3da39d2e96f84ae953a629e864cc3200d5b696019ba4af234`  
**Source size:** 2433 lines, 53 file blocks.  
**Upstream:** squashed android patch `d6a7411` - "feat: android modifications", tailscale `v1.98.5 -> v1.98.8`, by Anas <135501348+anasfanani@users.noreply.github.com>, dated 2026-07-13.  
**Series:** 12 patches, 53 files, 78 hunks, **+1555/-48** lines.  
**Line accounting:** 2001 new-side and 494 old-side lines, of which 446 are context (unchanged) - so 446 = 2001 - 1555 = 494 - 48.

## What this split is, and what it is not

Regrouped by CONCERN. The source is a single squash; the ten original commits named in its header are not recoverable from it, so these group boundaries are a reviewed regrouping, not a recovery. The split is lossless and machine-checked (see MANIFEST.md).

Every block in the series below is **byte-identical** to its block in the source - proven by sha256 over the written files, not over the intended ones. Every hunk header was re-checked against its own body after writing, so a truncated patch cannot hide here. And `git apply --numstat` - a parser this tool did not write - was required to report the same line totals, which is how the first, badly-labelled version of this report was caught.

## The series

| # | patch | concern | files | hunks | + | - | new-side | old-side |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 0001 | `0001-build-and-tooling.patch` | Build & tooling | 4 | 5 | 442 | 0 | 460 | 18 |
| 0002 | `0002-paths-and-runtime-locations.patch` | Paths & runtime locations | 6 | 7 | 72 | 17 | 118 | 63 |
| 0003 | `0003-tun-netstack-and-netns.patch` | TUN, netstack & netns | 6 | 10 | 132 | 4 | 195 | 67 |
| 0004 | `0004-dns-manager-android.patch` | DNS manager (Android) | 2 | 2 | 112 | 1 | 118 | 7 |
| 0005 | `0005-routing-and-firewall.patch` | Routing & firewall | 4 | 14 | 150 | 5 | 248 | 103 |
| 0006 | `0006-network-monitor.patch` | Network monitor | 5 | 8 | 24 | 3 | 72 | 51 |
| 0007 | `0007-hostinfo-and-os-user.patch` | Hostinfo & OS user | 4 | 5 | 182 | 0 | 200 | 18 |
| 0008 | `0008-cli-and-feature-knobs.patch` | CLI & feature knobs | 3 | 3 | 3 | 2 | 21 | 20 |
| 0009 | `0009-daemon-integration.patch` | Daemon integration | 5 | 5 | 14 | 7 | 44 | 37 |
| 0010 | `0010-ssh-and-taildrop.patch` | SSH & Taildrop | 9 | 14 | 39 | 8 | 122 | 91 |
| 0011 | `0011-self-update-and-version.patch` | Self-update & version gate | 4 | 4 | 375 | 1 | 387 | 13 |
| 0012 | `0012-web-surface.patch` | Web surface | 1 | 1 | 10 | 0 | 16 | 6 |
| | **total** | | **53** | **78** | **1555** | **48** | **2001** | **494** |

## File to group

### `0001-build-and-tooling.patch`

- `.github/workflows/build_android.yml`  
- `scripts/android.sh`  
- `go.mod`  
- `go.sum`  

### `0002-paths-and-runtime-locations.patch`

- `paths/paths.go`  
- `paths/paths_unix.go`  
- `tsconst/linuxfw.go`  
- `logpolicy/logpolicy.go`  
- `net/dns/resolvconfpath_android.go`  
- `net/dns/resolvconfpath_default.go`  

### `0003-tun-netstack-and-netns.patch`

- `cmd/tailscaled/tailscaled.go`  
- `net/tstun/tun.go`  
- `net/netns/netns_android.go`  
- `net/netns/netns_linux.go`  
- `wgengine/netstack/netstack.go`  
- `wgengine/pendopen.go`  

### `0004-dns-manager-android.patch`

- `net/dns/manager_android.go`  
- `net/dns/manager_default.go`  

### `0005-routing-and-firewall.patch`

- `wgengine/router/osrouter/router_linux.go`  
- `util/linuxfw/iptables.go`  
- `util/linuxfw/iptables_runner.go`  
- `util/linuxfw/linuxfw.go`  

### `0006-network-monitor.patch`

- `net/netmon/interfaces_android.go`  
- `net/netmon/interfaces_linux.go`  
- `net/netmon/netmon_linux.go`  
- `net/netmon/netmon_polling.go`  
- `net/netmon/state.go`  

### `0007-hostinfo-and-os-user.patch`

- `hostinfo/hostinfo_android.go`  
- `util/osuser/group_ids.go`  
- `util/osuser/user.go`  
- `util/osuser/user_android.go`  

### `0008-cli-and-feature-knobs.patch`

- `cmd/tailscale/cli/set.go`  
- `cmd/tailscale/cli/up.go`  
- `envknob/featureknob/featureknob.go`  

### `0009-daemon-integration.patch`

- `ipn/ipnlocal/local.go`  
- `ipn/ipnlocal/peerapi.go`  
- `ipn/ipnserver/actor.go`  
- `ipn/localapi/cert.go`  
- `ipn/localapi/disabled_stubs.go`  

### `0010-ssh-and-taildrop.patch`

- `feature/ssh/ssh.go`  
- `feature/taildrop/fileops_fs.go`  
- `feature/taildrop/paths.go`  
- `ssh/tailssh/c2n.go`  
- `ssh/tailssh/hostkeys.go`  
- `ssh/tailssh/incubator.go`  
- `ssh/tailssh/incubator_linux.go`  
- `ssh/tailssh/tailssh.go`  
- `ssh/tailssh/user.go`  

### `0011-self-update-and-version.patch`

- `clientupdate/clientupdate.go`  
- `clientupdate/clientupdate_android.go`  
- `clientupdate/clientupdate_notandroid.go`  
- `version/version_checkformat.go`  

### `0012-web-surface.patch`

- `tsweb/tsweb.go`  

## Verification

Re-run at any time (deterministic and idempotent):

```sh
node tools/split-android-patch.mjs research/android-patch.patch patches
```

Success prints `OK` with the census; any failure exits non-zero with `FAIL <reason>`.
Regenerate the series whenever the upstream android patch is re-synced to a newer
tailscale release.
