'use strict'
// ============================================================================
// atum-tools.cjs
// Purpose  : PAI_TOOLS definitions + executeTool() dispatcher
// Owner    : Aymeric
// Source   : server.js lines 107-808
// ============================================================================

const path = require('path')
const fs   = require('fs')
const os   = require('os')
const { spawn } = require('child_process')

const { explainError, truncateResult, registerFile, MAX_TOOL_RESULT_CHARS } = require('./atum-errors.cjs')
const { CUSTOM_AGENTS_DIR, AGENTS_DIR } = require('./atum-filesystem.cjs')

// ── PAI Tools schema definitions ────────────────────────────────────────────
const PAI_TOOLS = [
  {
    name: 'read_file',
    description: 'Read the contents of a file. Returns the file content as text. Use relative paths when a workspace is active.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to read (relative to workspace, or absolute)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write or overwrite a file with new content. Creates parent directories if needed.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to write (relative to workspace, or absolute)' },
        content: { type: 'string', description: 'Content to write to the file' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and directories at a given path. Use "." for workspace root.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to list (relative to workspace, or absolute). Use "." for root.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'execute_command',
    description: 'Execute a shell command and return stdout/stderr.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        cwd: { type: 'string', description: 'Working directory (relative to workspace or absolute). Defaults to workspace.' },
      },
      required: ['command'],
    },
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
        case_insensitive: { type: 'boolean', description: 'Case-insensitive search (default false)' },
      },
      required: ['pattern', 'path'],
    },
  },
  {
    name: 'glob_files',
    description: 'Find files matching a glob pattern in a directory. Returns list of matching file paths.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern, e.g. "**/*.ts", "src/**/*.js", "*.md"' },
        path: { type: 'string', description: 'Root directory to search from (relative to workspace or absolute)' },
      },
      required: ['pattern', 'path'],
    },
  },
  // ── Knowledge Base tools ────────────────────────────────────────────────
  {
    name: 'search_knowledge',
    description: 'Search the agent\'s personal knowledge base using BM25 semantic ranking.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        agent_id: { type: 'string', description: 'The agent ID whose knowledge base to search' },
        top_k: { type: 'number', description: 'Number of results to return (default 3, max 8)' },
      },
      required: ['query', 'agent_id'],
    },
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
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional list of tags for filtering' },
      },
      required: ['agent_id', 'content', 'source'],
    },
  },
  {
    name: 'list_knowledge',
    description: 'List all documents currently stored in the agent\'s knowledge base, grouped by source.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent ID' },
      },
      required: ['agent_id'],
    },
  },
  // ── Agent self-learning tools ───────────────────────────────────────────
  {
    name: 'reflect_and_learn',
    description: 'Save learnings from this interaction for self-improvement. Call at the end of each substantive interaction to capture corrections, user preferences, and new knowledge. Learnings are persistent and will be available in future conversations.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        learnings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              category: { type: 'string', enum: ['correction', 'preference', 'knowledge'], description: 'correction = user corrected you, preference = how user likes things done, knowledge = new facts/techniques learned' },
              content: { type: 'string', description: 'The learning content — concise, actionable, specific' },
              topic: { type: 'string', description: 'Topic area (e.g. "fiscalité", "format réponse", "client ABC")' },
            },
            required: ['category', 'content'],
          },
          description: 'Array of learnings from this interaction (max 5)',
        },
      },
      required: ['agent_id', 'learnings'],
    },
  },
  {
    name: 'get_agent_profile',
    description: 'Get the learning profile and progression stats for an agent. Shows total learnings by category, KB entries, and last activity.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent ID to get profile for' },
      },
      required: ['agent_id'],
    },
  },
  // ── Document generation tools ────────────────────────────────────────────
  {
    name: 'generate_pdf',
    description: 'Generate a PDF file from structured content. Use when the user asks to "export as PDF", "put this in a PDF", "send me this as PDF", etc. Returns a download link.',
    input_schema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Filename without extension, e.g. "rapport_comptable"' },
        title: { type: 'string', description: 'Document title displayed at the top' },
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              heading: { type: 'string' },
              content: { type: 'string' },
              bullets: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        footer: { type: 'string', description: 'Optional footer text' },
      },
      required: ['filename', 'title', 'sections'],
    },
  },
  {
    name: 'generate_excel',
    description: 'Generate an Excel (.xlsx) file. Use for tables, budgets, financial reports. Returns a download link.',
    input_schema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Filename without extension, e.g. "budget_2026"' },
        sheets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              headers: { type: 'array', items: { type: 'string' } },
              rows: { type: 'array', items: { type: 'array' } },
            },
            required: ['name', 'headers', 'rows'],
          },
        },
      },
      required: ['filename', 'sheets'],
    },
  },
  {
    name: 'generate_word',
    description: 'Generate a Word (.docx) document. Use for formal reports, letters, contracts. Returns a download link.',
    input_schema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Filename without extension, e.g. "contrat_service"' },
        title: { type: 'string' },
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              heading: { type: 'string' },
              content: { type: 'string' },
              bullets: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
      required: ['filename', 'title', 'sections'],
    },
  },
  {
    name: 'generate_pptx',
    description: 'Generate a PowerPoint (.pptx) presentation. Use for slideshows and decks. Includes auto-generated title slide. Returns a download link.',
    input_schema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Filename without extension, e.g. "presentation_client"' },
        title: { type: 'string', description: 'Presentation title (used for title slide)' },
        slides: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              content: { type: 'string' },
              bullets: { type: 'array', items: { type: 'string' } },
            },
            required: ['title'],
          },
        },
      },
      required: ['filename', 'title', 'slides'],
    },
  },
  {
    name: 'delegate_to_agents',
    description: 'Delegate tasks to specialized sub-agents and run them in parallel. Each agent works independently and returns results. Use when you need specialized expertise from one or more collaborators.',
    input_schema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              agent: { type: 'string', description: 'Agent identifier (lowercase, e.g. "julie", "frank", "catalin")' },
              task: { type: 'string', description: 'Detailed task description for the agent' },
            },
            required: ['agent', 'task'],
          },
        },
      },
      required: ['tasks'],
    },
  },
]

// ── Tool executor ────────────────────────────────────────────────────────────
async function executeTool(name, input, workspacePath, streamFn, apiToken, kb) {
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
            if (out.length > MAX_TOOL_RESULT_CHARS) out = truncateResult(out, MAX_TOOL_RESULT_CHARS)
            resolve(out)
          })
          proc.on('error', err => resolve(`Error executing command: ${err.message}`))
          proc.stdin.end()
        })
      }

      case 'grep_files': {
        const searchPath = resolvePath(input.path)
        return new Promise((resolve) => {
          const isWin = process.platform === 'win32'
          let proc
          if (isWin) {
            const globFilter = input.glob ? ` -Include "${input.glob}"` : ''
            const flags = input.case_insensitive ? '' : '-CaseSensitive'
            const psCmd = `Get-ChildItem -Path "${searchPath}" -Recurse${globFilter} -File | Select-String -Pattern "${input.pattern.replace(/"/g, '\\"')}" ${flags} | Select-Object -First 200 | ForEach-Object { "$($_.Filename):$($_.LineNumber): $($_.Line.Trim())" }`
            proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd], {
              env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
            })
          } else {
            const args = ['-rn']
            if (input.case_insensitive) args.push('-i')
            if (input.glob) args.push(`--include=${input.glob}`)
            args.push(input.pattern, searchPath)
            proc = spawn('grep', args, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
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
              env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
            })
          } else {
            const pattern = input.pattern.includes('/') ? input.pattern.split('/').pop() : input.pattern
            proc = spawn('find', [searchPath, '-name', pattern, '-type', 'f'], {
              env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
            })
          }
          let out = ''
          proc.stdout.on('data', d => { out += d.toString() })
          proc.on('close', () => resolve(out.trim() || 'No files found matching pattern'))
          proc.on('error', err => resolve(`glob_files error: ${err.message}`))
        })
      }

      // ── Knowledge Base ──────────────────────────────────────────────────
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

      // ── Agent self-learning ────────────────────────────────────────────
      case 'reflect_and_learn': {
        const { agent_id, learnings } = input
        const result = await kb.reflectAndLearn(agent_id, (learnings || []).slice(0, 5))
        return `Auto-apprentissage : ${result.saved} learning(s) sauvegardé(s), ${result.skipped} ignoré(s) (doublons ou trop courts).`
      }

      case 'get_agent_profile': {
        const { agent_id } = input
        const profile = await kb.getAgentProfile(agent_id)
        const catLines = Object.entries(profile.by_category).map(([cat, n]) => `  - ${cat}: ${n}`).join('\n')
        return `Profil de progression de ${agent_id}:\n` +
          `  Total learnings: ${profile.total_learnings}\n` +
          (catLines ? `  Par catégorie:\n${catLines}\n` : '') +
          `  Entrées KB (hors learnings): ${profile.total_kb_entries}\n` +
          `  Dernier apprentissage: ${profile.last_learning || 'jamais'}`
      }

      // ── Document generation ────────────────────────────────────────────
      case 'generate_pdf': {
        const PDFDocument = require('pdfkit')
        const { filename, title, sections = [], footer } = input
        const fname = filename.endsWith('.pdf') ? filename : `${filename}.pdf`
        const tmpDir = path.join(os.tmpdir(), 'atum-files')
        fs.mkdirSync(tmpDir, { recursive: true })
        const tmpPath = path.join(tmpDir, `${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`)
        await new Promise((resolve, reject) => {
          const doc = new PDFDocument({ margin: 55, size: 'A4' })
          const stream = fs.createWriteStream(tmpPath)
          doc.pipe(stream)
          stream.on('finish', resolve)
          stream.on('error', reject)
          doc.font('Helvetica-Bold').fontSize(22).fillColor('#1a1a2e').text(title, { align: 'center' })
          doc.moveDown(0.5)
          doc.moveTo(55, doc.y).lineTo(540, doc.y).strokeColor('#3b82f6').lineWidth(2).stroke()
          doc.moveDown(1)
          for (const sec of sections) {
            if (sec.heading) {
              doc.font('Helvetica-Bold').fontSize(14).fillColor('#1a1a2e').text(sec.heading)
              doc.moveDown(0.3)
            }
            if (sec.content) {
              doc.font('Helvetica').fontSize(11).fillColor('#333333').text(sec.content, { align: 'justify', lineGap: 2 })
              doc.moveDown(0.8)
            }
            if (sec.bullets && sec.bullets.length) {
              for (const b of sec.bullets) {
                doc.font('Helvetica').fontSize(11).fillColor('#333333').text(`• ${b}`, { indent: 20, lineGap: 2 })
              }
              doc.moveDown(0.8)
            }
          }
          if (footer) doc.fontSize(9).fillColor('#888888').text(footer, { align: 'center' })
          doc.end()
        })
        const id = registerFile(tmpPath, fname)
        return `✅ PDF généré !\n\n📥 [Télécharger ${fname}](/api/files/${id})`
      }

      case 'generate_excel': {
        const xlsx = require('xlsx')
        const { filename, sheets } = input
        const fname = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
        const tmpDir = path.join(os.tmpdir(), 'atum-files')
        fs.mkdirSync(tmpDir, { recursive: true })
        const tmpPath = path.join(tmpDir, `${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`)
        const wb = xlsx.utils.book_new()
        for (const sheet of (sheets || [])) {
          const data = [sheet.headers || [], ...(sheet.rows || [])]
          const ws = xlsx.utils.aoa_to_sheet(data)
          xlsx.utils.book_append_sheet(wb, ws, (sheet.name || 'Sheet1').slice(0, 31))
        }
        xlsx.writeFile(wb, tmpPath)
        const id = registerFile(tmpPath, fname)
        return `✅ Excel généré !\n\n📥 [Télécharger ${fname}](/api/files/${id})`
      }

      case 'generate_word': {
        const { Document, Paragraph, TextRun, HeadingLevel, Packer, AlignmentType } = require('docx')
        const { filename, title, sections = [] } = input
        const fname = filename.endsWith('.docx') ? filename : `${filename}.docx`
        const tmpDir = path.join(os.tmpdir(), 'atum-files')
        fs.mkdirSync(tmpDir, { recursive: true })
        const tmpPath = path.join(tmpDir, `${Date.now()}-${Math.random().toString(36).slice(2)}.docx`)
        const children = [
          new Paragraph({ text: title, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: '' }),
        ]
        for (const sec of sections) {
          if (sec.heading) children.push(new Paragraph({ text: sec.heading, heading: HeadingLevel.HEADING_1 }))
          if (sec.content) children.push(new Paragraph({ children: [new TextRun({ text: sec.content })] }))
          if (sec.bullets) for (const b of sec.bullets) children.push(new Paragraph({ text: b, bullet: { level: 0 } }))
          children.push(new Paragraph({ text: '' }))
        }
        const doc = new Document({ sections: [{ children }] })
        const buffer = await Packer.toBuffer(doc)
        fs.writeFileSync(tmpPath, buffer)
        const id = registerFile(tmpPath, fname)
        return `✅ Document Word généré !\n\n📥 [Télécharger ${fname}](/api/files/${id})`
      }

      case 'generate_pptx': {
        const PptxGenJS = require('pptxgenjs')
        const { filename, title, slides = [] } = input
        const fname = filename.endsWith('.pptx') ? filename : `${filename}.pptx`
        const tmpDir = path.join(os.tmpdir(), 'atum-files')
        fs.mkdirSync(tmpDir, { recursive: true })
        const tmpPath = path.join(tmpDir, `${Date.now()}-${Math.random().toString(36).slice(2)}.pptx`)
        const prs = new PptxGenJS()
        prs.layout = 'LAYOUT_16x9'
        const ts = prs.addSlide()
        ts.background = { color: '1a1a2e' }
        ts.addText(title, { x: 0.5, y: 2.5, w: 9, h: 1.5, fontSize: 36, bold: true, align: 'center', color: 'FFFFFF' })
        for (const sd of slides) {
          const sl = prs.addSlide()
          sl.background = { color: 'FFFFFF' }
          sl.addText(sd.title || '', { x: 0.4, y: 0.25, w: 9.2, h: 0.9, fontSize: 26, bold: true, color: '1a1a2e' })
          sl.addShape(prs.ShapeType.line, { x: 0.4, y: 1.1, w: 9.2, h: 0, line: { color: '3b82f6', width: 2 } })
          const items = sd.bullets && sd.bullets.length
            ? sd.bullets.map(b => ({ text: b, options: { bullet: { type: 'bullet' }, fontSize: 18, color: '333333', breakLine: true } }))
            : [{ text: sd.content || '', options: { fontSize: 18, color: '333333' } }]
          sl.addText(items, { x: 0.4, y: 1.3, w: 9.2, h: 4.8, valign: 'top' })
        }
        await prs.writeFile({ fileName: tmpPath })
        const id = registerFile(tmpPath, fname)
        return `✅ Présentation PowerPoint générée !\n\n📥 [Télécharger ${fname}](/api/files/${id})`
      }

      case 'delegate_to_agents': {
        const { tasks } = input
        if (!tasks || tasks.length === 0) return 'No tasks provided to delegate_to_agents'
        if (!apiToken) return 'No API token available — cannot spawn sub-agents'

        const Anthropic = require('@anthropic-ai/sdk')
        const subClient = new Anthropic({ apiKey: apiToken })
        const emit = streamFn || (() => {})
        const agentDirs = [CUSTOM_AGENTS_DIR, AGENTS_DIR]

        const agentPromises = tasks.map(async ({ agent, task }) => {
          emit({ type: 'subagent-start', agent, taskPreview: task.slice(0, 120), timestamp: Date.now() })
          const { recordAgentUsage } = require('./atum-tracking.cjs')
          recordAgentUsage(agent)

          let agentSystem = `You are ${agent}, a specialized assistant. Complete the task thoroughly and return your full result.`
          let agentModel = 'claude-haiku-4-5-20251001'
          try {
            for (const dir of agentDirs) {
              const candidates = [`${agent}.md`, `${agent.charAt(0).toUpperCase() + agent.slice(1)}.md`]
              for (const filename of candidates) {
                const filePath = path.join(dir, filename)
                if (fs.existsSync(filePath)) {
                  const raw = fs.readFileSync(filePath, 'utf8')
                  const modelM = raw.match(/^model:\s*(.+)$/m)
                  if (modelM) {
                    const m = modelM[1].trim()
                    if (m === 'haiku') agentModel = 'claude-haiku-4-5-20251001'
                    else if (m === 'sonnet') agentModel = 'claude-sonnet-4-6'
                    else if (m === 'opus') agentModel = 'claude-opus-4-6'
                    else if (m.includes('claude-')) agentModel = m
                  }
                  agentSystem = raw.replace(/^---[\s\S]*?---\n?/, '').trim()
                  break
                }
              }
            }
          } catch {}

          try {
            const SUB_AGENT_TOOLS = PAI_TOOLS.filter(t => t.name !== 'delegate_to_agents')
            const subMessages = [{ role: 'user', content: task }]
            let subResult = ''
            let subTurns = 0
            const MAX_SUB_TURNS = 8

            while (subTurns < MAX_SUB_TURNS) {
              const subMsg = await subClient.messages.create({
                model: agentModel,
                max_tokens: 4096,
                system: agentSystem,
                messages: subMessages,
                tools: SUB_AGENT_TOOLS,
              })
              subTurns++
              const textBlocks = subMsg.content.filter(b => b.type === 'text')
              if (textBlocks.length) subResult = textBlocks.map(b => b.text).join('\n')
              if (subMsg.stop_reason !== 'tool_use') break
              subMessages.push({ role: 'assistant', content: subMsg.content })
              const toolResults = []
              for (const block of subMsg.content) {
                if (block.type !== 'tool_use') continue
                const toolOut = await executeTool(block.name, block.input, workspacePath, null, apiToken, kb)
                toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: String(toolOut) })
              }
              subMessages.push({ role: 'user', content: toolResults })
            }

            emit({ type: 'subagent-done', agent, success: true, preview: subResult.slice(0, 200), timestamp: Date.now() })
            return { agent, result: subResult }
          } catch (err) {
            emit({ type: 'subagent-done', agent, success: false, preview: err.message, timestamp: Date.now() })
            return { agent, result: `[${agent} error: ${err.message}]` }
          }
        })

        const results = await Promise.all(agentPromises)
        let output = `## Agent Results (${results.length} agents)\n\n`
        for (const r of results) {
          output += `### ${r.agent}\n${r.result}\n\n---\n\n`
        }
        return output
      }

      default:
        return `Unknown tool: ${name}`
    }
  } catch (err) {
    return explainError(name, err)
  }
}

// ── TUI / status helpers ─────────────────────────────────────────────────────
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
    case 'reflect_and_learn': return `Learning: ${(input?.learnings || []).length} insight(s)`
    case 'get_agent_profile': return `Profile: ${input?.agent_id || ''}`
    default: return `${toolName} ${short}`
  }
}

// ── Token helpers ─────────────────────────────────────────────────────────────
const MAX_AGENTIC_TURNS = 25
const MAX_CONTEXT_TOKENS = 170000
const TOKEN_WARN_PER_MSG = 50000
const TOKEN_WARN_SESSION_RATE = 200000
const COST_WARN_PER_MSG = 0.05
const _tokenMonitor = { sessionTotal: 0, messageCount: 0, startTime: Date.now() }

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
  if (modelId.includes('/')) return modelId
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
      } catch {}
    }
  }
  return fullText
}

module.exports = {
  PAI_TOOLS,
  executeTool,
  nextSpinner,
  emitTUIStatus,
  toolDisplayName,
  estimateTokens,
  checkTokenConsumption,
  isOpenRouterKey,
  mapModelToOpenRouter,
  callOpenRouterStreaming,
  MAX_AGENTIC_TURNS,
  MAX_CONTEXT_TOKENS,
}
