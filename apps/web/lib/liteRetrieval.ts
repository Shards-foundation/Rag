export type LitePassage = { id: string; title: string; content: string; score: number };

const STOP_WORDS = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "i", "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "was", "what", "when", "where", "which", "who", "why", "with"]);

function terms(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]{2,}/g)?.filter((term) => !STOP_WORDS.has(term)) ?? [];
}

export function retrieveLitePassages(query: string, documents: Array<{ id: string; title: string; content: string }>, limit = 3): LitePassage[] {
  const queryTerms = terms(query);
  if (queryTerms.length === 0 || limit < 1) return [];
  return documents
    .flatMap((document) => {
      const chunks: string[] = [];
      for (let offset = 0; offset < document.content.length; offset += 900) {
        chunks.push(document.content.slice(offset, offset + 1000));
      }
      return chunks.map((content, index) => {
        const normalized = content.toLowerCase();
        const title = document.title.toLowerCase();
        const score = queryTerms.reduce((sum, term) => sum + (normalized.includes(term) ? 1 : 0) + (title.includes(term) ? 0.5 : 0), 0) / queryTerms.length;
        return { id: `${document.id}:${index}`, title: document.title, content, score };
      });
    })
    .filter((passage) => passage.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}
