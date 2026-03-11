import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { app } from './app.js'

const currentFile = fileURLToPath(import.meta.url)
const currentDirectory = path.dirname(currentFile)
const projectRootDirectory = path.resolve(currentDirectory, '..')
const clientDistDirectory = path.join(projectRootDirectory, 'dist')
const clientIndexPath = path.join(clientDistDirectory, 'index.html')
const port = Number(process.env.PORT ?? 3001)
const clientIndexHtml = fs.existsSync(clientIndexPath)
  ? fs.readFileSync(clientIndexPath, 'utf8')
  : null

if (clientIndexHtml) {
  app.use(
    '*',
    serveStatic({
      root: './dist',
    }),
  )

  app.get('*', (context) => {
    if (context.req.path.startsWith('/api/')) {
      return context.notFound()
    }

    return context.html(clientIndexHtml)
  })
}

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`Portune server listening on http://localhost:${info.port}`)
  },
)
