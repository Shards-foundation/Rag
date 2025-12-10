import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/liteStore';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    const session = store.getSession(id);
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ messages: session.messages });
}