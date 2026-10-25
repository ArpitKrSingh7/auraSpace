import type { NextRequest } from 'next/server';
import { proxyVision } from '@/server/vision-proxy';

export function POST(req: NextRequest) {
  return proxyVision(req, 'process');
}
