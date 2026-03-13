#!/usr/bin/env node
'use strict'

// ── Gmail Auto-Reply — script standalone pour GitHub Actions ──────────────
// Lance UN check, répond aux emails non traités, s'arrête.
// Variables d'environnement requises :
//   GMAIL_TOKEN        — contenu JSON de gmail-token.json
//   OPENROUTER_API_KEY — clé API OpenRouter (openrouter.ai)

const fs   = require('fs')
const path = require('path')

const GMAIL_TOKEN      = JSON.parse(process.env.GMAIL_TOKEN || '{}')
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const AGENTS_DIR       = path.join(__dirname, 'agents')
const LABEL_PROCESSED  = 'PAI-Processed'
const MAX_EMAILS       = 5

if (!OPENROUTER_API_KEY) {
  console.error('[Gmail] ❌ Variable OPENROUTER_API_KEY manquante')
  process.exit(1)
}
if (!GMAIL_TOKEN.refresh_token) {
  console.error('[Gmail] ❌ Variable GMAIL_TOKEN invalide ou manquante')
  process.exit(1)
}

// ── Requêtes Gmail API ─────────────────────────────────────────────────────
async function refreshAccessToken () {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     GMAIL_TOKEN.client_id,
      client_secret: GMAIL_TOKEN.client_secret,
      refresh_token: GMAIL_TOKEN.refresh_token,
      grant_type:    'refresh_token'
    })
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Refresh token échoué : ${JSON.stringify(data)}`)
  return data.access_token
}

async function gmailGet (endpoint, token) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  return res.json()
}

async function gmailPost (endpoint, token, body) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return res.json()
}

// ── Extraction du texte d'un email ────────────────────────────────────────
function extractText (payload) {
  if (!payload) return ''
  if (payload.mimeType === 'text/plain' && payload.body?.data)
    return Buffer.from(payload.body.data, 'base64').toString('utf8')
  if (payload.parts) {
    for (const part of payload.parts) {
      const t = extractText(part)
      if (t) return t
    }
  }
  return ''
}

function getHeader (headers, name) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''
}

// ── Label Gmail pour marquer les emails traités ───────────────────────────
async function ensureLabel (token, labelName) {
  const list = await gmailGet('/users/me/labels', token)
  const existing = (list.labels || []).find(l => l.name === labelName)
  if (existing) return existing.id
  const created = await gmailPost('/users/me/labels', token, {
    name: labelName, labelListVisibility: 'labelShow', messageListVisibility: 'show'
  })
  return created.id
}

// ── Chargement des agents depuis ./agents/ ─────────────────────────────────
function loadAgents () {
  try {
    return fs.readdirSync(AGENTS_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const base = f.replace('.md', '')
        const name = base.charAt(0).toUpperCase() + base.slice(1)
        let systemPrompt = `Tu es ${name}, un assistant IA expert. Tu réponds aux emails de manière professionnelle.`
        try {
          const raw = fs.readFileSync(path.join(AGENTS_DIR, f), 'utf8')
          systemPrompt = raw.replace(/^---[\s\S]*?---\n/, '').trim()
        } catch {}
        return { name, systemPrompt }
      })
  } catch { return [] }
}

// ── Détection de l'agent par le sujet de l'email ──────────────────────────
function detectAgent (subject, agents) {
  const lc = subject.toLowerCase()
  return agents.find(a => lc.includes(a.name.toLowerCase())) || null
}

// ── Appel Claude via OpenRouter API (fetch natif, pas de SDK) ─────────────
async function callAgent (agent, email) {
  const userMsg = `Tu as reçu un email professionnel. Réponds directement, sans commenter ta démarche.

EXPÉDITEUR : ${email.from}
SUJET : ${email.subject}
CORPS :
${email.body}

RÈGLES DE FORMAT ABSOLUES :
- Ton conversationnel, naturel et professionnel
- Pas de tableaux markdown (pas de | col | col |)
- Pas de séparateurs --- ou ===
- Pas d'astérisques gras **texte** ni de titres ## Section
- Bullet points OK pour les vraies listes, flèches (→) pour structurer sobrement
- Phrases courtes, directes, humaines
- Salutation naturelle + signature "${agent.name}"`

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://atum-five.vercel.app',
      'X-Title': 'ATUM Gmail Daemon'
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [
        { role: 'system', content: agent.systemPrompt },
        { role: 'user',   content: userMsg }
      ]
    })
  })
  const data = await res.json()
  if (data.error) throw new Error(`OpenRouter: ${data.error.message}`)
  return data.choices?.[0]?.message?.content || ''
}

// ── Construction de l'email MIME ──────────────────────────────────────────
function buildMime ({ to, from, subject, body, replyToMsgId, references }) {
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`
  let mime = `From: ${from}\r\nTo: ${to}\r\n`
  if (replyToMsgId) mime += `In-Reply-To: ${replyToMsgId}\r\n`
  if (references)   mime += `References: ${references}\r\n`
  mime += `Subject: Re: ${subjectEncoded}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`
  mime += Buffer.from(body).toString('base64')
  return Buffer.from(mime).toString('base64url')
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main () {
  console.log('[Gmail] 🚀 Démarrage du check...')

  const agents = loadAgents()
  if (!agents.length) {
    console.log('[Gmail] Aucun agent trouvé dans agents/')
    return
  }
  console.log(`[Gmail] ${agents.length} agent(s) : ${agents.map(a => a.name).join(', ')}`)

  const token      = await refreshAccessToken()
  const labelId    = await ensureLabel(token, LABEL_PROCESSED)
  const profile    = await gmailGet('/users/me/profile', token)
  const ownerEmail = profile.emailAddress || ''

  const q    = encodeURIComponent(`is:unread -label:${LABEL_PROCESSED}`)
  const list = await gmailGet(`/users/me/messages?q=${q}&maxResults=${MAX_EMAILS}`, token)

  if (!list.messages?.length) {
    console.log('[Gmail] ✅ Aucun nouveau email')
    return
  }

  console.log(`[Gmail] 📬 ${list.messages.length} email(s) à traiter`)

  for (const msg of list.messages) {
    try {
      const full    = await gmailGet(`/users/me/messages/${msg.id}?format=full`, token)
      const hdrs    = full.payload?.headers || []
      const from    = getHeader(hdrs, 'From')
      const subject = getHeader(hdrs, 'Subject')
      const msgId   = getHeader(hdrs, 'Message-ID')
      const refs    = getHeader(hdrs, 'References')
      const body    = extractText(full.payload)

      // Anti-boucle — ignorer ses propres emails
      if (ownerEmail && from.includes(ownerEmail)) {
        console.log(`[Gmail] ⏭️  Email propre ignoré (anti-boucle)`)
        await gmailPost(`/users/me/messages/${msg.id}/modify`, token, { addLabelIds: [labelId] })
        continue
      }

      const agent = detectAgent(subject, agents)
      if (!agent) {
        console.log(`[Gmail] ⏭️  Aucun agent pour "${subject}" — ignoré`)
        await gmailPost(`/users/me/messages/${msg.id}/modify`, token, { addLabelIds: [labelId] })
        continue
      }

      console.log(`[Gmail] ✍️  ${agent.name} répond à ${from} (sujet: "${subject}")`)
      const reply = await callAgent(agent, { from, subject, body })
      const raw   = buildMime({
        to: from, from: ownerEmail, subject, body: reply,
        replyToMsgId: msgId,
        references: refs ? `${refs} ${msgId}` : msgId
      })

      await gmailPost('/users/me/messages/send', token, { raw, threadId: full.threadId })
      console.log(`[Gmail] ✅ Réponse envoyée à ${from} par ${agent.name}`)
      await gmailPost(`/users/me/messages/${msg.id}/modify`, token, { addLabelIds: [labelId] })

    } catch (e) {
      console.error(`[Gmail] ❌ Erreur sur message ${msg.id} :`, e.message)
    }
  }

  console.log('[Gmail] 🏁 Check terminé.')
}

main().catch(err => {
  console.error('[Gmail] ❌ Erreur fatale :', err.message)
  process.exit(1)
})
