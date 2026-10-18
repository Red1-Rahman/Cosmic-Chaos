// Temporary lead smoke check. Deleted after use.
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const problems = [];
page.on("console", (m) => {
  if (m.type() === "warning" || m.type() === "error") problems.push(`console.${m.type()}: ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));

await page.goto("http://127.0.0.1:4173/?test=1&debug=1", { waitUntil: "load" });
await page.waitForFunction(() => typeof window.__cosmic !== "undefined", null, { timeout: 15000 });

const before = await page.evaluate(() => ({
  tick: window.__cosmic.tick,
  kinds: window.__cosmic.entities.map((e) => e.kind),
  player: window.__cosmic.entities.find((e) => e.kind === "player"),
  orca: window.__cosmic.entities.find((e) => e.kind === "orca"),
  timeScale: window.__cosmic.timeScale,
}));

// Start the game.
await page.keyboard.press("Enter");
await page.waitForTimeout(400);

// Steer right and jump for a while.
await page.keyboard.down("ArrowRight");
await page.keyboard.press("Space");
await page.waitForTimeout(1500);
await page.keyboard.up("ArrowRight");

const after = await page.evaluate(() => ({
  tick: window.__cosmic.tick,
  player: window.__cosmic.entities.find((e) => e.kind === "player"),
  orca: window.__cosmic.entities.find((e) => e.kind === "orca"),
  status: window.__cosmic.status,
  timeScale: window.__cosmic.timeScale,
  field: { x: window.__cosmic.fieldX, y: window.__cosmic.fieldY, r: window.__cosmic.fieldRadius },
  canvas: (() => {
    const c = document.getElementById("stage");
    const s = getComputedStyle(c);
    return { w: c.width, h: c.height, ir: s.imageRendering };
  })(),
  touchCss: [...document.styleSheets].map((s) => s.href).filter(Boolean),
}));

console.log("BEFORE", JSON.stringify(before, null, 1));
console.log("AFTER", JSON.stringify(after, null, 1));
console.log("PROBLEMS", problems.length ? problems : "none");
await page.screenshot({ path: "lead-smoke.png" });
await browser.close();