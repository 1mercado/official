import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  rows: [] as unknown[][],
  deleted: vi.fn(),
  updated: vi.fn(),
  lock: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: () => ({ handler: (handler: unknown) => handler }),
    handler: (handler: unknown) => handler,
  }),
}));
vi.mock("./auth.server", () => ({ requireAdmin: state.requireAdmin }));
vi.mock("./members.server", () => ({ lockPlacement: state.lock }));
vi.mock("./engine.server", () => ({}));
vi.mock("./plan.server", () => ({}));
vi.mock("./codes.server", () => ({}));
vi.mock("../../db/index.js", () => {
  const tx = {
    execute: vi.fn(),
    select: () => ({
      from: () => ({
        where: () => {
          const rows = state.rows.shift() ?? [];
          return {
            for: async () => rows,
            limit: async () => rows,
          };
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: async () => state.deleted(table),
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: async () => state.updated(table, values),
      }),
    }),
  };
  return { db: { transaction: (fn: (value: unknown) => unknown) => fn(tx) } };
});

import { deleteMember } from "./admin.functions";
import { credits, groceryOrders, members } from "../../db/schema.js";

const member = { id: 9, username: "kaisa", parentId: 1, isAdmin: false };
const data = { id: member.id, username: member.username };
beforeEach(() => {
  vi.clearAllMocks();
  state.rows.length = 0;
  state.requireAdmin.mockResolvedValue({ id: 1 });
});

describe("administrator member deletion", () => {
  it("requires administrator access before touching member data", async () => {
    state.requireAdmin.mockRejectedValue(new Error("Forbidden"));
    await expect(deleteMember({ data })).rejects.toThrow("Forbidden");
    expect(state.lock).not.toHaveBeenCalled();
    expect(state.deleted).not.toHaveBeenCalled();
  });

  it.each([
    { ...member, isAdmin: true },
    { ...member, id: 1 },
    { ...member, parentId: null },
  ])(
    "protects administrator, self, and root accounts: %o",
    async (protectedMember) => {
      state.rows.push([protectedMember]);
      await expect(deleteMember({ data })).rejects.toThrow("cannot be deleted");
      expect(state.deleted).not.toHaveBeenCalled();
    },
  );

  it("requires the exact username", async () => {
    state.rows.push([member]);
    await expect(
      deleteMember({ data: { ...data, username: "wrong" } }),
    ).rejects.toThrow("exact username");
    expect(state.deleted).not.toHaveBeenCalled();
  });

  it("protects genealogy and referral relationships", async () => {
    state.rows.push([member], [{ id: 10 }]);
    await expect(deleteMember({ data })).rejects.toThrow("downline");
    expect(state.deleted).not.toHaveBeenCalled();
  });

  it("requires settlement of pending withdrawals", async () => {
    state.rows.push([member], [], [{ id: 22 }]);
    await expect(deleteMember({ data })).rejects.toThrow("pending withdrawals");
    expect(state.deleted).not.toHaveBeenCalled();
  });

  it.each(["pending", "confirmed"])(
    "protects %s grocery orders",
    async (status) => {
      state.rows.push([member], [], [], [{ status }]);
      await expect(deleteMember({ data })).rejects.toThrow(
        "Close grocery orders",
      );
      expect(state.deleted).not.toHaveBeenCalled();
    },
  );

  it("deletes an eligible account and closed orders while preserving other members' credits", async () => {
    state.rows.push(
      [member],
      [],
      [],
      [{ status: "fulfilled" }, { status: "cancelled" }],
    );
    await expect(deleteMember({ data })).resolves.toEqual({ deleted: true });
    expect(state.deleted.mock.calls.map(([table]) => table)).toEqual([
      groceryOrders,
      members,
    ]);
    expect(state.updated).toHaveBeenCalledWith(credits, {
      sourceMemberId: null,
    });
    expect(state.lock).toHaveBeenCalledOnce();
  });
});
