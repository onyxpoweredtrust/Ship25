// Datasets Render
// designed and built by onyxlabs.

const colorEnabled = !process.env.NO_COLOR && Boolean(process.stdout.isTTY);

function paint(code: number, text: string): string {
  return colorEnabled ? `\x1b[${code}m${text}\x1b[39m` : text;
}

const gray = (s: string) => paint(90, s);
const green = (s: string) => paint(32, s);
const blue = (s: string) => paint(34, s);
const yellow = (s: string) => paint(33, s);
const red = (s: string) => paint(31, s);

const BAR = gray("│");
const BAR_START = gray("┌");
const BAR_END = gray("└");

function connected(marker: string, message: string): string {
  const lines = message.split("\n");
  const first = `${marker}  ${lines[0]}`;
  const rest = lines.slice(1).map((line) => `${BAR}  ${line}`);
  return [first, ...rest].join("\n");
}

export function intro(title = ""): void {
  console.log(`${BAR_START}  ${title}`);
  console.log(BAR);
}

export function outro(message = ""): void {
  console.log(connected(BAR_END, message));
}

function step(marker: string, message: string): void {
  console.log(connected(marker, message));
  console.log(BAR);
}

export const log = {
  message(message = ""): void {
    step(BAR, message);
  },
  info(message: string): void {
    step(blue("●"), message);
  },
  success(message: string): void {
    step(green("◆"), message);
  },
  step(message: string): void {
    step(green("◇"), message);
  },
  warn(message: string): void {
    step(yellow("▲"), message);
  },
  warning(message: string): void {
    log.warn(message);
  },
  error(message: string): void {
    step(red("■"), message);
  },
};

export async function withStep<T>(
  label: string,
  fn: () => Promise<T>,
  doneLabel?: (result: T) => string
): Promise<T> {
  try {
    const result = await fn();
    log.step(doneLabel ? `${label} — ${doneLabel(result)}` : label);
    return result;
  } catch (err) {
    log.step(`${label} — failed: ${(err as Error).message}`);
    throw err;
  }
}
