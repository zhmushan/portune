import { Hono } from 'hono'
import { z } from 'zod'

import {
  appendLedgerEntry,
  deleteLedgerEntry,
  readAccounts,
  readInstruments,
  readLedger,
  updateLedgerEntry,
} from '../services/ledger/store.js'
import { LedgerConflictError, LedgerStoreError } from '../services/ledger/types.js'

const ledgerApp = new Hono()

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const entryTypeSchema = z.enum([
  'balance',
  'buy',
  'dividend',
  'expense',
  'fx',
  'income',
  'sell',
  'transfer',
])

const entrySchema = z.object({
  account: z.string().trim().min(1),
  amount: z.number().finite().nullable().default(null),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, 'Currency must be a 3-letter code.')
    .transform((value) => value.toUpperCase()),
  date: z.string().trim().regex(ISO_DATE_PATTERN, 'Date must be YYYY-MM-DD.'),
  note: z.string().default(''),
  price: z.number().finite().nullable().default(null),
  qty: z.number().finite().nullable().default(null),
  symbol: z
    .string()
    .trim()
    .default('')
    .transform((value) => value.toUpperCase()),
  type: entryTypeSchema,
})

/**
 * Each entry type carries its value in a different field. Rejecting the wrong
 * shape here keeps the engine from silently valuing an incomplete row at zero.
 */
function validateShape(entry: z.infer<typeof entrySchema>) {
  const isTrade = entry.type === 'buy' || entry.type === 'sell'

  if (isTrade) {
    if (!entry.symbol) {
      return `${entry.type} requires a symbol.`
    }

    if (entry.qty === null || entry.qty <= 0) {
      return `${entry.type} requires a positive qty.`
    }

    if (entry.price === null || entry.price < 0) {
      return `${entry.type} requires a non-negative price.`
    }

    return null
  }

  if (entry.amount === null) {
    return `${entry.type} requires an amount.`
  }

  if (entry.type === 'transfer' && !entry.account.includes('>')) {
    return 'transfer requires an account in "from>to" form.'
  }

  return null
}

function respondWithStoreError(error: unknown) {
  if (error instanceof LedgerConflictError) {
    return {
      body: {
        code: 'CONFLICT' as const,
        message: error.message,
      },
      status: 409 as const,
    }
  }

  if (error instanceof LedgerStoreError) {
    return {
      body: {
        message: error.message,
      },
      status: error.status as 404 | 500 | 502,
    }
  }

  return {
    body: {
      message: error instanceof Error ? error.message : 'Ledger operation failed.',
    },
    status: 502 as const,
  }
}

ledgerApp.get('/', async (context) => {
  try {
    const [{ entries }, accounts, instruments] = await Promise.all([
      readLedger(),
      readAccounts(),
      readInstruments(),
    ])

    return context.json({
      accounts,
      entries,
      instruments,
    })
  } catch (error) {
    const { body, status } = respondWithStoreError(error)

    return context.json(body, status)
  }
})

ledgerApp.post('/entries', async (context) => {
  const parseResult = entrySchema.safeParse(
    await context.req.json().catch(() => null),
  )

  if (!parseResult.success) {
    return context.json(
      {
        issues: parseResult.error.flatten(),
        message: 'Entry payload is invalid.',
      },
      400,
    )
  }

  const shapeError = validateShape(parseResult.data)

  if (shapeError) {
    return context.json({ message: shapeError }, 400)
  }

  try {
    return context.json(await appendLedgerEntry(parseResult.data), 201)
  } catch (error) {
    const { body, status } = respondWithStoreError(error)

    return context.json(body, status)
  }
})

ledgerApp.put('/entries/:id', async (context) => {
  const parseResult = entrySchema.safeParse(
    await context.req.json().catch(() => null),
  )

  if (!parseResult.success) {
    return context.json(
      {
        issues: parseResult.error.flatten(),
        message: 'Entry payload is invalid.',
      },
      400,
    )
  }

  const shapeError = validateShape(parseResult.data)

  if (shapeError) {
    return context.json({ message: shapeError }, 400)
  }

  try {
    const updated = await updateLedgerEntry(
      context.req.param('id'),
      parseResult.data,
    )

    return context.json(updated)
  } catch (error) {
    const { body, status } = respondWithStoreError(error)

    return context.json(body, status)
  }
})

ledgerApp.delete('/entries/:id', async (context) => {
  try {
    await deleteLedgerEntry(context.req.param('id'))

    return context.body(null, 204)
  } catch (error) {
    const { body, status } = respondWithStoreError(error)

    return context.json(body, status)
  }
})

export { ledgerApp }
