'use strict'
// ============================================================================
// server.js -- ATUM Online thin orchestrator
// Adapted from PAI Desktop main.cjs (Daniel's upstream)
//
// UPSTREAM ZONES  : Express setup, cors, static serving, PORT binding
// AYMERIC ZONES   : All modules in ./modules/ (tracking, tools, agents, chat,
//                   KB, context, gmail, routes)
//
// This file is intentionally minimal (~65 lines). Business logic lives in modules/.
// ORIGINAL preserved at server.original.js (2132 lines)
// ============================================================================

const express = require('express')
const cors    = require('cors')
const path    = require('path')
const fs      = require('fs')

// -- Knowledge base service (BM25 -- shared module) -------------------------
// [UPSTREAM ZONE] knowledge-service.cjs is Daniel's code -- do not move
let kb
try {
  kb = require('./knowledge-service.cjs')
} catch {
  kb = {
    searchKnowledge:     () => [],
    saveToKnowledge:     () => ({ saved: 0, totalDocs: 0 }),
    listKnowledge:       () => ({ totalChunks: 0, sources: {}, storagePath: '' }),
    deleteFromKnowledge: () => ({ deleted: 0, remaining: 0 }),
    getRecentLearnings:  async () => '',
    reflectAndLearn:     async () => ({ saved: 0, skipped: 0 }),
    getAgentProfile:     async () => ({ total_learnings: 0, by_category: {}, total_kb_entries: 0, last_learning: null }),
  }
}

// -- [AYMERIC ZONE] Load modules --------------------------------------------
const { DATA_DIR, AGENTS_DIR, CUSTOM_AGENTS_DIR, DATABASES_DIR } = require('./modules/atum-filesystem.cjs')
const { registerChatRoute }   = require('./modules/atum-chat.cjs')
const { registerRoutes }      = require('./modules/atum-routes.cjs')
const { startGmailDaemonWeb } = require('./modules/atum-gmail.cjs')

// -- [UPSTREAM ZONE] Express setup ------------------------------------------
const app  = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }))
app.use(express.json({ limit: '50mb' }))
app.use(express.static(path.join(__dirname, 'dist')))

// -- [AYMERIC ZONE] Mount routes --------------------------------------------
// Order: chat first (has /api/abort inside), then misc routes, then SPA catch-all
registerChatRoute(app, kb)
registerRoutes(app)

// -- [AYMERIC ZONE] Data directory bootstrap --------------------------------
for (const dir of [DATA_DIR, AGENTS_DIR, CUSTOM_AGENTS_DIR, DATABASES_DIR]) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  } catch {}
}

// -- [UPSTREAM ZONE] Vercel serverless export --------------------------------
module.exports = app

// -- [UPSTREAM ZONE] Local dev: start listening only when run directly -------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log('ATUM Online server running on port ' + PORT)
    console.log('Data directory: ' + DATA_DIR)
    console.log('Agents directory: ' + AGENTS_DIR)
    console.log('Custom agents directory: ' + CUSTOM_AGENTS_DIR)
    startGmailDaemonWeb()
  })
}