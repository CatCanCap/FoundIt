// GET /api/stats/hotspots run through the real app with supertest. Most model
// functions it uses are swapped for small in-memory copies; Match.findByIds runs
// for real against a fake matches table that, like Supabase, never sends back
// more than 1000 rows. Every other table throws, so this file never touches the
// shared test database.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

process.env.JWT_SECRET = process.env.JWT_SECRET || "unit-test-secret";
const supabase = require("../../lib/db");
const request = require("supertest");
const app = require("../../app");
const Item = require("../../models/item-model");
const Spot = require("../../models/spot-model");
const Handoff = require("../../models/handoff-model");

const HOUR = 60 * 60 * 1000;
const createdAt = new Date(Date.now() - 2 * 24 * HOUR).toISOString();
const completedAt = new Date(Date.now() - 24 * HOUR).toISOString();

// 1,200 completed handoffs, one per match. The only resolved item is found
// item 1, returned through match 1200: past the first 1000 rows.
const HANDOFFS = 1200;
const handoffs = Array.from({ length: HANDOFFS }, (_, i) => ({
  id: i + 1,
  matchId: i + 1,
  status: "completed",
  completedAt,
}));
const matches = handoffs.map((h) => ({
  id: h.matchId,
  found_item_id: h.matchId === HANDOFFS ? 1 : 5000 + h.matchId,
  lost_item_id: 10000 + h.matchId,
  created_at: createdAt,
}));

const batchSizes = [];
// The filters the route last passed to Item.findAll
let lastFilters = null;
const saved = {};
const originalFrom = supabase.from;
const originalRpc = supabase.rpc;

beforeAll(() => {
  // Only the matches table answers, and only to select().in('id', ids)
  supabase.from = (table) => {
    if (table !== "matches")
      throw new Error("The database must not be used in unit tests");
    return {
      select: () => ({
        in: async (column, ids) => {
          batchSizes.push(ids.length);
          const wanted = new Set(ids.map(Number));
          return {
            data: matches.filter((m) => wanted.has(m.id)).slice(0, 1000),
            error: null,
          };
        },
      }),
    };
  };
  supabase.rpc = () => {
    throw new Error("The database must not be used in unit tests");
  };
  Object.assign(saved, {
    findAll: Item.findAll,
    spots: Spot.findAll,
    findCompleted: Handoff.findCompleted,
  });
  // Three finds at SCIS 1, so the figures for finds are not hidden (it takes
  // 3); find 1 is the resolved one
  Item.findAll = async (filters) => {
    lastFilters = filters;
    return [1, 2, 3].map((id) => ({
      id,
      type: filters.type,
      status: id === 1 ? "resolved" : "open",
      category: "Laptop",
      createdAt,
      trail: [{ spotId: 1, from: createdAt, to: createdAt }],
    }));
  };
  Spot.findAll = async () => [{ id: 1, building: "SCIS 1" }];
  Handoff.findCompleted = async () => handoffs;
});

afterAll(() => {
  supabase.from = originalFrom;
  supabase.rpc = originalRpc;
  Item.findAll = saved.findAll;
  Spot.findAll = saved.spots;
  Handoff.findCompleted = saved.findCompleted;
});

describe("GET /api/stats/hotspots", () => {
  it("still finds a return time when there are more than 1000 completed handoffs", async () => {
    const res = await request(app).get("/api/stats/hotspots");
    expect(res.status).toBe(200);
    expect(res.body.buildings[0]).toMatchObject({
      resolved: 1,
      medianReturnHours: 24,
    });
    expect(batchSizes.every((size) => size <= 500)).toBe(true);
    expect(batchSizes.reduce((sum, size) => sum + size, 0)).toBe(HANDOFFS);
  });

  it("asks the database for every category picked, not just one", async () => {
    const res = await request(app).get(
      "/api/stats/hotspots?type=lost&category=Laptop,Phone",
    );
    expect(res.status).toBe(200);
    expect(lastFilters.category).toEqual(["Laptop", "Phone"]);
    await request(app).get("/api/stats/hotspots?type=lost");
    expect(lastFilters.category).toBeUndefined();
  });

  it("keeps finds to 7 days in every category, so no one find can be singled out", async () => {
    const res = await request(app).get(
      "/api/stats/hotspots?type=found&days=1&category=Laptop",
    );
    expect(res.status).toBe(200);
    expect(lastFilters.category).toBeUndefined();
    const daysBack = (Date.now() - lastFilters.from.getTime()) / (24 * HOUR);
    expect(Math.round(daysBack)).toBe(7);
    // Lost reports still take both
    await request(app).get("/api/stats/hotspots?type=lost&days=3");
    expect(Math.round((Date.now() - lastFilters.from.getTime()) / (24 * HOUR))).toBe(3);
  });
});
