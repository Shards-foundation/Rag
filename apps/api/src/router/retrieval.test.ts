import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RetrievalChunk } from "@lumina/ai";

const mocks = vi.hoisted(() => ({ listOrganizationChunkPage: vi.fn() }));
vi.mock("@lumina/db", () => ({ listOrganizationChunkPage: mocks.listOrganizationChunkPage }));
vi.mock("@lumina/config", () => ({ CONSTANTS: { DEFAULT_TOP_K: 5 } }));

import { retrieveOrganizationPassages, RetrievalCapacityError } from "./retrieval";

function chunk(index: number, embedding: number[], documentId = "doc-1"): RetrievalChunk {
  return { id: `chunk-${index}`, documentId, documentTitle: "Document", index, content: `Passage ${index}`, embedding };
}
const page = (start: number, count: number, embedding = [0, 1]) =>
  Array.from({ length: count }, (_, i) => chunk(start + i, embedding));

describe("bounded tenant-scoped vector retrieval", () => {
  beforeEach(() => vi.clearAllMocks());

  it("finds the best matching passage across database pages", async () => {
    mocks.listOrganizationChunkPage.mockResolvedValueOnce(page(0, 128))
      .mockResolvedValueOnce([chunk(128, [1, 0])]);
    const hits = await retrieveOrganizationPassages("org-a", [1, 0], 3);
    expect(hits.map(({ id }) => id)).toEqual(["chunk-128"]);
    expect(mocks.listOrganizationChunkPage).toHaveBeenNthCalledWith(1, "org-a", null, 128);
    expect(mocks.listOrganizationChunkPage).toHaveBeenNthCalledWith(2, "org-a", { documentId: "doc-1", index: 127 }, 128);
  });

  it("refuses an oversized corpus rather than silently ignoring the remaining chunks", async () => {
    mocks.listOrganizationChunkPage.mockImplementation(async (_org, cursor, limit) => {
      const start = cursor ? cursor.index + 1 : 0;
      return page(start, Math.min(limit, Math.max(0, 2049 - start)));
    });
    await expect(retrieveOrganizationPassages("org-a", [1, 0], 5)).rejects.toBeInstanceOf(RetrievalCapacityError);
    expect(mocks.listOrganizationChunkPage).toHaveBeenCalledTimes(17);
  });

  it("allows a corpus of exactly 2048 chunks with a final emptiness check", async () => {
    mocks.listOrganizationChunkPage.mockImplementation(async (_org, cursor, limit) => {
      const start = cursor ? cursor.index + 1 : 0;
      return page(start, Math.min(limit, Math.max(0, 2048 - start)), [1, 0]);
    });
    const hits = await retrieveOrganizationPassages("org-a", [1, 0], 5);
    expect(hits).toHaveLength(5);
    expect(mocks.listOrganizationChunkPage).toHaveBeenCalledTimes(17);
  });

  it("rejects missing authorization scope and malformed query embeddings", async () => {
    await expect(retrieveOrganizationPassages("", [1, 0])).rejects.toThrow("authenticated organization");
    await expect(retrieveOrganizationPassages("org-a", [Number.NaN])).rejects.toThrow("finite query embedding");
    await expect(retrieveOrganizationPassages("org-a", [1, 0], 21)).rejects.toThrow("topK");
    expect(mocks.listOrganizationChunkPage).not.toHaveBeenCalled();
  });
});
