import { describe, expect, it, vi } from "vitest";
import { store } from "./liteStore";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";

describe("Lite Mode tenant isolation and memory bounds", () => {
  it("does not let another visitor read a session by ID", () => {
    const session = store.createSession(ownerA);
    store.addMessage(ownerA, session.id, "user", "private content");
    expect(store.getSession(ownerB, session.id)).toBeUndefined();
  });

  it("keeps uploaded documents private to their visitor", () => {
    store.addDocument(ownerA, "private.txt", "only owner A", "text/plain", 12);
    expect(store.getDocuments(ownerB)).toEqual([]);
    expect(store.getDocuments(ownerA).some((document) => document.title === "private.txt")).toBe(true);
  });

  it("persists citation excerpts with assistant answers", () => {
    const session = store.createSession(ownerA);
    const citation = { documentId: "doc-1", title: "policy.pdf", chunkIndex: 0, score: 0.9, excerpt: "The relevant policy passage." };
    store.addMessage(ownerA, session.id, "assistant", "See [1].", [citation]);
    expect(store.getSession(ownerA, session.id)?.messages[0].sources).toEqual([citation]);
  });

  it("expires inactive owner state after its retention period", () => {
    vi.useFakeTimers();
    try {
      const owner = "idle-owner-test";
      const session = store.createSession(owner);
      store.addDocument(owner, "temporary.txt", "temporary data", "text/plain", 14);
      vi.advanceTimersByTime(31 * 24 * 60 * 60 * 1_000 + 1);
      expect(store.getSession(owner, session.id)).toBeUndefined();
      expect(store.getDocuments(owner)).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("evicts the least recently used owner instead of growing its tenant map without limit", () => {
    const firstOwner = "bounded-owner-0";
    const firstSession = store.createSession(firstOwner);
    for (let index = 1; index <= 2_100; index += 1) store.createSession(`bounded-owner-${index}`);
    expect(store.getSession(firstOwner, firstSession.id)).toBeUndefined();
  });
});
