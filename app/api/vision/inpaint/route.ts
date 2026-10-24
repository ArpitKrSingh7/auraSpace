import { NextRequest, NextResponse } from 'next/server';

const PYTHON_SERVICE_URL = process.env.VISION_SERVICE_URL || process.env.NEXT_PUBLIC_VISION_API_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Try forwarding to Python FastAPI inpainting service if available
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(`${PYTHON_SERVICE_URL.replace(/\/$/, '')}/inpaint`, {
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

    return NextResponse.json({
      uri: body.image,
      method: 'Client-side directional interpolation fill',
      note: 'Inpainting is performed client-side or by the Python FastAPI service.',
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Inpainting failed' },
      { status: 400 }
    );
  }
}
