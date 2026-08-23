// Datasets index
// designed and built by onyxlabs.

export { parseDataset, DatasetParseError, serializeDataset } from "./Dataset/index.js";
export {
  createStore,
  DEFAULT_DATA_ROOT,
  AccessDeniedError,
  BlockNotFoundError,
  SHIP_ROOT_BLOCK,
  InvalidBlockPathError,
  SHIP_OWNER,
  checkAccess,
  type Store,
  type BlockPath,
  type Role,
  type SudoDeclaration,
  type AccessResult,
} from "./Blocks/index.js";
export { watchStore, DEFAULT_LOG_PATH, type Watcher, type AuditEntry, type AuditAction } from "./Agent/index.js";
export { createKeyring, type Keyring } from "./Keyring.js";
export { createVars, type Vars } from "./Vars.js";

export { ONE_VERSION } from "./Version.js";
export { guidelinesLines } from "./Guidelines.js";
export { runOneCli, ONE_COMMANDS } from "./Cli.js";
