import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const htmlFiles = (await readdir(root)).filter((name) => name.endsWith(".html"));
const publicPages = new Set(["index.html", "privacy.html", "terms.html"]);

test("only intentional public pages remain indexable", async () => {
  for (const name of htmlFiles) {
    const html = await readFile(new URL(name, root), "utf8");
    if (publicPages.has(name)) {
      assert.match(html, /content="index, follow"/);
    } else {
      assert.match(html, /content="noindex\s*,\s*nofollow"/);
    }
  }
  await assert.rejects(access(new URL("../experience.html", import.meta.url)));
});

test("crawler controls leave noindex pages crawlable and obsolete route redirects", async () => {
  const robots = await readFile(new URL("../robots.txt", import.meta.url), "utf8");
  const sitemap = await readFile(new URL("../sitemap.xml", import.meta.url), "utf8");
  const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.match(robots, /Allow: \/\n/);
  assert.doesNotMatch(robots, /Disallow:/);
  assert.match(sitemap, /<loc>https:\/\/waffleberry\.app\/<\/loc>/);
  assert.doesNotMatch(sitemap, /www\.waffleberry\.app|experience\.html|auth\.html|chat\.html/);
  assert.ok(vercel.redirects.some((rule) => rule.source === "/experience.html" && rule.destination === "https://waffleberry.app/" && rule.permanent));
  assert.ok(vercel.redirects.some((rule) => rule.has?.some((condition) => condition.value === "www.waffleberry.app") && rule.destination === "https://waffleberry.app/$1" && rule.permanent));
});
