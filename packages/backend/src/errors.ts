export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public retryable = false,
  ) {
    super(message);
  }
}
export const notFound = () =>
  new AppError(
    'not-found',
    'This project or file is no longer available.',
    404,
  );
export const conflict = () =>
  new AppError(
    'revision-conflict',
    'This room has changed elsewhere. Your local draft is safe. Review the newer version before syncing.',
    409,
  );
export function publicError(error: unknown) {
  if (error instanceof AppError) return error;
  return new AppError(
    'service-unavailable',
    'That operation could not finish. Your saved draft is safe; please retry.',
    503,
    true,
  );
}
