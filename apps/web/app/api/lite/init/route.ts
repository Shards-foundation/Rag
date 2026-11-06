import { NextRequest, NextResponse } from "next/server";
import { store } from "../../../../lib/liteStore";
import { ensureLiteOwner, isSameOriginMutation } from "../../../../lib/liteIdentity";

export async function GET(request: NextRequest) {
  const response = NextResponse.json({ sessions: [] });
  const ownerId = ensureLiteOwner(request, response);
  return NextResponse.json({ sessions: store.getSessions(ownerId) }, { headers: response.headers });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  const response = NextResponse.json({});
  const ownerId = ensureLiteOwner(request, response);
  const session = store.createSession(ownerId);
  return NextResponse.json({ session }, { headers: response.headers });
}
