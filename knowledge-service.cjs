'use strict'

/**
 * PAI Knowledge Base — BM25 Search Service
 * Stockage local JSON, recherche BM25 (standard industriel), 100% offline.
 * Compatible avec toutes les versions d'Electron/asar — aucun module natif.
 */

const fs   = require('fs')
const path = require('path')
const os   = require('os')

const KNOWLEDGE_DIR = path.join(os.homedir(), '.claude', 'knowledge')
const K1 = 1.5   // BM25 term saturation
const B  = 0.75  // BM25 length normalization

// ── Helpers ──────────────────────────────────────────────────────────────────

function getAgentDir(agentId) {
  const dir = path.join(KNOWLEDGE_DIR, agentId)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getIndexPath(agentId) {
  return path.join(getAgentDir(agentId), 'index.json')
}

function loadIndex(agentId) {
  const p = getIndexPath(agentId)
  if (!fs.existsSync(p)) return { docs: [], version: 1 }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) }
  catch { return { docs: [], version: 1 } }
}

function saveIndex(agentId, index) {
  fs.writeFileSync(getIndexPath(agentId), JSON.stringify(index, null, 2), 'utf8')
}

function tokenize(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents for matching
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t))
}

function termFreq(tokens) {
  const freq = {}
  for (const t of tokens) freq[t] = (freq[t] || 0) + 1
  return freq
}

function chunkText(text, chunkWords = 350, overlapWords = 60) {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length <= chunkWords) return [text]
  const chunks = []
  let i = 0
  while (i < words.length) {
    chunks.push(words.slice(i, i + chunkWords).join(' '))
    i += chunkWords - overlapWords
    if (i + overlapWords >= words.length) break
  }
  if (i < words.length) chunks.push(words.slice(i).join(' '))
  return chunks
}

function buildIdf(docs, queryTokens) {
  const N = docs.length
  const idf = {}
  for (const t of queryTokens) {
    const df = docs.filter(d => (d.tf[t] || 0) > 0).length
    idf[t] = Math.log((N - df + 0.5) / (df + 0.5) + 1)
  }
  return idf
}

function bm25Score(doc, queryTokens, idf, avgLen) {
  let score = 0
  for (const t of queryTokens) {
    const tf  = doc.tf[t] || 0
    if (tf === 0) continue
    const num = tf * (K1 + 1)
    const den = tf + K1 * (1 - B + B * doc.len / avgLen)
    score += (idf[t] || 0) * num / den
  }
  return score
}

// French + English stopwords
const STOPWORDS = new Set([
  'le','la','les','un','une','des','du','de','en','et','est','au','aux',
  'ce','se','sa','son','ses','mon','ton','ma','ta','mes','tes','qui','que',
  'que','quoi','ou','et','mais','donc','or','ni','car','si','ne','pas',
  'plus','par','sur','dans','avec','pour','sans','sous','entre','vers',
  'the','a','an','of','to','in','is','it','for','on','are','at','by',
  'this','that','with','from','be','was','have','has','not','but','or',
  'as','can','all','its','also','one','two','three','will','been','more',
])

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Save a document to the agent's knowledge base.
 * @param {string} agentId - e.g. 'lionel', 'christian'
 * @param {string} content - raw text to index
 * @param {object} metadata - { source, topic, date, tags }
 * @returns {{ saved: number, totalDocs: number }}
 */
function saveToKnowledge(agentId, content, metadata = {}) {
  const index  = loadIndex(agentId)
  const chunks = chunkText(content)
  const now    = new Date().toISOString().slice(0, 10)
  const ids    = []

  for (const chunk of chunks) {
    const tokens = tokenize(chunk)
    if (tokens.length < 3) continue   // skip tiny chunks
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    index.docs.push({
      id,
      content: chunk,
      tf:  termFreq(tokens),
      len: tokens.length,
      metadata: { source: 'manual', topic: '', date: now, tags: [], ...metadata, agentId },
    })
    ids.push(id)
  }

  saveIndex(agentId, index)
  return { saved: ids.length, totalDocs: index.docs.length }
}

/**
 * Search the agent's knowledge base using BM25.
 * @param {string} agentId
 * @param {string} query
 * @param {number} topK - max results (default 3)
 * @returns {Array<{ id, content, score, metadata }>}
 */
function searchKnowledge(agentId, query, topK = 3) {
  const index = loadIndex(agentId)
  if (!index.docs.length) return []

  const qTokens = tokenize(query)
  if (!qTokens.length) return []

  const avgLen = index.docs.reduce((s, d) => s + d.len, 0) / index.docs.length
  const idf    = buildIdf(index.docs, qTokens)

  return index.docs
    .map(doc => ({ ...doc, score: bm25Score(doc, qTokens, idf, avgLen) }))
    .filter(d => d.score > 0.01)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(d => ({
      id:       d.id,
      content:  d.content,
      score:    Math.round(d.score * 100) / 100,
      metadata: d.metadata,
    }))
}

/**
 * List all documents in the agent's knowledge base, grouped by source.
 * @param {string} agentId
 */
function listKnowledge(agentId) {
  const index = loadIndex(agentId)
  const groups = {}
  for (const doc of index.docs) {
    const src = doc.metadata?.source || 'sans source'
    if (!groups[src]) groups[src] = { count: 0, topic: doc.metadata?.topic || '', date: doc.metadata?.date || '' }
    groups[src].count++
  }
  return {
    agentId,
    totalChunks: index.docs.length,
    sources: groups,
    storagePath: getIndexPath(agentId),
  }
}

/**
 * Delete all documents from a given source.
 * @param {string} agentId
 * @param {string} source - the source name to delete
 */
function deleteFromKnowledge(agentId, source) {
  const index  = loadIndex(agentId)
  const before = index.docs.length
  index.docs   = index.docs.filter(d => d.metadata?.source !== source)
  saveIndex(agentId, index)
  return { deleted: before - index.docs.length, remaining: index.docs.length }
}

module.exports = { saveToKnowledge, searchKnowledge, listKnowledge, deleteFromKnowledge }
