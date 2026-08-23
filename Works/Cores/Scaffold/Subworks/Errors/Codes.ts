// Scaffold Codes
// designed and built by onyxlabs.

export interface ErrorEntry {
  code: number;
  slug: string;
  title: string;
  why: string;
  fixes: string[];
}

export const errorRegistry: ErrorEntry[] = [
  {
    code: 1,
    slug: "ignition-target-not-empty",
    title: "Ignition target directory is not empty",
    why: "Zero refuses to scaffold a new App into a directory that already has files in it, to avoid silently overwriting existing work.",
    fixes: [
      "Choose an empty directory for the new App.",
      "Remove or move existing files out of the target directory first.",
    ],
  },
  {
    code: 2,
    slug: "runtime-not-detected",
    title: "Agent Search could not identify a runtime",
    why: "None of Zero's known runtime signatures (Node, Go, Ruby, Python, Rust) matched anything in the scanned directory.",
    fixes: [
      "Confirm the project has a recognizable manifest file (package.json, go.mod, Gemfile, pyproject.toml, Cargo.toml).",
      "If this is a new/custom runtime, add a detection rule to Agent Search's registry.",
    ],
  },
  {
    code: 3,
    slug: "token-expired",
    title: "Scoped token expired",
    why: "A module or SDK presented a token past its exp claim.",
    fixes: [
      "Request a fresh scoped token from Zero's token issuer.",
      "If this happens repeatedly, check the module's refresh-before-expiry logic.",
    ],
  },
  {
    code: 4,
    slug: "data-pull-failed",
    title: "Data Pull verification failed during Ignition",
    why: "Zero scaffolded the App successfully but the post-scaffold test Data Pull did not return the expected result.",
    fixes: [
      "Check network/dependency availability at the scaffold target.",
      "Re-run `ship ignition --verify` to retry just the verification step.",
    ],
  },
  {
    code: 5,
    slug: "unauthorized",
    title: "Missing or invalid token",
    why: "The request had no bearer token, or the token failed signature/expiry verification.",
    fixes: [
      "Attach a valid `Authorization: Bearer <token>` header.",
      "Request a fresh token if the previous one expired or was revoked.",
    ],
  },
  {
    code: 6,
    slug: "forbidden",
    title: "Token scope not permitted for this endpoint",
    why: "The token verified correctly but its scope isn't allowed to call this route.",
    fixes: [
      "Request a token with an appropriate scope for this endpoint.",
      "Confirm which module (One/Two/Three/SDK) should own this call.",
    ],
  },
  {
    code: 7,
    slug: "package-check-failed",
    title: "Source check found missing packages",
    why: "checkSource() detected declared dependencies that aren't actually installed for the detected runtime.",
    fixes: [
      "Run the runtime's install command (npm/yarn/pnpm install, bundle install, cargo fetch, etc.).",
      "Re-run the source check after installing.",
    ],
  },
  {
    code: 8,
    slug: "app-location-drifted",
    title: "App moved since last registration",
    why: "Zero's app registry (~/.zero/apps.json) has a different recorded path than where this App is currently running from.",
    fixes: [
      "If this move was intentional, re-run Ignition or re-register to update the recorded path.",
      "If unintentional, verify you're running the App from its original location.",
    ],
  },
  {
    code: 9,
    slug: "app-already-exists",
    title: "An App with this name already exists",
    why: "`ship new` refuses to scaffold into a non-empty directory, and this name is already taken at the default Apps location.",
    fixes: [
      "Agent Fix: Zero suggests the next available name (e.g. <name>-2) automatically.",
      "Run `ship build on <port>` against the existing App instead if you meant to run it, not recreate it.",
    ],
  },
  {
    code: 10,
    slug: "port-in-use",
    title: "Port already in use",
    why: "Another process (possibly another Zero kernel) is already listening on the requested port.",
    fixes: [
      "Agent Fix: Zero finds the next free port and suggests it.",
      "Run `ship agent list` or check `~/.zero/sessions.json` to see what's already running.",
    ],
  },
  {
    code: 11,
    slug: "module-not-found",
    title: "No module by that name is registered",
    why: "`ship agent edit/remove` was given a name that isn't in this App's Ledger (`<app>/.zero/modules.json`).",
    fixes: [
      "Run `ship agent list` to see registered names.",
      "Names are case-sensitive — check for typos.",
    ],
  },
  {
    code: 12,
    slug: "module-name-taken",
    title: "A module with this name is already registered",
    why: "Two modules in the same App can't share a name — the Ledger enforces uniqueness per App.",
    fixes: [
      "Agent Fix: Zero suggests the next available name (e.g. <name>-2) automatically.",
      "Use `ship agent edit <existing-name> --rename <new-name>` if you meant to rename the existing one.",
    ],
  },
  {
    code: 13,
    slug: "invalid-runtime",
    title: "Unrecognized runtime slug",
    why: "`--runtime` must be one of Zero's known runtimes: node, go, ruby, python, rust.",
    fixes: ["Check spelling — runtime slugs are lowercase and exact.", "Omit --runtime to default to node."],
  },
  {
    code: 14,
    slug: "template-not-found",
    title: "Unrecognized template slug",
    why: "`--template` didn't match any entry in Zero's template catalog.",
    fixes: [
      "Run without --template to use the default (node-basic).",
      "Valid slugs: node-basic, go-basic, ruby-basic, python-basic, rust-basic.",
    ],
  },
  {
    code: 15,
    slug: "session-not-found",
    title: "No running Zero app found on that port",
    why: "`ship export from <port>` looks up `~/.zero/sessions.json` for a live kernel on that port and found none.",
    fixes: [
      "Agent Fix: Zero lists currently active sessions so you can pick the right port.",
      "Start the app first with `ship build on <port>`.",
    ],
  },
  {
    code: 16,
    slug: "hotswap-nothing-to-swap",
    title: "No running process for this App yet",
    why: "Hot Swap replaces an already-running module's process — there's nothing running to swap.",
    fixes: [
      "Agent Fix: Ship tells you to run `ship build on <port>` first, which now also starts the App's own process.",
      "Confirm the App has at least one registered module (`ship agent list`).",
    ],
  },
  {
    code: 17,
    slug: "power-daemon-not-installed",
    title: "Power draw daemon isn't installed",
    why: "Live power-draw readings require a one-time, root-owned background sampler (see @ship/scaffold's Daemon.ts) that hasn't been installed on this machine yet.",
    fixes: [
      "Run `node <scaffold>/Paths/Daemon.js` once (prompts for your password).",
      "Without it, power stats simply report unsupported — nothing else is affected.",
    ],
  },
  {
    code: 18,
    slug: "process-spawn-failed",
    title: "Could not start the module's process",
    why: "The resolved entrypoint command (node/go/ruby/python3/cargo) isn't installed or isn't on PATH.",
    fixes: [
      "Install the runtime's toolchain, or confirm it's on PATH.",
      "Check the entrypoint Agent resolved via `ship agent list`.",
    ],
  },
  {
    code: 19,
    slug: "invalid-port-argument",
    title: "That's not a valid port number",
    why: "`on <port>` / `from <port>` needs a plain number between 1 and 65535.",
    fixes: ["Use a numeric port, e.g. `ship build on 4000`."],
  },
  {
    code: 20,
    slug: "signing-key-unreadable",
    title: "Token signing key is corrupt or unreadable",
    why: "The signing key stored in One (`_Ship/Keys/zero-signing-key`) exists but couldn't be read as valid key material.",
    fixes: [
      "Agent Fix: Zero regenerates a fresh signing key automatically.",
      "Every previously issued token becomes invalid — reissue tokens for any connected module/SDK.",
    ],
  },
  {
    code: 21,
    slug: "state-file-corrupt",
    title: "A Zero state file was corrupt and has been reset",
    why: "One of `~/.zero/{state,apps,sessions,revoked}.json` or an App's `.zero/modules.json` failed to parse as JSON.",
    fixes: [
      "Agent Fix: Zero backs up the corrupt file (.bak) and starts fresh automatically.",
      "If this keeps happening, check for concurrent processes writing the same file.",
    ],
  },
  {
    code: 22,
    slug: "app-registry-write-failed",
    title: "Could not write to Zero's local state directory",
    why: "A write to `~/.zero/` failed, usually a filesystem permissions issue.",
    fixes: [
      "Check permissions on `~/.zero/` (should be writable by your user).",
      "Confirm disk isn't full.",
    ],
  },
];

export function findError(code: number): ErrorEntry | undefined {
  return errorRegistry.find((e) => e.code === code);
}
