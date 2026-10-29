import { NextResponse } from 'next/server';

function getVisionUrl(path: string): URL {
  const base =
    process.env.VISION_SERVICE_URL ||
    process.env.NEXT_PUBLIC_VISION_API_URL ||
    'http://localhost:8000';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return new URL(path.replace(/^\//, ''), normalizedBase);
}

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  let visionStatus = 'disconnected';
  if (
    process.env.VISION_SERVICE_URL ||
    process.env.NEXT_PUBLIC_VISION_API_URL
  ) {
    try {
      const res = await fetch(getVisionUrl('health'), {
        headers: process.env.VISION_API_TOKEN ? { 'X-AuraSpace-Vision-Token': process.env.VISION_API_TOKEN } : {},
        // A cold Python function imports the ML runtime before /health runs.
        signal: AbortSignal.timeout(10_000),
        cache: 'no-store',
      });
      if (res.ok) {
        visionStatus = 'connected';
      } else visionStatus = 'unavailable';
    } catch {
      visionStatus = 'unavailable';
    }
  }

  return NextResponse.json({
    status: 'ok',
    app: 'AuraSpace',
    version: '1.0.0',
    services: {
      app: 'healthy',
      vision: visionStatus,
    },
    capabilities: {
      imageProcessing: true,
      computerVision: true,
      computerGraphics: true,
      threeD: true,
      clientInference: true,
    },
    timestamp: new Date().toISOString(),
  });
}
