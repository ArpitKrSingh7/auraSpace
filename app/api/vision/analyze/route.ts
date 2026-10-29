import type { NextRequest } from 'next/server';
import { proxyVision } from '@/server/vision-proxy';

// Allow the 50-second upstream timeout to complete on hosts honoring this budget.
export const maxDuration = 60;

export function POST(req: NextRequest) {
  return proxyVision(req, 'analyze');
}
