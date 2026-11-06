import { PDFParse } from "pdf-parse";
import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { store } from "../../../../lib/liteStore";
import { ensureLiteOwner, getLiteOwner, isSameOriginMutation } from "../../../../lib/liteIdentity";

export const runtime = "nodejs";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 2_000_000;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export async function GET(request: NextRequest) {
  const response = NextResponse.json({ docs: [] });
  const ownerId = ensureLiteOwner(request, response);
  return NextResponse.json({ docs: store.getDocuments(ownerId) }, { headers: response.headers });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  const ownerId = getLiteOwner(request);
  if (!ownerId) return NextResponse.json({ error: "Open Lite Mode before uploading." }, { status: 401 });
  const body = await request.json().catch(() => null) as { fileName?: unknown; contentBase64?: unknown } | null;
  if (!body || typeof body.fileName !== "string" || typeof body.contentBase64 !== "string") {
    return NextResponse.json({ error: "A filename and file contents are required." }, { status: 400 });
  }

  const fileName = path.basename(body.fileName).replace(/[\u0000-\u001f\\/]/g, "_").trim();
  const extension = fileName.split(".").pop()?.toLowerCase();
  const mimeType = extension === "pdf" ? "application/pdf" : extension === "md" ? "text/markdown" : extension === "txt" ? "text/plain" : null;
  if (!fileName || !mimeType) return NextResponse.json({ error: "Only PDF, TXT, and Markdown files are supported." }, { status: 400 });
  if (body.contentBase64.length > Math.ceil(MAX_BYTES * 4 / 3) + 4 || !BASE64.test(body.contentBase64)) {
    return NextResponse.json({ error: "File data is invalid or exceeds the 10 MB limit." }, { status: 413 });
  }
  const bytes = Buffer.from(body.contentBase64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_BYTES || bytes.toString("base64") !== body.contentBase64) {
    return NextResponse.json({ error: "File data is invalid or exceeds the 10 MB limit." }, { status: 413 });
  }

  let content: string;
  if (mimeType === "application/pdf") {
    const parser = new PDFParse({ data: bytes });
    try { content = (await parser.getText()).text; }
    catch { return NextResponse.json({ error: "Could not extract text from this PDF. Password-protected or image-only files are not supported." }, { status: 422 }); }
    finally { await parser.destroy(); }
  } else {
    content = bytes.toString("utf8").replace(/\u0000/g, "");
  }
  if (content.length > MAX_TEXT_CHARS) return NextResponse.json({ error: "Extracted document text exceeds the 2,000,000 character limit." }, { status: 413 });
  if (!content.trim()) return NextResponse.json({ error: "No readable text was found in this document." }, { status: 422 });

  try {
    const document = store.addDocument(ownerId, fileName, content, mimeType, bytes.length);
    return NextResponse.json({ document: { id: document.id, title: document.title, size: document.size } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not store this document." }, { status: 413 });
  }
}
