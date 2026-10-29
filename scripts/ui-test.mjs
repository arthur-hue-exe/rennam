// End-to-end check of the running site through Chrome DevTools Protocol.
// Requires Chrome started with --remote-debugging-port=9222.
import { readFileSync, writeFileSync } from "node:fs";

const CDP = "http://127.0.0.1:9222";
const APP = "http://localhost:3000";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const checks = [];
const report = {};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pass(name, detail) {
  checks.push({ name, detail, ok: true });
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
}

async function remoteCounter() {
  const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/rennam_contador`, {
    method: "POST",
    headers: {
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!response.ok) throw new Error(`counter read failed: ${response.status}`);
  return response.json();
}

async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  const errors = [];
  let nextId = 0;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    if (message.method === "Runtime.exceptionThrown") {
      errors.push(message.params.exceptionDetails?.exception?.description ?? "exception");
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      errors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(" "));
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
        pending.set(nextId, { resolve, reject });
        socket.send(JSON.stringify({ id: nextId, method, params }));
      }),
    errors,
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
  const rect = (element) => {
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return { top: Math.round(box.top), bottom: Math.round(box.bottom), left: Math.round(box.left), width: Math.round(box.width), height: Math.round(box.height) };
  };
  const number = document.querySelector('.scoreboard-value');
  const player = document.querySelector('.player-slot');
  const block = document.querySelector('.block-main');
  const button = document.querySelector('.torar-button');
  const live = document.querySelector('[role="status"].sr-only');
  const notice = document.querySelector('.notice-text');
  return {
    display: number?.textContent ?? null,
    live: live?.textContent ?? null,
    status: document.querySelector('.scoreboard-status')?.textContent ?? null,
    notice: notice?.textContent ?? null,
    frame: document.querySelector('.player-img')?.getAttribute('src') ?? null,
    playerTransform: document.querySelector('.player-img') ? getComputedStyle(document.querySelector('.player-img')).transform : null,
    jumpGap: player && block ? Math.round(player.getBoundingClientRect().top - block.getBoundingClientRect().bottom) : null,
    player: rect(player),
    block: rect(block),
    button: rect(button),
    overflowX: document.documentElement.scrollWidth - innerWidth,
    overflowY: document.documentElement.scrollHeight - innerHeight,
    viewport: { width: innerWidth, height: innerHeight },
  };
})()`;

function digitsOnly(display) {
  return (display ?? "").replace(/\D/g, "");
}

let main;
let second;

async function run() {
  // Keep a single application tab so parallel tabs cannot pollute the run.
  const targets = await (await fetch(`${CDP}/json/list`)).json();
  const appTargets = targets.filter((target) => target.type === "page" && target.url.startsWith(APP));
  for (const target of appTargets.slice(1)) {
    await fetch(`${CDP}/json/close/${target.id}`);
  }
  const page = appTargets[0];
  assert(page, "application tab is open in Chrome");

  main = await connect(page.webSocketDebuggerUrl);
  await main.send("Page.enable");
  await main.send("Runtime.enable");
  await main.send("Network.enable");
  await main.send("Page.navigate", { url: APP });
  await sleep(2500);

  const remote = await remoteCounter();
  report.initial = { dom: await evaluate(main, stateScript), remote };
  assert(digitsOnly(report.initial.dom.display) === remote.value, "initial DOM matches the database");
  assert(report.initial.dom.overflowX <= 0 && report.initial.dom.overflowY <= 0, "no page overflow");
  pass("initial state", `counter ${remote.value}, no overflow`);

  const beforeClick = remote;
  await evaluate(main, `document.querySelector('.torar-button').click(); true`);
  let hitState = null;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await sleep(40);
    const state = await evaluate(main, stateScript);
    if (state.frame?.endsWith("player-hit.png")) {
      hitState = state;
      break;
    }
  }
  assert(hitState, "character never reached the hit frame");
  report.midJump = hitState;
  await screenshot(main, "scripts/ui-hit.png");
  const translateY = Number(report.midJump.playerTransform?.match(/,\s*(-?[\d.]+)\)$/)?.[1] ?? 0);
  assert(
    Math.abs(Math.abs(translateY) - report.midJump.jumpGap) <= 6,
    `character misses the block underside (travel ${Math.abs(translateY)}px, gap ${report.midJump.jumpGap}px)`,
  );
  pass("jump collision", `travel ${Math.abs(translateY)}px against a ${report.midJump.jumpGap}px gap`);

  await sleep(1200);
  const afterClickRemote = await remoteCounter();
  report.afterClick = { dom: await evaluate(main, stateScript), remote: afterClickRemote };
  await screenshot(main, "scripts/ui-after.png");
  assert(Number(afterClickRemote.value) === Number(beforeClick.value) + 1, "one click did not add exactly one");
  assert(digitsOnly(report.afterClick.dom.display) === afterClickRemote.value, "DOM does not show the confirmed value");
  pass("single click", `${beforeClick.value} → ${afterClickRemote.value}`);

  // Real keyboard input through CDP.
  await evaluate(main, `document.activeElement instanceof HTMLElement && document.activeElement.blur(); true`);
  await main.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: " ",
    code: "Space",
    windowsVirtualKeyCode: 32,
    nativeVirtualKeyCode: 32,
  });
  await main.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: " ",
    code: "Space",
    windowsVirtualKeyCode: 32,
    nativeVirtualKeyCode: 32,
  });
  await sleep(1600);
  const afterKeyRemote = await remoteCounter();
  report.afterKeyboard = { dom: await evaluate(main, stateScript), remote: afterKeyRemote };
  assert(Number(afterKeyRemote.value) === Number(afterClickRemote.value) + 1, "Space did not add exactly one");
  pass("keyboard shortcut", `${afterClickRemote.value} → ${afterKeyRemote.value}`);

  // Failure path: block the increment RPC, then retry the stored click.
  await main.send("Network.setBlockedURLs", { urls: ["*rennam_torar*"] });
  await evaluate(main, `document.querySelector('.torar-button').click(); true`);
  await sleep(1200);
  report.blocked = { dom: await evaluate(main, stateScript), remote: await remoteCounter() };
  assert(report.blocked.dom.notice, "failed click did not show an error");
  assert(report.blocked.remote.value === afterKeyRemote.value, "failed click changed the database");
  pass("failed click", "error shown, counter untouched");

  await main.send("Network.setBlockedURLs", { urls: [] });
  const retried = await evaluate(
    main,
    `(() => { const button = document.querySelector('.notice-retry'); if (!button) return false; button.click(); return true; })()`,
  );
  assert(retried, "retry button is unavailable");
  await sleep(1600);
  const retriedRemote = await remoteCounter();
  report.retried = { dom: await evaluate(main, stateScript), remote: retriedRemote };
  assert(Number(retriedRemote.value) === Number(afterKeyRemote.value) + 1, "retry did not count exactly once");
  assert(report.retried.dom.notice === null, "error stayed visible after retry");
  pass("retry", `${afterKeyRemote.value} → ${retriedRemote.value}, no double count`);
  await main.send("Network.disable");

  // Realtime: a second tab must update without a reload.
  const created = await (
    await fetch(`${CDP}/json/new?${encodeURIComponent(`${APP}/?tab=2`)}`, { method: "PUT" })
  ).json();
  second = await connect(created.webSocketDebuggerUrl);
  await second.send("Page.enable");
  await second.send("Runtime.enable");
  await sleep(3000);
  report.secondBefore = await evaluate(second, stateScript);
  assert(digitsOnly(report.secondBefore.display) === retriedRemote.value, "second tab shows another value");

  await evaluate(main, `document.querySelector('.torar-button').click(); true`);
  await sleep(3000);
  const realtimeRemote = await remoteCounter();
  report.secondAfter = await evaluate(second, stateScript);
  assert(digitsOnly(report.secondAfter.display) === realtimeRemote.value, "second tab missed the live update");
  pass("realtime", `second tab ${report.secondBefore.display} → ${report.secondAfter.display}`);

  // Persistence across reload.
  await main.send("Page.reload", { ignoreCache: true });
  await sleep(3000);
  report.afterReload = { dom: await evaluate(main, stateScript), remote: await remoteCounter() };
  assert(
    digitsOnly(report.afterReload.dom.display) === report.afterReload.remote.value,
    "value did not survive a reload",
  );
  pass("persistence", `reload still shows ${report.afterReload.remote.value}`);

  // Mute control: preference flips, survives a reload, and can be restored.
  const soundScript = `(() => {
    const button = document.querySelector('.sound-toggle');
    return {
      pressed: button?.getAttribute('aria-pressed') ?? null,
      label: button?.querySelector('.sound-label')?.textContent ?? null,
      stored: localStorage.getItem('rennam-torado:sound'),
    };
  })()`;
  const soundBefore = await evaluate(main, soundScript);
  await evaluate(main, `document.querySelector('.sound-toggle').click(); true`);
  await sleep(250);
  const soundToggled = await evaluate(main, soundScript);
  const expectedPressed = soundBefore.pressed === "true" ? "false" : "true";
  assert(soundToggled.pressed === expectedPressed, "sound toggle did not change state");
  assert(soundToggled.stored === (expectedPressed === "true" ? "on" : "off"), "sound preference was not stored");
  assert(soundToggled.label === (expectedPressed === "true" ? "SOM" : "MUDO"), "sound label did not follow the state");

  await main.send("Page.reload", { ignoreCache: true });
  await sleep(2500);
  const soundPersisted = await evaluate(main, soundScript);
  assert(soundPersisted.pressed === expectedPressed, "sound preference did not survive a reload");

  await evaluate(main, `document.querySelector('.sound-toggle').click(); true`);
  await sleep(250);
  const soundRestored = await evaluate(main, soundScript);
  assert(soundRestored.pressed === soundBefore.pressed, "sound preference could not be restored");
  report.sound = { soundBefore, soundToggled, soundPersisted, soundRestored };
  pass("sound mute", `${soundBefore.label} → ${soundToggled.label}, persisted across reload`);

  report.consoleErrors = [...main.errors, ...second.errors];
  assert(report.consoleErrors.length === 0, `console errors: ${report.consoleErrors.join(" | ")}`);
  pass("console", "no errors");
}

try {
  await run();
  console.log(`ALL ${checks.length} CHECKS PASSED`);
  writeFileSync("scripts/ui-test-report.json", JSON.stringify({ checks, report }, null, 2));
  process.exitCode = 0;
} catch (error) {
  console.error(`\nFAILED: ${error.message}`);
  writeFileSync(
    "scripts/ui-test-report.json",
    JSON.stringify({ checks, report, error: error.message }, null, 2),
  );
  process.exitCode = 1;
} finally {
  try {
    second?.close();
    main?.close();
  } catch {
    // ignore socket shutdown problems
  }
  setTimeout(() => process.exit(process.exitCode ?? 1), 100);
}
