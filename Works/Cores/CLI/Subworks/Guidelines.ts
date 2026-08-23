// CLI Guidelines
// designed and built by onyxlabs.

export const guidelinesLines: string[] = [
  "Ship — Onyx Labs' dev platform (Works/{Datasets, Cores, Connectors, Pipelines})",
  "",
  "  ship ignition   check that Ship's Core modules are set up correctly",
  "  ship guidelines get started",
  "  ship vars       add/edit config values — pastes multiple KEY=VALUE lines at once",
  "  ship daemon     run an app as a background service, on Mac, Linux, or Windows",
  "  ship --version  show the CLI version",
  "",
  "Cores is Ship's kernel — process management, resource-aware throttling,",
  "scaffolding, and security — split across Agent (process mgmt), Scaffold",
  "(app creation), and Security (JWT + bot defense). `ship new`/`ship build`",
  "are the day-to-day tools for building and running an App.",
  "",
  "Datasets is the storage layer everything else persists through — role-gated",
  "Blocks, plus Keyring and Vars for anything that needs a key or a config value.",
  "Connectors are GitHub, Ship UI, Ship Auth, Ship AI, Ship Pay, Ship Notify,",
  "and Ship Shield. Pipelines builds and deploys — framework detection, cache,",
  "and the relay tunnel.",
];
