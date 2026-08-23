// Datasets Guidelines
// designed and built by onyxlabs.

export const guidelinesLines: string[] = [
  "One — Data Management for Ship and its Apps",
  "",
  "  one read <path> [--as <role>]         read a block (e.g. Contour/Users/eggman95/Posts/yoooo wsp)",
  "  one write <path> <json> [--as <role>] write a block (value is a JSON literal)",
  "  one list <path> [--as <role>]         list subblocks/leaf blocks at a path",
  "  one remove <path> [--as <role>]       delete a block",
  "  one sudo <path> <role1,role2,...>     declare a path as a Sudoblock",
  "  one log [--limit N]                   show One Agent's recent access log",
  "",
  "Data is organized as Blocks -> Subblocks -> Sudoblocks: a path like",
  "Contour/Users/eggman95/Posts/yoooo wsp addresses one piece of data.",
  "Sudoblocks are gated to specific roles — an App defines its own role",
  "names (e.g. \"bot\", \"admin\"); use --as to test what a given role can see.",
  "",
  "Ship's own data lives under a reserved _Ship block, always gated to the",
  "single machine owner — no role you pass via --as can ever unlock it.",
  "",
  "Every guarded read/write is watched by One Agent and logged — `one log`",
  "shows recent access, including denied Sudoblock attempts.",
  "",
  "Data is stored as Dataset, One's own data language: writes like JSON but",
  "uses `/` for key/value pairs and `()` for containers instead of {}/[].",
];
