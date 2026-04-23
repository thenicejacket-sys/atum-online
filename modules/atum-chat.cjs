'use strict'
// ============================================================================
// atum-chat.cjs
// Purpose  : Main chat route handler — POST /api/chat (NDJSON streaming,
//            agentic loop, OpenRouter fast path, attachment processing)
// Owner    : Aymeric
// Source   : server.js lines 1253-1840
// ============================================================================

const path = require('path')
const fs   = require('fs')
const os   = require('os')

const { recordAgentUsage }                         = require('./atum-tracking.cjs')
const { explainError, truncateResult, MAX_TOOL_RESULT_CHARS } = require('./atum-errors.cjs')
const { RULES_PATH, RULES_COMPACT_PATH }           = require('./atum-filesystem.cjs')
const { loadAgentSystemPrompt, resolveModel }      = require('./atum-agents.cjs')
const { loadBaseContext, loadChatRules }           = require('./atum-context.cjs')
const { buildKBContext }                           = require('./atum-kb.cjs')
const {
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
} = require('./atum-tools.cjs')

// ── Fast path detection — simple messages get lightweight context + Haiku ────
// Messages simples → Haiku (rapide, pas cher). Tout le reste → Sonnet (capable).
// Critères : pas de pièces jointes, message court, pas de mots-clés complexes.
function isSimpleMessage(messages, attachments) {
  if (attachments && attachments.length > 0) return false
  if (!messages || messages.length === 0) return false
  const lastMsg = messages[messages.length - 1]
  const text = (typeof lastMsg.content === 'string' ? lastMsg.content : '').trim().toLowerCase()
  if (text.length > 120) return false
  // Mots-clés qui déclenchent le chemin complet (Sonnet + outils)
  const complexKeywords = /\b(analyse|recherche|crée|génère|écris|rédige|calcul|compare|explique en détail|diagnostic|audit|rapport|document|fichier|code|refactor|debug|investig|planifi|stratég|architec|implémente|optimise|résous|corrige)\b/i
  if (complexKeywords.test(text)) return false
  // Greetings et réponses courtes conversationnelles
  const simple = /^(salut|bonjour|bonsoir|hello|hi|hey|coucou|yo|ça va|ca va|comment vas|quoi de neuf|merci|ok|oui|non|d'accord|parfait|super|cool|génial|genial|au revoir|à bientôt|bonne nuit|bonne journée|et toi|nickel|top|bien reçu|c'est noté|entendu|compris|pas de souci|avec plaisir|je comprends|intéressant|ah bon|vraiment|exactement|tout à fait|bien sûr|évidemment)\b/i
  if (simple.test(text)) return true
  // Messages courts sans complexité (<40 chars)
  if (text.length < 40) return true
  return false
}

// ── Shared abort controller (one per active request) ─────────────────────────
let currentAbortController = null

// ── Chat route factory — call with (app, kb) ────────────────────────────────
function registerChatRoute(app, kb) {

  app.post('/api/chat', async (req, res) => {
    // ── Auth: API key from header ─────────────────────────────────────────
    const token = req.headers['x-api-key'] || ''
    if (!token) return res.status(401).json({ error: 'API key required' })

    // ── Streaming headers ─────────────────────────────────────────────────
    res.setHeader('Content-Type', 'application/x-ndjson')
    res.setHeader('Transfer-Encoding', 'chunked')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('X-Accel-Buffering', 'no')

    const sendStream = (data) => {
      if (!res.writableEnded) res.write(JSON.stringify(data) + '\n')
    }
    const endStream = () => {
      if (!res.writableEnded) {
        res.write(JSON.stringify({ type: 'bell', timestamp: Date.now() }) + '\n')
        res.end()
      }
    }

    // ── Extract request body ──────────────────────────────────────────────
    const { agentId, systemPrompt, messages, workspacePath, attachments, model: requestModel } = req.body

    // ── Record agent usage (fire & forget) ────────────────────────────────
    recordAgentUsage(agentId)

    // ── FAST PATH: Simple messages → lightweight context, no tools, Haiku ─
    if (isSimpleMessage(messages, attachments)) {
      try {
        const Anthropic = require('@anthropic-ai/sdk')
        const client = new Anthropic({ apiKey: token })
        const { prompt: realSystemPrompt } = loadAgentSystemPrompt(agentId, systemPrompt)
        const now = new Date()
        const daysFR = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi']
        const monthsFR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
        const lightContext = `\n\nNous sommes le ${daysFR[now.getDay()]} ${now.getDate()} ${monthsFR[now.getMonth()]} ${now.getFullYear()}, ${now.toLocaleTimeString('fr-FR')}.`
        const lightSystem = ((realSystemPrompt || '') + lightContext).trim()

        sendStream({ type: 'start', timestamp: Date.now() })
        sendStream({ type: 'json-event', event: { type: 'system', subtype: 'init', model: 'claude-haiku-4-5-20251001', permissionMode: 'fast' }, timestamp: Date.now() })

        const response = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: lightSystem,
          messages: messages.slice(-4).map(m => ({ role: m.role, content: m.content })),
        })

        const text = response.content.map(b => b.text || '').join('')
        sendStream({ type: 'stream-text', data: text, timestamp: Date.now() })
        endStream()
        return
      } catch (fastErr) {
        sendStream({ type: 'stderr', data: `[FAST] Fallback: ${fastErr.message}\n`, timestamp: Date.now() })
      }
    }

    const abortController = new AbortController()
    currentAbortController = abortController
    const tempFiles = []

    // ── Process attachments ───────────────────────────────────────────────
    let attachmentContext = ''
    const imageBlocks = []
    const documentBlocks = []
    let hasDocAttachment = false
    for (const att of attachments || []) {
      try {
        const buffer = Buffer.from(att.data, 'base64')
        const isImage    = att.type === 'image' || /\.(png|jpg|jpeg|gif|webp)$/i.test(att.name)
        const isPdf      = /\.pdf$/i.test(att.name)
        const isTextFile = /\.(txt|md|json|csv|js|ts|jsx|tsx|py|html|css|xml|yaml|yml|sh|sql)$/i.test(att.name)
        const isExcel    = /\.(xlsx|xls)$/i.test(att.name)
        const isWord     = /\.(docx|doc)$/i.test(att.name)

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
        } else if (isPdf) {
          documentBlocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } })
          try {
            const pdfParse = require('pdf-parse')
            const parsed = await pdfParse(buffer)
            attachmentContext += `\n\n[Document PDF: ${att.name}]\n${parsed.text}`
          } catch {
            attachmentContext += `\n\n[Document PDF: ${att.name} — analysé ci-dessus]`
          }
          hasDocAttachment = true
        } else if (isTextFile) {
          attachmentContext += `\n\n[Attached file: ${att.name}]\n\`\`\`\n${buffer.toString('utf8')}\n\`\`\``
          hasDocAttachment = true
        } else if (isExcel) {
          try {
            const xlsx = require('xlsx')
            const wb = xlsx.read(buffer)
            let excelText = `[Excel file: ${att.name}]\n`
            for (const sheetName of wb.SheetNames) {
              excelText += `\n### Sheet: ${sheetName}\n`
              excelText += xlsx.utils.sheet_to_csv(wb.Sheets[sheetName])
            }
            attachmentContext += '\n\n' + excelText
            hasDocAttachment = true
          } catch (e) {
            attachmentContext += `\n\n[Excel file: ${att.name} -- read error: ${e.message}]`
          }
        } else if (isWord) {
          try {
            const mammoth = require('mammoth')
            const result = await mammoth.extractRawText({ buffer })
            attachmentContext += `\n\n[Word document: ${att.name}]\n${result.value}`
            hasDocAttachment = true
          } catch (e) {
            attachmentContext += `\n\n[Word document: ${att.name} -- read error: ${e.message}]`
          }
        } else {
          const ext = path.extname(att.name).slice(1) || 'bin'
          const tempPath = path.join(os.tmpdir(), `atum-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`)
          fs.writeFileSync(tempPath, buffer)
          tempFiles.push(tempPath)
          attachmentContext += `\n\n[Attached file: ${att.name} -- path: ${tempPath}]`
        }
      } catch (e) {
        attachmentContext += `\n\n[Attachment: ${att.name} -- processing error: ${e.message}]`
      }
    }

    // Auto-KB instruction when documents are attached
    if (hasDocAttachment && agentId) {
      attachmentContext += `\n\n⚠️ Auto instruction: Save a structured summary of this/these document(s) to your knowledge base via write_file at ~/.claude/databases/${agentId}_data.json. Add an entry in the appropriate array (documents, context, notes, etc.) with today's date, source, and key extracted information.`
    }

    sendStream({ type: 'start', timestamp: Date.now() })

    // ── OpenRouter fast path ──────────────────────────────────────────────
    if (isOpenRouterKey(token)) {
      try {
        const { prompt: realSystemPrompt, model: rawAgentModel } = loadAgentSystemPrompt(agentId || 'atum', systemPrompt)
        const agentModelId = requestModel || resolveModel(rawAgentModel)
        const orModel = mapModelToOpenRouter(agentModelId)
        const baseContext = loadBaseContext(agentId || 'atum')

        let chatRules = ''
        try {
          if (fs.existsSync(RULES_PATH)) {
            chatRules = '\n\n---\nPRIORITY RULES\n' + fs.readFileSync(RULES_PATH, 'utf8') + '\n---\n'
          }
        } catch {}

        const learningsContextOR = await kb.getRecentLearnings(agentId || 'atum', 2000)
        const fullSystem = ((realSystemPrompt || '') + baseContext + learningsContextOR + chatRules).trim() || undefined

        const MAX_HISTORY = 10
        let trimmedMsgs = messages || []
        if (trimmedMsgs.length > MAX_HISTORY) {
          trimmedMsgs = trimmedMsgs.slice(-MAX_HISTORY)
          if (trimmedMsgs[0]?.role !== 'user') trimmedMsgs = trimmedMsgs.slice(1)
        }

        const orMessages = []
        if (fullSystem) orMessages.push({ role: 'system', content: fullSystem })
        for (const m of trimmedMsgs) {
          const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
          orMessages.push({ role: m.role, content })
        }
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
      endStream()
      return
    }

    // ── SDK retry loop ────────────────────────────────────────────────────
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
          defaultHeaders: { 'anthropic-beta': 'pdfs-2024-09-25,prompt-caching-2024-07-31' },
        })

        // Load full agent system prompt
        const { prompt: realSystemPrompt, model: rawAgentModel } = loadAgentSystemPrompt(agentId || 'pai', systemPrompt)
        const agentModelId = requestModel || resolveModel(rawAgentModel)

        // Build context
        const baseContext = loadBaseContext(agentId || 'pai')
        const chatRules = loadChatRules(agentId || '')

        // Workspace path injection (no auto-content loading)
        let wsContext = ''
        if (workspacePath && fs.existsSync(workspacePath)) {
          wsContext = `\n\n---\n## WORKSPACE ACTIF\nChemin : ${workspacePath}\nUtilise les outils (read_file, list_directory, grep_files, glob_files) pour acceder au code.\nLes chemins relatifs sont resolus depuis : ${workspacePath}\n---`
        }

        const kbContext = buildKBContext(agentId || 'pai')
        const learningsContext = await kb.getRecentLearnings(agentId || 'pai', 2000)
        const fullSystem = ((realSystemPrompt || '') + baseContext + wsContext + kbContext + learningsContext + chatRules).trim() || undefined

        // Trim conversation history
        const MAX_HISTORY = 10
        let trimmedMsgs = messages || []
        if (trimmedMsgs.length > MAX_HISTORY) {
          trimmedMsgs = trimmedMsgs.slice(-MAX_HISTORY)
          if (trimmedMsgs[0]?.role !== 'user') {
            trimmedMsgs = trimmedMsgs.slice(1)
          }
        }

        // Build API messages (attach context + images/documents to last user message)
        const apiMessages = trimmedMsgs.map((m, i) => {
          if (i !== trimmedMsgs.length - 1) return { role: m.role, content: m.content }
          const textContent = (m.content || '') + attachmentContext
          if (documentBlocks.length > 0 || imageBlocks.length > 0) {
            return { role: m.role, content: [...documentBlocks, ...imageBlocks, { type: 'text', text: textContent }] }
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

        // Token cost hint
        {
          const sysTokens = Math.round((fullSystem || '').length / 4)
          const ctxTokens = Math.round(
            currentMessages.reduce((acc, m) => acc + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length), 0) / 4
          )
          const estimatedInput = sysTokens + ctxTokens
          let costHint = ''
          if (estimatedInput > 30000) costHint = ' -- high context'
          else if (estimatedInput > 15000) costHint = ' -- moderate context'
          sendStream({ type: 'stderr', data: `[tokens] ~${estimatedInput.toLocaleString()} input tokens${costHint}.\n`, timestamp: Date.now() })
        }

        // ── Agentic loop ────────────────────────────────────────────────
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
            finalMsg = await Promise.race([
              stream.finalMessage(),
              new Promise((_, reject) => {
                if (abortController.signal.aborted) {
                  reject(Object.assign(new Error('AbortError'), { name: 'AbortError' }))
                } else {
                  abortController.signal.addEventListener('abort', () => {
                    reject(Object.assign(new Error('AbortError'), { name: 'AbortError' }))
                  }, { once: true })
                }
              }),
            ])
          } finally {
            clearTimeout(timeoutId)
          }

          if (streamTimedOut) {
            sendStream({ type: 'stderr', data: `[TIMEOUT] Stream exceeded ${STREAM_TIMEOUT / 1000}s -- stopping turn.\n`, timestamp: Date.now() })
            break
          }

          totalInputTokens += finalMsg.usage?.input_tokens || 0
          totalOutputTokens += finalMsg.usage?.output_tokens || 0

          currentMessages.push({ role: 'assistant', content: finalMsg.content })

          // Auto-continuation if model was cut off mid-task
          if (finalMsg.stop_reason === 'max_tokens') {
            emitTUIStatus(sendStream, `${nextSpinner()} Continuation...`)
            const lastChunk = fullText.slice(-200).trim().replace(/\n+/g, ' ')
            const contextHint = lastChunk.length > 20 ? ` You stopped at: "...${lastChunk.slice(-80)}"` : ''
            currentMessages.push({
              role: 'user',
              content: `[AUTO-CONTINUATION -- DO NOT RESTART]\nYour previous response was truncated by the token limit.${contextHint}\nResume IMMEDIATELY where you left off -- no introduction, no recap.`,
            })
            continue
          }

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

            const result = await executeTool(block.name, block.input, workspacePath, sendStream, token, kb)

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

          if (turn === MAX_AGENTIC_TURNS - 1) {
            const warningMsg = '\n\nMax turns reached. Reply "continue" if the task is not finished.'
            fullText += warningMsg
            sendStream({ type: 'stream-text', data: warningMsg, timestamp: Date.now() })
          }
        }

        // ── Post-loop ───────────────────────────────────────────────────
        if (abortController.signal.aborted) {
          clearInterval(_progressIntervalId)
          currentAbortController = null
          sendStream({ type: 'end', code: 1, aborted: true, timestamp: Date.now() })
          endStream()
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

        tempFiles.forEach(f => { try { fs.unlinkSync(f) } catch {} })

        const costUsd = (totalInputTokens * 3 + totalOutputTokens * 15) / 1e6
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
        endStream()
        return

      } catch (err) {
        if (_progressIntervalId) clearInterval(_progressIntervalId)
        lastSdkError = err
        currentAbortController = null
        if (abortController.signal.aborted) {
          sendStream({ type: 'end', code: 1, aborted: true, timestamp: Date.now() })
          endStream()
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
        const isRetryable = isRateLimit || isServerError || isNetworkError || isAuth401

        if (isRateLimit) { isRateLimited = true; lastErrorType = 'rateLimit' }
        else if (isAuth401) { lastErrorType = 'auth401' }
        else if (isServerError) { lastErrorType = 'server' }
        else if (isNetworkError) { lastErrorType = 'network' }

        if (isRetryable && attempt < MAX_SDK_RETRIES) {
          continue
        }

        if (isAuth401) {
          sendStream({ type: 'stream-text', data: '\nInvalid API key. Please check your key and try again.', timestamp: Date.now() })
          sendStream({ type: 'end', code: 1, timestamp: Date.now() })
          endStream()
          return
        }

        if (isRateLimit) {
          sendStream({ type: 'stream-text', data: '\nRate limit reached. Wait a few minutes and try again.', timestamp: Date.now() })
          sendStream({ type: 'end', code: 0, timestamp: Date.now() })
          currentAbortController = null
          endStream()
          return
        }

        sendStream({ type: 'stderr', data: explainError('API', err) + '\n', timestamp: Date.now() })
        sendStream({ type: 'stream-text', data: `\nError: ${explainError('API', err)}`, timestamp: Date.now() })
        sendStream({ type: 'end', code: 1, timestamp: Date.now() })
        endStream()
        return
      }
    } // end retry loop
  })

  // Allow external callers to abort the current request
  app.post('/api/abort', (req, res) => {
    if (currentAbortController) currentAbortController.abort()
    res.json({ success: true })
  })
}

module.exports = { registerChatRoute }
