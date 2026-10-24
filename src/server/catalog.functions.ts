import { createServerFn } from "@tanstack/react-start";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { groceryOrders, groceryProducts, members } from "../../db/schema.js";
import { isSuperAdmin, requireAdmin, requireMember } from "./auth.server";

export const getCatalog = createServerFn({ method: "GET" }).handler(
  async () => {
    const member = await requireMember();
    const products = await db
      .select()
      .from(groceryProducts)
      .orderBy(groceryProducts.name);
    const orders = await db
      .select({ order: groceryOrders, name: members.fullName })
      .from(groceryOrders)
      .innerJoin(members, eq(groceryOrders.memberId, members.id))
      .where(
        isSuperAdmin(member)
          ? undefined
          : eq(groceryOrders.memberId, member.id),
      )
      .orderBy(desc(groceryOrders.createdAt));
    return {
      products,
      orders: orders.map(({ order, name }) => ({
        ...order,
        name,
        createdAt: order.createdAt.toISOString(),
      })),
    };
  },
);

export const saveProduct = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.number().int().positive().optional(),
      name: z.string().trim().min(2).max(100),
      description: z.string().trim().max(500),
      category: z.string().trim().min(1).max(60),
      unit: z.string().trim().min(1).max(40),
      priceCentavos: z.number().int().min(1).max(100000000),
      available: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const { id, ...values } = data;
    if (id)
      await db
        .update(groceryProducts)
        .set(values)
        .where(eq(groceryProducts.id, id));
    else await db.insert(groceryProducts).values(values);
    return { ok: true };
  });

export const placeGroceryOrder = createServerFn({ method: "POST" })
  .validator(
    z.object({
      requestKey: z.uuid(),
      items: z
        .array(
          z.object({
            id: z.number().int().positive(),
            quantity: z.number().int().min(1).max(100),
          }),
        )
        .min(1)
        .max(100),
      contact: z.string().trim().min(5).max(120),
      address: z.string().trim().min(10).max(500),
    }),
  )
  .handler(async ({ data }) => {
    const member = await requireMember();
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(groceryOrders)
        .where(eq(groceryOrders.requestKey, data.requestKey));
      if (existing) {
        if (existing.memberId !== member.id)
          throw new Error("Please refresh and try again");
        return { id: existing.id };
      }
      if (new Set(data.items.map((i) => i.id)).size !== data.items.length)
        throw new Error("Duplicate products in order");
      const products = await tx
        .select()
        .from(groceryProducts)
        .where(
          inArray(
            groceryProducts.id,
            data.items.map((i) => i.id),
          ),
        )
        .for("share");
      const items = data.items.map((item) => {
        const product = products.find((p) => p.id === item.id);
        if (!product?.available)
          throw new Error(
            "A product is no longer available. Refresh your cart.",
          );
        return {
          id: product.id,
          name: product.name,
          unit: product.unit,
          priceCentavos: product.priceCentavos,
          quantity: item.quantity,
        };
      });
      const totalCentavos = items.reduce(
        (sum, item) => sum + item.priceCentavos * item.quantity,
        0,
      );
      if (totalCentavos > 2000000000)
        throw new Error("Order total is too large");
      const [order] = await tx
        .insert(groceryOrders)
        .values({
          memberId: member.id,
          requestKey: data.requestKey,
          contact: data.contact,
          address: data.address,
          items: JSON.stringify(items),
          totalCentavos,
        })
        .onConflictDoNothing({ target: groceryOrders.requestKey })
        .returning();
      if (!order)
        throw new Error(
          "This order was already submitted. Refresh your order history.",
        );
      return { id: order.id };
    });
  });

export const reviewGroceryOrder = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.number().int().positive(),
      status: z.enum(["confirmed", "fulfilled", "cancelled"]),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(groceryOrders)
        .where(eq(groceryOrders.id, data.id))
        .for("update");
      if (!order) throw new Error("Order not found");
      if (order.status === "fulfilled" || order.status === "cancelled")
        throw new Error("This order is already closed");
      if (data.status === "fulfilled" && order.status !== "confirmed")
        throw new Error("Confirm the order before marking it fulfilled");
      await tx
        .update(groceryOrders)
        .set({ status: data.status })
        .where(eq(groceryOrders.id, data.id));
    });
    return { ok: true };
  });
