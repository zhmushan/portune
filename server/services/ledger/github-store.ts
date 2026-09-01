import { LedgerConflictError, LedgerStoreError } from './types.js'

const GITHUB_API_BASE_URL = 'https://api.github.com'
const GITHUB_API_VERSION = '2022-11-28'

function readRepositoryConfig() {
  const repository = process.env.GITHUB_DATA_REPO?.trim()
  const token = process.env.GITHUB_DATA_TOKEN?.trim()

  if (!repository) {
    throw new LedgerStoreError(
      'GITHUB_DATA_REPO is not configured. Set it to "owner/name" of the private data repository.',
      500,
    )
  }

  if (!token) {
    throw new LedgerStoreError(
      'GITHUB_DATA_TOKEN is not configured. Set it to a token with read/write access to the data repository.',
      500,
    )
  }

  return {
    branch: process.env.GITHUB_DATA_BRANCH?.trim() || 'main',
    repository,
    token,
  }
}

async function requestGitHub(path: string, init: RequestInit = {}) {
  const { token } = readRepositoryConfig()

  let response: Response

  try {
    response = await fetch(`${GITHUB_API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        ...init.headers,
      },
      signal: init.signal ?? AbortSignal.timeout(10_000),
    })
  } catch (error) {
    throw new LedgerStoreError(
      error instanceof Error
        ? `GitHub request failed: ${error.message}`
        : 'GitHub request failed.',
    )
  }

  return response
}

function buildContentsPath(filePath: string, ref?: string) {
  const { branch, repository } = readRepositoryConfig()
  const query = new URLSearchParams({ ref: ref ?? branch })

  return `/repos/${repository}/contents/${filePath}?${query.toString()}`
}

async function readErrorMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as {
    message?: unknown
  } | null

  return typeof payload?.message === 'string' ? payload.message : fallback
}

/**
 * Reads a file and its blob sha in one call. Returns null when the file does not
 * exist yet, which lets callers create it on first write.
 */
export async function readRepositoryFile(filePath: string) {
  const response = await requestGitHub(buildContentsPath(filePath))

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new LedgerStoreError(
      `Failed to read ${filePath}: ${await readErrorMessage(response, `HTTP ${response.status}`)}`,
      response.status === 401 || response.status === 403 ? 500 : 502,
    )
  }

  const payload = (await response.json()) as {
    content?: string
    encoding?: string
    sha?: string
  }

  if (typeof payload.sha !== 'string' || typeof payload.content !== 'string') {
    throw new LedgerStoreError(`GitHub returned an unexpected payload for ${filePath}.`)
  }

  return {
    sha: payload.sha,
    value: Buffer.from(payload.content, 'base64').toString('utf8'),
  }
}

/**
 * Writes a file back.
 *
 * `sha` must be the sha observed when reading; GitHub rejects a stale one rather
 * than overwriting a concurrent edit. Omitting it creates the file. A rejected
 * write surfaces as LedgerConflictError so callers can re-read and replay.
 */
export async function writeRepositoryFile(options: {
  content: string
  message: string
  path: string
  sha?: string
}) {
  const { branch } = readRepositoryConfig()
  const response = await requestGitHub(
    `/repos/${readRepositoryConfig().repository}/contents/${options.path}`,
    {
      body: JSON.stringify({
        branch,
        content: Buffer.from(options.content, 'utf8').toString('base64'),
        message: options.message,
        ...(options.sha ? { sha: options.sha } : {}),
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    },
  )

  // GitHub documents 409 for conflicting writes and 422 for validation failures;
  // a stale sha can surface as either, so both mean "re-read and replay".
  if (response.status === 409 || response.status === 422) {
    throw new LedgerConflictError(
      `${options.path} changed since it was read. Reload and retry.`,
    )
  }

  if (!response.ok) {
    throw new LedgerStoreError(
      `Failed to write ${options.path}: ${await readErrorMessage(response, `HTTP ${response.status}`)}`,
      response.status === 401 || response.status === 403 ? 500 : 502,
    )
  }

  const payload = (await response.json()) as {
    content?: { sha?: string }
  }

  return {
    sha: payload.content?.sha ?? '',
  }
}
