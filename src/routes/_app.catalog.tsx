import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ShoppingBasket, Search, Package, Plus, Minus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/hooks/use-session";
import { errorMessage } from "@/lib/utils";
import { productImage } from "@/lib/product-images";
import { formatDateTime } from "@/lib/plan";
import {
  getCatalog,
  saveProduct,
  placeGroceryOrder,
  reviewGroceryOrder,
} from "@/server/catalog.functions";

export const Route = createFileRoute("/_app/catalog")({
  loader: () => getCatalog(),
  head: () => ({ meta: [{ title: "Grocery Shopping · 1MERCADO" }] }),
  component: Catalog,
});
const money = (centavos: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    centavos / 100,
  );
type Product = Awaited<ReturnType<typeof getCatalog>>["products"][number];

function Catalog() {
  const { products, orders } = Route.useLoaderData();
  const { member } = useSession();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const visible = products.filter(
    (p) =>
      (category === "all" || p.category === category) &&
      `${p.name} ${p.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  const cartItems = products.filter((p) => cart[p.id] > 0);
  const total = cartItems.reduce(
    (sum, p) => sum + p.priceCentavos * cart[p.id],
    0,
  );
  function changeCart(id: number, quantity: number) {
    setCart((prev) => ({
      ...prev,
      [id]: Math.max(0, Math.min(100, quantity)),
    }));
    setRequestKey(null);
  }
  async function run(task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
      await router.invalidate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  function submitProduct(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    void run(async () => {
      await saveProduct({
        data: {
          id: editing?.id,
          name: String(data.get("name")),
          description: String(data.get("description")),
          category: String(data.get("category")),
          unit: String(data.get("unit")),
          priceCentavos: Math.round(Number(data.get("price")) * 100),
          available: data.get("available") === "on",
        },
      });
      setEditing(null);
      form.reset();
      toast.success("Product saved");
    });
  }
  function checkout(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const key = requestKey ?? crypto.randomUUID();
    setRequestKey(key);
    void run(async () => {
      const order = await placeGroceryOrder({
        data: {
          requestKey: key,
          items: cartItems.map((p) => ({ id: p.id, quantity: cart[p.id] })),
          contact: String(data.get("contact")),
          address: String(data.get("address")),
        },
      });
      setCart({});
      setRequestKey(null);
      form.reset();
      setNotice(
        `Order #${order.id} submitted. The team contacts you to confirm availability, payment, and fulfillment.`,
      );
      toast.success(`Order #${order.id} submitted`);
    });
  }
  return (
    <>
      <PageHeader
        title="Grocery Shopping"
        subtitle="Everyday essentials, right here in your membership."
      />
      <section className="mb-6 flex items-center gap-5 rounded-3xl bg-brand-gradient p-6 text-primary-foreground sm:p-8">
        <ShoppingBasket className="size-12 shrink-0" aria-hidden="true" />
        <div>
          <h2 className="font-display text-xl font-bold">
            Your next grocery run starts here.
          </h2>
          <p className="mt-1 text-sm opacity-90">
            Choose your essentials and submit an order for confirmation. Payment
            and fulfillment are arranged with the team after review.
          </p>
        </div>
      </section>
      {notice && (
        <p
          role="status"
          className="surface-card mb-6 border border-primary/30 p-4 text-sm"
        >
          {notice}
        </p>
      )}
      {member.isAdmin && (
        <details
          className="surface-card mb-6 p-5"
          open={editing !== null || products.length === 0}
        >
          <summary className="cursor-pointer font-display font-bold">
            Manage grocery products
          </summary>
          <p className="mt-2 text-sm text-muted-foreground">
            Add real products and prices to open your catalog. Mark a product
            unavailable to stop new orders.
          </p>
          <form
            key={editing?.id ?? "new"}
            onSubmit={submitProduct}
            className="mt-4 grid gap-4 sm:grid-cols-2"
          >
            <div className="space-y-2">
              <Label htmlFor="product-name">Product name</Label>
              <Input
                id="product-name"
                name="name"
                required
                minLength={2}
                maxLength={100}
                defaultValue={editing?.name}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-category">Category</Label>
              <Input
                id="product-category"
                name="category"
                required
                maxLength={60}
                placeholder="e.g. Pantry essentials"
                defaultValue={editing?.category}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-unit">Pack / unit</Label>
              <Input
                id="product-unit"
                name="unit"
                required
                maxLength={40}
                placeholder="e.g. 5 kg bag"
                defaultValue={editing?.unit}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-price">Price (₱)</Label>
              <Input
                id="product-price"
                name="price"
                type="number"
                required
                min="0.01"
                max="1000000"
                step="0.01"
                defaultValue={editing ? editing.priceCentavos / 100 : undefined}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="product-description">Description</Label>
              <Input
                id="product-description"
                name="description"
                maxLength={500}
                defaultValue={editing?.description}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="available"
                defaultChecked={editing?.available ?? true}
              />
              Available to order
            </label>
            <div className="flex gap-2 sm:justify-end">
              <Button disabled={busy} type="submit">
                {busy ? "Saving…" : editing ? "Save changes" : "Add product"}
              </Button>
              {editing && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(null)}
                >
                  Cancel edit
                </Button>
              )}
            </div>
          </form>
        </details>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[1fr_20rem]">
        <section aria-label="Products" className="space-y-5">
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-48 flex-1">
              <Search className="absolute top-3 left-3 size-4 text-muted-foreground" />
              <Input
                aria-label="Search groceries"
                placeholder="Search groceries"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              aria-label="Product category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="all">All categories</option>
              {[...new Set(products.map((p) => p.category))].sort().map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          {!visible.length ? (
            <div className="surface-card p-10 text-center">
              <Package className="mx-auto mb-4 size-10 text-primary" />
              <h2 className="font-display font-bold">
                {products.length
                  ? "No matching groceries"
                  : "The shelves are getting ready"}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {products.length
                  ? "Try another search or category."
                  : member.isAdmin
                    ? "Add your first product above to start accepting orders."
                    : "Products appear here once the team adds them. Check back soon."}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {visible.map((p) => (
                <article className="surface-card flex flex-col p-5" key={p.id}>
                  <div className="mb-5 flex items-center justify-between">
                    {productImage(p.name) ? (
                      <img
                        src={productImage(p.name)!}
                        alt={`${p.name} illustration`}
                        width={80}
                        height={80}
                        loading="lazy"
                        className="size-20 rounded-2xl object-contain"
                      />
                    ) : (
                      <span
                        className="grid size-20 place-items-center rounded-2xl bg-secondary text-primary"
                        aria-label="Product image unavailable"
                      >
                        <Package />
                      </span>
                    )}
                    <Badge variant={p.available ? "success" : "secondary"}>
                      {p.available ? "Available" : "Unavailable"}
                    </Badge>
                  </div>
                  <p className="text-xs font-bold tracking-wide text-primary uppercase">
                    {p.category}
                  </p>
                  <h3 className="mt-1 font-display text-lg font-bold">
                    {p.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">{p.unit}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {p.description}
                  </p>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5">
                    <strong className="text-lg">
                      {money(p.priceCentavos)}
                    </strong>
                    <Button
                      disabled={
                        !p.available || busy || (cart[p.id] ?? 0) >= 100
                      }
                      size="sm"
                      onClick={() => changeCart(p.id, (cart[p.id] ?? 0) + 1)}
                    >
                      <Plus />
                      Add
                    </Button>
                  </div>
                  {member.isAdmin && (
                    <Button
                      className="mt-3"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(p);
                        window.scrollTo({ top: 0, behavior: "instant" });
                      }}
                    >
                      Edit product
                    </Button>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
        <section className="surface-card p-5" aria-label="Your basket">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <ShoppingBasket className="size-5 text-primary" />
            Your basket
          </h2>
          {!cartItems.length ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Add groceries to get started.
            </p>
          ) : (
            <form onSubmit={checkout} className="mt-4 space-y-4">
              {cartItems.map((p) => (
                <div
                  key={p.id}
                  className="space-y-2 border-b border-border pb-3"
                >
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="font-bold">{p.name}</span>
                    <span>{money(p.priceCentavos * cart[p.id])}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      disabled={busy}
                      aria-label={`Remove one ${p.name}`}
                      onClick={() => changeCart(p.id, cart[p.id] - 1)}
                    >
                      <Minus />
                    </Button>
                    <span aria-label="Quantity">{cart[p.id]}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      disabled={busy || cart[p.id] >= 100 || !p.available}
                      aria-label={`Add one ${p.name}`}
                      onClick={() => changeCart(p.id, cart[p.id] + 1)}
                    >
                      <Plus />
                    </Button>
                  </div>
                  {!p.available && (
                    <p className="text-sm text-destructive">
                      Unavailable — remove to continue.
                    </p>
                  )}
                </div>
              ))}
              <div className="flex justify-between font-bold">
                <span>Product total</span>
                <span>{money(total)}</span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="order-contact">Contact number</Label>
                <Input
                  id="order-contact"
                  name="contact"
                  type="tel"
                  required
                  minLength={5}
                  maxLength={120}
                  defaultValue={member.mobile}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="order-address">
                  Delivery address / pickup request
                </Label>
                <Input
                  id="order-address"
                  name="address"
                  required
                  minLength={10}
                  maxLength={500}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                The team confirms availability, any delivery fees, payment
                details, and fulfillment before proceeding. No wallet deduction
                is made.
              </p>
              <Button
                className="w-full"
                variant="hero"
                type="submit"
                disabled={busy || cartItems.some((p) => !p.available)}
              >
                {busy ? "Submitting…" : "Submit order"}
              </Button>
            </form>
          )}
        </section>
      </div>
      <section className="surface-card mt-8 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">
            {member.isAdmin ? "Customer orders" : "Your orders"}
          </h2>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void run(async () => {})}
          >
            Refresh
          </Button>
        </div>
        {!orders.length ? (
          <p className="mt-4 text-sm text-muted-foreground">No orders yet.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {orders.map((o) => (
              <article
                key={o.id}
                className="rounded-2xl border border-border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold">
                    Order #{o.id} · {money(o.totalCentavos)}
                  </h3>
                  <Badge className="capitalize">{o.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDateTime(o.createdAt)}
                  {member.isAdmin ? ` · ${o.name}` : ""}
                </p>
                <ul className="mt-3 space-y-1 text-sm">
                  {(
                    JSON.parse(o.items) as {
                      id: number;
                      name: string;
                      unit: string;
                      quantity: number;
                      priceCentavos: number;
                    }[]
                  ).map((i) => (
                    <li key={i.id}>
                      {i.quantity} × {i.name} ({i.unit}) ·{" "}
                      {money(i.quantity * i.priceCentavos)}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm">
                  {o.contact} · {o.address}
                </p>
                {member.isAdmin &&
                  (o.status === "pending" || o.status === "confirmed") && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(o.status === "pending"
                        ? (["confirmed", "cancelled"] as const)
                        : (["fulfilled", "cancelled"] as const)
                      ).map((status) => (
                        <Button
                          key={status}
                          disabled={busy}
                          variant={
                            status === "cancelled" ? "outline" : "default"
                          }
                          size="sm"
                          onClick={() =>
                            void run(async () => {
                              await reviewGroceryOrder({
                                data: { id: o.id, status },
                              });
                              toast.success("Order updated");
                            })
                          }
                        >
                          {status === "confirmed"
                            ? "Confirm order"
                            : status === "fulfilled"
                              ? "Mark fulfilled"
                              : "Cancel order"}
                        </Button>
                      ))}
                    </div>
                  )}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
