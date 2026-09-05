import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const homepage = await readFile(new URL("../index.html", import.meta.url), "utf8");
const robots = await readFile(new URL("../robots.txt", import.meta.url), "utf8");
const sitemap = await readFile(new URL("../sitemap.xml", import.meta.url), "utf8");

test("homepage presents LegaRya as the product and WaffleBerry as the organization", () => {
  assert.match(homepage, /<title>LegaRya — Remember You, Always<\/title>/);
  assert.match(homepage, /name="description" content="Preserve the memories, stories, personality, and voice/);
  assert.match(homepage, /property="og:site_name" content="LegaRya"/);
  assert.match(homepage, /property="og:title" content="LegaRya — Remember You, Always"/);
  assert.match(homepage, /name="twitter:title" content="LegaRya — Remember You, Always"/);
  assert.match(homepage, /rel="canonical" href="https:\/\/waffleberry\.app\/"/);
  assert.match(homepage, /https:\/\/waffleberry\.app\//);
});

test("homepage structured data separates product and company identities", () => {
  assert.match(homepage, /"@type": "WebSite"/);
  assert.match(homepage, /"name": "LegaRya"/);
  assert.match(homepage, /"alternateName": "LegaRya by WaffleBerry"/);
  assert.match(homepage, /"@type": "Organization"/);
  assert.match(homepage, /"name": "WaffleBerry"/);
});

test("robots and sitemap index only the public homepage", () => {
  assert.match(robots, /Allow: \/\n/);
  assert.match(robots, /Disallow: \/chat\.html/);
  assert.match(robots, /Sitemap: https:\/\/waffleberry\.app\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/waffleberry\.app\/<\/loc>/);
  assert.doesNotMatch(sitemap, /www\.waffleberry\.app|chat\.html|gateway\.html/);
});
