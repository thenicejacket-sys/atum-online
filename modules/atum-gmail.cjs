'use strict'
// ============================================================================
// atum-gmail.cjs
// Purpose  : Gmail daemon — auto-reply to emails via Anthropic SDK
// Owner    : Aymeric
// Source   : server.js lines 1843-2067
// ============================================================================

const path = require('path')
const fs   = require('fs')
const { CUSTOM_AGENTS_DIR, GMAIL_CONFIG_PATH, GMAIL_TOKEN_PATH } = require('./atum-filesystem.cjs')
const { recordAgentUsage } = require('./atum-tracking.cjs')

// ── Config loaders ───────────────────────────────────────────────────────────
function loadGmailConfig() {
  let cfg = { enabled: false }
  try {
    cfg = JSON.parse(fs.readFileSync(GMAIL_CONFIG_PATH, 'utf8'))
  } catch {
    // Fallback: read from repo root (state written by toggle)
    try { cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'gmail-config.json'), 'utf8')) } catch {}
  }
  // Railway env vars — max priority
  if (process.env.GMAIL_ENABLED !== undefined) cfg.enabled = process.env.GMAIL_ENABLED === 'true'
  if (process.env.GMAIL_API_KEY) cfg.api_key = process.env.GMAIL_API_KEY
  return cfg
}

function loadGmailToken() {
  // Railway env vars — persistent between restarts
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

function loadCustomAgentsGmail() {
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
      return { id: base.toLowerCase(), name, file: f, systemPrompt }
    })
  } catch { return [] }
}

// ── Gmail API helpers ────────────────────────────────────────────────────────
async function refreshGmailAccessToken() {
  const t = loadGmailToken()
  if (!t?.refresh_token) throw new Error('gmail-token.json manquant ou sans refresh_token')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: t.client_id,
      client_secret: t.client_secret,
      refresh_token: t.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Refresh token echoue : ${JSON.stringify(data)}`)
  return data.access_token
}

async function gmailGetReq(endpoint, token) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

async function gmailPostReq(endpoint, token, body) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

function extractGmailEmailText(payload) {
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

function getGmailHeader(headers, name) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''
}

async function ensureGmailLabel(token, labelName) {
  const list = await gmailGetReq('/users/me/labels', token)
  const existing = (list.labels || []).find(l => l.name === labelName)
  if (existing) return existing.id
  const created = await gmailPostReq('/users/me/labels', token, {
    name: labelName,
    labelListVisibility: 'labelShow',
    messageListVisibility: 'show',
  })
  return created.id
}

function detectGmailAgent(subject, agents) {
  const lc = subject.toLowerCase()
  return agents.find(a => lc.includes(a.name.toLowerCase())) || null
}

async function callAgentForEmailWeb(agent, email, apiKey) {
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
    messages: [{ role: 'user', content: userMsg }],
  })
  return response.content?.[0]?.text || ''
}

function buildMimeEmailWeb({ to, from, subject, body, replyToMsgId, references }) {
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`
  let mime = `From: ${from}\r\nTo: ${to}\r\n`
  if (replyToMsgId) mime += `In-Reply-To: ${replyToMsgId}\r\n`
  if (references) mime += `References: ${references}\r\n`
  mime += `Subject: Re: ${subjectEncoded}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`
  mime += Buffer.from(body).toString('base64')
  return Buffer.from(mime).toString('base64url')
}

// ── Main daemon tick ─────────────────────────────────────────────────────────
async function checkNewGmailEmailsWeb() {
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
        const isSelfSent = ownerEmail && from.includes(ownerEmail)
        const isReply = /^re:\s/i.test(subject.trim())
        if (isSelfSent && isReply) {
          console.log(`[Gmail] Reponse auto-envoyee ignoree (anti-boucle) — ${from}`)
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
          replyToMsgId: msgId,
          references: refs ? `${refs} ${msgId}` : msgId,
        })
        const replyMode = config.reply_mode || 'send'
        if (replyMode === 'draft') {
          await gmailPostReq('/users/me/drafts', token, { message: { raw: rawEmail, threadId: full.threadId } })
          console.log(`[Gmail] Brouillon cree pour : ${from}`)
        } else {
          await gmailPostReq('/users/me/messages/send', token, { raw: rawEmail, threadId: full.threadId })
          console.log(`[Gmail] Email envoye automatiquement a : ${from} par ${agent.name}`)
          recordAgentUsage(agent.id || agent.name.toLowerCase())
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

function startGmailDaemonWeb() {
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

function stopGmailDaemon() {
  if (gmailDaemonIntervalId) {
    clearInterval(gmailDaemonIntervalId)
    gmailDaemonIntervalId = null
  }
}

module.exports = {
  loadGmailConfig,
  loadGmailToken,
  startGmailDaemonWeb,
  stopGmailDaemon,
  checkNewGmailEmailsWeb,
}
