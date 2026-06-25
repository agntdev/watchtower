import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildBot } from "../src/bot.js";
import { runSpecs, parseBotSpec } from "../src/toolkit/index.js";

function loadSpecs(name: string) {
  const raw = JSON.parse(
    readFileSync(new URL(`./specs/${name}.json`, import.meta.url), "utf8"),
  ) as unknown[];
  return raw.map(parseBotSpec);
}

describe("buildBot handler loader", () => {
  it("loads src/handlers/start.ts so /start replies via the harness", async () => {
    const specs = loadSpecs("start");
    const suite = await runSpecs(() => buildBot("test-token"), specs);
    expect(suite.failed).toBe(0);
    expect(suite.passed).toBeGreaterThan(0);
  });

  it("loads src/handlers/help.ts so /help replies via the harness", async () => {
    const specs = loadSpecs("help");
    const suite = await runSpecs(() => buildBot("test-token"), specs);
    expect(suite.failed).toBe(0);
    expect(suite.passed).toBeGreaterThan(0);
  });

  it("unknown input falls through to the global fallback", async () => {
    const suite = await runSpecs(() => buildBot("test-token"), [
      parseBotSpec({
        name: "unknown text hits the fallback",
        steps: [
          { send: { text: "qwerty" },
            expect: [{ method: "sendMessage", payload: { text: "Sorry, I didn't understand that. Try /help." } }] },
        ],
      }),
    ]);
    expect(suite.failed).toBe(0);
  });

  it("watchlist features: /add, /list, /remove", async () => {
    const specs = loadSpecs("watchlist");
    const suite = await runSpecs(() => buildBot("test-token"), specs);
    expect(suite.failed).toBe(0);
    expect(suite.passed).toBeGreaterThan(0);
  });

  it("price features: /price", async () => {
    const specs = loadSpecs("price");
    const suite = await runSpecs(() => buildBot("test-token"), specs);
    expect(suite.failed).toBe(0);
    expect(suite.passed).toBeGreaterThan(0);
  });

  it("alerts features: /alerts, /set_threshold, /set_percent_rule", async () => {
    const specs = loadSpecs("alerts");
    const suite = await runSpecs(() => buildBot("test-token"), specs);
    expect(suite.failed).toBe(0);
    expect(suite.passed).toBeGreaterThan(0);
  });

  it("settings features: /settings, /quiet_hours, /summary_time", async () => {
    const specs = loadSpecs("settings");
    const suite = await runSpecs(() => buildBot("test-token"), specs);
    expect(suite.failed).toBe(0);
    expect(suite.passed).toBeGreaterThan(0);
  });

  it("admin features: /admin, /claim_owner", async () => {
    const specs = loadSpecs("admin");
    const suite = await runSpecs(() => buildBot("test-token"), specs);
    expect(suite.failed).toBe(0);
    expect(suite.passed).toBeGreaterThan(0);
  });
});
