import { NextRequest, NextResponse } from "next/server";
import { store } from "../../../../lib/liteStore";
import { getLiteOwner } from "../../../../lib/liteIdentity";

export async function GET(request: NextRequest) {
  const ownerId = getLiteOwner(request);
  if (!ownerId) return NextResponse.json({ error: "Lite Mode session is not initialized." }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing session ID." }, { status: 400 });
  const session = store.getSession(ownerId, id);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  return NextResponse.json({ messages: session.messages });
}
