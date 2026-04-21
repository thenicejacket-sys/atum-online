'use strict'
// ============================================================================
// atum-routes.cjs
// Purpose  : All non-chat Express route handlers
//            (models, conversations, files, gmail-config, SPA fallback)
// Owner    : Aymeric
// Source   : server.js lines 1208-1252, 2069-2110
// ============================================================================

const path = require('path')
const fs   = require('fs')
const os   = require('os')

const { getGeneratedFile } = require('./atum-errors.cjs')
const { DATA_DIR, GMAIL_CONFIG_PATH } = require('./atum-filesystem.cjs')
const { loadGmailConfig, startGmailDaemonWeb, stopGmailDaemon } = require('./atum-gmail.cjs')

function registerRoutes(app) {

  // ── GET /api/models — list available models ─────────────────────────────
  app.get('/api/models', (req, res) => {
    res.json([
      { id: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5 (rapide)', default: false },
      { id: 'claude-sonnet-4-6', name: 'Sonnet 4.6 (recommande)', default: true },
    ])
  })

  // ── POST /api/conversations/save ─────────────────────────────────────────
  app.post('/api/conversations/save', (req, res) => {
    const dataDir = path.join(os.homedir(), '.atum-web')
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(path.join(dataDir, 'conversations.json'), JSON.stringify(req.body, null, 2))
    res.json({ success: true })
  })

  // ── GET /api/conversations/load ──────────────────────────────────────────
  app.get('/api/conversations/load', (req, res) => {
    try {
      const raw = fs.readFileSync(path.join(os.homedir(), '.atum-web', 'conversations.json'), 'utf8')
      res.json({ success: true, conversations: JSON.parse(raw) })
    } catch {
      res.json({ success: true, conversations: [] })
    }
  })

  // ── GET /api/files/:id — download a generated file (24h TTL) ────────────
  app.get('/api/files/:id', (req, res) => {
    const entry = getGeneratedFile(req.params.id)
    if (!entry || !fs.existsSync(entry.path)) {
      return res.status(404).json({ error: 'File not found or expired (24h TTL)' })
    }
    res.download(entry.path, entry.name)
  })

  // ── GET /api/gmail-config ────────────────────────────────────────────────
  app.get('/api/gmail-config', (req, res) => {
    try {
      const cfg = JSON.parse(fs.readFileSync(GMAIL_CONFIG_PATH, 'utf8'))
      const { api_key, ...safe } = cfg
      safe.has_api_key = !!api_key
      res.json(safe)
    } catch {
      res.json({ enabled: false, has_api_key: false })
    }
  })

  // ── POST /api/gmail-config ───────────────────────────────────────────────
  app.post('/api/gmail-config', (req, res) => {
    try {
      let cfg = {}
      try { cfg = JSON.parse(fs.readFileSync(GMAIL_CONFIG_PATH, 'utf8')) } catch {}
      const { enabled, api_key } = req.body
      if (typeof enabled === 'boolean') cfg.enabled = enabled
      if (api_key) cfg.api_key = api_key
      fs.mkdirSync(DATA_DIR, { recursive: true })
      fs.writeFileSync(GMAIL_CONFIG_PATH, JSON.stringify(cfg, null, 2))
      console.log(`[Gmail] Config mise a jour — enabled: ${cfg.enabled}`)
      stopGmailDaemon()
      if (cfg.enabled) startGmailDaemonWeb()
      const { api_key: _k, ...safe } = cfg
      safe.has_api_key = !!_k
      res.json({ ok: true, config: safe })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  // ── Serve React SPA for all other GET routes ─────────────────────────────
  app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath)
    } else {
      res.status(200).send('ATUM Online server is running. Place your built React app in ./dist/')
    }
  })
}

module.exports = { registerRoutes }
