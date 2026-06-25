export interface User {
  telegramId: number;
  timezone: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  summaryTime: string | null;
  defaultFiat: string;
  cooldownMinutes: number;
}

export interface WatchlistEntry {
  id: string;
  telegramId: number;
  coinId: string;
  ticker: string;
  displayName: string;
  enabled: boolean;
  createdAt: number;
}

export interface PriceThresholdAlert {
  id: string;
  telegramId: number;
  coinId: string;
  ticker: string;
  direction: "above" | "below";
  threshold: number;
  enabled: boolean;
  createdAt: number;
  lastTriggeredAt: number | null;
}

export interface PercentMoveRule {
  id: string;
  telegramId: number;
  coinId: string;
  ticker: string;
  percentage: number;
  timeframeMinutes: number;
  direction: "up" | "down" | "both";
  enabled: boolean;
  createdAt: number;
  lastTriggeredAt: number | null;
  basePrice: number | null;
  basePriceSetAt: number | null;
}

export interface AlertHistoryRecord {
  id: string;
  telegramId: number;
  alertType: "threshold" | "percent_move";
  coinId: string;
  ticker: string;
  oldPrice: number;
  newPrice: number;
  percentChange: number;
  timestamp: number;
}

export interface PriceData {
  price: number;
  change24h: number | null;
}
