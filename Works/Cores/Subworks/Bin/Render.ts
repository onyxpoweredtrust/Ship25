// Cores Render
// designed and built by onyxlabs.

import { emitKeypressEvents } from "node:readline";

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

const SPINNER_FRAMES = ["◒", "◐", "◓", "◑"];
const SPINNER_INTERVAL_MS = 100;

export function spinner(): { start(msg?: string): void; stop(msg?: string): void; message(msg?: string): void } {
  let label = "";
  let frame = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  function render(): void {
    process.stdout.write(`\r\x1b[K${green(SPINNER_FRAMES[frame % SPINNER_FRAMES.length])}  ${label}`);
    frame++;
  }

  return {
    start(msg = "") {
      label = msg;
      if (colorEnabled) timer = setInterval(render, SPINNER_INTERVAL_MS);
    },
    stop(msg) {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
        process.stdout.write(`\r\x1b[K`);
      }
      console.log(connected(green("◆"), msg ?? label));
      console.log(BAR);
    },
    message(msg = "") {
      label = msg;
    },
  };
}

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

export interface SelectOption<T> {
  label: string;
  value: T;
  description?: string;
}

export function select<T>(message: string, options: ReadonlyArray<SelectOption<T>>): Promise<T | null> {
  if (options.length === 0) return Promise.resolve(null);
  if (!process.stdin.isTTY) return Promise.resolve(options[0].value);

  return new Promise((resolve) => {
    let index = 0;
    let renderedLines = 0;

    function frame(): string[] {
      const lines = [`${BAR_START}  ${message}`];
      for (const [i, opt] of options.entries()) {
        const active = i === index;
        const marker = active ? green("●") : gray("○");
        const label = active ? opt.label : gray(opt.label);
        const description = opt.description ? gray(`  ${opt.description}`) : "";
        lines.push(`${BAR}  ${marker} ${label}${active ? description : ""}`);
      }
      return lines;
    }

    function draw(): void {
      if (renderedLines > 0) process.stdout.write(`\x1b[${renderedLines}A`);
      const lines = frame();
      for (const line of lines) process.stdout.write(`\x1b[2K${line}\n`);
      renderedLines = lines.length;
    }

    function cleanup(): void {
      process.stdin.off("keypress", onKeypress);
      process.stdin.setRawMode?.(wasRaw);
      process.stdin.pause();
    }

    function onKeypress(_str: string, key: { name?: string; ctrl?: boolean } | undefined): void {
      if (!key) return;
      if (key.ctrl && key.name === "c") {
        cleanup();
        console.log(BAR);
        resolve(null);
        return;
      }
      if (key.name === "up") {
        index = (index - 1 + options.length) % options.length;
        draw();
      } else if (key.name === "down") {
        index = (index + 1) % options.length;
        draw();
      } else if (key.name === "return") {
        cleanup();
        console.log(BAR);
        resolve(options[index].value);
      }
    }

    emitKeypressEvents(process.stdin);
    const wasRaw = process.stdin.isRaw ?? false;
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.on("keypress", onKeypress);
    draw();
  });
}

export function confirmKeypress(message: string): Promise<boolean> {
  console.log(`${BAR}  ${message}`);
  if (!process.stdin.isTTY) return Promise.resolve(false);

  return new Promise((resolve) => {
    function cleanup(): void {
      process.stdin.off("keypress", onKeypress);
      process.stdin.setRawMode?.(wasRaw);
      process.stdin.pause();
    }

    function onKeypress(_str: string, key: { name?: string; ctrl?: boolean } | undefined): void {
      cleanup();
      resolve(key?.name === "return");
    }

    emitKeypressEvents(process.stdin);
    const wasRaw = process.stdin.isRaw ?? false;
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.once("keypress", onKeypress);
  });
}

export async function withSpinner<T>(
  label: string,
  fn: () => Promise<T>,
  doneLabel?: (result: T) => string
): Promise<T> {
  const s = spinner();
  s.start(label);
  try {
    const result = await fn();
    s.stop(doneLabel ? doneLabel(result) : label);
    return result;
  } catch (err) {
    s.stop(`failed: ${(err as Error).message}`);
    throw err;
  }
}
