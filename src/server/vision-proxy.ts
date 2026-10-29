import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const image = z
  .string()
  .max(3_500_000)
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/);
const schemas = {
  analyze: z.object({
    image,
    include_depth: z.boolean().optional(),
    include_room: z.boolean().optional(),
    intrinsics: z.object({
      fx: z.number().finite().positive().max(1_000_000),
      fy: z.number().finite().positive().max(1_000_000),
      cx: z.number().finite(), cy: z.number().finite(),
    }).optional(),
  }),
  process: z.object({
    image,
    operation: z.enum([
      'grayscale',
      'contrast',
      'edges',
      'clahe',
      'contours',
      'histogram',
    ]),
    params: z.record(z.unknown()).optional(),
  }),
  inpaint: z.object({
    image,
    boxes: z
      .array(
        z.tuple([
          z.number().finite().nonnegative(),
          z.number().finite().nonnegative(),
          z.number().finite().positive(),
          z.number().finite().positive(),
        ]),
      )
      .min(1)
      .max(100),
    method: z.enum(['auto', 'telea', 'navier-stokes']).optional(),
  }),
};
export async function proxyVision(
  req: NextRequest,
  operation: keyof typeof schemas,
) {
  try {
    if (Number(req.headers.get('content-length')) > 3_600_000)
      return NextResponse.json(
        { error: 'Image request is too large.' },
        { status: 413 },
      );
    const raw = await req.text();
    if (raw.length > 3_600_000)
      return NextResponse.json(
        { error: 'Image request is too large.' },
        { status: 413 },
      );
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: 'Provide a valid JSON request.' },
        { status: 400 },
      );
    }
    const parsed = schemas[operation].safeParse(input);
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Provide a valid image and operation parameters.' },
        { status: 400 },
      );
    const base =
      process.env.VISION_SERVICE_URL || process.env.NEXT_PUBLIC_VISION_API_URL;
    if (!base)
      return NextResponse.json(
        {
          error:
            'The vision service is not configured. Configure VISION_SERVICE_URL for photo reconstruction, or enter room dimensions manually.',
        },
        { status: 503 },
      );
    const url = new URL(operation, base.endsWith('/') ? base : `${base}/`);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.VISION_API_TOKEN ? { 'X-AuraSpace-Vision-Token': process.env.VISION_API_TOKEN } : {}),
      },
      body: JSON.stringify(parsed.data),
      signal: AbortSignal.timeout(180_000),
      cache: 'no-store',
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      {
        error:
          'The vision service is unavailable or timed out. Retry, or enter room dimensions and place furniture manually.',
      },
      { status: 502 },
    );
  }
}
