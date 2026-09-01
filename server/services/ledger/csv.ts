/**
 * Minimal RFC 4180 CSV handling.
 *
 * The ledger is written by this app and occasionally by hand, so quoted fields
 * containing commas, quotes, or newlines have to survive a round trip. A
 * dedicated dependency would also work; this stays in-tree because the format
 * is fixed and the surface is small.
 */

function parseLine(line: string) {
  const fields: string[] = []
  let field = ''
  let index = 0
  let isQuoted = false

  while (index < line.length) {
    const character = line[index]

    if (isQuoted) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }

        isQuoted = false
        index += 1
        continue
      }

      field += character
      index += 1
      continue
    }

    if (character === '"') {
      isQuoted = true
      index += 1
      continue
    }

    if (character === ',') {
      fields.push(field)
      field = ''
      index += 1
      continue
    }

    field += character
    index += 1
  }

  fields.push(field)

  return fields
}

/**
 * Splits on newlines that sit outside quoted fields, so a quoted note spanning
 * lines stays a single record.
 */
function splitRecords(content: string) {
  const records: string[] = []
  let record = ''
  let isQuoted = false

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]

    if (character === '"') {
      isQuoted = !isQuoted
    }

    if (!isQuoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && content[index + 1] === '\n') {
        index += 1
      }

      records.push(record)
      record = ''
      continue
    }

    record += character
  }

  if (record) {
    records.push(record)
  }

  return records
}

export function parseCsv(content: string) {
  const records = splitRecords(content).filter((record) => record.trim())

  if (records.length === 0) {
    return {
      headers: [] as string[],
      rows: [] as Record<string, string>[],
    }
  }

  const headers = parseLine(records[0] as string).map((header) => header.trim())
  const rows = records.slice(1).map((record) => {
    const fields = parseLine(record)

    return Object.fromEntries(
      headers.map((header, index) => [header, (fields[index] ?? '').trim()]),
    )
  })

  return {
    headers,
    rows,
  }
}

function escapeField(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`
  }

  return value
}

export function serializeCsv(
  headers: string[],
  rows: Record<string, string>[],
) {
  const lines = [headers.join(',')]

  for (const row of rows) {
    lines.push(headers.map((header) => escapeField(row[header] ?? '')).join(','))
  }

  // Trailing newline keeps diffs clean when rows are appended.
  return `${lines.join('\n')}\n`
}
