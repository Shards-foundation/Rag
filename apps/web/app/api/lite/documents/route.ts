import { NextResponse } from 'next/server';
import { store } from '@/lib/liteStore';

export async function GET() {
    return NextResponse.json({ docs: store.getDocuments() });
}