import { NextResponse } from 'next/server';
import { store } from '@/lib/liteStore';

export async function GET() {
    return NextResponse.json({ sessions: store.getSessions() });
}

export async function POST() {
    const session = store.createSession();
    return NextResponse.json({ session });
}