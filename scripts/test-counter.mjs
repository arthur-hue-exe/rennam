// Exercises the database contract directly: RPC concurrency, click-id
// idempotency, decimal string transport and visitor write restrictions.
// Reads configuration from .env.local and talks to the Supabase REST API.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

const checks = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pass(name, detail) {
  checks.push({ name, detail });
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
}

async function rpc(name, body) {
  const response = await fetch(`${BASE}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${name} failed (${response.status}): ${text}`);
  }
  return response.json();
}

async function readCounter() {
  return rpc("rennam_contador", {});
}

async function inc(clickId) {
  return rpc("rennam_torar", { p_click_id: clickId });
}

function toBigInt(value) {
  assert(typeof value === "string", `counter value must be a string, received ${typeof value}`);
  assert(/^\d{1,18}$/.test(value), `invalid decimal string: ${value}`);
  return BigInt(value);
}

const start = await readCounter();
const startValue = toBigInt(start.value);
const startRevision = BigInt(start.revision);
pass("decimal transport", `value "${start.value}", revision "${start.revision}"`);

const nullResponse = await fetch(`${BASE}/rest/v1/rpc/rennam_torar`, {
  method: "POST",
  headers: HEADERS,
  body: JSON.stringify({ p_click_id: null }),
});
assert(!nullResponse.ok, "RPC accepted a null click id");
pass("null click id rejected", `HTTP ${nullResponse.status}`);

const patch = await fetch(`${BASE}/rest/v1/rennam_counter?id=eq.1`, {
  method: "PATCH",
  headers: { ...HEADERS, Prefer: "return=representation" },
  body: JSON.stringify({ value: "0" }),
});
assert(!patch.ok, "anonymous PATCH on the counter was accepted");
const insert = await fetch(`${BASE}/rest/v1/rennam_clicks`, {
  method: "POST",
  headers: { ...HEADERS, Prefer: "return=representation" },
  body: JSON.stringify({ click_id: crypto.randomUUID() }),
});
assert(!insert.ok, "anonymous INSERT into clicks was accepted");
const remove = await fetch(`${BASE}/rest/v1/rennam_counter?id=eq.1`, {
  method: "DELETE",
  headers: HEADERS,
});
assert(!remove.ok, "anonymous DELETE on the counter was accepted");
pass("visitor write restrictions", `PATCH ${patch.status}, INSERT ${insert.status}, DELETE ${remove.status}`);

const concurrent = 50;
const ids = Array.from({ length: concurrent }, () => crypto.randomUUID());
const responses = await Promise.all(ids.map((id) => inc(id)));

assert(responses.every((response) => response.counted === true), "a concurrent click was not counted");
const values = new Set(responses.map((response) => response.value));
assert(values.size === concurrent, `expected ${concurrent} distinct values, received ${values.size}`);
const highest = responses
  .map((response) => toBigInt(response.value))
  .reduce((max, value) => (value > max ? value : max), 0n);
assert(highest === startValue + BigInt(concurrent), "concurrent increments skipped or repeated a value");

const afterConcurrent = await readCounter();
assert(toBigInt(afterConcurrent.value) === startValue + BigInt(concurrent), "final value does not match 50 increments");
assert(
  BigInt(afterConcurrent.revision) === startRevision + BigInt(concurrent),
  "revision does not match 50 increments",
);
pass("50 parallel increments", `all counted, value ${start.value} → ${afterConcurrent.value}, no duplicates`);

const duplicateId = crypto.randomUUID();
const duplicates = await Promise.all(Array.from({ length: 5 }, () => inc(duplicateId)));
assert(
  duplicates.filter((response) => response.counted === true).length === 1,
  "duplicate click id was counted more than once",
);
assert(
  duplicates.every((response) => {
    const value = toBigInt(response.value);
    return value === toBigInt(afterConcurrent.value) || value === toBigInt(afterConcurrent.value) + 1n;
  }),
  "duplicate responses diverged unexpectedly",
);
const afterDuplicate = await readCounter();
assert(
  toBigInt(afterDuplicate.value) === toBigInt(afterConcurrent.value) + 1n,
  "duplicate click id changed the counter by more than one",
);
pass("idempotent retry", "5 requests with the same click id added exactly 1");

const final = await readCounter();
assert(final.value === afterDuplicate.value, "read endpoint disagrees with the last confirmed value");
pass("consistent reads", `counter at ${final.value}, revision ${final.revision}`);

console.log(`\nALL ${checks.length} COUNTER CHECKS PASSED`);
