// Agent Source
// designed and built by onyxlabs.

export interface PowerReading {
  watts: number | null;
  supported: boolean;
  source: string;
}

export interface PowerSource {
  read(): Promise<PowerReading>;
}

export const UNSUPPORTED: PowerReading = { watts: null, supported: false, source: "none" };
