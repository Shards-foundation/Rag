import { describe, it, expect } from 'vitest';
import { SimpleFileVectorStore } from './index';
import { vi } from 'vitest';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal() as typeof import('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

describe('SimpleFileVectorStore', () => {
  it('should calculate cosine similarity correctly', async () => {
    const store = new SimpleFileVectorStore();
    
    // Access private method via any for testing logic
    const similarity = (store as any).cosineSimilarity([1, 0], [1, 0]);
    expect(similarity).toBeCloseTo(1);

    const orthogonality = (store as any).cosineSimilarity([1, 0], [0, 1]);
    expect(orthogonality).toBeCloseTo(0);
    
    const opposition = (store as any).cosineSimilarity([1, 0], [-1, 0]);
    expect(opposition).toBeCloseTo(-1);
  });
});