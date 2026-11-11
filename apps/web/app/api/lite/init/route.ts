import { NextRequest, NextResponse } from "next/server";
import { store } from "../../../../lib/liteStore";
import { ensureLiteOwner, isLiteModeEnabled, isSameOriginMutation } from "../../../../lib/liteIdentity";

export async function GET(request: NextRequest) {
  if (!isLiteModeEnabled()) return NextResponse.json({ error: "Lite Mode is disabled on this deployment." }, { status: 404 });
  try {
    const response = NextResponse.json({ sessions: [] });
    const ownerId = ensureLiteOwner(request, response);
    return NextResponse.json({ sessions: store.getSessions(ownerId) }, { headers: response.headers });
  } catch {
    return NextResponse.json({ error: "Lite Mode visitor capacity reached." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!isLiteModeEnabled()) return NextResponse.json({ error: "Lite Mode is disabled on this deployment." }, { status: 404 });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  try {
    const response = NextResponse.json({});
    const ownerId = ensureLiteOwner(request, response);
    const session = store.createSession(ownerId);
    return NextResponse.json({ session }, { headers: response.headers });
  } catch {
    return NextResponse.json({ error: "Lite Mode visitor capacity reached." }, { status: 503 });
  }
}
