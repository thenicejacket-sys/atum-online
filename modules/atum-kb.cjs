'use strict'
// ============================================================================
// atum-kb.cjs
// Purpose  : Knowledge Base system — permissions, provisioning, context builder
// Owner    : Aymeric
// Source   : server.js lines 972-1048
// ============================================================================

const path = require('path')
const fs   = require('fs')
const { DATABASES_DIR } = require('./atum-filesystem.cjs')

const KB_DIR = DATABASES_DIR

const KB_DEFAULT_PERMISSIONS = {
  orchestrators: {
    pai: ['*'],
    atum: ['atum', 'jamie', 'serena', 'marcus', 'rook', 'dev', 'alex', 'aditi', 'priya', 'emma'],
    christian: ['christian', 'julie', 'frank', 'catalin', 'norman', 'magali', 'sophie'],
  },
}

function getKBPermissions() {
  try {
    const f = path.join(KB_DIR, '_kb_permissions.json')
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'))
  } catch {}
  return KB_DEFAULT_PERMISSIONS
}

function provisionAgentKB(agentId) {
  try {
    if (!fs.existsSync(KB_DIR)) fs.mkdirSync(KB_DIR, { recursive: true })
    const kbPath = path.join(KB_DIR, `${agentId}_data.json`)
    if (!fs.existsSync(kbPath)) {
      fs.writeFileSync(
        kbPath,
        JSON.stringify({ notes: [], documents: [], history: [], preferences: {} }, null, 2),
        'utf8'
      )
    }
  } catch {}
}

function loadAgentKBSummary(agentId) {
  try {
    const kbPath = path.join(KB_DIR, `${agentId}_data.json`)
    if (!fs.existsSync(kbPath)) return null
    const data = JSON.parse(fs.readFileSync(kbPath, 'utf8'))
    const counts = Object.entries(data)
      .filter(([k]) => k !== 'preferences')
      .map(([k, v]) => `${k}:${Array.isArray(v) ? v.length : Object.keys(v || {}).length}`)
      .join(' ')
    const isEmpty = !Object.values(data).some(v =>
      Array.isArray(v) ? v.length > 0 : Object.keys(v || {}).length > 0
    )
    return { path: kbPath, counts, isEmpty }
  } catch { return null }
}

function buildKBContext(agentId) {
  const perms = getKBPermissions()
  const orchPerms = (perms.orchestrators || {})[agentId]
  provisionAgentKB(agentId)
  const kbPath = path.join(KB_DIR, `${agentId}_data.json`)
  let ctx = '\n\n---\n## BASE DE CONNAISSANCES (KB)\n'
  ctx += `Ton compartiment : ${kbPath}\n`
  const own = loadAgentKBSummary(agentId)
  if (own) ctx += own.isEmpty ? 'KB vide.\n' : `Donnees actuelles : ${own.counts}\n`
  ctx += 'Utilise read_file pour consulter, write_file pour enrichir (ton compartiment uniquement).\n'
  if (orchPerms) {
    let allies = []
    if (orchPerms.includes('*')) {
      try {
        allies = fs.readdirSync(KB_DIR)
          .filter(f => f.endsWith('_data.json') && !f.startsWith('_') && f !== `${agentId}_data.json`)
          .map(f => f.replace('_data.json', ''))
          .sort()
      } catch {}
    } else {
      allies = orchPerms.filter(a => a !== agentId)
    }
    if (allies.length > 0) {
      ctx += '\n### Compartiments accessibles (lecture seule)\n'
      for (const aid of allies) {
        provisionAgentKB(aid)
        const kbInfo = loadAgentKBSummary(aid)
        if (kbInfo) ctx += `- ${aid} : ${kbInfo.path} [${kbInfo.counts}]\n`
      }
      ctx += 'Lecture via read_file. Ecriture UNIQUEMENT dans ton propre compartiment.\n'
    }
  }
  ctx += '---\n'
  return ctx
}

module.exports = {
  buildKBContext,
  provisionAgentKB,
  loadAgentKBSummary,
  getKBPermissions,
  KB_DIR,
}
