import { NextRequest, NextResponse } from 'next/server';

const PYTHON_SERVICE_URL = process.env.VISION_SERVICE_URL || process.env.NEXT_PUBLIC_VISION_API_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // If external Python vision service is reachable, forward to it
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${PYTHON_SERVICE_URL.replace(/\/$/, '')}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch {
      // Fall through to self-contained response
    }

    // Fallback: return image with metadata
    return NextResponse.json({
      uri: body.image,
      metadata: {
        operation: body.operation,
        status: 'processed-fallback',
        note: 'Classical pixel processing is accelerated client-side via HTML5 canvas & web workers.',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Processing failed' },
      { status: 400 }
    );
  }
}
