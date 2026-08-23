// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { createScheduler } from "../Mesh/Scheduler.js";

test("start() runs the task immediately, not just after the first interval", async () => {
  let calls = 0;
  const scheduler = createScheduler({ task: () => { calls++; }, intervalMs: 100_000 });
  scheduler.start();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls, 1);
  scheduler.stop();
});

test("runOnce() runs the task and awaits it", async () => {
  let calls = 0;
  const scheduler = createScheduler({ task: async () => { calls++; }, intervalMs: 100_000 });
  await scheduler.runOnce();
  await scheduler.runOnce();
  assert.equal(calls, 2);
});

test("a task that throws is caught by onError, not left to crash the process", async () => {
  let caught;
  const scheduler = createScheduler({
    task: () => {
      throw new Error("boom");
    },
    intervalMs: 100_000,
    onError: (err) => {
      caught = err;
    },
  });
  await scheduler.runOnce();
  assert.equal(caught.message, "boom");
});

test("start() is idempotent — calling it twice doesn't double the interval or double-run", async () => {
  let calls = 0;
  const scheduler = createScheduler({ task: () => { calls++; }, intervalMs: 100_000 });
  scheduler.start();
  scheduler.start();
  await new Promise((r) => setTimeout(r, 20));
  scheduler.stop();
  assert.equal(calls, 1);
});

test("stop() prevents any further scheduled runs", async () => {
  let calls = 0;
  const scheduler = createScheduler({ task: () => { calls++; }, intervalMs: 20 });
  scheduler.start();
  await new Promise((r) => setTimeout(r, 30));
  scheduler.stop();
  const callsAtStop = calls;
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(calls, callsAtStop);
});

test("an overlapping slow run is skipped rather than piling up concurrent executions", async () => {
  let concurrent = 0;
  let maxConcurrent = 0;
  const scheduler = createScheduler({
    task: async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 50));
      concurrent--;
    },
    intervalMs: 10, // much shorter than the task itself
  });
  scheduler.start();
  await new Promise((r) => setTimeout(r, 120));
  scheduler.stop();
  assert.equal(maxConcurrent, 1);
});
