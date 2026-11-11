import { describe, expect, it } from "vitest";
import { retrieveLitePassages } from "./liteRetrieval";

const documents = [
  { id: "one", title: "Returns policy", content: "Customers may return an unused item within thirty days with proof of purchase." },
  { id: "two", title: "Privacy", content: "Personal data is encrypted in transit and deleted on account closure." },
];

describe("Lite Mode document retrieval", () => {
  it("returns a matching passage rather than a fabricated answer", () => {
    expect(retrieveLitePassages("How long do I have to return an item?", documents)[0].id).toMatch(/^one:/);
  });

  it("returns no sources when the query is unrelated", () => {
    expect(retrieveLitePassages("quarterly revenue projection", documents)).toEqual([]);
  });

  it("handles stop-word-only and empty queries", () => {
    expect(retrieveLitePassages("what is this", documents)).toEqual([]);
    expect(retrieveLitePassages("", documents)).toEqual([]);
  });
});
