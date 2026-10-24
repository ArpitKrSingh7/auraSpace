import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    app: 'AuraSpace',
    version: '1.0.0',
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
