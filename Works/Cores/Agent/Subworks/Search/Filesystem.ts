// Agent Filesystem
// designed and built by onyxlabs.

export interface DetectorFilesystem {
  hasPath(path: string): Promise<boolean>;
  isFile(path: string): Promise<boolean>;
  readFile(path: string): Promise<string>;
  listFiles(dir: string): Promise<string[]>;
}
