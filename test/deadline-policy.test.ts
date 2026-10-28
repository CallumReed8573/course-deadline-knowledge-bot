import assert from "node:assert/strict";
import test from "node:test";
import { deadlineStatus } from "../src/learner-deadline-decision.ts";

test("educator report marks a missed course deadline as overdue", () => {
  assert.equal(deadlineStatus("2026-09-14", "2026-09-15"), "overdue");
  assert.equal(deadlineStatus("2026-09-15", "2026-09-15"), "due-today");
  assert.equal(deadlineStatus("2026-09-16", "2026-09-15"), "upcoming");
});
