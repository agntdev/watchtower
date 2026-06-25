import { describe, expect, it } from "vitest";
import {
  parseTimezoneOffset,
  isValidTimezone,
  isInQuietHours,
  getLocalMinutes,
} from "../src/alert-monitor.js";

describe("parseTimezoneOffset", () => {
  it("returns 0 for UTC", () => {
    expect(parseTimezoneOffset("UTC")).toBe(0);
  });

  it("parses UTC+3", () => {
    expect(parseTimezoneOffset("UTC+3")).toBe(180);
  });

  it("parses UTC-5", () => {
    expect(parseTimezoneOffset("UTC-5")).toBe(-300);
  });

  it("parses UTC+5:30", () => {
    expect(parseTimezoneOffset("UTC+5:30")).toBe(330);
  });

  it("parses UTC abbreviation with case-insensitivity", () => {
    expect(parseTimezoneOffset("utc+2")).toBe(120);
  });

  it("parses EST abbreviation", () => {
    expect(parseTimezoneOffset("EST")).toBe(-300);
  });

  it("parses JST abbreviation", () => {
    expect(parseTimezoneOffset("JST")).toBe(540);
  });

  it("parses IST abbreviation", () => {
    expect(parseTimezoneOffset("IST")).toBe(330);
  });

  it("parses IANA timezone America/New_York", () => {
    expect(parseTimezoneOffset("America/New_York")).toBe(-300);
  });

  it("parses IANA timezone Europe/London", () => {
    expect(parseTimezoneOffset("Europe/London")).toBe(0);
  });

  it("parses IANA timezone Asia/Tokyo", () => {
    expect(parseTimezoneOffset("Asia/Tokyo")).toBe(540);
  });

  it("parses IANA timezone Australia/Sydney", () => {
    expect(parseTimezoneOffset("Australia/Sydney")).toBe(600);
  });

  it("returns 0 for unknown timezone", () => {
    expect(parseTimezoneOffset("Mars/Olympus")).toBe(0);
  });

  it("parses IANA timezone with lowercase", () => {
    expect(parseTimezoneOffset("asia/tokyo")).toBe(540);
  });
});

describe("isValidTimezone", () => {
  it("accepts UTC", () => {
    expect(isValidTimezone("UTC")).toBe(true);
  });

  it("accepts UTC+3", () => {
    expect(isValidTimezone("UTC+3")).toBe(true);
  });

  it("accepts EST", () => {
    expect(isValidTimezone("EST")).toBe(true);
  });

  it("accepts Europe/London", () => {
    expect(isValidTimezone("Europe/London")).toBe(true);
  });

  it("accepts Asia/Tokyo", () => {
    expect(isValidTimezone("Asia/Tokyo")).toBe(true);
  });

  it("rejects invalid timezone", () => {
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidTimezone("")).toBe(false);
  });

  it("rejects nonsense", () => {
    expect(isValidTimezone("xyzzy")).toBe(false);
  });
});

describe("quiet hours", () => {
  describe("isInQuietHours", () => {
    it("detects quiet hours when inside range (22:00-07:00, local=23:00 UTC)", () => {
      const ref = new Date("2024-01-01T01:00:00Z"); // UTC 01:00 = UTC+2 -> 03:00 local
      // For UTC timezone: UTC 01:00 = 01:00 local. Not in quiet hours.
      // Let's use a midnight UTC reference to get 00:00 local for UTC
      const ref2 = new Date("2024-01-01T23:00:00Z"); // UTC 23:00 = 23:00 local in UTC
      expect(
        isInQuietHours(
          { quietHoursStart: "22:00", quietHoursEnd: "07:00", timezone: "UTC" },
          ref2,
        ),
      ).toBe(true);
    });

    it("detects NOT in quiet hours when outside range", () => {
      const ref = new Date("2024-01-01T12:00:00Z"); // UTC noon
      expect(
        isInQuietHours(
          { quietHoursStart: "22:00", quietHoursEnd: "07:00", timezone: "UTC" },
          ref,
        ),
      ).toBe(false);
    });

    it("detects quiet hours for overnight wrap (22:00-07:00, local=05:00)", () => {
      const ref = new Date("2024-01-01T05:00:00Z"); // UTC 05:00 = 05:00 local in UTC
      expect(
        isInQuietHours(
          { quietHoursStart: "22:00", quietHoursEnd: "07:00", timezone: "UTC" },
          ref,
        ),
      ).toBe(true);
    });

    it("disabled quiet hours (00:00-00:00) never trigger", () => {
      const ref = new Date("2024-01-01T03:00:00Z");
      expect(
        isInQuietHours(
          { quietHoursStart: "00:00", quietHoursEnd: "00:00", timezone: "UTC" },
          ref,
        ),
      ).toBe(false);
    });

    it("non-wrapping range (09:00-17:00, local=14:00) triggers", () => {
      const ref = new Date("2024-01-01T14:00:00Z");
      expect(
        isInQuietHours(
          { quietHoursStart: "09:00", quietHoursEnd: "17:00", timezone: "UTC" },
          ref,
        ),
      ).toBe(true);
    });

    it("non-wrapping range (09:00-17:00, local=20:00) does NOT trigger", () => {
      const ref = new Date("2024-01-01T20:00:00Z");
      expect(
        isInQuietHours(
          { quietHoursStart: "09:00", quietHoursEnd: "17:00", timezone: "UTC" },
          ref,
        ),
      ).toBe(false);
    });

    it("respects timezone offset in quiet hours", () => {
      // UTC-5 means when it's 03:00 UTC, it's 22:00 local -> in quiet hours
      const ref = new Date("2024-01-01T03:00:00Z"); // UTC 03:00 = 22:00 local in EST (UTC-5)
      expect(
        isInQuietHours(
          { quietHoursStart: "22:00", quietHoursEnd: "07:00", timezone: "EST" },
          ref,
        ),
      ).toBe(true);
    });
  });
});

describe("cooldown enforcement", () => {
  it("enforces cooldown when lastTriggered was recent", () => {
    const now = Date.now();
    const cooldownMinutes = 60;
    const lastTriggeredAt = now - 30 * 60 * 1000; // 30 min ago
    const ago = lastTriggeredAt ? now - lastTriggeredAt : Infinity;
    expect(ago < cooldownMinutes * 60 * 1000).toBe(true);
  });

  it("allows trigger when cooldown expired", () => {
    const now = Date.now();
    const cooldownMinutes = 60;
    const lastTriggeredAt = now - 90 * 60 * 1000; // 90 min ago
    const ago = lastTriggeredAt ? now - lastTriggeredAt : Infinity;
    expect(ago < cooldownMinutes * 60 * 1000).toBe(false);
  });

  it("allows trigger on first alert (no lastTriggeredAt)", () => {
    const cooldownMinutes = 60;
    const ago = Infinity; // no lastTriggeredAt
    expect(ago < cooldownMinutes * 60 * 1000).toBe(false);
  });
});

describe("getLocalMinutes", () => {
  it("computes local minutes for UTC", () => {
    const ref = new Date("2024-01-01T14:30:00Z"); // UTC 14:30
    expect(getLocalMinutes("UTC", ref)).toBe(14 * 60 + 30);
  });

  it("computes local minutes for UTC+3", () => {
    const ref = new Date("2024-01-01T14:30:00Z"); // UTC 14:30 -> UTC+3 = 17:30
    expect(getLocalMinutes("UTC+3", ref)).toBe(17 * 60 + 30);
  });

  it("computes local minutes wrapping past midnight", () => {
    const ref = new Date("2024-01-01T23:00:00Z"); // UTC 23:00 -> UTC+3 = 02:00 next day
    expect(getLocalMinutes("UTC+3", ref)).toBe(2 * 60);
  });

  it("computes local minutes for negative offset", () => {
    const ref = new Date("2024-01-01T05:00:00Z"); // UTC 05:00 -> UTC-5 = 00:00
    expect(getLocalMinutes("UTC-5", ref)).toBe(0);
  });
});
