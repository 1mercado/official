import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  requireMember: vi.fn(),
  results: [] as unknown[][],
  inserted: vi.fn(),
  updated: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: () => ({ handler: (handler: unknown) => handler }),
    handler: (handler: unknown) => handler,
  }),
}));
vi.mock("./auth.server", () => ({
  requireAdmin: state.requireAdmin,
  requireMember: state.requireMember,
  isSuperAdmin: () => false,
}));
vi.mock("../../db/index.js", () => {
  const tx = {
    select: () => ({
      from: () => ({
        where: () => {
          const rows = state.results.shift() ?? [];
          return Object.assign(Promise.resolve(rows), {
            for: () => Promise.resolve(rows),
          });
        },
      }),
    }),
    insert: () => ({
      values: (values: unknown) => {
        state.inserted(values);
        return {
          onConflictDoNothing: () => ({ returning: async () => [{ id: 42 }] }),
        };
      },
    }),
    update: () => ({
      set: (values: unknown) => {
        state.updated(values);
        return { where: async () => undefined };
      },
    }),
  };
  return {
    db: { ...tx, transaction: (fn: (value: unknown) => unknown) => fn(tx) },
  };
});
import {
  placeGroceryOrder,
  reviewGroceryOrder,
  saveProduct,
} from "./catalog.functions";
const input = {
  requestKey: "a1234567-1234-4234-8234-123456789abc",
  items: [{ id: 1, quantity: 3 }],
  contact: "09171234567",
  address: "Pickup at member center",
};
beforeEach(() => {
  vi.clearAllMocks();
  state.results.length = 0;
  state.requireMember.mockResolvedValue({ id: 7 });
  state.requireAdmin.mockResolvedValue({ id: 1 });
});
describe("grocery orders", () => {
  it("uses database prices and snapshots products instead of trusting client totals", async () => {
    state.results.push(
      [],
      [
        {
          id: 1,
          name: "Rice",
          unit: "1 kg",
          priceCentavos: 6250,
          available: true,
        },
      ],
    );
    await expect(placeGroceryOrder({ data: input })).resolves.toEqual({
      id: 42,
    });
    expect(state.inserted).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId: 7,
        totalCentavos: 18750,
        items: JSON.stringify([
          {
            id: 1,
            name: "Rice",
            unit: "1 kg",
            priceCentavos: 6250,
            quantity: 3,
          },
        ]),
      }),
    );
  });
  it("rejects unavailable products", async () => {
    state.results.push([], [{ id: 1, available: false }]);
    await expect(placeGroceryOrder({ data: input })).rejects.toThrow(
      "no longer available",
    );
    expect(state.inserted).not.toHaveBeenCalled();
  });
  it("returns an existing order when the same member retries", async () => {
    state.results.push([{ id: 12, memberId: 7 }]);
    await expect(placeGroceryOrder({ data: input })).resolves.toEqual({
      id: 12,
    });
    expect(state.inserted).not.toHaveBeenCalled();
  });
  it("rejects fulfilling an unconfirmed order", async () => {
    state.results.push([{ id: 1, status: "pending" }]);
    await expect(
      reviewGroceryOrder({ data: { id: 1, status: "fulfilled" } }),
    ).rejects.toThrow("Confirm the order");
    expect(state.updated).not.toHaveBeenCalled();
  });
  it("requires admin authorization to modify products", async () => {
    state.requireAdmin.mockRejectedValue(
      new Error("Super admin access required"),
    );
    await expect(
      saveProduct({
        data: {
          name: "Rice",
          description: "",
          category: "Pantry",
          unit: "1 kg",
          priceCentavos: 6250,
          available: true,
        },
      }),
    ).rejects.toThrow("Super admin access required");
    expect(state.inserted).not.toHaveBeenCalled();
  });
});
