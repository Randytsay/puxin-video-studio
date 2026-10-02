import { NextRequest, NextResponse } from 'next/server';
import { outputStatus } from '@/lib/puxin/drive-output';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) { return NextResponse.json(await outputStatus(new URL(request.url).origin)); }
