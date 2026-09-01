import { UpstreamProviderError } from '../types.js'

/**
 * Daily NAV history for Chinese mutual funds (including QDII).
 *
 * Uses fund.eastmoney.com/pingzhongdata/{code}.js — a ~350KB JS bundle whose
 * `Data_netWorthTrend` array carries the fund's full NAV history since inception.
 *
 * The alternative endpoint (api.fund.eastmoney.com/f10/lsjz) is deliberately not
 * used: it rejects requests without a Referer header with {"ErrCode":-999}.
 * pingzhongdata has no such requirement.
 *
 * NAV publication lags by one to two business days, so the latest available point
 * is normally not today.
 */

const PINGZHONGDATA_BASE_URL = 'https://fund.eastmoney.com/pingzhongdata'

/**
 * Eastmoney timestamps are midnight Beijing time (UTC+8), which lands on
 * 16:00:00Z of the *previous* UTC day. Reading them as UTC would shift every NAV
 * back by one day and value holdings with a stale price. Verified against the
 * f10/lsjz endpoint: epoch 1787846400000 is NAV date 2026-08-28, not 08-27.
 */
const BEIJING_UTC_OFFSET_MS = 8 * 60 * 60 * 1000

export type NavPoint = {
  date: string
  nav: number
}

function toIsoDate(epochMs: number) {
  return new Date(epochMs + BEIJING_UTC_OFFSET_MS).toISOString().slice(0, 10)
}

/**
 * Extracts the `Data_netWorthTrend` array literal.
 *
 * The source has spaces around `=`, so the pattern tolerates optional whitespace.
 * Scanning for the matching bracket beats a greedy regex here because the file
 * contains several other array literals after this one.
 */
export function parseNetWorthTrend(source: string): NavPoint[] {
  const match = /Data_netWorthTrend\s*=\s*\[/.exec(source)

  if (!match) {
    throw new UpstreamProviderError(
      'Eastmoney response did not contain Data_netWorthTrend.',
    )
  }

  const start = match.index + match[0].length - 1
  let depth = 0
  let end = -1
  let isInString = false
  let isEscaped = false

  // Bracket counting has to know about string literals: a fund's unitMoney note
  // can contain "分红]备注", and a naive scan would cut the array there.
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]

    if (isEscaped) {
      isEscaped = false
      continue
    }

    if (character === '\\') {
      isEscaped = true
      continue
    }

    if (character === '"') {
      isInString = !isInString
      continue
    }

    if (isInString) {
      continue
    }

    if (character === '[') {
      depth += 1
    } else if (character === ']') {
      depth -= 1

      if (depth === 0) {
        end = index + 1
        break
      }
    }
  }

  if (end === -1) {
    throw new UpstreamProviderError(
      'Eastmoney Data_netWorthTrend array was truncated.',
    )
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(source.slice(start, end))
  } catch {
    throw new UpstreamProviderError(
      'Eastmoney Data_netWorthTrend could not be parsed as JSON.',
    )
  }

  if (!Array.isArray(parsed)) {
    return []
  }

  return parsed.flatMap((item) => {
    if (typeof item !== 'object' || item === null) {
      return []
    }

    const { x, y } = item as { x?: unknown; y?: unknown }

    // typeof NaN and typeof Infinity are both "number", and new Date(Infinity)
    // throws a RangeError from toISOString() that would escape this function
    // unwrapped. Both coordinates need the finite check.
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      return []
    }

    return [
      {
        date: toIsoDate(x),
        nav: y,
      },
    ]
  })
}

export async function fetchFundNavHistory(fundCode: string) {
  const normalizedCode = fundCode.trim().replace(/^F/i, '')
  let response: Response

  try {
    response = await fetch(`${PINGZHONGDATA_BASE_URL}/${normalizedCode}.js`, {
      headers: {
        // Eastmoney serves the bundle to plain clients; a browser-like UA avoids
        // the occasional bot filter without needing a Referer.
        'User-Agent': 'Mozilla/5.0',
      },
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    throw new UpstreamProviderError(
      error instanceof Error
        ? `Eastmoney request failed: ${error.message}`
        : 'Eastmoney request failed.',
    )
  }

  if (!response.ok) {
    throw new UpstreamProviderError(
      `Eastmoney request failed: HTTP ${response.status} ${response.statusText}`,
      response.status === 429 ? 429 : 502,
    )
  }

  return parseNetWorthTrend(await response.text())
}
