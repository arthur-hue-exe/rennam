// Drives the milestone celebrations and the counter ceiling through the UI.
// Local-only: uses the Supabase Docker container to stage counter values.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const CDP = "http://127.0.0.1:9222";
const APP = "http://localhost:3000";
const MAX = "999999999999999999";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sql(statement) {
  return execFileSync(
    "docker",
    ["exec", "supabase_db_Rennam", "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-c", statement],
    { encoding: "utf8" },
  ).trim();
}

async function setCounter(value) {
  sql(
    `truncate public.rennam_clicks; update public.rennam_counter set value = ${value}, revision = revision + 1, updated_at = now() where id = 1;`,
  );
}

async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  let nextId = 0;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return {
    send: (method, params = {}) =>
      new Promise((resolve, reject) => {
        nextId += 1;
        const timer = setTimeout(() => reject(new Error(`timeout: ${method}`)), 10_000);
        pending.set(nextId, {
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        });
        socket.send(JSON.stringify({ id: nextId, method, params }));
      }),
    close: () => socket.close(),
  };
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "evaluate failed");
  return result.result.value;
}

async function screenshot(client, file) {
  const { data } = await client.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(file, Buffer.from(data, "base64"));
}

const stateScript = `(() => {
  const banner = document.querySelector('.milestone');
  const wrap = document.querySelector('.scoreboard-value-wrap');
  const value = document.querySelector('.scoreboard-value');
  return {
    display: value?.textContent ?? null,
    digits: (value?.textContent ?? '').replace(/\\D/g, ''),
    bannerTitle: banner?.querySelector('.milestone-title')?.textContent ?? null,
    bannerKicker: banner?.querySelector('.milestone-kicker')?.textContent ?? null,
    bannerClass: banner?.className ?? null,
    gameClass: document.querySelector('.game')?.className ?? null,
    scoreboardFit: wrap ? wrap.scrollWidth - wrap.clientWidth : null,
    status: document.querySelector('.scoreboard-status')?.textContent ?? null,
  };
})()`;

function digitsOnly(display) {
  return (display ?? "").replace(/\D/g, "");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitFor(fn, timeout = 8000, label = "condition") {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {
      // navigation may replace the execution context
    }
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${label}`);
}

const targets = await (await fetch(`${CDP}/json/list`)).json();
const appTargets = targets.filter((target) => target.type === "page" && target.url.startsWith(APP));
const page = appTargets.find((target) => target.url === `${APP}/`) ?? appTargets[0];
assert(page, "application tab is not open in Chrome");

const client = await connect(page.webSocketDebuggerUrl);
await client.send("Page.enable");
await client.send("Runtime.enable");
await client.send("Emulation.clearDeviceMetricsOverride");
await sleep(500);

const results = {};

async function reloadAndWait(expected) {
  await client.send("Page.reload", { ignoreCache: true });
  return waitFor(async () => {
    const state = await evaluate(client, stateScript);
    return digitsOnly(state.display) === expected ? state : null;
  }, 10000, `reload showing ${expected}`);
}

async function clickAndWait(predicate, label) {
  await evaluate(client, `document.querySelector('.torar-button').click(); true`);
  return waitFor(async () => {
    const state = await evaluate(client, stateScript);
    return predicate(state) ? state : null;
  }, 8000, label);
}

// 100: big celebration.
await setCounter("99");
await reloadAndWait("99");
const at100 = await clickAndWait((state) => state.digits === "100" && state.bannerClass, "100 banner");
assert(at100.bannerTitle === "100 TORADAS!", `100 title was ${at100.bannerTitle}`);
assert(at100.bannerClass.includes("milestone-big"), "100 banner did not use the big tier");
assert(at100.gameClass.includes("celebrate-big"), "100 celebration class missing");
assert(at100.scoreboardFit <= 0, "100 score overflowed its panel");
await screenshot(client, "scripts/ui-100.png");
results.at100 = at100;
console.log("PASS milestone 100 — big banner and celebration");

// 500: mega celebration.
await sleep(2200);
await setCounter("499");
await reloadAndWait("499");
const at500 = await clickAndWait((state) => state.digits === "500" && state.bannerClass, "500 banner");
assert(at500.bannerTitle === "500 TORADAS!!!", `500 title was ${at500.bannerTitle}`);
assert(at500.bannerClass.includes("milestone-mega"), "500 banner did not use the mega tier");
assert(at500.gameClass.includes("celebrate-mega"), "500 celebration class missing");
assert(at500.scoreboardFit <= 0, "500 score overflowed its panel");
await screenshot(client, "scripts/ui-500.png");
results.at500 = at500;
console.log("PASS milestone 500 — mega banner and celebration");

// Ceiling: the click at the maximum wraps to zero, and only then.
await sleep(3200);
const beforeMax = String(BigInt(MAX) - 1n);
await setCounter(beforeMax);
await reloadAndWait(beforeMax);
const atMax = await clickAndWait((state) => state.digits === MAX, "counter at maximum");
assert(!atMax.bannerClass, "maximum click showed a reset banner too early");
assert(atMax.scoreboardFit <= 0, "18-digit score overflowed its panel");
await screenshot(client, "scripts/ui-max.png");
results.atMax = atMax;
console.log(`PASS ceiling — ${MAX} reached without resetting`);

const afterWrap = await clickAndWait((state) => state.digits === "0" && state.bannerClass, "wrap banner");
assert(afterWrap.bannerTitle === "PLACAR ZERADO!", `wrap title was ${afterWrap.bannerTitle}`);
assert(afterWrap.gameClass.includes("celebrate-mega"), "wrap celebration class missing");
await screenshot(client, "scripts/ui-wrap.png");
results.afterWrap = afterWrap;
console.log("PASS wrap — next click at the maximum reset to zero");

const column = sql(
  "select data_type || '(' || numeric_precision || ',' || numeric_scale || ')' from information_schema.columns where table_schema = 'public' and table_name = 'rennam_counter' and column_name = 'value';",
);
results.column = column;
assert(column === "numeric(18,0)", `unexpected column type: ${column}`);
console.log(`PASS column type — ${column}`);

// Leave the shared counter at zero for handoff.
await setCounter("0");
const reset = await reloadAndWait("0");
results.reset = reset;
await sleep(500);
writeFileSync("scripts/celebration-test-report.json", JSON.stringify(results, null, 2));
console.log("Counter reset to 0");
client.close();
setTimeout(() => process.exit(0), 100);
