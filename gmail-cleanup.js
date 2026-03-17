#!/usr/bin/env node
'use strict'

// ── Gmail Cleanup — retire PAI-Seen des emails non traités ────────────────
// Cas d'usage : emails bloqués par l'ancien anti-boucle (PAI-Seen sans PAI-Processed)
// Rend ces emails visibles au daemon pour qu'il les traite au prochain run.

const GMAIL_TOKEN = JSON.parse(process.env.GMAIL_TOKEN || '{}')

if (!GMAIL_TOKEN.refresh_token) {
  console.error('[Cleanup] ❌ Variable GMAIL_TOKEN invalide ou manquante')
  process.exit(1)
}

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

async function getLabelId (labelName, token) {
  const data = await gmailGet('/users/me/labels', token)
  const lbl = (data.labels || []).find(l => l.name === labelName)
  return lbl ? lbl.id : null
}

async function main () {
  console.log('[Cleanup] 🚀 Démarrage du nettoyage...')
  const token = await refreshAccessToken()

  const labelSeenId = await getLabelId('PAI-Seen', token)
  if (!labelSeenId) {
    console.log('[Cleanup] ℹ️  Label PAI-Seen introuvable — rien à nettoyer')
    return
  }

  // Cherche emails avec PAI-Seen mais sans PAI-Processed
  const q = encodeURIComponent('label:PAI-Seen -label:PAI-Processed')
  const list = await gmailGet(`/users/me/messages?q=${q}&maxResults=20`, token)

  if (!list.messages || list.messages.length === 0) {
    console.log('[Cleanup] ✅ Aucun email bloqué trouvé')
    return
  }

  console.log(`[Cleanup] 🔍 ${list.messages.length} email(s) à débloquer`)

  for (const msg of list.messages) {
    const full = await gmailGet(`/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject,From`, token)
    const hdrs = full.payload?.headers || []
    const subject = hdrs.find(h => h.name === 'Subject')?.value || '(sans objet)'
    const from    = hdrs.find(h => h.name === 'From')?.value || '(inconnu)'

    await gmailPost(`/users/me/messages/${msg.id}/modify`, token, {
      removeLabelIds: [labelSeenId]
    })
    console.log(`[Cleanup] ♻️  Débloqué : "${subject}" de ${from}`)
  }

  console.log('[Cleanup] ✅ Nettoyage terminé — le daemon reprendra ces emails au prochain run')
}

main().catch(err => {
  console.error('[Cleanup] ❌ Erreur fatale:', err.message)
  process.exit(1)
})
