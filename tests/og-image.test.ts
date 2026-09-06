import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { handleApi, loadSiteConfig } from "../src/cloudflare/api";
import type { Env } from "../src/cloudflare/runtime";
import {
  DEFAULT_SEO_SETTINGS,
  SITE_SEO_SETTING_KEY,
  defaultOgImageUrl,
  getCanonicalHostname,
  isDefaultOgImageUrl,
} from "../src/lib/site-config";
import worker from "../src/worker";
import { createTestEnv, LocalContext } from "./cloudflare-test-helpers";

const template = readFileSync(new URL("../public/og-image.svg", import.meta.url), "utf8");

async function patchSeo(env: Env, value: Record<string, unknown>): Promise<Response> {
  return handleApi(
    new Request("https://archive.example.com/api/admin/seo-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    }),
    env,
    new LocalContext(),
  );
}

test("default share image URLs use only the canonical hostname", () => {
  const canonical = "https://www.example.com:8443/archive?source=test#top";
  assert.equal(getCanonicalHostname(canonical), "www.example.com");
  assert.equal(defaultOgImageUrl(canonical), "/og-image.svg?v=www.example.com");
  assert.equal(getCanonicalHostname("not a URL"), "example.com");
  assert.equal(defaultOgImageUrl("not a URL"), "/og-image.svg?v=example.com");
  assert.equal(isDefaultOgImageUrl("/og-image.svg"), true);
  assert.equal(isDefaultOgImageUrl("/og-image.svg?v=example.com"), true);
  assert.equal(isDefaultOgImageUrl("https://media.example.com/site/og/custom.png"), false);
});

test("saving canonical settings refreshes the default image while uploads keep priority", async () => {
  const { env } = createTestEnv();

  const saved = await patchSeo(env, { canonicalUrl: "https://share.example.net/archive" });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json() as { ogImageUrl: string }).ogImageUrl, "/og-image.svg?v=share.example.net");

  const uploaded = await patchSeo(env, { ogImageKey: "site/og/custom.png" });
  assert.equal(uploaded.status, 200);
  assert.equal(
    (await uploaded.json() as { ogImageUrl: string }).ogImageUrl,
    "https://media.example.com/site/og/custom.png",
  );

  const changedCanonical = await patchSeo(env, { canonicalUrl: "https://next.example.org/elsewhere" });
  assert.equal(changedCanonical.status, 200);
  assert.equal(
    (await changedCanonical.json() as { ogImageUrl: string }).ogImageUrl,
    "https://media.example.com/site/og/custom.png",
  );

  const reset = await patchSeo(env, { ogImageKey: null });
  assert.equal(reset.status, 200);
  assert.equal((await reset.json() as { ogImageUrl: string }).ogImageUrl, "/og-image.svg?v=next.example.org");

  const rejected = await patchSeo(env, { canonicalUrl: "javascript:alert(1)" });
  assert.equal(rejected.status, 400);
  assert.equal((await loadSiteConfig(env)).seo.ogImageUrl, "/og-image.svg?v=next.example.org");
});

test("the Worker renders the saved canonical hostname into GET and HEAD default images", async () => {
  const { db, env } = createTestEnv();
  const hostname = `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.example`;
  db.sqlite.prepare("INSERT INTO site_settings(key, value) VALUES (?, ?)").run(
    SITE_SEO_SETTING_KEY,
    JSON.stringify({ ...DEFAULT_SEO_SETTINGS, canonicalUrl: `https://${hostname}/archive` }),
  );
  const assetRequests: Request[] = [];
  env.ASSETS = {
    fetch: async (request) => {
      assetRequests.push(request instanceof Request ? request : new Request(request));
      return new Response(template, {
        headers: {
          "Content-Type": "image/svg+xml",
          ETag: "static-etag",
          "Content-Length": String(template.length),
        },
      });
    },
  };
  const context = new LocalContext();
  const getResponse = await worker.fetch(
    new Request("https://attacker.invalid/og-image.svg?v=evil.example", {
      headers: { "If-None-Match": "static-etag" },
    }),
    env,
    context,
  );
  const svg = await getResponse.text();
  assert.equal(getResponse.status, 200);
  assert.match(getResponse.headers.get("Content-Type") ?? "", /^image\/svg\+xml/);
  assert.equal(getResponse.headers.get("Cache-Control"), "no-store");
  assert.equal(getResponse.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(getResponse.headers.get("ETag"), null);
  assert.equal(getResponse.headers.get("Content-Length"), null);
  assert.match(svg, new RegExp(`>${hostname}<`));
  assert.doesNotMatch(svg, /evil\.example/);
  assert.match(svg, /id="canonical-domain"[^>]*style="font-size: [0-9.]+px"/);
  assert.equal(assetRequests[0]?.method, "GET");
  assert.equal(assetRequests[0]?.headers.get("If-None-Match"), null);

  const headResponse = await worker.fetch(
    new Request("https://archive.example.com/og-image.svg", { method: "HEAD" }),
    env,
    context,
  );
  assert.equal(headResponse.status, 200);
  assert.equal(await headResponse.text(), "");
  assert.equal(assetRequests[1]?.method, "GET");
});

test("the Worker falls back to example.com when stored settings cannot be read", async () => {
  const { env } = createTestEnv();
  env.DB = {
    prepare() {
      throw new Error("D1 unavailable");
    },
  } as unknown as Env["DB"];
  env.ASSETS = { fetch: async () => new Response(template) };

  const response = await worker.fetch(
    new Request("https://archive.example.com/og-image.svg"),
    env,
    new LocalContext(),
  );
  assert.equal(response.status, 200);
  assert.match(await response.text(), />example\.com<\/text>/);
});
