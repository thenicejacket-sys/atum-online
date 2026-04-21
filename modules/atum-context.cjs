'use strict'
// ============================================================================
// atum-context.cjs
// Purpose  : loadBaseContext (date, tools hint, agents registry),
//            loadPAIAgentsContext, PAI context routing, Algorithm
// Owner    : Aymeric
// Source   : server.js lines 810-870
// Updated  : v4.0.3 — PAI/ directory context routing + Algorithm v3.7.0
// ============================================================================

const path = require('path')
const fs   = require('fs')
const { CUSTOM_AGENTS_DIR, AGENTS_DIR, RULES_PATH, RULES_COMPACT_PATH } = require('./atum-filesystem.cjs')

// ── PAI directory (v4.0.3) — context routing + Algorithm ─────────────────────
const PAI_DIR = path.join(__dirname, '..', 'PAI')

// Load PAI agents registry for orchestrators
function loadPAIAgentsContext(filterIds = null) {
  try {
    const seen = new Set()
    const entries = []
    for (const dir of [CUSTOM_AGENTS_DIR, AGENTS_DIR]) {
      try {
        for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
          const id = file.replace(/\.md$/i, '').toLowerCase()
          if (!seen.has(id)) { seen.add(id); entries.push({ file, dir, id }) }
        }
      } catch {}
    }
    const filtered = filterIds ? entries.filter(e => filterIds.includes(e.id)) : entries
    if (filtered.length === 0) return ''

    let ctx = `\n\n---\n## Agents disponibles (${filtered.length})\n\n`
    for (const { file, dir } of filtered.sort((a, b) => a.id.localeCompare(b.id))) {
      try {
        const raw = fs.readFileSync(path.join(dir, file), 'utf8')
        const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/)
        if (fmMatch) {
          const fm = fmMatch[1]
          const nameMatch = fm.match(/^name:\s*(.+)$/m)
          const descMatch = fm.match(/^description:\s*(.+)$/m)
          const name = nameMatch ? nameMatch[1].trim() : file.replace('.md', '')
          const desc = descMatch ? descMatch[1].trim() : ''
          ctx += `**${name}** -- ${desc}\n`
        }
      } catch {}
    }
    ctx += `---`
    return ctx
  } catch { return '' }
}

function loadBaseContext(agentId = '') {
  let context = ''

  // Current date and time (French locale)
  const now = new Date()
  const daysFR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
  const monthsFR = [
    'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
  ]
  context += `\n\n# Date et heure actuelles\nNous sommes le **${daysFR[now.getDay()]} ${now.getDate()} ${monthsFR[now.getMonth()]} ${now.getFullYear()}**.\nHeure locale : ${now.toLocaleTimeString('fr-FR')}.`

  // CLAUDE.md — v4.0.3 mode system (NATIVE/ALGORITHM/MINIMAL)
  // UNIQUEMENT pour les orchestrateurs — les agents personnalité restent conversationnels
  const orchestrators = new Set(['pai', 'atum', 'christian'])
  if (orchestrators.has(agentId.toLowerCase())) {
    try {
      const localClaudeMd = path.join(__dirname, '..', 'CLAUDE.md')
      if (fs.existsSync(localClaudeMd)) {
        const content = fs.readFileSync(localClaudeMd, 'utf8').trim()
        if (content && content !== 'This file does nothing.') {
          context += `\n\n---\n## Instructions PAI (CLAUDE.md v4.0.3)\n${content}\n---`
        }
      }
    } catch {}
  }

  // Document generation tools — always available
  context += `\n\n---\n## Outils de génération de fichiers (TOUJOURS DISPONIBLES)\n\nQuand l'utilisateur demande un PDF, Excel ou Word — utilise DIRECTEMENT ces outils :\n- \`generate_pdf\` — Génère un PDF téléchargeable (rapport, dossier, synthèse, note, etc.)\n- \`generate_excel\` — Génère un fichier Excel .xlsx (tableaux, budgets, données financières)\n- \`generate_word\` — Génère un document Word .docx\n\n⚠️ Ne dis JAMAIS "je n'ai pas d'outil de génération" — ces outils sont toujours disponibles.\n---`

  // PAI context routing (v4.0.3) — pour orchestrateurs et PAI
  const aid = agentId.toLowerCase()
  if (['pai', 'atum', 'christian'].includes(aid)) {
    context += loadPAIContextRouting()
  }
  // PAI agents registry — only for orchestrators
  if (['pai', 'atum', 'christian'].includes(aid)) {
    let filterIds = null
    if (aid === 'atum') {
      filterIds = ['atum', 'atum-diagnostic', 'atum-analyse', 'atum-design', 'atum-offre']
    } else if (aid === 'christian') {
      filterIds = ['christian', 'frank', 'julie', 'norman', 'magali', 'sophie', 'catalin']
    }
    context += loadPAIAgentsContext(filterIds)
  }
  return context
}

// ── PAI context routing (v4.0.3) ────────────────────────────────────────────
function loadPAIContextRouting() {
  try {
    const routingPath = path.join(PAI_DIR, 'CONTEXT_ROUTING.md')
    if (fs.existsSync(routingPath)) {
      return '\n\n---\n## PAI Context Routing (v4.0.3)\n' + fs.readFileSync(routingPath, 'utf8') + '\n---'
    }
  } catch {}
  return ''
}

// ── Algorithm v3.7.0 loader ─────────────────────────────────────────────────
function loadAlgorithm() {
  try {
    const latestPath = path.join(PAI_DIR, 'Algorithm', 'LATEST')
    let version = 'v3.7.0'
    if (fs.existsSync(latestPath)) {
      version = fs.readFileSync(latestPath, 'utf8').trim()
    }
    const algoPath = path.join(PAI_DIR, 'Algorithm', version + '.md')
    if (fs.existsSync(algoPath)) {
      return fs.readFileSync(algoPath, 'utf8')
    }
  } catch {}
  return null
}

// Load rules file for context injection
function loadChatRules(agentId = '') {
  let chatRules = ''
  try {
    const isOrch = new Set(['pai', 'atum', 'christian']).has(agentId.toLowerCase())
    const rulePath = isOrch
      ? RULES_PATH
      : (fs.existsSync(RULES_COMPACT_PATH) ? RULES_COMPACT_PATH : RULES_PATH)
    if (fs.existsSync(rulePath)) {
      chatRules = '\n\n---\nPRIORITY RULES\n' + fs.readFileSync(rulePath, 'utf8') + '\n---\n'
    }
  } catch {}
  return chatRules
}

module.exports = {
  loadBaseContext,
  loadPAIAgentsContext,
  loadPAIContextRouting,
  loadAlgorithm,
  loadChatRules,
  PAI_DIR,
}
