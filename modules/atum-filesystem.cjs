'use strict'
// ============================================================================
// atum-filesystem.cjs
// Purpose  : Path constants, folder reader, workspace cache
// Owner    : Aymeric
// Source   : server.js lines 56-105, 947-970
// ============================================================================

const path = require('path')
const fs   = require('fs')

// ── Path mapping (server-relative paths, not Electron homedir) ──────────────
const DATA_DIR          = path.join(__dirname, '..', 'data')
const AGENTS_DIR        = path.join(DATA_DIR, 'agents')
const CUSTOM_AGENTS_DIR = path.join(DATA_DIR, 'custom-agents')
const DATABASES_DIR     = path.join(DATA_DIR, 'databases')
const RULES_PATH        = path.join(DATA_DIR, 'rules.md')
const RULES_COMPACT_PATH = path.join(DATA_DIR, 'rules-compact.md')
const GMAIL_CONFIG_PATH = path.join(DATA_DIR, 'gmail-config.json')
const GMAIL_TOKEN_PATH  = path.join(DATA_DIR, 'gmail-token.json')

// ── Folder reader constants ──────────────────────────────────────────────────
const BLOCKED_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build',
  '__pycache__', '.cache', 'coverage', 'vendor', '.venv', 'venv',
])
const TEXT_EXTS = new Set([
  '.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.json', '.py',
  '.html', '.css', '.scss', '.yaml', '.yml', '.sh', '.sql', '.csv',
  '.xml', '.toml', '.ini', '.cfg', '.log', '.env', '.gitignore',
  '.dockerfile', '.tf', '.go', '.rs', '.java', '.rb', '.php',
  '.cs', '.cpp', '.c', '.h',
])
const MAX_FILE_CHARS  = 60000   // 60 KB per file
const MAX_TOTAL_CHARS = 300000  // 300 KB total across all files

function readFolderContents(folderPath, maxDepth = 4, depth = 0, total = { n: 0 }) {
  let tree = [], files = []
  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true })
    for (const e of entries) {
      if (e.name.startsWith('.') || BLOCKED_DIRS.has(e.name)) continue
      const full = path.join(folderPath, e.name)
      const indent = '  '.repeat(depth)
      if (e.isDirectory()) {
        tree.push(`${indent}d ${e.name}/`)
        if (depth < maxDepth) {
          const sub = readFolderContents(full, maxDepth, depth + 1, total)
          tree = tree.concat(sub.tree)
          files = files.concat(sub.files)
        }
      } else {
        tree.push(`${indent}f ${e.name}`)
        const ext = path.extname(e.name).toLowerCase()
        if (TEXT_EXTS.has(ext) && total.n < MAX_TOTAL_CHARS) {
          try {
            const stat = fs.statSync(full)
            if (stat.size <= MAX_FILE_CHARS) {
              const content = fs.readFileSync(full, 'utf8')
              files.push({ path: path.relative(folderPath, full).replace(/\\/g, '/'), content })
              total.n += content.length
            }
          } catch {}
        }
      }
    }
  } catch {}
  return { tree, files }
}

// ── Workspace content cache (60s TTL) ───────────────────────────────────────
const _wsCache = { path: null, context: '', timestamp: 0 }
const WS_CACHE_TTL = 60000

function getCachedWorkspaceContext(workspacePath) {
  if (!workspacePath) return ''
  const now = Date.now()
  if (_wsCache.path === workspacePath && (now - _wsCache.timestamp) < WS_CACHE_TTL) {
    return _wsCache.context
  }
  const { tree, files } = readFolderContents(workspacePath)
  let wsContext = `\n\n---\n## DOSSIER DE TRAVAIL : ${path.basename(workspacePath)}\nChemin complet : ${workspacePath}\n\n### Structure du dossier :\n${tree.join('\n')}`
  if (files.length > 0) {
    wsContext += '\n\n### Contenu des fichiers :\n'
    for (const f of files) {
      wsContext += `\n#### ${f.path}\n\`\`\`\n${f.content}\n\`\`\`\n`
    }
  }
  wsContext += '\n---'
  _wsCache.path = workspacePath
  _wsCache.context = wsContext
  _wsCache.timestamp = now
  return wsContext
}

module.exports = {
  DATA_DIR,
  AGENTS_DIR,
  CUSTOM_AGENTS_DIR,
  DATABASES_DIR,
  RULES_PATH,
  RULES_COMPACT_PATH,
  GMAIL_CONFIG_PATH,
  GMAIL_TOKEN_PATH,
  BLOCKED_DIRS,
  TEXT_EXTS,
  readFolderContents,
  getCachedWorkspaceContext,
}
