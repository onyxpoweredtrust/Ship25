// Pipelines Copy
// designed and built by onyxlabs.

import fs   from 'node:fs'
import path from 'node:path'

const SKIP = new Set(['node_modules', '.git', '.venv', '__pycache__', '.bundle'])

export function copyProject(root: string, outDir: string): void {
  const excludeAbs = path.resolve(outDir)
  copyDir(root, outDir, excludeAbs)
}

function copyDir(src: string, dst: string, excludeAbs: string): void {
  if (path.resolve(src) === excludeAbs) return
  fs.mkdirSync(dst, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.isSymbolicLink()) continue
    const s = path.join(src, e.name)
    if (path.resolve(s) === excludeAbs) continue
    const d = path.join(dst, e.name)
    if (e.isDirectory()) copyDir(s, d, excludeAbs)
    else if (e.isFile()) fs.copyFileSync(s, d)
  }
}
