'use strict'
// ============================================================================
// atum-errors.cjs
// Purpose  : Human-readable error translation + result truncation utility
// Owner    : Aymeric
// Source   : server.js lines 375-438
// ============================================================================

const MAX_TOOL_RESULT_CHARS = 8000

function explainError(context, err) {
  const msg = err?.message || String(err)
  const low = msg.toLowerCase()

  if (low.includes('enoent') || low.includes('no such file')) {
    const p = msg.match(/'([^']+)'/)
    return `File not found${p ? `: \`${p[1]}\`` : ''}`
  }
  if (low.includes('eacces') || low.includes('permission denied')) {
    return `Permission denied — cannot read/write this file.`
  }
  if (low.includes('429') || low.includes('rate limit')) {
    return `Rate limited. Wait 30 seconds and try again.`
  }
  if (low.includes('401') || low.includes('unauthorized') || low.includes('invalid api key') || low.includes('api key')) {
    return `Invalid or missing API key.`
  }
  if (low.includes('403') || low.includes('forbidden')) {
    return `Access denied (403).`
  }
  if (low.includes('500') || low.includes('502') || low.includes('503') || low.includes('server error')) {
    return `Anthropic server error. Retry shortly.`
  }
  if (low.includes('cannot find module') || low.includes('module not found')) {
    const modMatch = msg.match(/cannot find module '([^']+)'/i)
    return `Missing module: ${modMatch ? modMatch[1] : 'unknown'}.`
  }
  if (low.includes('network') || low.includes('econnrefused') || low.includes('enotfound')) {
    return `Network error. Check your connection.`
  }
  if (low.includes('context_length') || low.includes('too long') || low.includes('max_tokens')) {
    return `Context too long for the API. Reduce workspace size or start a new conversation.`
  }
  if (low.includes('timeout') || low.includes('timed out')) {
    return `Request timed out. Retry.`
  }
  return `Error in ${context}: ${msg}`
}

function truncateResult(text, max) {
  if (text.length <= max) return text
  const half = Math.floor(max / 2) - 50
  return text.slice(0, half) + '\n\n[... truncated — ' + text.length + ' chars total ...]\n\n' + text.slice(-half)
}

// Generated files registry — download links with 24h TTL
const _generatedFiles = new Map()
setInterval(() => {
  const now = Date.now()
  for (const [id, entry] of _generatedFiles.entries()) {
    if (now > entry.expires) {
      try { require('fs').unlinkSync(entry.path) } catch {}
      _generatedFiles.delete(id)
    }
  }
}, 60 * 60 * 1000)

function registerFile(filepath, name) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  _generatedFiles.set(id, { path: filepath, name, expires: Date.now() + 24 * 60 * 60 * 1000 })
  return id
}

function getGeneratedFile(id) {
  return _generatedFiles.get(id) || null
}

module.exports = {
  explainError,
  truncateResult,
  registerFile,
  getGeneratedFile,
  MAX_TOOL_RESULT_CHARS,
}
