import { OpenAI } from "openai";
import { env, CONSTANTS } from "@lumina/config";
import * as fs from "fs";
import * as path from "path";

// --- Vector Store Interface & Implementation ---

export interface VectorChunk {
  id: string;
  vector: number[];
  metadata: {
    documentId: string;
    organizationId: string;
    content: string;
  };
}

export interface IVectorStore {
  upsertMany(chunks: VectorChunk[]): Promise<void>;
  query(vector: number[], topK: number, filter: { organizationId: string }): Promise<VectorChunk[]>;
}

// Simple File-based Vector Store
export class SimpleFileVectorStore implements IVectorStore {
  private filePath: string;

  constructor() {
    this.filePath = path.resolve(CONSTANTS.VECTOR_STORE_FILE_PATH);
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  private load(): VectorChunk[] {
    if (!fs.existsSync(this.filePath)) return [];
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
    } catch {
      return [];
    }
  }

  private save(chunks: VectorChunk[]) {
    fs.writeFileSync(this.filePath, JSON.stringify(chunks, null, 2));
  }

  async upsertMany(newChunks: VectorChunk[]): Promise<void> {
    const current = this.load();
    const updated = [...current, ...newChunks];
    this.save(updated);
  }

  async query(vector: number[], topK: number, filter: { organizationId: string }): Promise<VectorChunk[]> {
    const all = this.load();
    const filtered = all.filter(c => c.metadata.organizationId === filter.organizationId);
    
    const scored = filtered.map(chunk => ({
      chunk,
      score: this.cosineSimilarity(vector, chunk.vector)
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map(s => s.chunk);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
    const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
    return magA && magB ? dot / (magA * magB) : 0;
  }
}

export const vectorStore = new SimpleFileVectorStore();

// --- LLM & Embedding ---

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY || "sk-dummy" });

export async function embedText(text: string): Promise<number[]> {
  if (!env.OPENAI_API_KEY) {
    const seed = text.length;
    return new Array(1536).fill(0).map((_, i) => Math.sin(seed + i));
  }
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text.replace(/\n/g, " "),
  });
  return res.data[0].embedding;
}

// --- UTILITIES ---

export function chunkText(text: string, size: number, overlap: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += (size - overlap)) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

export async function* generateAnswerStream(
  question: string,
  contextChunks: { content: string }[],
  history: { role: 'user' | 'assistant', content: string }[]
): AsyncGenerator<string, void, unknown> {
  
  const contextText = contextChunks.map(c => c.content).join("\n---\n");
  const systemPrompt = `You are Lumina, an intelligent enterprise assistant. 
  Answer the user's question based ONLY on the following context. 
  If the answer is not in the context, say "I don't have enough information in the provided documents."
  
  CONTEXT:
  ${contextText}`;

  if (!env.OPENAI_API_KEY) {
    yield "Lumina (Dev Mode): Simulating response.\n\n";
    yield `Found ${contextChunks.length} relevant chunks.\n`;
    yield "No valid OpenAI API key provided in .env";
    return;
  }

  const stream = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "system", content: systemPrompt },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: "user", content: question }
    ],
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    if (content) yield content;
  }
}