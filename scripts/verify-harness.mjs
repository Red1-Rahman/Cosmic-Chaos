// Drift guard. Run by `npm run test:ci` before every other gate.
// Usage: node scripts/verify-harness.mjs [--lock]
//   --lock  Human only. Records size, bytes and sha256 of every image into assets.json.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const ASSET_DIR = "public/assets";
const IMAGE_EXT = new Set([".png", ".jpeg", ".jpg", ".webp", ".gif"]);
const AUDIO_EXT = new Set([".wav", ".mp3", ".ogg", ".m4a", ".flac", ".aac", ".opus"]);
const ANIMS = ["idle", "walk", "swim", "jump", "defeat"];
const REQUIRED_CHARACTERS = ["capybara", "orca", "shark", "tarantula", "snail", "human"];
const lock = process.argv.includes("--lock");

const errors = [];
const fail = (msg) => errors.push(msg);
const readJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (["node_modules", "dist", ".git", "playwright-report", "test-results"].includes(name))
      continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

const ratioOf = (label) => {
  const [a, b] = label.split(":");
  const num = (s) => (s === "sqrt2" ? Math.SQRT2 : Number(s));
  return num(a) / num(b);
};

// ---------- package.json, tech-stack.json, .nvmrc ----------
const pkg = readJson("package.json");
const stack = readJson("tech-stack.json");

if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
  fail(
    `package.json has runtime dependencies (${Object.keys(pkg.dependencies).join(", ")}). The game ships with zero.`,
  );
}
const dev = pkg.devDependencies ?? {};
for (const [name, version] of Object.entries(dev)) {
  if (!/^\d+\.\d+\.\d+$/.test(version))
    fail(`package.json: ${name} must be an exact version, got "${version}".`);
  if (stack.pins[name] === undefined)
    fail(`package.json: ${name} is not listed in tech-stack.json pins.`);
  else if (stack.pins[name] !== version)
    fail(
      `Pin mismatch for ${name}: package.json ${version} vs tech-stack.json ${stack.pins[name]}.`,
    );
}
for (const name of Object.keys(stack.pins)) {
  if (dev[name] === undefined)
    fail(`tech-stack.json pins ${name} but package.json does not install it.`);
}
if (!existsSync(join(root, "package-lock.json"))) fail("package-lock.json is missing.");
if (existsSync(join(root, ".nvmrc"))) {
  const major = readFileSync(join(root, ".nvmrc"), "utf8").trim().replace(/^v/, "").split(".")[0];
  if (Number(major) !== stack.tooling.node.major)
    fail(`.nvmrc says ${major}, tech-stack.json says ${stack.tooling.node.major}.`);
} else fail(".nvmrc is missing.");

// ---------- assets.json ----------
const assets = readJson(`${ASSET_DIR}/assets.json`);
const spriteIds = new Set();
const listed = new Set(["assets.json"]);

function checkFile(entry, label) {
  const path = join(root, ASSET_DIR, entry.file);
  listed.add(entry.file);
  if (!existsSync(path)) {
    fail(`${label}: file ${entry.file} is missing from ${ASSET_DIR}.`);
    return;
  }
  const buf = readFileSync(path);
  const size = imageSize(buf);
  const sha = createHash("sha256").update(buf).digest("hex");
  if (lock) {
    if (!size) {
      fail(`${label}: cannot read image size of ${entry.file}.`);
      return;
    }
    entry.size = size;
    entry.bytes = buf.length;
    entry.sha256 = sha;
    if (entry.locked !== undefined) entry.locked = true;
    if (entry.frame) {
      const { cols, rows } = entry.frame.grid;
      entry.frame.tile = { w: size.w / cols, h: size.h / rows };
    }
    return;
  }
  if (entry.locked === false || !entry.size || !entry.sha256) {
    fail(`${label}: ${entry.file} exists but is not locked. A human must run: npm run assets:lock`);
    return;
  }
  if (!size || size.w !== entry.size.w || size.h !== entry.size.h) {
    fail(
      `${label}: ${entry.file} is ${size ? `${size.w}x${size.h}` : "unreadable"}, manifest says ${entry.size.w}x${entry.size.h}. If you replaced the image, a human must run: npm run assets:lock`,
    );
  }
  if (entry.sha256 !== sha)
    fail(
      `${label}: ${entry.file} content changed (sha256 mismatch). Image files are read-only for agents.`,
    );
  if (entry.frame) {
    const { count, grid, tile } = entry.frame;
    if (grid.cols * grid.rows < count)
      fail(`${label}: grid ${grid.cols}x${grid.rows} cannot hold ${count} frames.`);
    if (tile.w * grid.cols !== entry.size.w || tile.h * grid.rows !== entry.size.h)
      fail(`${label}: tile x grid does not equal image size.`);
  }
  if (entry.declaredRatio && size) {
    const declared = ratioOf(entry.declaredRatio);
    if (Math.abs(size.w / size.h - declared) / declared > 0.04) {
      fail(
        `${label}: ${entry.file} aspect ${(size.w / size.h).toFixed(3)} is not within 4% of declared ${entry.declaredRatio}.`,
      );
    }
  }
}

for (const s of assets.sprites) {
  if (spriteIds.has(s.id)) fail(`Duplicate sprite id ${s.id}.`);
  spriteIds.add(s.id);
  checkFile(s, `sprite ${s.id}`);
}
const bgIds = new Set();
for (const b of assets.backgrounds) {
  bgIds.add(b.id);
  checkFile(b, `background ${b.id}`);
}
for (const b of assets.backgrounds) {
  if (b.variantOf && !bgIds.has(b.variantOf))
    fail(`background ${b.id}: variantOf ${b.variantOf} does not exist.`);
}

if (!lock) {
  for (const file of readdirSync(join(root, ASSET_DIR))) {
    if (IMAGE_EXT.has(extname(file).toLowerCase()) && !listed.has(file)) {
      fail(`${ASSET_DIR}/${file} is not described in assets.json. Add it to the manifest.`);
    }
  }

  for (const [charId, def] of Object.entries(assets.characters)) {
    for (const [name, a] of Object.entries(def.animations)) {
      if (!ANIMS.includes(name)) fail(`${charId}: unknown animation name ${name}.`);
      let prev = -1;
      a.keyframes.forEach((k, i) => {
        if (!spriteIds.has(k.sprite))
          fail(`${charId}.${name}: keyframe ${i} uses unknown sprite ${k.sprite}.`);
        if (k.t < prev) fail(`${charId}.${name}: keyframe times must not decrease.`);
        prev = k.t;
      });
      if (a.keyframes[0].t !== 0 || a.keyframes.at(-1).t !== 1)
        fail(`${charId}.${name}: keyframes must start at t=0 and end at t=1.`);
    }
    for (const name of ANIMS) {
      const target = def.animations[name] ? name : def.aliases[name];
      if (!target || !def.animations[target])
        fail(`${charId}: "${name}" is neither defined nor aliased to a defined animation.`);
    }
  }

  const vp = assets.viewport;
  const wanted = stack.viewport.presets;
  const have = vp.presets.map((p) => p.id);
  for (const id of wanted)
    if (!have.includes(id))
      fail(`viewport preset ${id} from tech-stack.json is missing in assets.json.`);
  for (const p of vp.presets) {
    if (Math.abs(p.logical.w / p.logical.h - p.ratio) / p.ratio > 0.01)
      fail(`viewport preset ${p.id}: logical size does not match ratio.`);
  }

  // ---------- characters.json ----------
  const chars = readJson("src/data/characters.json");
  const ids = chars.characters.map((c) => c.id);
  for (const id of REQUIRED_CHARACTERS) {
    if (!ids.includes(id)) fail(`characters.json: missing character ${id}.`);
    if (!assets.characters[id]) fail(`assets.json: no animation set for ${id}.`);
  }
  for (const c of chars.characters) {
    for (const sid of c.spriteIds)
      if (!spriteIds.has(sid)) fail(`characters.json: ${c.id} references unknown sprite ${sid}.`);
    if (!c.milestone1?.must?.length) fail(`characters.json: ${c.id} has no milestone1.must list.`);
  }
  if (!bgIds.has(chars.world.arenaBackground))
    fail(`characters.json: arenaBackground ${chars.world.arenaBackground} is not in assets.json.`);

  // ---------- forbidden files ----------
  for (const f of [
    ...walk(join(root, "src")),
    ...walk(join(root, "public")),
    ...walk(join(root, "tests")),
  ]) {
    if (AUDIO_EXT.has(extname(f).toLowerCase()))
      fail(`Audio file not allowed: ${relative(root, f)}. Synthesize sounds with Web Audio.`);
  }
  if (existsSync(join(root, "index.html"))) {
    const html = readFileSync(join(root, "index.html"), "utf8");
    if (!/rel=["']icon["']/.test(html))
      fail(
        'index.html needs <link rel="icon" href="data:,"> (or a real icon) to avoid a favicon 404 console error.',
      );
  }

  // ---------- content guardrail scan ----------
  const terms = readJson("scripts/guardrail-terms.json").categories;
  const targets = [
    ...walk(join(root, "src")).filter((f) => /\.(ts|js|css|html|json)$/.test(f)),
    ...walk(join(root, ASSET_DIR)).filter((f) => f.endsWith(".json")),
    ...(existsSync(join(root, "index.html")) ? [join(root, "index.html")] : []),
  ];
  for (const file of targets) {
    const text = readFileSync(file, "utf8");
    for (const [category, list] of Object.entries(terms)) {
      for (const term of list) {
        const re = new RegExp(`(^|[^A-Za-z])${term.replace(/\s+/g, "\\s+")}($|[^A-Za-z])`, "i");
        if (re.test(text))
          fail(`Content guardrail (${category}): "${term}" found in ${relative(root, file)}.`);
      }
    }
  }
}

if (lock) {
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  writeFileSync(join(root, ASSET_DIR, "assets.json"), `${JSON.stringify(assets, null, 2)}\n`);
  console.log("assets.json locked: sizes, byte counts and sha256 updated.");
  process.exit(0);
}

if (errors.length) {
  console.error(
    `verify-harness: ${errors.length} problem(s)\n` + errors.map((e) => ` - ${e}`).join("\n"),
  );
  process.exit(1);
}
console.log("verify-harness: ok");
