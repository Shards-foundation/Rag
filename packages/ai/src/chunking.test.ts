import { describe, it, expect } from 'vitest';
import { chunkText } from './index';

describe('chunkText', () => {
  it('should split text into chunks of given size', () => {
    const text = "1234567890";
    const chunks = chunkText(text, 5, 0);
    expect(chunks).toEqual(["12345", "67890"]);
  });

  it('should handle overlap', () => {
    const text = "1234567890";
    const chunks = chunkText(text, 5, 2);
    // 0-5: 12345
    // 3-8: 45678
    // 6-11: 7890
    expect(chunks).toEqual(["12345", "45678", "7890"]);
  });

  it('should handle text smaller than chunk size', () => {
    const text = "abc";
    const chunks = chunkText(text, 10, 0);
    expect(chunks).toEqual(["abc"]);
  });
});