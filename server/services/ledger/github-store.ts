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
 * Distinguishes "the file isn't there yet" from "we cannot see this repository
 * at all", which GitHub reports identically as 404.
 */
async function assertRepositoryReachable() {
  const { branch, repository } = readRepositoryConfig()
  const response = await requestGitHub(`/repos/${repository}`)

  if (response.status === 404 || response.status === 401 || response.status === 403) {
    throw new LedgerStoreError(
      `Cannot access repository "${repository}". Check GITHUB_DATA_REPO and that GITHUB_DATA_TOKEN still grants it read/write access.`,
      500,
    )
  }

  if (!response.ok) {
    throw new LedgerStoreError(
      `Failed to verify repository "${repository}": ${await readErrorMessage(response, `HTTP ${response.status}`)}`,
    )
  }

  const branchResponse = await requestGitHub(
    `/repos/${repository}/branches/${encodeURIComponent(branch)}`,
  )

  if (branchResponse.status === 404) {
    throw new LedgerStoreError(
      `Branch "${branch}" does not exist in "${repository}". Check GITHUB_DATA_BRANCH.`,
      500,
    )
  }
}

/**
 * The blob sha this process last wrote for each path.
 *
 * GitHub's read path is eventually consistent: a PUT can return 200 while a
 * follow-up GET still serves the previous blob. Left alone, a user who adds an
 * entry and immediately reloads may not see it. Remembering what we wrote lets
 * a read detect that it got a stale copy and wait for the write to land.
 */
const lastWrittenSha = new Map<string, string>()

const STALE_READ_RETRIES = 4
const STALE_READ_DELAY_MS = 400

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Reads a file and its blob sha in one call. Returns null when the file does not
 * exist yet, which lets callers create it on first write.
 */
export async function readRepositoryFile(filePath: string) {
  const expectedSha = lastWrittenSha.get(filePath)

  for (let attempt = 0; ; attempt += 1) {
    const result = await readRepositoryFileOnce(filePath)

    // Only wait when we know a newer blob exists and this read predates it.
    if (
      !expectedSha ||
      !result ||
      result.sha === expectedSha ||
      attempt >= STALE_READ_RETRIES
    ) {
      return result
    }

    await sleep(STALE_READ_DELAY_MS)
  }
}

async function readRepositoryFileOnce(filePath: string) {
  const response = await requestGitHub(buildContentsPath(filePath))

  if (response.status === 404) {
    // GitHub also answers 404 for a private repo the token cannot see, so a
    // typo'd repo name, a revoked token, or a wrong branch would otherwise look
    // like "no ledger yet" — and the next write would happily create a fresh
    // one-row file. Confirm the repository itself is reachable first.
    await assertRepositoryReachable()

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
    size?: number
  }

  if (typeof payload.sha !== 'string' || typeof payload.content !== 'string') {
    throw new LedgerStoreError(`GitHub returned an unexpected payload for ${filePath}.`)
  }

  // Above 1 MB the Contents API returns an empty string with encoding "none"
  // and a perfectly valid sha. Treating that as an empty file would let the
  // next write replace the whole ledger with a single row — and the sha would
  // be current, so the conflict guard could not catch it. Fail loudly instead.
  if (payload.encoding !== 'base64') {
    throw new LedgerStoreError(
      `${filePath} was returned with encoding "${payload.encoding ?? 'unknown'}" instead of base64, which happens above 1 MB. Refusing to read it as empty.`,
      500,
    )
  }

  if (payload.content === '' && (payload.size ?? 0) > 0) {
    throw new LedgerStoreError(
      `${filePath} reports ${payload.size} bytes but returned no content. Refusing to treat it as empty.`,
      500,
    )
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

  // 409 is always a conflicting write. 422 covers several permanent validation
  // failures too (missing branch, malformed path, oversized content), so only
  // treat it as a conflict when GitHub says the sha is the problem — otherwise
  // the real error would be hidden behind a misleading "reload and retry".
  if (response.status === 409 || response.status === 422) {
    const message = await readErrorMessage(response, `HTTP ${response.status}`)
    const isStaleSha =
      response.status === 409 || /sha|does not match|is at/i.test(message)

    if (isStaleSha) {
      throw new LedgerConflictError(
        `${options.path} changed since it was read. Reload and retry.`,
      )
    }

    throw new LedgerStoreError(
      `Failed to write ${options.path}: ${message}`,
      500,
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

  const writtenSha = payload.content?.sha ?? ''

  if (writtenSha) {
    lastWrittenSha.set(options.path, writtenSha)
  }

  return {
    sha: writtenSha,
  }
}
