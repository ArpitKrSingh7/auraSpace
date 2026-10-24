import { NextRequest, NextResponse } from 'next/server';

function getVisionUrl(path: string): URL {
  const base = process.env.VISION_SERVICE_URL || process.env.NEXT_PUBLIC_VISION_API_URL || 'http://localhost:8000';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return new URL(path.replace(/^\//, ''), normalizedBase);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Try forwarding to Python FastAPI Mask R-CNN service via service binding if available
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const targetUrl = getVisionUrl('analyze');
      const res = await fetch(targetUrl, {
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
      // Fall through
    }

    // Fallback: Client-side COCO-SSD will handle detection in the browser
    return NextResponse.json({
      detections: [],
      mode: 'client-side-coco-ssd',
      message: 'On-device browser detection active via TensorFlow.js.',
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Analysis failed' },
      { status: 400 }
    );
  }
}
