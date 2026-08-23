// Connectors Adapter
// designed and built by onyxlabs.

import { memoryAdapter } from "../../Vendor/BetterAuth/AdaptersMemory.mjs";
import type { Store, Role, BlockPath } from "@ship/datasets";

export interface AuthTables {
  [model: string]: unknown[];
}

const AUTH_BLOCK = "Auth";
const TABLES_BLOCK = "Tables";

function tablePath(appBlock: string, model: string): BlockPath {
  return [appBlock, AUTH_BLOCK, TABLES_BLOCK, model];
}

const DATE_MARKER = "__ship_auth_iso_date__";

function encodeDates(value: unknown): unknown {
  if (value instanceof Date) return { [DATE_MARKER]: value.toISOString() };
  if (Array.isArray(value)) return value.map(encodeDates);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = encodeDates(v);
    return out;
  }
  return value;
}

function decodeDates(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeDates);
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Object.keys(obj).length === 1 && typeof obj[DATE_MARKER] === "string") {
      return new Date(obj[DATE_MARKER] as string);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = decodeDates(v);
    return out;
  }
  return value;
}

const MUTATING_METHODS = new Set(["create", "update", "delete", "deleteMany", "consumeOne", "incrementOne", "updateMany"]);

const KNOWN_MODELS = ["user", "session", "account", "verification", "onyxKey"];

export interface ShipAuthAdapterFactory {
  (options: Parameters<ReturnType<typeof memoryAdapter>>[0]): ReturnType<ReturnType<typeof memoryAdapter>>;
  preload(): Promise<void>;
}

export function createShipAuthAdapter(store: Store, appBlock: string, role: Role): ShipAuthAdapterFactory {
  const db: AuthTables = {};
  const loadedModels = new Set<string>();

  async function ensureModelLoaded(model: string): Promise<void> {
    if (loadedModels.has(model)) return;
    loadedModels.add(model);
    try {
      const rows = await store.readAs(role, tablePath(appBlock, model));
      db[model] = Array.isArray(rows) ? (decodeDates(rows) as unknown[]) : [];
    } catch {
      db[model] = [];
    }
  }

  async function persist(model: string): Promise<void> {
    await store.writeAs(role, tablePath(appBlock, model), encodeDates(db[model] ?? []));
  }

  const baseFactory = memoryAdapter(db);

  const factory = ((options: Parameters<typeof baseFactory>[0]) => {
    const base = baseFactory(options) as unknown as Record<string, unknown>;

    const wrapped: Record<string, unknown> = {};
    for (const key of Object.keys(base)) {
      const member = base[key];
      if (typeof member !== "function") {
        wrapped[key] = member;
        continue;
      }
      const fn = member as (...args: unknown[]) => Promise<unknown>;
      wrapped[key] = async (...args: unknown[]) => {
        const model = (args[0] as { model?: string } | undefined)?.model;
        if (model) await ensureModelLoaded(model);
        const result = await fn(...args);
        if (model && MUTATING_METHODS.has(key)) {
          await persist(model);
        } else if (key === "transaction") {
          await Promise.all([...loadedModels].map((m) => persist(m)));
        }
        return result;
      };
    }
    return wrapped as ReturnType<typeof baseFactory>;
  }) as ShipAuthAdapterFactory;

  factory.preload = async () => {
    await Promise.all(KNOWN_MODELS.map((m) => ensureModelLoaded(m)));
  };

  return factory;
}
