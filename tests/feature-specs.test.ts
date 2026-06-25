import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { buildBot } from "../src/bot.js";
import { runSpecs, parseBotSpecs } from "../src/toolkit/index.js";
import { _resetStore } from "../src/services/store.js";

async function runSpecFile(filename: string) {
  const path = new URL(`./specs/${filename}`, import.meta.url);
  if (!existsSync(path)) throw new Error(`spec file not found: ${filename}`);
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown[];
  const specs = parseBotSpecs(raw);
  const suite = await runSpecs(() => buildBot("test-token"), specs);
  if (suite.failed > 0) {
    const details = suite.results
      .filter((r) => !r.ok)
      .map((r) => `${r.name}: ${r.steps.filter((s) => !s.ok).map((s) => s.failures.join("; ")).join(" | ")}`)
      .join("\n");
    throw new Error(`${suite.failed} failed:\n${details}`);
  }
  return suite;
}

describe("all feature specs", () => {
  beforeEach(() => {
    _resetStore();
  });
  it("list specs pass", async () => {
    const suite = await runSpecFile("list.json");
    expect(suite.failed).toBe(0);
  });
  it("add specs pass", async () => {
    const suite = await runSpecFile("add.json");
    expect(suite.failed).toBe(0);
  });
  it("remove specs pass", async () => {
    const suite = await runSpecFile("remove.json");
    expect(suite.failed).toBe(0);
  });
  it("price specs pass", async () => {
    const suite = await runSpecFile("price.json");
    expect(suite.failed).toBe(0);
  });
  it("alerts specs pass", async () => {
    const suite = await runSpecFile("alerts.json");
    expect(suite.failed).toBe(0);
  });
  it("settings specs pass", async () => {
    const suite = await runSpecFile("settings.json");
    expect(suite.failed).toBe(0);
  });
  it("admin specs pass", async () => {
    const suite = await runSpecFile("admin.json");
    expect(suite.failed).toBe(0);
  });
  it("owner specs pass", async () => {
    const suite = await runSpecFile("owner.json");
    expect(suite.failed).toBe(0);
  });
  it("claim_owner specs pass", async () => {
    const suite = await runSpecFile("claim_owner.json");
    expect(suite.failed).toBe(0);
  });
  it("set_threshold specs pass", async () => {
    const suite = await runSpecFile("set_threshold.json");
    expect(suite.failed).toBe(0);
  });
  it("set_percent_rule specs pass", async () => {
    const suite = await runSpecFile("set_percent_rule.json");
    expect(suite.failed).toBe(0);
  });
  it("quiet_hours specs pass", async () => {
    const suite = await runSpecFile("quiet_hours.json");
    expect(suite.failed).toBe(0);
  });
  it("summary_time specs pass", async () => {
    const suite = await runSpecFile("summary_time.json");
    expect(suite.failed).toBe(0);
  });
  it("watchlist lifecycle specs pass", async () => {
    const suite = await runSpecFile("watchlist.json");
    expect(suite.failed).toBe(0);
  });
  it("alert flows specs pass", async () => {
    const suite = await runSpecFile("alert_flows.json");
    expect(suite.failed).toBe(0);
  });
  it("settings flow specs pass", async () => {
    const suite = await runSpecFile("settings_flow.json");
    expect(suite.failed).toBe(0);
  });
});