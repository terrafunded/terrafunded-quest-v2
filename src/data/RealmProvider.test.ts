import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import raw from "@/domain/__fixtures__/payments.json";
import type { PaymentsSnapshot } from "@/domain";
import * as domain from "@/domain";
import { HorizonProvider } from "@/horizon/HorizonProvider";
import { REALM_QUERY_KEY, RealmProvider, useRealm } from "./RealmProvider";

vi.mock("./auth", () => ({
  useAuth: () => ({
    session: { user: { id: "quest-user" } },
    access: "granted",
    ready: true,
    configured: true,
    refusal: null,
    signIn: async () => null,
    signOut: async () => undefined,
  }),
}));

const fixture = raw as unknown as PaymentsSnapshot;
const fetchedAt = new Date("2026-09-11T00:00:00Z");

function Consumer() {
  const { data } = useRealm();
  return createElement("span", { "data-lots": data?.realm.lots.length ?? 0 });
}

function tree(client: QueryClient, consumers: number) {
  const kids: ReactNode[] = Array.from({ length: consumers }, (_, i) => createElement(Consumer, { key: i }));
  return createElement(
    QueryClientProvider,
    { client },
    createElement(HorizonProvider, null, createElement(RealmProvider, null, createElement("div", null, ...kids))),
  );
}

describe("RealmProvider", () => {
  it("calls buildRealm exactly once for a tree that mounts three useRealm consumers", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData([...REALM_QUERY_KEY, "quest-user"], {
      snapshot: fixture,
      tableErrors: [],
      fetchedAt,
    });
    const spy = vi.spyOn(domain, "buildRealm");
    const html = renderToString(tree(client, 3));
    expect(html).toContain('data-lots="121"');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
