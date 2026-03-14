// ============================================================================
// ATUM Online — Express server (adapted from PAI Desktop main.cjs)
// SaaS web version: no Electron, API key via header, streaming SSE
// ============================================================================

// ── Agent usage tracking (Supabase) ─────────────────────────────────────────
const _SUPA_URL = 'https://ataxqfqlprndcjisepbn.supabase.co'
const _SUPA_KEY = 'sb_publishable_qZMWIStnnUbnmdVxKB4DyA_Bpj10XoY'
const _AGENT_NAMES = {
  'atum':'Tom','atum-diagnostic':'John','atum-analyse':'Olivier','atum-offre':'Silvia',
  'nathan':'N8than','fabrice':'Fabrice','christian':'Christian','frank':'Frank',
  'sophie':'Sophie','norman':'Norman','magali':'Magalie','catalin':'Catalin',
  'lionel':'Lionel','axelle':'Axelle','aziza':'Aziza','julie':'Julie','josie':'Julie',
}
function recordAgentUsage (agentId) {
  if (!agentId) return
  const agent_name = _AGENT_NAMES[agentId.toLowerCase()] || agentId
  fetch(_SUPA_URL + '/rest/v1/agent_usage', {
    method: 'POST',
    headers: {
      'apikey': _SUPA_KEY, 'Authorization': 'Bearer ' + _SUPA_KEY,
      'Content-Type': 'application/json', 'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ agent_id: agentId, agent_name }),
  }).catch(() => {})
}

const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawn } = require('child_process')

// Knowledge base service (BM25 search — same module as desktop)
let kb
try {
  kb = require('./knowledge-service.cjs')
} catch {
  // Inline minimal KB stub if the file is missing
  kb = {
    searchKnowledge: () => [],
    saveToKnowledge: () => ({ saved: 0, totalDocs: 0 }),
    listKnowledge: () => ({ totalChunks: 0, sources: {}, storagePath: '' }),
    deleteFromKnowledge: () => ({ deleted: 0, remaining: 0 }),
  }
}

const app = express()
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }))
app.use(express.json({ limit: '50mb' }))
app.use(express.static(path.join(__dirname, 'dist')))
const PORT = process.env.PORT || 3001

// ── Path mapping (Electron homedir paths -> server-relative paths) ──────────
const DATA_DIR = path.join(__dirname, 'data')
const AGENTS_DIR = path.join(DATA_DIR, 'agents')
const CUSTOM_AGENTS_DIR = path.join(DATA_DIR, 'custom-agents')
const DATABASES_DIR = path.join(DATA_DIR, 'databases')
const RULES_PATH = path.join(DATA_DIR, 'rules.md')
const RULES_COMPACT_PATH = path.join(DATA_DIR, 'rules-compact.md')

const GMAIL_CONFIG_PATH = path.join(DATA_DIR, 'gmail-config.json')
const GMAIL_TOKEN_PATH  = path.join(DATA_DIR, 'gmail-token.json')

// ── Folder reader ─────────────────────────────────────────────────────────────
const BLOCKED_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', '.cache', 'coverage', 'vendor', '.venv', 'venv'])
const TEXT_EXTS = new Set(['.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.json', '.py', '.html', '.css', '.scss', '.yaml', '.yml', '.sh', '.sql', '.csv', '.xml', '.toml', '.ini', '.cfg', '.log', '.env', '.gitignore', '.dockerfile', '.tf', '.go', '.rs', '.java', '.rb', '.php', '.cs', '.cpp', '.c', '.h'])
const MAX_FILE_CHARS = 60000   // 60 KB per file
const MAX_TOTAL_CHARS = 300000 // 300 KB total across all files

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

// ── PAI Tools (Warp parity) ───────────────────────────────────────────────────
const PAI_TOOLS = [
  {
    name: 'read_file',
    description: 'Read the contents of a file. Returns the file content as text. Use relative paths when a workspace is active.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to read (relative to workspace, or absolute)' }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write or overwrite a file with new content. Creates parent directories if needed.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to write (relative to workspace, or absolute)' },
        content: { type: 'string', description: 'Content to write to the file' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'list_directory',
    description: 'List files and directories at a given path. Use "." for workspace root.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to list (relative to workspace, or absolute). Use "." for root.' }
      },
      required: ['path']
    }
  },
  {
    name: 'execute_command',
    description: 'Execute a shell command and return stdout/stderr.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        cwd: { type: 'string', description: 'Working directory (relative to workspace or absolute). Defaults to workspace.' }
      },
      required: ['command']
    }
  },
  {
    name: 'grep_files',
    description: 'Search for a pattern (regex or literal string) across files in a directory. Returns matching file paths and line content.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Search pattern (regex or literal string)' },
        path: { type: 'string', description: 'Directory or file to search in (relative to workspace or absolute)' },
        glob: { type: 'string', description: 'Optional file glob filter, e.g. "*.js" or "**/*.ts"' },
        case_insensitive: { type: 'boolean', description: 'Case-insensitive search (default false)' }
      },
      required: ['pattern', 'path']
    }
  },
  {
    name: 'glob_files',
    description: 'Find files matching a glob pattern in a directory. Returns list of matching file paths.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern, e.g. "**/*.ts", "src/**/*.js", "*.md"' },
        path: { type: 'string', description: 'Root directory to search from (relative to workspace or absolute)' }
      },
      required: ['pattern', 'path']
    }
  },
  // ── Knowledge Base tools ──────────────────────────────────────────────────
  {
    name: 'search_knowledge',
    description: 'Search the agent\'s personal knowledge base using BM25 semantic ranking.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        agent_id: { type: 'string', description: 'The agent ID whose knowledge base to search' },
        top_k: { type: 'number', description: 'Number of results to return (default 3, max 8)' }
      },
      required: ['query', 'agent_id']
    }
  },
  {
    name: 'save_to_knowledge',
    description: 'Save a piece of information to the agent\'s personal knowledge base for future retrieval.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent ID whose knowledge base to save to' },
        content: { type: 'string', description: 'The full text content to index and save' },
        source: { type: 'string', description: 'Short name identifying the source' },
        topic: { type: 'string', description: 'Topic category' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional list of tags for filtering' }
      },
      required: ['agent_id', 'content', 'source']
    }
  },
  {
    name: 'list_knowledge',
    description: 'List all documents currently stored in the agent\'s knowledge base, grouped by source.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent ID' }
      },
      required: ['agent_id']
    }
  }
]

// ── Human-readable error translator ──────────────────────────────────────────
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

// ── Tool execution ──────────────────────────────────────────────────────────
const MAX_TOOL_RESULT_CHARS = 8000

function truncateResult(text, max) {
  if (text.length <= max) return text
  const half = Math.floor(max / 2) - 50
  return text.slice(0, half) + '\n\n[... truncated — ' + text.length + ' chars total ...]\n\n' + text.slice(-half)
}

async function executeTool(name, input, workspacePath, streamFn) {
  const resolvePath = (p) => {
    if (!p || p === '.') return workspacePath || os.homedir()
    if (path.isAbsolute(p)) return p
    return path.join(workspacePath || os.homedir(), p)
  }

  try {
    switch (name) {
      case 'read_file': {
        const fullPath = resolvePath(input.path)
        const content = fs.readFileSync(fullPath, 'utf8')
        return truncateResult(content, MAX_TOOL_RESULT_CHARS)
      }

      case 'write_file': {
        const fullPath = resolvePath(input.path)
        fs.mkdirSync(path.dirname(fullPath), { recursive: true })
        fs.writeFileSync(fullPath, input.content, 'utf8')
        return `File written successfully: ${fullPath} (${input.content.length} chars)`
      }

      case 'list_directory': {
        const fullPath = resolvePath(input.path)
        const entries = fs.readdirSync(fullPath, { withFileTypes: true })
        const lines = entries.map(e => {
          const isDir = e.isDirectory()
          let extra = ''
          if (!isDir) {
            try { extra = ` (${fs.statSync(path.join(fullPath, e.name)).size} bytes)` } catch {}
          }
          return `${isDir ? 'd' : 'f'} ${e.name}${extra}`
        })
        return `Contents of ${fullPath}:\n${lines.join('\n')}`
      }

      case 'execute_command': {
        return new Promise((resolve) => {
          const cwd = resolvePath(input.cwd || '.')
          // Use sh on Linux/macOS, cmd.exe on Windows
          const isWin = process.platform === 'win32'
          const shell = isWin ? 'cmd.exe' : '/bin/sh'
          const shellArgs = isWin ? ['/c', input.command] : ['-c', input.command]
          const proc = spawn(shell, shellArgs, {
            cwd: fs.existsSync(cwd) ? cwd : os.homedir(),
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env },
          })
          let stdout = '', stderr = ''
          proc.stdout.on('data', d => { stdout += d.toString() })
          proc.stderr.on('data', d => { stderr += d.toString() })
          proc.on('close', code => {
            let out = stdout.trimEnd()
            if (stderr.trim()) out += `\n[STDERR]\n${stderr.trimEnd()}`
            if (!out) out = `Command exited with code ${code}`
            if (out.length > MAX_TOOL_RESULT_CHARS) {
              out = truncateResult(out, MAX_TOOL_RESULT_CHARS)
            }
            resolve(out)
          })
          proc.on('error', err => resolve(`Error executing command: ${err.message}`))
          proc.stdin.end()
        })
      }

      case 'grep_files': {
        const searchPath = resolvePath(input.path)
        return new Promise((resolve) => {
          // Use grep on Linux/macOS, PowerShell on Windows
          const isWin = process.platform === 'win32'
          let proc
          if (isWin) {
            const globFilter = input.glob ? ` -Include "${input.glob}"` : ''
            const flags = input.case_insensitive ? '' : '-CaseSensitive'
            const psCmd = `Get-ChildItem -Path "${searchPath}" -Recurse${globFilter} -File | Select-String -Pattern "${input.pattern.replace(/"/g, '\\"')}" ${flags} | Select-Object -First 200 | ForEach-Object { "$($_.Filename):$($_.LineNumber): $($_.Line.Trim())" }`
            proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd], {
              env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
            })
          } else {
            const args = ['-rn']
            if (input.case_insensitive) args.push('-i')
            if (input.glob) args.push(`--include=${input.glob}`)
            args.push(input.pattern, searchPath)
            proc = spawn('grep', args, {
              env: process.env, stdio: ['ignore', 'pipe', 'pipe']
            })
          }
          let out = ''
          proc.stdout.on('data', d => { out += d.toString() })
          proc.on('close', () => resolve(truncateResult(out.trim() || 'No matches found', MAX_TOOL_RESULT_CHARS)))
          proc.on('error', err => resolve(`grep_files error: ${err.message}`))
        })
      }

      case 'glob_files': {
        const searchPath = resolvePath(input.path)
        return new Promise((resolve) => {
          const isWin = process.platform === 'win32'
          let proc
          if (isWin) {
            const pattern = input.pattern.includes('/') ? input.pattern.split('/').pop() : input.pattern
            const psCmd = `(Get-ChildItem -Path "${searchPath}" -Recurse -Filter "${pattern}" | Select-Object -First 500).FullName -join "\`n"`
            proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd], {
              env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
            })
          } else {
            const pattern = input.pattern.includes('/') ? input.pattern.split('/').pop() : input.pattern
            proc = spawn('find', [searchPath, '-name', pattern, '-type', 'f'], {
              env: process.env, stdio: ['ignore', 'pipe', 'pipe']
            })
          }
          let out = ''
          proc.stdout.on('data', d => { out += d.toString() })
          proc.on('close', () => resolve(out.trim() || 'No files found matching pattern'))
          proc.on('error', err => resolve(`glob_files error: ${err.message}`))
        })
      }

      // ── Knowledge Base ────────────────────────────────────────────────────
      case 'search_knowledge': {
        const { query, agent_id, top_k = 3 } = input
        const results = kb.searchKnowledge(agent_id, query, Math.min(top_k, 8))
        if (!results.length) {
          return `No results found in ${agent_id}'s knowledge base for: "${query}".`
        }
        const lines = results.map((r, i) =>
          `[${i + 1}] (score: ${r.score}) source: ${r.metadata?.source || '?'} | topic: ${r.metadata?.topic || '?'}\n${r.content}`
        )
        return `${results.length} result(s) for "${query}" in ${agent_id}'s KB:\n\n${lines.join('\n\n---\n\n')}`
      }

      case 'save_to_knowledge': {
        const { agent_id, content, source, topic = '', tags = [] } = input
        const result = kb.saveToKnowledge(agent_id, content, { source, topic, tags })
        return `Saved to ${agent_id}'s KB: ${result.saved} chunk(s) indexed from "${source}". Total KB: ${result.totalDocs} chunks.`
      }

      case 'list_knowledge': {
        const { agent_id } = input
        const info = kb.listKnowledge(agent_id)
        if (info.totalChunks === 0) {
          return `${agent_id}'s knowledge base is empty. Use save_to_knowledge to populate it.`
        }
        const srcLines = Object.entries(info.sources).map(([src, meta]) =>
          `  - ${src} (${meta.count} chunks, topic: ${meta.topic || '?'}, date: ${meta.date || '?'})`
        )
        return `KB for ${agent_id}: ${info.totalChunks} chunks total.\n\nIndexed sources:\n${srcLines.join('\n')}\n\nFile: ${info.storagePath}`
      }

      default:
        return `Unknown tool: ${name}`
    }
  } catch (err) {
    return explainError(name, err)
  }
}

// ── Auto-inject personal context ──────────────────────────────────────────────
function loadBaseContext(agentId = '') {
  let context = ''
  // Current date and time
  const now = new Date()
  const daysFR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
  const monthsFR = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre']
  context += `\n\n# Date et heure actuelles\nNous sommes le **${daysFR[now.getDay()]} ${now.getDate()} ${monthsFR[now.getMonth()]} ${now.getFullYear()}**.\nHeure locale : ${now.toLocaleTimeString('fr-FR')}.`

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

// Load PAI agents registry
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

// ── Agent system prompt loader ────────────────────────────────────────────────
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
  const dirs = [CUSTOM_AGENTS_DIR, AGENTS_DIR]
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

function loadAgentSystemPrompt(agentId, fallbackPrompt) {
  try {
    if (agentId === 'pai') {
      const desktopPromptPath = path.join(DATA_DIR, 'DESKTOP_PROMPT.md')
      const skillPath = path.join(DATA_DIR, 'SKILL.md')
      const sourcePath = fs.existsSync(desktopPromptPath) ? desktopPromptPath : (fs.existsSync(skillPath) ? skillPath : null)
      if (sourcePath) {
        const raw = fs.readFileSync(sourcePath, 'utf8')
        const modelMatch = raw.match(/^model:\s*(.+)$/m)
        const modelKey = modelMatch ? modelMatch[1].trim() : null
        return { prompt: raw.replace(/^---[\s\S]*?---\n?/, '').trim(), model: modelKey }
      }
    }
    const agentFile = findAgentFile(agentId)
    if (agentFile) {
      const raw = fs.readFileSync(agentFile, 'utf8')
      const modelMatch = raw.match(/^model:\s*(.+)$/m)
      const modelKey = modelMatch ? modelMatch[1].trim() : null
      const prompt = raw.replace(/^---[\s\S]*?---\n?/, '').trim()
      // Auto-load skill context
      let skillContext = ''
      try {
        const alias = SKILL_CONTEXT_ALIASES[agentId.toLowerCase()]
        const baseName = alias || (agentId.charAt(0).toUpperCase() + agentId.slice(1))
        const skillCtxPath = path.join(DATA_DIR, 'skills', baseName + 'Context.md')
        if (fs.existsSync(skillCtxPath)) {
          skillContext = '\n\n---\n## SKILL CONTEXT\n'
            + fs.readFileSync(skillCtxPath, 'utf8') + '\n---'
        }
      } catch {}
      return { prompt: prompt + skillContext, model: modelKey }
    }
  } catch {}
  return { prompt: fallbackPrompt, model: null }
}

// ── Workspace content cache ──────────────────────────────────────────────────
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

// ── KB (Knowledge Base) System ────────────────────────────────────────────────
const KB_DIR = DATABASES_DIR
const KB_DEFAULT_PERMISSIONS = {
  orchestrators: {
    pai: ['*'],
    atum: ['atum', 'jamie', 'serena', 'marcus', 'rook', 'dev', 'alex', 'aditi', 'priya', 'emma'],
    christian: ['christian', 'julie', 'frank', 'catalin', 'norman', 'magali', 'sophie']
  }
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
      fs.writeFileSync(kbPath, JSON.stringify({ notes: [], documents: [], history: [], preferences: {} }, null, 2), 'utf8')
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
    const isEmpty = !Object.values(data).some(v => Array.isArray(v) ? v.length > 0 : Object.keys(v || {}).length > 0)
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

// ── Token estimation ────────────────────────────────────────────────────────
const MAX_AGENTIC_TURNS = 25
const MAX_CONTEXT_TOKENS = 170000

function estimateTokens(messages, systemLen) {
  let total = Math.ceil(systemLen / 4)
  for (const m of messages) {
    if (typeof m.content === 'string') {
      total += Math.ceil(m.content.length / 4)
    } else if (Array.isArray(m.content)) {
      for (const b of m.content) {
        if (b.type === 'text') total += Math.ceil((b.text || '').length / 4)
        else if (b.type === 'tool_use') total += Math.ceil(JSON.stringify(b.input || {}).length / 4) + 50
        else if (b.type === 'tool_result') total += Math.ceil((b.content || '').length / 4)
      }
    }
  }
  return total
}

// ── Token consumption monitor ────────────────────────────────────────────────
const _tokenMonitor = { sessionTotal: 0, messageCount: 0, startTime: Date.now() }
const TOKEN_WARN_PER_MSG = 50000
const TOKEN_WARN_SESSION_RATE = 200000
const COST_WARN_PER_MSG = 0.05

function checkTokenConsumption(inputTokens, outputTokens, sendStream) {
  _tokenMonitor.sessionTotal += inputTokens + outputTokens
  _tokenMonitor.messageCount++
  const costUsd = (inputTokens * 3 + outputTokens * 15) / 1e6
  const warnings = []

  if (inputTokens > TOKEN_WARN_PER_MSG) {
    warnings.push(`High consumption: ${Math.round(inputTokens / 1000)}K input tokens.`)
  }
  if (costUsd > COST_WARN_PER_MSG) {
    warnings.push(`High cost: ~$${costUsd.toFixed(3)} for this message.`)
  }
  const elapsed = (Date.now() - _tokenMonitor.startTime) / 1000 / 60
  if (elapsed < 5 && _tokenMonitor.sessionTotal > TOKEN_WARN_SESSION_RATE) {
    warnings.push(`Abnormal rate: ${Math.round(_tokenMonitor.sessionTotal / 1000)}K tokens in ${Math.round(elapsed)} min.`)
  }

  if (warnings.length > 0) {
    const alertText = '\n\n---\nTOKEN ALERT\n' + warnings.join('\n') + '\n---\n'
    sendStream({ type: 'stream-text', data: alertText, timestamp: Date.now() })
    sendStream({ type: 'token-alert', warnings, inputTokens, outputTokens, sessionTotal: _tokenMonitor.sessionTotal, timestamp: Date.now() })
  }
}

// ── TUI status helpers (synthetic status for frontend) ──────────────────────
const SPINNER_FRAMES = ['|', '/', '-', '\\']
let _spinnerIdx = 0
function nextSpinner() { return SPINNER_FRAMES[_spinnerIdx++ % SPINNER_FRAMES.length] }

function emitTUIStatus(sendStream, text) {
  sendStream({ type: 'claude-status', text, timestamp: Date.now() })
}

function toolDisplayName(toolName, input) {
  const preview = input
    ? (input.file_path || input.path || input.pattern || input.command || '').toString().slice(0, 60)
    : ''
  const short = preview ? `(${preview})` : ''
  switch (toolName) {
    case 'read_file': return `Reading ${short}`
    case 'write_file': return `Writing ${short}`
    case 'edit_file': return `Editing ${short}`
    case 'bash': return `Bash ${short}`
    case 'glob': return `Searching files ${short}`
    case 'grep': return `Grep ${short}`
    case 'web_fetch': return `Fetching ${short}`
    case 'web_search': return `Searching web...`
    case 'search_knowledge': return `KB Search: ${(input?.query || '').slice(0, 40)}...`
    case 'save_to_knowledge': return `KB Save: ${(input?.source || '').slice(0, 40)}`
    case 'list_knowledge': return `KB List: ${input?.agent_id || ''}`
    default: return `${toolName} ${short}`
  }
}

// ── Abort controller for current request ────────────────────────────────────
let currentAbortController = null

// ── OpenRouter support ────────────────────────────────────────────────────────
function isOpenRouterKey(key) {
  return key.startsWith('sk-or-v1-')
}

function mapModelToOpenRouter(modelId) {
  const map = {
    'claude-haiku-4-5-20251001': 'anthropic/claude-haiku-4-5-20251001',
    'claude-sonnet-4-6': 'anthropic/claude-sonnet-4-6',
    'claude-opus-4-6': 'anthropic/claude-opus-4-6',
    'haiku': 'anthropic/claude-haiku-4-5-20251001',
    'sonnet': 'anthropic/claude-sonnet-4-6',
    'opus': 'anthropic/claude-opus-4-6',
  }
  if (map[modelId]) return map[modelId]
  if (modelId.includes('/')) return modelId // Already OpenRouter format
  return `anthropic/${modelId}`
}

async function callOpenRouterStreaming(token, orModel, orMessages, sendStream, abortController) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'HTTP-Referer': 'https://atum-five.vercel.app',
      'X-Title': 'ATUM',
    },
    body: JSON.stringify({
      model: orModel,
      messages: orMessages,
      stream: true,
      max_tokens: 16000,
    }),
    signal: abortController.signal,
  })

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}))
    throw new Error(`OpenRouter ${response.status}: ${errData?.error?.message || response.statusText}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue
      try {
        const json = JSON.parse(data)
        const delta = json.choices?.[0]?.delta?.content
        if (delta) {
          fullText += delta
          sendStream({ type: 'stream-text', data: delta, timestamp: Date.now() })
        }
      } catch { /* partial chunk */ }
    }
  }

  return fullText
}

// ============================================================================
// EXPRESS ROUTES
// ============================================================================

// ── GET /api/models — list available models ─────────────────────────────────
app.get('/api/models', (req, res) => {
  res.json([
    { id: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5 (rapide)', default: false },
    { id: 'claude-sonnet-4-6', name: 'Sonnet 4.6 (recommande)', default: true }
  ])
})

// ── POST /api/abort — abort current request ─────────────────────────────────
app.post('/api/abort', (req, res) => {
  if (currentAbortController) currentAbortController.abort()
  res.json({ success: true })
})

// ── POST /api/conversations/save ────────────────────────────────────────────
app.post('/api/conversations/save', (req, res) => {
  const dataDir = path.join(os.homedir(), '.atum-web')
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'conversations.json'), JSON.stringify(req.body, null, 2))
  res.json({ success: true })
})

// ── GET /api/conversations/load ─────────────────────────────────────────────
app.get('/api/conversations/load', (req, res) => {
  try {
    const raw = fs.readFileSync(path.join(os.homedir(), '.atum-web', 'conversations.json'), 'utf8')
    res.json({ success: true, conversations: JSON.parse(raw) })
  } catch {
    res.json({ success: true, conversations: [] })
  }
})

// ── POST /api/chat — main chat endpoint (NDJSON streaming) ──────────────────
app.post('/api/chat', async (req, res) => {
  // ── Auth: API key from header ─────────────────────────────────────────────
  const token = req.headers['x-api-key'] || ''
  if (!token) return res.status(401).json({ error: 'API key required' })

  // ── Streaming headers ─────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'application/x-ndjson')
  res.setHeader('Transfer-Encoding', 'chunked')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('X-Accel-Buffering', 'no')

  const sendStream = (data) => {
    if (!res.writableEnded) res.write(JSON.stringify(data) + '\n')
  }

  // ── Extract request body ──────────────────────────────────────────────────
  const { agentId, systemPrompt, messages, workspacePath, attachments, model: requestModel } = req.body

  // ── Record agent usage (fire & forget) ────────────────────────────────────
  recordAgentUsage(agentId)

  const abortController = new AbortController()
  currentAbortController = abortController
  const tempFiles = []

  // ── Process attachments ───────────────────────────────────────────────────
  let attachmentContext = ''
  const imageBlocks = []
  for (const att of attachments || []) {
    try {
      const buffer = Buffer.from(att.data, 'base64')
      const isImage = att.type === 'image' || /\.(png|jpg|jpeg|gif|webp)$/i.test(att.name)
      const isTextFile = /\.(txt|md|json|csv|js|ts|jsx|tsx|py|html|css|xml|yaml|yml|sh|sql)$/i.test(att.name)
      if (isImage) {
        const mediaMime = att.mimeType && att.mimeType.startsWith('image/') ? att.mimeType
          : /\.png$/i.test(att.name) ? 'image/png'
          : /\.gif$/i.test(att.name) ? 'image/gif'
          : /\.webp$/i.test(att.name) ? 'image/webp'
          : 'image/jpeg'
        const supported = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
        if (supported.includes(mediaMime)) {
          imageBlocks.push({ type: 'image', source: { type: 'base64', media_type: mediaMime, data: buffer.toString('base64') } })
          attachmentContext += `\n\n[Attached image: ${att.name}]`
        } else {
          attachmentContext += `\n\n[Attached image: ${att.name} -- unsupported format (${mediaMime})]`
        }
      } else if (isTextFile) {
        attachmentContext += `\n\n[Attached file: ${att.name}]\n\`\`\`\n${buffer.toString('utf8')}\n\`\`\``
      } else {
        const ext = path.extname(att.name).slice(1) || 'bin'
        const tempPath = path.join(os.tmpdir(), `atum-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`)
        fs.writeFileSync(tempPath, buffer)
        tempFiles.push(tempPath)
        attachmentContext += `\n\n[Attached file: ${att.name} -- path: ${tempPath}]`
      }
    } catch {
      attachmentContext += `\n\n[Attachment: ${att.name} -- processing error]`
    }
  }

  sendStream({ type: 'start', timestamp: Date.now() })

  // ── OpenRouter fast path ──────────────────────────────────────────────────
  if (isOpenRouterKey(token)) {
    try {
      const { prompt: realSystemPrompt, model: rawAgentModel } = loadAgentSystemPrompt(agentId || 'atum', systemPrompt)
      const agentModelId = requestModel || resolveModel(rawAgentModel)
      const orModel = mapModelToOpenRouter(agentModelId)
      const baseContext = loadBaseContext(agentId || 'atum')

      let chatRules = ''
      try {
        const rulePath = RULES_PATH
        if (fs.existsSync(rulePath)) {
          chatRules = '\n\n---\nPRIORITY RULES\n' + fs.readFileSync(rulePath, 'utf8') + '\n---\n'
        }
      } catch {}

      const fullSystem = ((realSystemPrompt || '') + baseContext + chatRules).trim() || undefined

      const MAX_HISTORY = 10
      let trimmedMsgs = messages || []
      if (trimmedMsgs.length > MAX_HISTORY) {
        trimmedMsgs = trimmedMsgs.slice(-MAX_HISTORY)
        if (trimmedMsgs[0]?.role !== 'user') trimmedMsgs = trimmedMsgs.slice(1)
      }

      // Build OpenAI-format messages
      const orMessages = []
      if (fullSystem) orMessages.push({ role: 'system', content: fullSystem })
      for (const m of trimmedMsgs) {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        orMessages.push({ role: m.role, content })
      }
      // Append attachment context to last user message
      if (attachmentContext && orMessages.length > 0) {
        const last = orMessages[orMessages.length - 1]
        if (last.role === 'user') last.content += attachmentContext
      }

      sendStream({
        type: 'json-event',
        event: { type: 'system', subtype: 'init', model: orModel, permissionMode: 'chat' },
        timestamp: Date.now(),
      })

      emitTUIStatus(sendStream, '| Thinking...')
      const fullText = await callOpenRouterStreaming(token, orModel, orMessages, sendStream, abortController)

      if (!fullText.trim()) sendStream({ type: 'stream-text', data: 'Done.', timestamp: Date.now() })

      tempFiles.forEach(f => { try { fs.unlinkSync(f) } catch {} })
      sendStream({ type: 'end', code: 0, timestamp: Date.now() })
    } catch (err) {
      tempFiles.forEach(f => { try { fs.unlinkSync(f) } catch {} })
      if (abortController.signal.aborted) {
        sendStream({ type: 'end', code: 1, aborted: true, timestamp: Date.now() })
      } else {
        const errMsg = err?.message || String(err)
        sendStream({ type: 'stream-text', data: `\nErreur OpenRouter : ${errMsg}`, timestamp: Date.now() })
        sendStream({ type: 'end', code: 1, timestamp: Date.now() })
      }
    }
    currentAbortController = null
    if (!res.writableEnded) res.end()
    return
  }

  // ── SDK retry loop ────────────────────────────────────────────────────────
  const MAX_SDK_RETRIES = 4
  let lastSdkError = null
  let isRateLimited = false
  let lastErrorType = null

  for (let attempt = 0; attempt <= MAX_SDK_RETRIES; attempt++) {
    if (attempt > 0) {
      const baseDelay = isRateLimited ? 30000
        : Math.min(500 * Math.pow(2, attempt - 1), 8000)
      const jitter = baseDelay * (0.75 + Math.random() * 0.25)
      const waitSec = Math.round(jitter / 1000)

      if (lastErrorType === 'rateLimit') {
        sendStream({ type: 'stream-text', data: `\nRate limit -- retrying in ${waitSec}s...`, timestamp: Date.now() })
      } else if (lastErrorType === 'server' || lastErrorType === 'network') {
        sendStream({ type: 'stream-text', data: `\nServer error -- retrying in ${waitSec}s...`, timestamp: Date.now() })
      }
      emitTUIStatus(sendStream, `${nextSpinner()} Waiting ${waitSec}s (retry ${attempt + 1})...`)
      await new Promise(r => setTimeout(r, jitter))
    }

    let _progressIntervalId = null
    try {
      const Anthropic = require('@anthropic-ai/sdk')
      const client = new Anthropic({
        apiKey: token,
        defaultHeaders: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
      })

      // Load full agent system prompt
      const { prompt: realSystemPrompt, model: rawAgentModel } = loadAgentSystemPrompt(agentId || 'pai', systemPrompt)
      // Use model from request body, or agent default, or global default
      const agentModelId = requestModel || resolveModel(rawAgentModel)

      // Build context
      const baseContext = loadBaseContext(agentId || 'pai')

      // Workspace path injection (no auto-content loading)
      let wsContext = ''
      if (workspacePath && fs.existsSync(workspacePath)) {
        wsContext = `\n\n---\n## WORKSPACE ACTIF\nChemin : ${workspacePath}\nUtilise les outils (read_file, list_directory, grep_files, glob_files) pour acceder au code.\nLes chemins relatifs sont resolus depuis : ${workspacePath}\n---`
      }

      // Load rules (priority rules appended last for recency bias)
      let chatRules = ''
      try {
        const isOrch = new Set(['pai', 'atum', 'christian']).has((agentId || '').toLowerCase())
        const rulePath = isOrch ? RULES_PATH : (fs.existsSync(RULES_COMPACT_PATH) ? RULES_COMPACT_PATH : RULES_PATH)
        if (fs.existsSync(rulePath)) {
          chatRules = '\n\n---\nPRIORITY RULES\n' + fs.readFileSync(rulePath, 'utf8') + '\n---\n'
        }
      } catch {}

      const kbContext = buildKBContext(agentId || 'pai')
      const fullSystem = ((realSystemPrompt || '') + baseContext + wsContext + kbContext + chatRules).trim() || undefined

      // Trim conversation history
      const MAX_HISTORY = 10
      let trimmedMsgs = messages || []
      if (trimmedMsgs.length > MAX_HISTORY) {
        trimmedMsgs = trimmedMsgs.slice(-MAX_HISTORY)
        if (trimmedMsgs[0]?.role !== 'user') {
          trimmedMsgs = trimmedMsgs.slice(1)
        }
      }

      // Build API messages (attach context + images to last user message)
      const apiMessages = trimmedMsgs.map((m, i) => {
        if (i !== trimmedMsgs.length - 1) return { role: m.role, content: m.content }
        const textContent = (m.content || '') + attachmentContext
        if (imageBlocks.length > 0) {
          return { role: m.role, content: [...imageBlocks, { type: 'text', text: textContent }] }
        }
        return { role: m.role, content: textContent }
      })

      sendStream({
        type: 'json-event',
        event: { type: 'system', subtype: 'init', model: agentModelId, permissionMode: 'agentic' },
        timestamp: Date.now(),
      })

      const startTime = Date.now()
      let fullText = ''
      let totalInputTokens = 0
      let totalOutputTokens = 0
      let currentMessages = [...apiMessages]

      emitTUIStatus(sendStream, `${nextSpinner()} Thinking...`)

      let _tuiTokenCount = 0
      let _lastToolName = ''
      const _progressToolLog = []
      let _progressActivity = 'Initialisation...'

      // Progress updates every 3 min
      _progressIntervalId = setInterval(() => {
        if (abortController.signal.aborted) { clearInterval(_progressIntervalId); return }
        const elapsed = Math.round((Date.now() - startTime) / 60000)
        const wordCount = fullText.trim().split(/\s+/).filter(Boolean).length
        const donePart = _progressToolLog.slice(-4).map(t => `Done: ${t}`).join('\n')
        const wordPart = wordCount > 20 ? `\n${wordCount} words written` : ''
        const msg = [
          `\n\n---`,
          `Update -- ${elapsed} min`,
          donePart || null,
          `In progress: ${_progressActivity}${wordPart}`,
          `Still working...`,
          `---\n`,
        ].filter(Boolean).join('\n')
        fullText += msg
        sendStream({ type: 'stream-text', data: msg, timestamp: Date.now() })
      }, 3 * 60 * 1000)

      // Token cost warning
      {
        const sysTokens = Math.round((fullSystem || '').length / 4)
        const ctxTokens = Math.round(currentMessages.reduce((acc, m) => acc + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length), 0) / 4)
        const estimatedInput = sysTokens + ctxTokens
        let costHint = ''
        if (estimatedInput > 30000) costHint = ' -- high context'
        else if (estimatedInput > 15000) costHint = ' -- moderate context'
        sendStream({ type: 'stderr', data: `[tokens] ~${estimatedInput.toLocaleString()} input tokens${costHint}.\n`, timestamp: Date.now() })
      }

      // ── Agentic loop ──────────────────────────────────────────────────────
      for (let turn = 0; turn < MAX_AGENTIC_TURNS; turn++) {
        if (abortController.signal.aborted) break
        if (turn > 0) {
          emitTUIStatus(sendStream, `${nextSpinner()} Thinking... (turn ${turn + 1})`)
          _progressActivity = `Turn ${turn + 1} -- thinking...`
        }

        // Inactivity timeout (300s)
        const STREAM_TIMEOUT = 300000
        let streamTimedOut = false
        let timeoutId = setTimeout(() => {
          streamTimedOut = true
          try { abortController.abort() } catch {}
        }, STREAM_TIMEOUT)
        const resetStreamTimeout = () => {
          clearTimeout(timeoutId)
          timeoutId = setTimeout(() => {
            streamTimedOut = true
            try { abortController.abort() } catch {}
          }, STREAM_TIMEOUT)
        }

        let finalMsg
        try {
          let _firstTextReceived = false
          const _waitHb = setInterval(() => {
            if (!_firstTextReceived) emitTUIStatus(sendStream, `${nextSpinner()} AI processing...`)
          }, 2000)

          const stream = client.messages.stream({
            model: agentModelId,
            max_tokens: 16000,
            system: fullSystem
              ? [{ type: 'text', text: fullSystem, cache_control: { type: 'ephemeral' } }]
              : undefined,
            messages: currentMessages,
            tools: PAI_TOOLS,
          }, { signal: abortController.signal })

          // Stream text deltas
          stream.on('text', (delta) => {
            resetStreamTimeout()
            if (!_firstTextReceived) _progressActivity = 'Writing response...'
            _firstTextReceived = true
            _tuiTokenCount += Math.ceil(delta.length / 4)
            if (_tuiTokenCount % 4 === 0) {
              emitTUIStatus(sendStream, `${nextSpinner()} Generating... (~${_tuiTokenCount * 4} chars)`)
            }
            fullText += delta
            sendStream({ type: 'stream-text', data: delta, timestamp: Date.now() })
          })

          stream.on('message', () => { resetStreamTimeout() })

          stream.on('error', (err) => {
            resetStreamTimeout()
            let errMsg = err.message || String(err)
            const errLow2 = errMsg.toLowerCase()
            const is401 = errLow2.includes('401') || errLow2.includes('authentication_error') || errLow2.includes('invalid x-api-key')
            if (!is401) {
              sendStream({ type: 'stderr', data: `Stream error: ${errMsg}\n`, timestamp: Date.now() })
            }
          })

          clearInterval(_waitHb)
          finalMsg = await stream.finalMessage()
        } finally {
          clearTimeout(timeoutId)
        }

        if (streamTimedOut) {
          sendStream({ type: 'stderr', data: `[TIMEOUT] Stream exceeded ${STREAM_TIMEOUT / 1000}s -- stopping turn.\n`, timestamp: Date.now() })
          break
        }

        totalInputTokens += finalMsg.usage?.input_tokens || 0
        totalOutputTokens += finalMsg.usage?.output_tokens || 0

        // Add assistant response to conversation
        currentMessages.push({ role: 'assistant', content: finalMsg.content })

        // Auto-continuation if model was cut off mid-task
        if (finalMsg.stop_reason === 'max_tokens') {
          emitTUIStatus(sendStream, `${nextSpinner()} Continuation...`)
          const lastChunk = fullText.slice(-200).trim().replace(/\n+/g, ' ')
          const contextHint = lastChunk.length > 20 ? ` You stopped at: "...${lastChunk.slice(-80)}"` : ''
          currentMessages.push({
            role: 'user',
            content: `[AUTO-CONTINUATION -- DO NOT RESTART]\nYour previous response was truncated by the token limit.${contextHint}\nResume IMMEDIATELY where you left off -- no introduction, no recap.`
          })
          continue
        }

        // Stop if model finished naturally
        if (finalMsg.stop_reason !== 'tool_use') break

        // Execute tool calls
        const toolResults = []
        for (const block of finalMsg.content) {
          if (block.type !== 'tool_use') continue

          _lastToolName = toolDisplayName(block.name, block.input)
          _progressActivity = _lastToolName
          sendStream({
            type: 'tool-call',
            tool: block.name,
            input: block.input,
            id: block.id,
            timestamp: Date.now(),
          })
          emitTUIStatus(sendStream, `${nextSpinner()} ${_lastToolName}`)

          const result = await executeTool(block.name, block.input, workspacePath, sendStream)

          sendStream({
            type: 'tool-result',
            tool: block.name,
            id: block.id,
            success: typeof result === 'string',
            preview: String(result).slice(0, 300),
            timestamp: Date.now(),
          })
          emitTUIStatus(sendStream, `Done: ${block.name}`)
          _progressToolLog.push(_lastToolName)
          _progressActivity = 'Analyzing results...'

          if (abortController.signal.aborted) break

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: truncateResult(String(result), MAX_TOOL_RESULT_CHARS),
          })
        }

        // Feed tool results back and continue loop
        currentMessages.push({ role: 'user', content: toolResults })

        // Check estimated context size
        const estTokens = estimateTokens(currentMessages, (fullSystem || '').length)
        if (estTokens > MAX_CONTEXT_TOKENS) {
          const warnCtx = `\n\nContext near limit (${Math.round(estTokens / 1000)}K tokens). Synthesizing response.`
          fullText += warnCtx
          sendStream({ type: 'stream-text', data: warnCtx, timestamp: Date.now() })
          sendStream({ type: 'stderr', data: `[TOKEN CAP] ~${estTokens} estimated tokens, stopping.\n`, timestamp: Date.now() })
          break
        }

        // Warn on last turn
        if (turn === MAX_AGENTIC_TURNS - 1) {
          const warningMsg = '\n\nMax turns reached. Reply "continue" if the task is not finished.'
          fullText += warningMsg
          sendStream({ type: 'stream-text', data: warningMsg, timestamp: Date.now() })
        }
      }

      // ── Post-loop ─────────────────────────────────────────────────────────
      if (abortController.signal.aborted) {
        clearInterval(_progressIntervalId)
        currentAbortController = null
        sendStream({ type: 'end', code: 1, aborted: true, timestamp: Date.now() })
        if (!res.writableEnded) res.end()
        return
      }

      // If model only used tools without text, synthesize a summary
      if (!fullText.trim()) {
        const toolsUsed = currentMessages
          .filter(m => m.role === 'assistant')
          .flatMap(m => Array.isArray(m.content) ? m.content : [])
          .filter(b => b.type === 'tool_use')
          .map(b => b.name)
        const summary = toolsUsed.length > 0
          ? `Actions completed: ${[...new Set(toolsUsed)].join(', ')}.`
          : 'Done.'
        fullText = summary
        sendStream({ type: 'stream-text', data: summary, timestamp: Date.now() })
      }

      // Cleanup temp files
      tempFiles.forEach(f => { try { fs.unlinkSync(f) } catch {} })

      const costUsd = (totalInputTokens * 3 + totalOutputTokens * 15) / 1e6

      // Token monitoring
      checkTokenConsumption(totalInputTokens, totalOutputTokens, sendStream)

      sendStream({
        type: 'json-event',
        event: {
          type: 'result',
          duration_ms: Date.now() - startTime,
          total_cost_usd: costUsd,
          num_turns: currentMessages.length,
          input_tokens: totalInputTokens,
          output_tokens: totalOutputTokens,
        },
        timestamp: Date.now(),
      })
      sendStream({ type: 'end', code: 0, timestamp: Date.now() })

      clearInterval(_progressIntervalId)
      emitTUIStatus(sendStream, 'Done')
      currentAbortController = null

      if (!res.writableEnded) res.end()
      return

    } catch (err) {
      if (_progressIntervalId) clearInterval(_progressIntervalId)
      lastSdkError = err
      currentAbortController = null
      if (abortController.signal.aborted) {
        sendStream({ type: 'end', code: 1, aborted: true, timestamp: Date.now() })
        if (!res.writableEnded) res.end()
        return
      }

      const rawErr = err?.message || String(err)
      const errLow = rawErr.toLowerCase()

      const isRateLimit = errLow.includes('429') || errLow.includes('rate limit') || errLow.includes('rate_limit')
      const isServerError = errLow.includes('500') || errLow.includes('502') || errLow.includes('503')
        || errLow.includes('server error') || errLow.includes('overloaded')
      const isNetworkError = errLow.includes('econnreset') || errLow.includes('econnrefused')
        || errLow.includes('socket hang up') || errLow.includes('timeout')
        || (errLow.includes('network') && !errLow.includes('cannot find module'))
        || errLow.includes('fetch failed')
      const isAuth401 = errLow.includes('401') || errLow.includes('authentication_error') || errLow.includes('invalid x-api-key')
      const isRetryable = isRateLimit || isServerError || isNetworkError

      if (isRateLimit) { isRateLimited = true; lastErrorType = 'rateLimit' }
      else if (isAuth401) { lastErrorType = 'auth401' }
      else if (isServerError) { lastErrorType = 'server' }
      else if (isNetworkError) { lastErrorType = 'network' }

      if (isRetryable && attempt < MAX_SDK_RETRIES) {
        continue
      }

      // Auth 401 — send error and end
      if (isAuth401) {
        sendStream({ type: 'stream-text', data: '\nInvalid API key. Please check your key and try again.', timestamp: Date.now() })
        sendStream({ type: 'end', code: 1, timestamp: Date.now() })
        if (!res.writableEnded) res.end()
        return
      }

      // Rate limit — send error and end
      if (isRateLimit) {
        sendStream({ type: 'stream-text', data: '\nRate limit reached. Wait a few minutes and try again.', timestamp: Date.now() })
        sendStream({ type: 'end', code: 0, timestamp: Date.now() })
        currentAbortController = null
        if (!res.writableEnded) res.end()
        return
      }

      // All retries exhausted — send the error
      sendStream({ type: 'stderr', data: explainError('API', err) + '\n', timestamp: Date.now() })
      sendStream({ type: 'stream-text', data: `\nError: ${explainError('API', err)}`, timestamp: Date.now() })
      sendStream({ type: 'end', code: 1, timestamp: Date.now() })
      if (!res.writableEnded) res.end()
      return
    }
  } // end retry loop
})

// ============================================================================
// GMAIL DAEMON (réponses email automatiques via Anthropic SDK)
// ============================================================================

function loadGmailConfig () {
  let cfg = {}
  try { cfg = JSON.parse(fs.readFileSync(GMAIL_CONFIG_PATH, 'utf8')) } catch {}
  // Variables d'environnement Railway — priorité sur le fichier pour persistance 24h/24
  if (process.env.GMAIL_ENABLED !== undefined) cfg.enabled = process.env.GMAIL_ENABLED === 'true'
  if (process.env.GMAIL_API_KEY) cfg.api_key = process.env.GMAIL_API_KEY
  return cfg
}
function loadGmailToken () {
  // Variables d'environnement Railway — persistent entre redémarrages
  if (process.env.GMAIL_REFRESH_TOKEN) {
    return {
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      token_uri: 'https://oauth2.googleapis.com/token',
      client_id: process.env.GMAIL_CLIENT_ID || '905451623884-c3flncjl69slhuo02hvfddbs8r9tm0de.apps.googleusercontent.com',
      client_secret: process.env.GMAIL_CLIENT_SECRET,
    }
  }
  try { return JSON.parse(fs.readFileSync(GMAIL_TOKEN_PATH, 'utf8')) } catch { return null }
}
function loadCustomAgentsGmail () {
  try {
    const files = fs.readdirSync(CUSTOM_AGENTS_DIR).filter(f => f.endsWith('.md'))
    return files.map(f => {
      const base = f.replace('.md', '')
      const name = base.charAt(0).toUpperCase() + base.slice(1)
      let systemPrompt = `Tu es ${name}, un assistant IA expert. Tu reponds aux emails de maniere professionnelle.`
      try {
        const raw = fs.readFileSync(path.join(CUSTOM_AGENTS_DIR, f), 'utf8')
        systemPrompt = raw.replace(/^---[\s\S]*?---\n/, '').trim()
      } catch {}
      return { name, file: f, systemPrompt }
    })
  } catch { return [] }
}
async function refreshGmailAccessToken () {
  const t = loadGmailToken()
  if (!t?.refresh_token) throw new Error('gmail-token.json manquant ou sans refresh_token')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: t.client_id, client_secret: t.client_secret,
      refresh_token: t.refresh_token, grant_type: 'refresh_token'
    })
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Refresh token echoue : ${JSON.stringify(data)}`)
  return data.access_token
}
async function gmailGetReq (endpoint, token) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  return res.json()
}
async function gmailPostReq (endpoint, token, body) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return res.json()
}
function extractGmailEmailText (payload) {
  if (!payload) return ''
  if (payload.mimeType === 'text/plain' && payload.body?.data)
    return Buffer.from(payload.body.data, 'base64').toString('utf8')
  if (payload.parts) {
    for (const part of payload.parts) {
      const t = extractGmailEmailText(part)
      if (t) return t
    }
  }
  return ''
}
function getGmailHeader (headers, name) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''
}
async function ensureGmailLabel (token, labelName) {
  const list = await gmailGetReq('/users/me/labels', token)
  const existing = (list.labels || []).find(l => l.name === labelName)
  if (existing) return existing.id
  const created = await gmailPostReq('/users/me/labels', token, {
    name: labelName, labelListVisibility: 'labelShow', messageListVisibility: 'show'
  })
  return created.id
}
function detectGmailAgent (subject, agents) {
  const lc = subject.toLowerCase()
  return agents.find(a => lc.includes(a.name.toLowerCase())) || null
}
async function callAgentForEmailWeb (agent, email, apiKey) {
  const Anthropic = require('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })
  const userMsg = `Tu as recu un email professionnel. Reponds directement, sans commenter ta demarche.

EXPEDITEUR : ${email.from}
SUJET : ${email.subject}
CORPS :
${email.body}

REGLES DE FORMAT ABSOLUES :
- Ton conversationnel, naturel et professionnel
- Pas de tableaux markdown (pas de | col | col |)
- Pas de separateurs --- ou ===
- Pas d'asterisques gras **texte** ni de titres ## Section
- Bullet points OK pour les vraies listes, fleches (→) pour structurer sobrement
- Phrases courtes, directes, humaines
- Salutation naturelle + signature "${agent.name}"`
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: agent.systemPrompt || `Tu es ${agent.name}, un assistant IA expert.`,
    messages: [{ role: 'user', content: userMsg }]
  })
  return response.content?.[0]?.text || ''
}
function buildMimeEmailWeb ({ to, from, subject, body, replyToMsgId, references, threadId }) {
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`
  let mime = `From: ${from}\r\nTo: ${to}\r\n`
  if (replyToMsgId) mime += `In-Reply-To: ${replyToMsgId}\r\n`
  if (references) mime += `References: ${references}\r\n`
  mime += `Subject: Re: ${subjectEncoded}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`
  mime += Buffer.from(body).toString('base64')
  return Buffer.from(mime).toString('base64url')
}
async function checkNewGmailEmailsWeb () {
  const config = loadGmailConfig()
  if (!config?.enabled) return
  const apiKey = config.api_key
  if (!apiKey) {
    console.log('[Gmail] Cle API manquante dans gmail-config.json — daemon inactif')
    return
  }
  try {
    const agents = loadCustomAgentsGmail()
    if (!agents.length) {
      console.log('[Gmail] Aucun agent custom trouve dans custom-agents/')
      return
    }
    const token = await refreshGmailAccessToken()
    const labelProcessed = config.label_processed || 'PAI-Processed'
    const q = encodeURIComponent(`is:unread -label:${labelProcessed}`)
    const list = await gmailGetReq(`/users/me/messages?q=${q}&maxResults=${config.max_emails_per_check || 5}`, token)
    if (!list.messages?.length) return
    console.log(`[Gmail] ${list.messages.length} email(s) detecte(s)`)
    const labelId = await ensureGmailLabel(token, labelProcessed)
    const profile = await gmailGetReq('/users/me/profile', token)
    const ownerEmail = profile.emailAddress || ''
    for (const msg of list.messages) {
      try {
        const full = await gmailGetReq(`/users/me/messages/${msg.id}?format=full`, token)
        const hdrs = full.payload?.headers || []
        const from = getGmailHeader(hdrs, 'From')
        const subject = getGmailHeader(hdrs, 'Subject')
        const msgId = getGmailHeader(hdrs, 'Message-ID')
        const refs = getGmailHeader(hdrs, 'References')
        const body = extractGmailEmailText(full.payload)
        if (from.includes(ownerEmail) && ownerEmail) {
          console.log(`[Gmail] Reponse de ${from} ignoree (anti-boucle)`)
          await gmailPostReq(`/users/me/messages/${msg.id}/modify`, token, { addLabelIds: [labelId] })
          continue
        }
        const agent = detectGmailAgent(subject, agents)
        if (!agent) {
          console.log(`[Gmail] Aucun agent detecte pour : "${subject}" — email ignore`)
          await gmailPostReq(`/users/me/messages/${msg.id}/modify`, token, { addLabelIds: [labelId] })
          continue
        }
        console.log(`[Gmail] Email de : ${from} | Sujet : ${subject} | Agent : ${agent.name}`)
        const reply = await callAgentForEmailWeb(agent, { from, subject, body }, apiKey)
        console.log(`[Gmail] ${agent.name} a redige une reponse (${reply.length} car.)`)
        const rawEmail = buildMimeEmailWeb({
          to: from, from: ownerEmail, subject, body: reply,
          replyToMsgId: msgId, references: refs ? `${refs} ${msgId}` : msgId
        })
        const replyMode = config.reply_mode || 'send'
        if (replyMode === 'draft') {
          await gmailPostReq('/users/me/drafts', token, { message: { raw: rawEmail, threadId: full.threadId } })
          console.log(`[Gmail] Brouillon cree pour : ${from}`)
        } else {
          await gmailPostReq('/users/me/messages/send', token, { raw: rawEmail, threadId: full.threadId })
          console.log(`[Gmail] Email envoye automatiquement a : ${from} par ${agent.name}`)
        }
        await gmailPostReq(`/users/me/messages/${msg.id}/modify`, token, { addLabelIds: [labelId] })
      } catch (emailErr) {
        console.error(`[Gmail] Erreur sur email ${msg.id} :`, emailErr.message)
      }
    }
  } catch (err) {
    console.error('[Gmail] Erreur daemon :', err.message)
  }
}
let gmailDaemonIntervalId = null
function startGmailDaemonWeb () {
  const config = loadGmailConfig()
  if (!config?.enabled) {
    console.log('[Gmail] Daemon desactive (enabled: false dans gmail-config.json)')
    return
  }
  if (!loadGmailToken()?.refresh_token) {
    console.log('[Gmail] Daemon non demarre — gmail-token.json manquant')
    return
  }
  if (!config.api_key) {
    console.log('[Gmail] Daemon non demarre — api_key manquante dans gmail-config.json')
    return
  }
  const agents = loadCustomAgentsGmail()
  const intervalMs = (config.check_interval_min || 5) * 60 * 1000
  console.log(`[Gmail] Daemon demarre — ${agents.length} agent(s) : ${agents.map(a => a.name).join(', ')}`)
  console.log(`[Gmail] Verification toutes les ${config.check_interval_min || 5} min | Mode : ${config.reply_mode || 'send'}`)
  checkNewGmailEmailsWeb()
  gmailDaemonIntervalId = setInterval(checkNewGmailEmailsWeb, intervalMs)
}

// ── GET /api/gmail-config ───────────────────────────────────────────────────
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

// ── POST /api/gmail-config ──────────────────────────────────────────────────
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
    if (gmailDaemonIntervalId) { clearInterval(gmailDaemonIntervalId); gmailDaemonIntervalId = null }
    if (cfg.enabled) startGmailDaemonWeb()
    const { api_key: _k, ...safe } = cfg
    safe.has_api_key = !!_k
    res.json({ ok: true, config: safe })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── Serve React app for all other routes ────────────────────────────────────
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html')
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath)
  } else {
    res.status(200).send('ATUM Online server is running. Place your built React app in ./dist/')
  }
})

// ── Start server ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`ATUM Online server running on port ${PORT}`)
  console.log(`Data directory: ${DATA_DIR}`)
  console.log(`Agents directory: ${AGENTS_DIR}`)
  console.log(`Custom agents directory: ${CUSTOM_AGENTS_DIR}`)
  // Create data directories if they don't exist
  for (const dir of [DATA_DIR, AGENTS_DIR, CUSTOM_AGENTS_DIR, DATABASES_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
      console.log(`  Created: ${dir}`)
    }
  }
  startGmailDaemonWeb()
})
