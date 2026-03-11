type ApiErrorPayload = {
  code?: string
  message?: string
}

export class ApiError extends Error {
  readonly code?: string
  readonly status: number

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export async function readJsonOrThrow<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | ApiErrorPayload
      | null

    throw new ApiError(
      payload?.message ?? fallbackMessage,
      response.status,
      payload?.code,
    )
  }

  return (await response.json()) as T
}
