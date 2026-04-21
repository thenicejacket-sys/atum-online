'use strict'
// ============================================================================
// atum-agents.cjs
// Purpose  : Agent file resolution, model tier mapping, system prompt loading
// Owner    : Aymeric
// Source   : server.js lines 872-945
// Updated  : v4.0.3 frontmatter support (isolation, skills, permissions)
// ============================================================================

const path = require('path')
const fs   = require('fs')
const { DATA_DIR, CUSTOM_AGENTS_DIR, AGENTS_DIR } = require('./atum-filesystem.cjs')

// ── Skill context aliases (agent ID -> Context file base name) ───────────────
const SKILL_CONTEXT_ALIASES = {
  'nathan': 'N8than', 'n8than': 'N8than',
  'atum-diagnostic': 'John', 'john': 'John',
  'atum-analyse': 'Olive', 'olive': 'Olive',
  'atum-offre': 'Silvia', 'silvia': 'Silvia',
  'atum': 'Tom', 'tom': 'Tom',
  'claude-researcher': 'ClaudeResearcher', 'clauderesearcher': 'ClaudeResearcher',
  'gemini-researcher': 'GeminiResearcher', 'geminiresearcher': 'GeminiResearcher',
  'grok-researcher': 'GrokResearcher', 'grokresearcher': 'GrokResearcher',
  'perplexity-researcher': 'PerplexityResearcher', 'perplexityresearcher': 'PerplexityResearcher',
  'codex-researcher': 'CodexResearcher', 'codexresearcher': 'CodexResearcher',
  'qa-tester': 'QATester', 'qatester': 'QATester',
}

function findAgentFile(agentId) {
  const dirs = [CUSTOM_AGENTS_DIR, AGENTS_DIR, path.join(__dirname, '..', 'agents')]
  const idLower = agentId.toLowerCase()
  for (const dir of dirs) {
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'))
      for (const file of files) {
        const name = file.replace(/\.md$/i, '').toLowerCase()
        if (name === idLower) return path.join(dir, file)
      }
    } catch {}
  }
  return null
}

function resolveModel(modelKey) {
  if (!modelKey) return 'claude-sonnet-4-6'
  if (modelKey === 'haiku') return 'claude-haiku-4-5-20251001'
  if (modelKey === 'sonnet') return 'claude-sonnet-4-6'
  if (modelKey === 'opus') return 'claude-opus-4-6'
  if (modelKey.includes('claude-')) return modelKey
  return 'claude-sonnet-4-6'
}

// ── Parse frontmatter YAML block ─────────────────────────────────────────────
function parseFrontmatter(raw) {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) return {}
  const fm = fmMatch[1]
  const result = {}
  const keys = ['model', 'isolation', 'color', 'name', 'description']
  for (const key of keys) {
    const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
    if (m) result[key] = m[1].trim()
  }
  // Parse skills: array (YAML list)
  const skillsMatch = fm.match(/^skills:\n((?:\s+-\s+.+\n?)+)/m)
  if (skillsMatch) {
    result.skills = skillsMatch[1].match(/^\s+-\s+(.+)$/gm)
      ?.map(s => s.replace(/^\s+-\s+/, '').trim()) || []
  }
  // Parse permissions: block
  const permsMatch = fm.match(/^permissions:\n((?:\s+.+\n?)+)/m)
  if (permsMatch) {
    const allowMatch = permsMatch[1].match(/allow:\n((?:\s+-\s+.+\n?)+)/m)
    if (allowMatch) {
      result.permissions = {
        allow: allowMatch[1].match(/^\s+-\s+"?(.+?)"?\s*$/gm)
          ?.map(s => s.replace(/^\s+-\s+"?/, '').replace(/"?\s*$/, '').trim()) || []
      }
    }
  }
  return result
}

function loadAgentSystemPrompt(agentId, fallbackPrompt) {
  try {
    if (agentId === 'pai') {
      const desktopPromptPath = path.join(DATA_DIR, 'DESKTOP_PROMPT.md')
      const skillPath = path.join(DATA_DIR, 'SKILL.md')
      const sourcePath = fs.existsSync(desktopPromptPath)
        ? desktopPromptPath
        : (fs.existsSync(skillPath) ? skillPath : null)
      if (sourcePath) {
        const raw = fs.readFileSync(sourcePath, 'utf8')
        const fm = parseFrontmatter(raw)
        return { prompt: raw.replace(/^---[\s\S]*?---\n?/, '').trim(), model: fm.model || null, isolation: fm.isolation, skills: fm.skills }
      }
    }
    const agentFile = findAgentFile(agentId)
    if (agentFile) {
      const raw = fs.readFileSync(agentFile, 'utf8')
      const fm = parseFrontmatter(raw)
      const prompt = raw.replace(/^---[\s\S]*?---\n?/, '').trim()
      // Auto-load skill context — check local v4.0.3 skills first, then DATA_DIR/skills
      let skillContext = ''
      try {
        const alias = SKILL_CONTEXT_ALIASES[agentId.toLowerCase()]
        const baseName = alias || (agentId.charAt(0).toUpperCase() + agentId.slice(1))
        const localSkillCtx = path.join(__dirname, '..', 'skills', 'Agents', baseName + 'Context.md')
        const dataSkillCtx = path.join(DATA_DIR, 'skills', baseName + 'Context.md')
        const skillCtxPath = fs.existsSync(localSkillCtx) ? localSkillCtx : dataSkillCtx
        if (fs.existsSync(skillCtxPath)) {
          skillContext = '\n\n---\n## SKILL CONTEXT\n'
            + fs.readFileSync(skillCtxPath, 'utf8') + '\n---'
        }
      } catch {}
      return {
        prompt: prompt + skillContext,
        model: fm.model || null,
        isolation: fm.isolation,
        skills: fm.skills,
        permissions: fm.permissions,
        color: fm.color,
      }
    }
  } catch {}
  return { prompt: fallbackPrompt, model: null }
}

module.exports = {
  findAgentFile,
  resolveModel,
  parseFrontmatter,
  loadAgentSystemPrompt,
  SKILL_CONTEXT_ALIASES,
}
