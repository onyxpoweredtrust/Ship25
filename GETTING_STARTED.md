# Getting Started with Ship25

Ship is onyxlabs' developer platform — one flat `ship` CLI over five modules: **Zero** (kernel), **One** (data), **Two** (connectors), **Three** (build + deploy), and **CLI** (the `ship` binary itself, which merges each module's own commands into a single command table).

Every module ships at its own version — `1.0` for Zero/One/Two/Three, independent of the umbrella release name. This umbrella release is **Ship25**, so named for 2026.

## 1. First-time machine setup — Dynamic Boot

Dynamic Boot finds where this checkout lives, installs workspace dependencies, builds every Core module, and links `ship` onto your `PATH`. Two ways to trigger it:

**Double-click** [`ignition.command`](ignition.command) in Finder. It always operates on the folder it's saved in, so it works no matter where you double-click it from.

**Or from a terminal**, from inside this repo:

```
pnpm install
npx tsx Core/CLI/Engine/Bin/Boot.ts
```

Either way, once it finishes:

```
$ ship --version
ship Ship25
```

`ship` is now a real global command — verified working from any directory, not just this repo. If the "linking ship globally" step ever fails (a `pnpm bin --global` path issue, permissions, etc.), Dynamic Boot tells you exactly what to check; everything else it did (install + build) still stands.

Dynamic Boot also writes your shell config for you — the PATH line (only if pnpm's global bin dir isn't already on PATH) and the `shell-init` line that makes `ship new` auto-`cd` (see step 3). It's idempotent: safe to run again, never duplicates a line. If it added anything, it tells you and you'll need to open a new terminal (or `source` the file it names) once.

On macOS/Linux, if you're in a real interactive terminal, it'll also ask once whether to install the power-monitoring daemon (needs your password — a real system-level LaunchDaemon/systemd unit, so it asks rather than doing it silently). Skipped automatically when run non-interactively.

## 2. Get oriented

```
ship guidelines
```

prints the umbrella overview above. Each module has its own deeper `guidelines`, reached through its own CLI once you're inside an App (or directly: `zero guidelines`, `one guidelines`, etc. — the standalone module binaries still exist for local dev, per each module's own CHECKLIST.md).

## 3. Scaffold your first App

```
ship new my-app
```

drops you into `Apps/my-app` — Zero's `shell-init` makes this auto-`cd` work (a subprocess can't change your shell's directory on its own); Dynamic Boot already wired this into your shell config in step 1. From there:

```
ship build
```

picks up your App and runs it — interactively, if you're not already standing inside one.

From anywhere else later on, `ship latest` cds you straight back into whichever App you used most recently — same auto-cd mechanism as `new`, no path needed.

## 4. Store data

Everything Ship or your App persists goes through **One** — Blocks, Subblocks, and Sudoblocks (role-gated paths), stored in One's own data language (Dataset). Ship's own data lives under a reserved `_Ship` block that no App-defined role can ever unlock — only the machine owner. Try:

```
ship write MyApp/hello '"world"'
ship read MyApp/hello
```

## 5. Add a connector

**Two** ships GitHub, Ship UI (shadcn scaffold), Ship Auth (Better Auth, 35 social providers, backed by One), Ship AI (OpenAI/Anthropic), Ship Pay (Stripe + QR), and Ship Notify (Slack/Discord). See what's registered:

```
ship connector list
```

Every connector's credentials are stored through One's `ConnectorStorageAdapter` — never a flat file, never a raw env var. (Ship Auth isn't in the CLI registry yet — it needs real settings to construct; it's fully usable via `@ship/two` today.)

## 6. Build and deploy

**Three** detects your framework automatically (73 supported, modeled on Vercel's own detection), builds with a real content-addressed cache, and can push to a relay tunnel for a public URL:

```
ship deploy build   # build only, no deploy
ship deploy         # build, then push to the relay
```

Deploying to onyxlabs' own `onyxpowered.com` relay is a separate, one-time infrastructure step — see [`Core/Three/RUNBOOK.md`](Core/Three/RUNBOOK.md) for the real provisioning/DNS/TLS steps.

## Where credentials live

Every secret Ship itself needs — Zero's JWT signing key, Two's Onyx Pass encryption key, Three's relay admin key — lives in One, under `_Ship/Keys/<name>`, via One's shared `Keyring`. Nothing is a raw file in `~/.ship/keys` or a bare environment variable. If you're extending Ship with a new module that needs a key, use `createKeyring(store)` from `@ship/one` rather than inventing another place to put it.

## No third-party packages, ever

Every runtime dependency Ship uses — `jose`, `ws`, `systeminformation`, `zod`, `nodemailer`, `qrcode`, `acme-client`, `better-auth` — is vendored: real, working source living inside the relevant module's own `Engine/Vendor/`, not an npm dependency. If you're adding a new capability that needs an external library, vendor it the same way rather than adding it to a `package.json`'s `dependencies`.

## Naming and branding, if you're contributing

- Every file and folder Ship itself authors is a single capitalized word (`Registry.ts`, `Ignition/`, `Providers/ShipAuth/`) — vendored third-party code keeps its own internal structure as-is.
- Every source file starts with `// <Module> @ Onyx Ship` (`Zero`, `One`, `Two`, `Three`, or `Ship25` for CLI's own files) — shebang'd entrypoints carry it on line 2.
- Read a module's own `Guidelines.ts` (`guidelinesLines`) before changing its CLI surface — that's the text `ship guidelines` actually prints, so it needs to stay accurate.
