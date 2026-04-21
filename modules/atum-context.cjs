'use strict'
// ============================================================================
// atum-context.cjs
// Purpose  : loadBaseContext (date, tools hint, agents registry),
//            loadPAIAgentsContext
// Owner    : Aymeric
// Source   : server.js lines 810-870
// ============================================================================

const path = require('path')
const fs   = require('fs')
const { CUSTOM_AGENTS_DIR, AGENTS_DIR, RULES_PATH, RULES_COMPACT_PATH } = require('./atum-filesystem.cjs')

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

  // Document generation tools — always available
  context += `\n\n---\n## Outils de génération de fichiers (TOUJOURS DISPONIBLES)\n\nQuand l'utilisateur demande un PDF, Excel ou Word — utilise DIRECTEMENT ces outils :\n- \`generate_pdf\` — Génère un PDF téléchargeable (rapport, dossier, synthèse, note, etc.)\n- \`generate_excel\` — Génère un fichier Excel .xlsx (tableaux, budgets, données financières)\n- \`generate_word\` — Génère un document Word .docx\n\n⚠️ Ne dis JAMAIS "je n'ai pas d'outil de génération" — ces outils sont toujours disponibles.\n---`

  // PAI agents registry — only for orchestrators
  const aid = agentId.toLowerCase()
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
  loadChatRules,
}
