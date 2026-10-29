import type { NextRequest } from 'next/server';
import { proxyVision } from '@/server/vision-proxy';

// Cold CPU inference gets a bounded three-minute upstream budget.
export const maxDuration = 300;

export function POST(req: NextRequest) {
  return proxyVision(req, 'analyze');
}
