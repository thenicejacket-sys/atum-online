'use strict'

/**
 * PAI Knowledge Base — Supabase Cloud Service
 * Remplace le stockage JSON local par PostgreSQL Supabase.
 * API identique à l'ancienne version — transparent pour les agents.
 */

const SUPABASE_URL = 'https://ataxqfqlprndcjisepbn.supabase.co'
const SUPABASE_KEY = 'sb_publishable_qZMWIStnnUbnmdVxKB4DyA_Bpj10XoY'
const REST = `${SUPABASE_URL}/rest/v1`

const BASE_HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

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
        headers: { ...BASE_HEADERS, 'Prefer': 'return=minimal' },
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
      { method: 'DELETE', headers: BASE_HEADERS }
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

module.exports = { searchKnowledge, saveToKnowledge, listKnowledge, deleteFromKnowledge }
