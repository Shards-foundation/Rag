import { describe, expect, it } from "vitest";
import { cosineSimilarity, rankChunks, type RetrievalChunk } from "./index";

const chunk = (id: string, embedding: number[] | null): RetrievalChunk => ({
  id,
  documentId: `doc-${id}`,
  documentTitle: `Document ${id}`,
  index: 0,
  content: `content ${id}`,
  embedding,
});

describe("vector retrieval", () => {
  it("computes cosine similarity for identical, orthogonal, and opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("ranks persisted embeddings by relevance and respects topK", () => {
    const results = rankChunks([1, 0], [chunk("orthogonal", [0, 1]), chunk("match", [1, 0]), chunk("near", [0.8, 0.2])], 2);
    expect(results.map((item) => item.id)).toEqual(["match", "near"]);
    expect(results[0].score).toBeCloseTo(1);
  });

  it("ignores absent, malformed, or wrong-dimension embeddings", () => {
    expect(rankChunks([1, 0], [chunk("none", null), chunk("wrong", [1]), chunk("nan", [Number.NaN, 1])])).toEqual([]);
  });

  it("rejects non-positive topK", () => {
    expect(() => rankChunks([1], [], 0)).toThrow(RangeError);
  });
});
