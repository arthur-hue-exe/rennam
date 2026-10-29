// Checks responsive layouts at desktop, tablet and phone sizes over CDP.
// Requires Chrome started with --remote-debugging-port=9222.
import { writeFileSync } from "node:fs";

const CDP = "http://127.0.0.1:9222";
const APP = "http://localhost:3000";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, mobile: false, file: "scripts/ui-desktop.png" },
  { name: "notebook", width: 1280, height: 720, mobile: false, file: "scripts/ui-notebook.png" },
  { name: "tablet", width: 820, height: 1180, mobile: true, file: "scripts/ui-tablet.png" },
  { name: "mobile", width: 390, height: 844, mobile: true, file: "scripts/ui-mobile.png" },
  { name: "small-mobile", width: 320, height: 568, mobile: true, file: "scripts/ui-small.png" },
  { name: "landscape", width: 844, height: 390, mobile: true, file: "scripts/ui-landscape.png" },
];

const stateScript = `(() => {
  const rect = (element) => {
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return { top: Math.round(box.top), bottom: Math.round(box.bottom), left: Math.round(box.left), right: Math.round(box.right), width: Math.round(box.width), height: Math.round(box.height) };
  };
  const visible = (element) => {
    if (!element) return false;
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
  };
  const player = document.querySelector('.player-slot');
  const block = document.querySelector('.block-main');
  return {
    display: document.querySelector('.scoreboard-value')?.textContent ?? null,
    title: document.querySelector('.scoreboard-title')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
    titleVisible: visible(document.querySelector('.scoreboard-title')),
    soundVisible: visible(document.querySelector('.sound-toggle')),
    statusVisible: visible(document.querySelector('.scoreboard-status')),
    hud: rect(document.querySelector('.hud')),
    scoreboard: rect(document.querySelector('.scoreboard')),
    player: rect(player),
    block: rect(block),
    button: rect(document.querySelector('.torar-button')),
    hintVisible: visible(document.querySelector('.torar-hint')),
    overflowX: document.documentElement.scrollWidth - innerWidth,
    overflowY: document.documentElement.scrollHeight - innerHeight,
    viewport: { width: innerWidth, height: innerHeight },
  };
})()`;

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
  const send = (method, params = {}) =>
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
    });
  return { send, close: () => socket.close() };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const targets = await (await fetch(`${CDP}/json/list`)).json();
const target = targets.find((entry) => entry.type === "page" && entry.url.startsWith(APP));
if (!target) throw new Error("application tab is not open in Chrome");

const client = await connect(target.webSocketDebuggerUrl);
await client.send("Page.enable");
await client.send("Runtime.enable");
await client.send("Page.navigate", { url: APP });
await sleep(2000);

const results = [];
try {
  for (const viewport of VIEWPORTS) {
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
      screenOrientation: {
        type: viewport.width >= viewport.height ? "landscapePrimary" : "portraitPrimary",
        angle: viewport.width >= viewport.height ? 90 : 0,
      },
    });
    await sleep(700);
    const state = (await client.send("Runtime.evaluate", {
      expression: stateScript,
      returnByValue: true,
    })).result.value;
    const shot = await client.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(viewport.file, Buffer.from(shot.data, "base64"));

    assert(state.viewport.width === viewport.width && state.viewport.height === viewport.height, `${viewport.name}: viewport mismatch`);
    assert(state.overflowX <= 0 && state.overflowY <= 0, `${viewport.name}: page overflows by ${state.overflowX}×${state.overflowY}`);
    assert(state.titleVisible && /RENNAM TORADO/.test(state.title ?? ""), `${viewport.name}: scoreboard title hidden`);
    assert(state.soundVisible, `${viewport.name}: sound control hidden`);
    assert(state.player && state.button, `${viewport.name}: player or button missing`);
    assert(state.button.top >= state.player.bottom - 1, `${viewport.name}: button covers the character (${state.button.top} < ${state.player.bottom})`);
    assert(state.block && state.block.bottom <= state.player.top, `${viewport.name}: block overlaps the character at rest`);
    assert(state.hud && state.hud.bottom <= state.block.top, `${viewport.name}: HUD overlaps the block`);
    assert(/\d/.test(state.display ?? ""), `${viewport.name}: counter is not visible`);

    results.push({ viewport: viewport.name, ...state });
    console.log(
      `PASS ${viewport.name} ${state.viewport.width}×${state.viewport.height} — button ${state.button.top}, player ${state.player.bottom}, block ${state.block.top}, HUD ${state.hud.bottom}`,
    );
  }
  writeFileSync("scripts/layout-test-report.json", JSON.stringify(results, null, 2));
  console.log(`ALL ${results.length} LAYOUTS PASSED`);
} catch (error) {
  writeFileSync("scripts/layout-test-report.json", JSON.stringify({ results, error: error.message }, null, 2));
  console.error(`FAILED: ${error.message}`);
  process.exitCode = 1;
} finally {
  client.close();
  setTimeout(() => process.exit(process.exitCode ?? 0), 100);
}
