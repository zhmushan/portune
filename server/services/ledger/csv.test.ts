import { describe, expect, it } from 'vitest'

import { CsvParseError, parseCsv, serializeCsv } from './csv.js'

const HEADERS = ['id', 'date', 'note']

function roundTrip(rows: Record<string, string>[]) {
  return parseCsv(serializeCsv(HEADERS, rows)).rows
}

describe('parseCsv', () => {
  it('preserves commas, quotes and newlines through a round trip', () => {
    const rows = [
      { date: '2026-01-01', id: 'a', note: 'salary, with comma' },
      { date: '2026-01-02', id: 'b', note: 'he said "hi"' },
      { date: '2026-01-03', id: 'c', note: 'line one\nline two' },
      { date: '2026-01-04', id: 'd', note: '"' },
      { date: '2026-01-05', id: 'e', note: '工资，含年终奖' },
      { date: '2026-01-06', id: 'f', note: '' },
    ]

    expect(roundTrip(rows)).toEqual(rows)
  })

  it('reads CRLF files', () => {
    const { rows } = parseCsv('id,date,note\r\na,2026-01-01,first\r\n')

    expect(rows).toEqual([{ date: '2026-01-01', id: 'a', note: 'first' }])
  })

  /**
   * A stray quote used to flip quote parity and swallow every following line
   * into one record, which the next full-file write then erased for good.
   */
  it('refuses a file that ends inside an unterminated quoted field', () => {
    const malformed =
      'id,date,note\naaaa,2026-01-01,bought 5" pipe\nbbbb,2026-01-02,second\ncccc,2026-01-03,third\n'

    expect(() => parseCsv(malformed)).toThrow(CsvParseError)
  })

  it('treats an empty file as no rows', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] })
  })
})
