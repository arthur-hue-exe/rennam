// Generates the pixel-art PNG assets used by Rennam Torado.
// Pure Node (zlib) PNG encoder: no runtime dependencies, fully deterministic.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "sprites");
mkdirSync(outDir, { recursive: true });

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function hexToRgba(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255];
}

// Build an image from a character grid + palette. "." is transparent.
function fromGrid(grid, palette) {
  const height = grid.length;
  const width = grid[0].length;
  for (const row of grid) {
    if (row.length !== width) throw new Error(`Row width mismatch: "${row}" (${row.length} vs ${width})`);
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = grid[y][x];
      if (ch === ".") continue;
      const color = palette[ch];
      if (!color) throw new Error(`Unknown palette char "${ch}" at ${x},${y}`);
      const [r, g, b, a] = hexToRgba(color);
      const i = (y * width + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = a;
    }
  }
  return { width, height, rgba };
}

function padGrid(rows, width) {
  return rows.map((row) => {
    if (row.length > width) throw new Error(`Row "${row}" is wider than ${width}`);
    return row.padEnd(width, ".");
  });
}

function write(name, img) {
  writeFileSync(join(outDir, name), encodePNG(img.width, img.height, img.rgba));
}

function scale(img, factor) {
  const width = img.width * factor;
  const height = img.height * factor;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = Math.floor(x / factor);
      const sy = Math.floor(y / factor);
      const si = (sy * img.width + sx) * 4;
      const di = (y * width + x) * 4;
      img.rgba.copy(rgba, di, si, si + 4);
    }
  }
  return { width, height, rgba };
}

// ---------------------------------------------------------------------------
// Plumber palette
// ---------------------------------------------------------------------------
const P = {
  K: "#2a1620", // outline
  R: "#e8402f", // red
  D: "#a8241b", // dark red
  L: "#ff6e5a", // light red
  S: "#ffca9c", // skin
  s: "#d9935f", // skin shade
  H: "#4b2a15", // hair / mustache
  B: "#2f66d9", // overalls
  b: "#1d3f94", // overalls shade
  l: "#5f98f2", // overalls highlight
  W: "#f8f3e6", // glove / eye white
  w: "#cfc7b2", // glove shade
  Y: "#82501f", // shoe
  y: "#4f2d0e", // shoe shade
  E: "#20111a", // eye
  G: "#ffd93b", // button
};

const idle = [
  ".....RRRRRR.....",
  "....RRRRRRRRR...",
  "...RRRRRRRRRRR..",
  "...DDDRRRRRRRRR.",
  "..HHHHSSSSSSSS..",
  "..HHHSSSSSESSSS.",
  "..HHSSSSSSESSSS.",
  "..HHSSSSSSSSSSS.",
  "...sSSSSSSSSSS..",
  "...SSSSSSHHHHH..",
  "...sSSSSSSSSSs..",
  "....SSSSSSSS....",
  "...RRRRRRRRRR...",
  "..RRRRRRRRRRRR..",
  ".SSRRRRBBRRRRSS.",
  ".SWRRRBBBBRRRWS.",
  ".SWRRBBGBBGRRWS.",
  ".SSRRBBBBBBRRSS.",
  "....RBBBBBBR....",
  "....BBBBBBBB....",
  "....BBB..BBB....",
  "....BB....BB....",
  "...BBB....BBB...",
  "...YYY....YYY...",
  "..YYYY....YYYY..",
  "..yyyy....yyyy..",
];

const jump = [
  "..SW.....RR..WS.",
  "..SW...RRRRRRWS.",
  "..SS..RRRRRRRRSS",
  "...S..RRRRRRRRR.",
  "..HHHHSSSSSSSS..",
  "..HHHSSSSSESSSS.",
  "..HHSSSSSSESSSS.",
  "..HHSSSSSSSSSSS.",
  "...sSSSSSSSSSS..",
  "...SSSSSSHHHHH..",
  "...sSSSSSSSSSs..",
  "....SSSSSSSS....",
  "...RRRRRRRRRR...",
  "..RRRRRRRRRRRR..",
  ".SSRRRRBBRRRRSS.",
  ".SWRRRBBBBRRRWS.",
  ".SWRRBBGBBGRRWS.",
  "....RBBBBBBR....",
  "....BBBBBBBB....",
  "...BBBB..BBBB...",
  "..BBB......BBB..",
  "..YYY......YYY..",
  ".YYYY......YYYY.",
  ".yyyy......yyyy.",
  "................",
  "................",
];

const crouch = [
  ".....RRRRRR.....",
  "....RRRRRRRRR...",
  "...RRRRRRRRRRR..",
  "...DDDRRRRRRRRR.",
  "..HHHHSSSSSSSS..",
  "..HHHSSSSSESSSS.",
  "..HHSSSSSSESSSS.",
  "..HHSSSSSSSSSSS.",
  "...sSSSSSSSSSS..",
  "...SSSSSSHHHHH..",
  "...sSSSSSSSSSs..",
  "....SSSSSSSS....",
  "...RRRRRRRRRR...",
  ".SSRRRRBBRRRRSS.",
  ".SWRRBBGBBGRRWS.",
  ".SSRRBBBBBBRRSS.",
  "....BBBBBBBB....",
  "...BBBB..BBBB...",
  "..YYYY....YYYY..",
  ".YYYYY....YYYYY.",
];

const hit = [
  "..SS.....RR..SS.",
  "..SW...RRRRRRWS.",
  "..SW..RRRRRRRRWS",
  "...S..RRRRRRRRR.",
  "..HHHHSSSSSSSS..",
  "..HHHSSSSSESSSS.",
  "..HHSSSSSSESSSS.",
  "..HHSSSSSSSSSSS.",
  "...sSSSSSSSSSS..",
  "...SSSSSSHHHHH..",
  "...sSSSSSSSSSs..",
  "....SSSSSSSS....",
  "...RRRRRRRRRR...",
  "..RRRRRRRRRRRR..",
  ".SSRRRRBBRRRRSS.",
  ".SWRRRBBBBRRRWS.",
  "....RBBGBBGBR...",
  "....BBBBBBBB....",
  "....BBBBBBBB....",
  "...BBB....BBB...",
  "..BBB......BBB..",
  "..YYY......YYY..",
  ".YYYY......YYYY.",
  ".yyyy......yyyy.",
  "................",
  "................",
];

write("player-idle.png", fromGrid(idle, P));
write("player-jump.png", fromGrid(jump, P));
write("player-crouch.png", fromGrid(crouch, P));
write("player-hit.png", fromGrid(hit, P));

// ---------------------------------------------------------------------------
// Question block 16x16
// ---------------------------------------------------------------------------
const blockPalette = {
  K: "#2c1a05",
  O: "#7a4a06",
  Y: "#f9b800",
  L: "#ffe37a",
  D: "#b57300",
  W: "#fffdf0",
  w: "#e8d9a0",
};
const block = [
  "KKKKKKKKKKKKKKKK",
  "KLLLLLLLLLLLLLLK",
  "KLYYYYYYYYYYYYDK",
  "KLYYYYYYYYYYYYDK",
  "KLYYKKKKKKKKYYDK",
  "KLYKWWWWWWWWKYDK",
  "KLYKWWKKKKWWKYDK",
  "KLYKKKKKKWWKYYDK",
  "KLYYYYYKWWKYYYDK",
  "KLYYYYKWWKYYYYDK",
  "KLYYYKWWKYYYYYDK",
  "KLYYYYKWKYYYYYDK",
  "KLYYYYYYYYYYYYDK",
  "KLYYYYKWWKYYYYDK",
  "KLYYYYYYYYYYYYDK",
  "KDYYYYYYYYYYYYDK",
  "KDDDDDDDDDDDDDDK",
];
write("block.png", fromGrid(block, blockPalette));

// Coin 10x14
const coinPalette = {
  K: "#4a2a05",
  Y: "#ffd633",
  L: "#fff2a8",
  D: "#d99a06",
  O: "#a86b00",
};
const coin = [
  "...KKKK...",
  "..KYYYYK..",
  ".KYLLYYYK.",
  ".KYLYYDYK.",
  "KYLYYDYYDK",
  "KYLYYDYYDK",
  "KYLYYDYYDK",
  "KYLYYDYYDK",
  "KYLYYDYYDK",
  ".KYLYYDYK.",
  ".KYYDDYYK.",
  "..KYYYYK..",
  "...KKKK...",
  "..........",
];
write("coin.png", fromGrid(coin, coinPalette));

// Ground tiles 16x16
const tilePalette = {
  K: "#3f2a14",
  G: "#5cc93c",
  g: "#8ff062",
  d: "#2f8a24",
  B: "#c47a3c",
  b: "#9a5827",
  l: "#e0a061",
  o: "#6f3d18",
};
const grassTile = [
  "gggggggggggggggg",
  "gGGGGGGGGGGGGGGg",
  "GGGGGGGGGGGGGGGG",
  "GGdGGGGdGGGGdGGG",
  "dddddddddddddddd",
  "KKKKKKKKKKKKKKKK",
  "BBlBBBBBBBlBBBBB",
  "BBBBBoBBBBBBBBBB",
  "BBBBBoBBBBBlBBBB",
  "BlBBBBBBBBBBBoBB",
  "BBBBBBBlBBBBBoBB",
  "BoBBBBBBBBBBBBBb",
  "BBBBBBBoBBBBBBBB",
  "BBBBlBBBBBBBBBBB",
  "BBBBBBBBBBBBlBBB",
  "bBBBBBBBBBBBBBBb",
];
const dirtTile = [
  "BBlBBBBBBBlBBBBB",
  "BBBBBoBBBBBBBBBB",
  "BBBBBoBBBBBBBBBB",
  "BBBBBoBBBBBlBBBB",
  "BlBBBBBBBBBBBoBB",
  "BBBBBBBlBBBBBoBB",
  "BoBBBBBBBBBBBBBb",
  "BBBBBBBoBBBBBBBB",
  "BBBBlBBBBBBBBBBB",
  "BBBBBBBBBBBBlBBB",
  "BoBBBBBBBBBBBBBb",
  "BBBBBBBlBBBBBBBB",
  "BBBoBBBBBBBBBBBB",
  "BBBBBBBBBoBBBlBB",
  "bBBBBBBBBBBBBBBb",
  "oBBBBBBBBBBBBBBo",
];
write("grass-tile.png", fromGrid(grassTile, tilePalette));
write("dirt-tile.png", fromGrid(dirtTile, tilePalette));

// Cloud 40x16
const cloudPalette = {
  K: "#3c6fa8",
  W: "#ffffff",
  w: "#d8ecff",
  c: "#a9d4ff",
};
const cloud = [
  ".........KKKKK..........................",
  ".......KKWWWWWKK........................",
  "......KWWWWWWWWWKK......................",
  "..KKKKWWWWWWWWWWWWKKKK..................",
  ".KWWWWWWWWWWWWWWWWWWWWKK................",
  "KWWWWWWWWWWWWWWWWWWWWWWWKK..KKK.........",
  "KWWWWWWWWWWWWWWWWWWWWWWWWWKKWWWKK.......",
  "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK......",
  "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK.....",
  "KwwWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK....",
  ".KwwWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK....",
  "..KcccwwwwwwwwwwwwwwwwwwwwwwwwwwwwK.....",
  "...KKccccccccccccccccccccccccccccKK.....",
  ".....KKKKKKKKKKKKKKKKKKKKKKKKKKKK.......",
  "........................................",
  "........................................",
];
write("cloud.png", fromGrid(padGrid(cloud, 40), cloudPalette));

// Bush 48x16
const bushPalette = {
  K: "#123f0e",
  G: "#57c33a",
  g: "#8ef062",
  d: "#2f8a24",
};
const bush = [
  "..........KKKK...........................",
  "........KKggggKK.........................",
  ".......KgggggggGK........................",
  "..KKKKKGGGGGGGGGKKKKK...................",
  ".KggggggggggggggggggggKK................",
  "KgggggggggggggggggggggggKK..............",
  "KGGGGGGGGGGGGGGGGGGGGGGGGGK.............",
  "KGGGdGGGGGGdGGGGGGdGGGGGGGGK............",
  "KGGGdGGGGGGdGGGGGGdGGGGGGGGKKK..........",
  "KGGGdGGGGGGdGGGGGGdGGGGGGGGGGGKK........",
  "KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK.......",
  "KGGGddGGGGGGGddGGGGGGGddGGGGGGGGGK......",
  ".KGGGddddddddddddddddddddddddddddK......",
  "..KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK......",
  "........................................",
  "........................................",
];
write("bush.png", fromGrid(padGrid(bush, 48), bushPalette));

// Hill 80x44 - rounded pixel-art mound generated from an ellipse profile
const hillPalette = {
  K: "#123f0e",
  G: "#57c33a",
  g: "#8ef062",
  d: "#2f8a24",
};
function makeHill(width = 80, height = 44) {
  const grid = Array.from({ length: height }, () => Array(width).fill("."));
  const cx = width / 2;
  for (let y = 0; y < height; y++) {
    const t = (y + 1) / height;
    const half = Math.round((width / 2 - 2) * Math.pow(t, 0.55));
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      if (x >= 0 && x < width) grid[y][x] = "G";
    }
  }
  const filled = (x, y) => y >= 0 && y < height && x >= 0 && x < width && grid[y][x] !== ".";
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!filled(x, y)) continue;
      if (!filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1)) grid[y][x] = "K";
    }
  }
  for (let y = 1; y < height; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (grid[y][x] !== "G") continue;
      if (grid[y - 1][x] === "K" || grid[y][x - 1] === "K") grid[y][x] = "g";
    }
  }
  const spots = [[0.35, 0.33], [0.6, 0.42], [0.45, 0.6], [0.68, 0.66], [0.3, 0.68]];
  for (const [fx, fy] of spots) {
    const sx = Math.round(fx * width);
    const sy = Math.round(fy * height);
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        if (grid[sy + dy] && grid[sy + dy][sx + dx] === "G") grid[sy + dy][sx + dx] = "d";
      }
    }
  }
  return grid.map((row) => row.join(""));
}
const hill = makeHill();
write("hill.png", fromGrid(hill, hillPalette));

// ---------------------------------------------------------------------------
// Contact sheet for visual inspection (scaled 8x, on a checkerboard)
// ---------------------------------------------------------------------------
const previews = [
  ["idle", fromGrid(idle, P)],
  ["jump", fromGrid(jump, P)],
  ["crouch", fromGrid(crouch, P)],
  ["hit", fromGrid(hit, P)],
  ["block", fromGrid(block, blockPalette)],
  ["coin", fromGrid(coin, coinPalette)],
  ["grass", fromGrid(grassTile, tilePalette)],
  ["cloud", fromGrid(padGrid(cloud, 40), cloudPalette)],
  ["bush", fromGrid(padGrid(bush, 48), bushPalette)],
  ["hill", fromGrid(hill, hillPalette)],
];
const factor = 6;
const padding = 16;
const cellW = Math.max(...previews.map(([, img]) => img.width)) * factor + padding * 2;
const cellH = Math.max(...previews.map(([, img]) => img.height)) * factor + padding * 2;
const sheetW = cellW * 5;
const sheetH = cellH * 2;
const sheet = Buffer.alloc(sheetW * sheetH * 4);
for (let y = 0; y < sheetH; y++) {
  for (let x = 0; x < sheetW; x++) {
    const i = (y * sheetW + x) * 4;
    const checker = (Math.floor(x / 12) + Math.floor(y / 12)) % 2 === 0 ? 210 : 180;
    sheet[i] = checker;
    sheet[i + 1] = checker;
    sheet[i + 2] = checker;
    sheet[i + 3] = 255;
  }
}
previews.forEach(([, img], index) => {
  const big = scale(img, factor);
  const ox = (index % 5) * cellW + padding;
  const oy = Math.floor(index / 5) * cellH + padding;
  for (let y = 0; y < big.height; y++) {
    for (let x = 0; x < big.width; x++) {
      const si = (y * big.width + x) * 4;
      if (big.rgba[si + 3] === 0) continue;
      const di = ((oy + y) * sheetW + ox + x) * 4;
      big.rgba.copy(sheet, di, si, si + 4);
    }
  }
});
writeFileSync(join(root, "scripts", "sprites-preview.png"), encodePNG(sheetW, sheetH, sheet));

console.log("Sprites generated in", outDir);
