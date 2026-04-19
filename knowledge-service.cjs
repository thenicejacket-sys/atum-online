'use strict'

/**
 * PAI Knowledge Base — Supabase Cloud Service
 * Remplace le stockage JSON local par PostgreSQL Supabase.
 * API identique à l'ancienne version — transparent pour les agents.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ataxqfqlprndcjisepbn.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const REST = `${SUPABASE_URL}/rest/v1`

// Service_role key for all operations (server-side only, bypasses RLS)
const BASE_HEADERS = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
}
const WRITE_HEADERS = BASE_HEADERS

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function chunkText(text, maxWords = 800) {
  const paragraphs = text.split(/\n\n+/)
  const chunks = []
  let current = ''
  for (const para of paragraphs) {
    const words = para.split(/\s+/).length
    if (current && current.split(/\s+/).length + words > maxWords) {
      chunks.push(current.trim())
      current = para
    } else {
      current = current ? current + '\n\n' + para : para
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.length ? chunks : [text.trim()]
}

// ── searchKnowledge ───────────────────────────────────────────────────────────
// Recherche PostgreSQL FTS via RPC, avec fallback ILIKE si 0 résultats.

async function searchKnowledge(agentId, query, topK = 5) {
  topK = Math.min(topK || 5, 10)

  // 1. Essai FTS via la fonction search_kb
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/search_kb`, {
      method: 'POST',
      headers: BASE_HEADERS,
      body: JSON.stringify({ p_agent_id: agentId, p_query: query, p_top_k: topK }),
    })
    if (res.ok) {
      const rows = await res.json()
      if (Array.isArray(rows) && rows.length > 0) {
        return rows.map(r => ({
          content: r.content,
          source:  r.source  || '',
          topic:   r.topic   || '',
          score:   r.rank    || 0,
        }))
      }
    }
  } catch {}

  // 2. Fallback ILIKE sur les mots-clés
  try {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2).slice(0, 4)
    if (!words.length) return []
    const orFilter = words.map(w => `content.ilike.*${encodeURIComponent(w)}*`).join(',')
    const url = `${REST}/knowledge?agent_id=eq.${encodeURIComponent(agentId)}&or=(${orFilter})&limit=${topK}`
    const res = await fetch(url, { headers: BASE_HEADERS })
    if (res.ok) {
      const rows = await res.json()
      return (rows || []).map(r => ({ content: r.content, source: r.source || '', topic: r.topic || '', score: 0.3 }))
    }
  } catch {}

  return []
}

// ── saveToKnowledge ───────────────────────────────────────────────────────────

async function saveToKnowledge(agentId, content, source, topic, tags) {
  const chunks = chunkText(content)
  let saved = 0

  const rows = chunks.map(chunk => ({
    id:       uid(),
    agent_id: agentId,
    content:  chunk,
    source:   source || null,
    topic:    topic  || null,
    tags:     Array.isArray(tags) ? tags : (tags ? [tags] : []),
  }))

  // Insérer en batch de 50
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50)
    try {
      const res = await fetch(`${REST}/knowledge`, {
        method: 'POST',
        headers: { ...WRITE_HEADERS, 'Prefer': 'return=minimal' },
        body: JSON.stringify(batch),
      })
      if (res.ok) saved += batch.length
    } catch {}
  }

  // Compter total pour cet agent
  let totalDocs = saved
  try {
    const res = await fetch(`${REST}/knowledge?agent_id=eq.${encodeURIComponent(agentId)}&select=id`, { headers: BASE_HEADERS })
    if (res.ok) totalDocs = (await res.json()).length
  } catch {}

  return { saved, totalDocs, storagePath: `supabase://${agentId}` }
}

// ── listKnowledge ─────────────────────────────────────────────────────────────

async function listKnowledge(agentId) {
  try {
    const res = await fetch(
      `${REST}/knowledge?agent_id=eq.${encodeURIComponent(agentId)}&select=source,topic,created_at&order=created_at.desc`,
      { headers: BASE_HEADERS }
    )
    const rows = res.ok ? await res.json() : []
    const sources = {}
    for (const r of (rows || [])) {
      const s = r.source || '(sans source)'
      sources[s] = (sources[s] || 0) + 1
    }
    return { totalChunks: (rows || []).length, sources, storagePath: `supabase://${agentId}` }
  } catch {
    return { totalChunks: 0, sources: {}, storagePath: `supabase://${agentId}` }
  }
}

// ── deleteFromKnowledge ───────────────────────────────────────────────────────

async function deleteFromKnowledge(agentId, source) {
  try {
    const res = await fetch(
      `${REST}/knowledge?agent_id=eq.${encodeURIComponent(agentId)}&source=eq.${encodeURIComponent(source)}`,
      { method: 'DELETE', headers: WRITE_HEADERS }
    )
    // Compter restants
    const listRes = await fetch(
      `${REST}/knowledge?agent_id=eq.${encodeURIComponent(agentId)}&select=id`,
      { headers: BASE_HEADERS }
    )
    const remaining = listRes.ok ? (await listRes.json()).length : 0
    return { deleted: res.ok ? 1 : 0, remaining }
  } catch {
    return { deleted: 0, remaining: 0 }
  }
}

// ── reflectAndLearn ──────────────────────────────────────────────────────────
// Auto-apprentissage : sauvegarde des learnings catégorisés avec dédup.
// Utilise la table `knowledge` existante avec source="learning:{category}".

async function reflectAndLearn(agentId, learnings) {
  if (!agentId || !Array.isArray(learnings) || !learnings.length) {
    return { saved: 0, skipped: 0, reason: 'No learnings provided' }
  }

  let saved = 0
  let skipped = 0

  for (const l of learnings) {
    const category = l.category || 'knowledge'  // correction | preference | knowledge
    const content = (l.content || '').trim()
    if (!content || content.length < 10) { skipped++; continue }

    // Dedup: check if similar learning already exists (first 60 chars ILIKE)
    const needle = content.substring(0, 60).replace(/[%_'"]/g, '')
    try {
      const checkUrl = `${REST}/knowledge?agent_id=eq.${encodeURIComponent(agentId)}&source=like.learning:*&content=ilike.*${encodeURIComponent(needle)}*&limit=1`
      const checkRes = await fetch(checkUrl, { headers: BASE_HEADERS })
      if (checkRes.ok) {
        const existing = await checkRes.json()
        if (existing && existing.length > 0) { skipped++; continue }
      }
    } catch {}

    // Save as learning entry
    try {
      const row = {
        id: uid(),
        agent_id: agentId,
        content: content,
        source: `learning:${category}`,
        topic: l.topic || category,
        tags: ['learning', category, ...(l.tags || [])],
      }
      const res = await fetch(`${REST}/knowledge`, {
        method: 'POST',
        headers: { ...WRITE_HEADERS, 'Prefer': 'return=minimal' },
        body: JSON.stringify([row]),
      })
      if (res.ok) saved++
    } catch {}
  }

  return { saved, skipped, totalLearnings: saved + skipped }
}

// ── getRecentLearnings ──────────────────────────────────────────────────────
// Charge les learnings récents d'un agent, capped à maxTokens (~4 chars/token).

async function getRecentLearnings(agentId, maxTokens = 2000) {
  if (!agentId) return ''

  try {
    const url = `${REST}/knowledge?agent_id=eq.${encodeURIComponent(agentId)}&source=like.learning:*&order=created_at.desc&limit=30`
    const res = await fetch(url, { headers: BASE_HEADERS })
    if (!res.ok) return ''

    const rows = await res.json()
    if (!rows || !rows.length) return ''

    // Group by category
    const byCategory = { correction: [], preference: [], knowledge: [] }
    for (const r of rows) {
      const cat = (r.source || '').replace('learning:', '') || 'knowledge'
      if (byCategory[cat]) byCategory[cat].push(r.content)
      else byCategory.knowledge.push(r.content)
    }

    // Build injection text, respecting token budget
    let text = '\n\n---\n## MÉMOIRE D\'APPRENTISSAGE (auto-améliorations)\n'
    let charBudget = maxTokens * 4  // ~4 chars per token
    charBudget -= text.length

    const labels = { correction: 'Corrections apprises', preference: 'Préférences utilisateur', knowledge: 'Connaissances acquises' }
    for (const [cat, items] of Object.entries(byCategory)) {
      if (!items.length) continue
      const header = `\n### ${labels[cat] || cat}\n`
      if (charBudget < header.length + 20) break
      text += header
      charBudget -= header.length
      for (const item of items) {
        const line = `- ${item}\n`
        if (charBudget < line.length) break
        text += line
        charBudget -= line.length
      }
    }

    text += '---\n'
    return text
  } catch {
    return ''
  }
}

// ── getAgentProfile ─────────────────────────────────────────────────────────
// Retourne le profil de progression d'un agent.

async function getAgentProfile(agentId) {
  if (!agentId) return { agent_id: agentId, total_learnings: 0, by_category: {}, total_kb_entries: 0 }

  try {
    // Count learnings by category
    const lUrl = `${REST}/knowledge?agent_id=eq.${encodeURIComponent(agentId)}&source=like.learning:*&select=source,created_at&order=created_at.desc`
    const lRes = await fetch(lUrl, { headers: BASE_HEADERS })
    const learnings = lRes.ok ? await lRes.json() : []

    const byCategory = {}
    let lastLearning = null
    for (const r of (learnings || [])) {
      const cat = (r.source || '').replace('learning:', '') || 'knowledge'
      byCategory[cat] = (byCategory[cat] || 0) + 1
      if (!lastLearning) lastLearning = r.created_at
    }

    // Count total KB entries (non-learning)
    const kUrl = `${REST}/knowledge?agent_id=eq.${encodeURIComponent(agentId)}&source=not.like.learning:*&select=id`
    const kRes = await fetch(kUrl, { headers: BASE_HEADERS })
    const kbEntries = kRes.ok ? (await kRes.json()).length : 0

    return {
      agent_id: agentId,
      total_learnings: (learnings || []).length,
      by_category: byCategory,
      total_kb_entries: kbEntries,
      last_learning: lastLearning,
    }
  } catch {
    return { agent_id: agentId, total_learnings: 0, by_category: {}, total_kb_entries: 0 }
  }
}

module.exports = { searchKnowledge, saveToKnowledge, listKnowledge, deleteFromKnowledge, reflectAndLearn, getRecentLearnings, getAgentProfile }
