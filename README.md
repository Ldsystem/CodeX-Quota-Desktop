# Codex Quota Desktop

Desktop application for managing several Codex accounts and comparing their quota at a glance. It is a full port of the `codex-quota` bash CLI into TypeScript, not a wrapper around it.

## Status

Working against real data. The main process reads the profiles under `~/.codex-quota/`, the live credential at `~/.codex/auth.json`, and the Codex usage API, and it performs every action the CLI does. The fixture source (`src/renderer/src/lib/fixture-service.ts`) is still there and takes over automatically when the renderer runs in a plain browser through `pnpm dev:web`, so the interface can be worked on without touching real credentials.

## Shape of the interface

Two levels deep, with no side rail. The list is the navigation: open an account, act on it, come back.

- **Overview** — how many accounts are ready to switch to, lifetime tokens, which quota resets next, and one row per account with its weekly meter.
- **Account** — reached by opening a row. Subscription and quota, token activity, credential state, warnings, and every action for that account.
- **Settings** — reached by the gear in the header. Paths, proxy, usage API, and the priming request settings.

The header carries the back button, what is currently running, refresh, and the gear.

## Token activity is optional

The CLI never read token counts, and the usage endpoint is undocumented, so lifetime tokens and the daily activity grid are modelled as optional data (`QuotaReport.tokenUsage`). When a report carries it, the overview card and the account's activity grid appear; when it is null they are simply absent, and nothing else changes. The fixture provides it so the layout can be judged — set `TOKEN_USAGE_AVAILABLE` to `false` in the fixture to see the interface without it.

## Reads and work are asynchronous

Nothing blocks the interface:

- The registry read is local and paints immediately.
- Each account's subscription and usage is fetched in its own background job. Rows fill in as answers arrive, and a failed fetch offers a retry without affecting the others.
- Actions run per account. Several can be in flight at once; only the account running a job has its actions disabled, and the header says what is currently running.

## Capabilities covered by the interface

Every entry point of the CLI has a counterpart in the UI:

| CLI command | Interface |
| --- | --- |
| `status`, `list` | Account rows with the weekly meter, plan, reset time, available resets, and warnings |
| `add` | Add account dialog with name validation and profile mode choice |
| `import-active` | Import the live credential, per account |
| `activate` | Switch Codex Desktop, guarded by the running-app check and the mandatory backup |
| `login` | Sign in to an account |
| `logout` | Sign out, behind a confirmation |
| `delete-auth` | Delete stored credential, restricted to Desktop-switching profiles |
| `remove` | Remove account, behind a confirmation |
| `start-5h` | "Start the quota window": one minimal billed request so the window counts from a chosen moment |

Two deliberate departures from the CLI:

- Codex no longer enforces a rolling 5-hour limit, so only the weekly window is tracked. The command that used to be `start-5h` keeps its real purpose, priming the window, under a name that is not tied to a bucket that no longer exists.
- `use` (running an arbitrary command under a profile home) has no interface counterpart yet.

## Layout

```
src/
  main/        Electron main process
  preload/     Context bridge
  shared/      Domain model and the CodexQuotaService contract
  renderer/    React interface
```

## The codex command

Signing in, signing out, and priming a quota window all spawn the real `codex`. Nothing is bundled: the app uses the one already installed, looking at `PATH` first and then at the usual install directories, because an app started from Finder inherits only `/usr/bin:/bin:/usr/sbin:/sbin` and never sees a shell profile. Set `CODEX_QUOTA_CODEX_BIN` to choose a specific one. Settings shows which command was found.

## Commands

Node 22 or newer. Node 20 cannot load `undici@8`, which one test file needs; the packaged app is unaffected because Electron embeds its own Node.

```bash
pnpm install
pnpm dev        # Electron with hot reload
pnpm dev:web    # Renderer only, in a browser at http://localhost:5273
pnpm test
pnpm typecheck
pnpm build
pnpm dist       # Unsigned macOS arm64 .dmg and .zip in release/
```

## Installing the local build

```bash
pnpm dist
open release                      # then drag Codex Quota.app to /Applications
```

The build is ad-hoc signed, not notarised, and has no Developer ID. That is enough for macOS to start it locally. A copy that travels through a browser, AirDrop, or another Mac arrives quarantined, and Gatekeeper will refuse it until it is opened once with right-click → Open, or cleared with:

```bash
xattr -dr com.apple.quarantine "/Applications/Codex Quota.app"
```

There is no auto-update. Run `pnpm dist` again and replace the app.

## Publishing a release

`.github/workflows/release.yml` builds on a GitHub-hosted Apple silicon runner and needs no secrets: the bundle is ad-hoc signed by the same `afterPack` hook used locally, and the run's own token publishes the release.

```bash
gh workflow run Release          # rehearsal: builds and uploads a workflow artifact
pnpm version patch               # or edit package.json, then commit
git tag v0.1.1 && git push origin v0.1.1
```

A tag whose version disagrees with `package.json` fails the run before anything is built, and the job refuses to continue if the runner is not arm64 or if the packed bundle has no valid signature. Tag runs publish `CodexQuota-<version>-arm64.dmg` and the matching `.zip` to the release page, with the quarantine instructions in the body.
