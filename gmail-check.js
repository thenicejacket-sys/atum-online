#!/usr/bin/env node
'use strict'

// ── Gmail Auto-Reply — script standalone pour GitHub Actions ──────────────
// Lance UN check, répond aux emails non traités, s'arrête.
// Variables d'environnement requises :
//   GMAIL_TOKEN        — contenu JSON de gmail-token.json
//   OPENROUTER_API_KEY — clé API OpenRouter (openrouter.ai)
//   MINDEE_API_KEY     — (optionnel) OCR spécialisé reçus/factures

const fs       = require('fs')
const os       = require('os')
const path     = require('path')
const pdfParse = require('pdf-parse')
const XLSX     = require('xlsx')
const sharp    = require('sharp')
const Mindee   = require('mindee')

const GMAIL_TOKEN        = JSON.parse(process.env.GMAIL_TOKEN || '{}')
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const MINDEE_API_KEY     = process.env.MINDEE_API_KEY || ''

// Client Mindee V2 — null si clé absente (dégradation gracieuse)
const MINDEE_MODEL_ID = 'ebee3a4a-342b-4fa7-abef-7f2fee112cac'
const mindeeClient = MINDEE_API_KEY
  ? new Mindee.ClientV2({ apiKey: MINDEE_API_KEY })
  : null
const AGENTS_DIR         = path.join(__dirname, 'agents')
const CONFIG_PATH        = path.join(__dirname, 'gmail-config.json')
const LABEL_PROCESSED    = 'PAI-Processed'
const LABEL_SEEN         = 'PAI-Seen'
const MAX_EMAILS         = 5

// ── Supabase — tracking des interactions agents ────────────────────────────
const _SUPA_URL = 'https://ataxqfqlprndcjisepbn.supabase.co'
const _SUPA_KEY = 'sb_publishable_qZMWIStnnUbnmdVxKB4DyA_Bpj10XoY'
function recordAgentUsage (agentId, agentName) {
  if (!agentId) return
  fetch(_SUPA_URL + '/rest/v1/agent_usage', {
    method: 'POST',
    headers: {
      'apikey': _SUPA_KEY, 'Authorization': 'Bearer ' + _SUPA_KEY,
      'Content-Type': 'application/json', 'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ agent_id: agentId, agent_name: agentName || agentId }),
  }).catch(() => {})
}

if (!OPENROUTER_API_KEY) {
  console.error('[Gmail] ❌ Variable OPENROUTER_API_KEY manquante')
  process.exit(1)
}
if (!GMAIL_TOKEN.refresh_token) {
  console.error('[Gmail] ❌ Variable GMAIL_TOKEN invalide ou manquante')
  process.exit(1)
}

// ── Vérifier si le daemon est activé ──────────────────────────────────────
try {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  if (!cfg.enabled) {
    console.log('[Gmail] ⏸️  Daemon désactivé (gmail-config.json → enabled: false)')
    process.exit(0)
  }
} catch {
  console.log('[Gmail] ℹ️  gmail-config.json absent — daemon actif par défaut')
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

// ── Preprocessing image pour OCR (resize, niveaux de gris, contraste, netteté) ─
async function preprocessForOCR (inputBuffer) {
  try {
    const meta = await sharp(inputBuffer).metadata()
    const w    = meta.width || 800
    // Cible : 2400px max (ideal OCR), 1200px min si image petite
    const targetW = Math.min(Math.max(w, 1200), 2400)

    const processed = await sharp(inputBuffer)
      .rotate()                                          // EXIF auto-rotation (photo prise de côté)
      .resize(targetW, null, { fit: 'inside' })         // rescale optimal OCR
      .grayscale()                                      // niveaux de gris → moins de bruit couleur
      .normalise()                                      // auto levels (étire l'histogramme)
      .sharpen()                                        // accentue les bords du texte
      .jpeg({ quality: 85 })
      .toBuffer()

    console.log(`[OCR] 🔧 ${w}px → ${targetW}px · ${(inputBuffer.length/1024).toFixed(0)}KB → ${(processed.length/1024).toFixed(0)}KB`)
    return processed
  } catch (e) {
    console.warn(`[OCR] ⚠️  Preprocessing échoué (${e.message}) — image originale`)
    return inputBuffer
  }
}

// ── PaddleOCR v4 via @gutenye/ocr-node (ONNX — offline, état de l'art) ───
// Bien meilleur que Tesseract sur tickets flous/inclinés/peu contrastés
// Modèles bundlés dans node_modules — aucun download au runtime

// Singleton : Ocr.create() est lent (chargement ONNX) — on l'appelle une seule fois par run
let _paddleOcrInstance = null
let _paddleOcrInit     = null

async function getPaddleOcr () {
  if (_paddleOcrInstance) return _paddleOcrInstance
  if (!_paddleOcrInit) {
    _paddleOcrInit = (async () => {
      const { default: Ocr } = await import('@gutenye/ocr-node')
      _paddleOcrInstance = await Ocr.create()
      console.log('[PaddleOCR] 🧠 Modèles ONNX chargés')
      return _paddleOcrInstance
    })()
  }
  return _paddleOcrInit
}

async function paddleOCR (imageBuffer, fname) {
  const tmpFile = path.join(os.tmpdir(), `ocr_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`)
  try {
    fs.writeFileSync(tmpFile, imageBuffer)
    const ocr   = await getPaddleOcr()
    const lines = await ocr.detect(tmpFile)
    const text  = (lines || []).map(l => l.text).join('\n').trim()
    if (!text || text.length < 10) return null
    console.log(`[PaddleOCR] ✅ ${fname} — ${lines.length} lignes · ${text.length} chars`)
    return text
  } catch (e) {
    console.error(`[PaddleOCR] ❌ ${fname} : ${e.message}`)
    return null
  } finally {
    try { fs.unlinkSync(tmpFile) } catch {}
  }
}

// ── Mindee V2 OCR — spécialisé reçus & factures ────────────────────────────
// Model: RECIP (ebee3a4a-342b-4fa7-abef-7f2fee112cac) — détecte reçus/factures
// Extrait : fournisseur, date, HT, TVA, TTC, articles, catégorie
async function mindeeExtract (fileBuffer, filename) {
  if (!mindeeClient) return null
  try {
    const input  = new Mindee.BufferInput({ buffer: fileBuffer, filename })
    const result = await mindeeClient.enqueueAndGetInference(input, { modelId: MINDEE_MODEL_ID })
    const fields = result.inference.result.fields

    const lines = [`[Mindee — ${filename}]`]
    const addField = (label, key) => {
      try {
        const f = fields.get(key)
        if (!f) return
        const v = f.value
        if (v !== null && v !== undefined && String(v).trim() !== '') lines.push(`${label}: ${v}`)
      } catch {}
    }

    addField('Type',        'document_type')
    addField('Catégorie',   'category')
    addField('Fournisseur', 'supplier_name')
    addField('Date',        'date')
    addField('N° reçu',     'receipt_number')
    addField('N° facture',  'invoice_number')
    addField('Total HT',    'total_net')
    addField('TVA',         'total_tax')
    addField('Total TTC',   'total_amount')
    addField('Pourboire',   'tip')

    // Détail TVA
    try {
      const taxesField = fields.get('taxes')
      if (taxesField?.items?.length > 0) {
        taxesField.items.forEach(item => {
          const rate  = item.fields?.get('rate')?.value
          const value = item.fields?.get('value')?.value
          if (value !== null && value !== undefined) {
            lines.push(`  TVA ${rate ?? '?'}%: ${value}`)
          }
        })
      }
    } catch {}

    // Articles
    try {
      const itemsField = fields.get('line_items')
      if (itemsField?.items?.length > 0) {
        lines.push('Articles:')
        itemsField.items.forEach(item => {
          const desc  = item.fields?.get('description')?.value || ''
          const price = item.fields?.get('total_amount')?.value
                     ?? item.fields?.get('unit_price')?.value
                     ?? ''
          if (desc || price !== '') lines.push(`  - ${desc}: ${price}`)
        })
      }
    } catch {}

    if (lines.length <= 1) return null // Aucune donnée utile
    console.log(`[Mindee] ✅ ${filename} — ${lines.length - 1} champ(s)`)
    return lines.join('\n')
  } catch (e) {
    console.error(`[Mindee] ❌ ${filename}: ${e.message}`)
    return null
  }
}

// ── Extraction JPEG brut depuis PDF scanné ────────────────────────────────
// La plupart des PDFs scannés = JPEG(s) wrappé(s) dans un conteneur PDF
// On extrait les bytes JPEG directement (FF D8 FF ... FF D9) sans aucune dep
function extractJpegsFromPdf (pdfBuffer) {
  const images = []
  let pos = 0
  while (pos < pdfBuffer.length - 3) {
    if (pdfBuffer[pos] === 0xFF && pdfBuffer[pos + 1] === 0xD8 && pdfBuffer[pos + 2] === 0xFF) {
      let end = pos + 3
      while (end < pdfBuffer.length - 1) {
        if (pdfBuffer[end] === 0xFF && pdfBuffer[end + 1] === 0xD9) {
          end += 2
          const jpeg = pdfBuffer.slice(pos, end)
          if (jpeg.length > 8000) images.push(jpeg) // < 8KB = thumbnail → ignore
          pos = end
          break
        }
        end++
      }
      if (end >= pdfBuffer.length - 1) break
    } else {
      pos++
    }
  }
  return images
}

// ── Parser MIME basique pour emails RFC822 imbriqués (emails transférés) ──
// Gmail emballe les PJ dans un part message/rfc822 pour les emails "TR:"
// On parse la structure MIME brute pour en extraire les PDFs et images
function parseMimeAttachments (rawBytes) {
  const raw   = rawBytes.toString('latin1')  // latin1 préserve tous les octets
  const parts = []

  const bMatch = raw.match(/boundary=(?:"([^"]+)"|([^\s;\r\n]+))/i)
  if (!bMatch) return parts
  const boundary = (bMatch[1] || bMatch[2]).trim()

  const segments = raw.split('--' + boundary)
  for (let i = 1; i < segments.length - 1; i++) {
    const seg    = segments[i]
    const sepSeq = seg.indexOf('\r\n\r\n') !== -1 ? '\r\n\r\n' : '\n\n'
    const sepIdx = seg.indexOf(sepSeq)
    if (sepIdx === -1) continue

    const headers = seg.slice(0, sepIdx)
    const body    = seg.slice(sepIdx + sepSeq.length)

    const ctMatch  = headers.match(/Content-Type:\s*([^\r\n;]+)/i)
    const cteMatch = headers.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i)
    const fnMatch  = headers.match(/filename\*?=(?:"([^"]+)"|([^;\r\n]+))/i)

    const mime  = (ctMatch?.[1]  || '').trim().toLowerCase()
    const enc   = (cteMatch?.[1] || '').trim().toLowerCase()
    const fname = ((fnMatch?.[1] || fnMatch?.[2]) || '').trim()

    if (enc !== 'base64') continue
    if (!mime.includes('application/pdf') && !mime.startsWith('image/')) continue

    try {
      const decoded = Buffer.from(body.replace(/[\r\n\s]/g, ''), 'base64')
      if (decoded.length > 500) {
        const label = fname || (mime.includes('pdf') ? 'document.pdf' : 'image.jpg')
        console.log(`[Gmail] 📦 RFC822 imbriqué : ${label} (${mime}, ${(decoded.length / 1024).toFixed(0)} KB)`)
        parts.push({ mimeType: mime, filename: label, data: decoded })
      }
    } catch {}
  }
  return parts
}

// ── Extraction de toutes les pièces jointes (PDF, Excel, Images) ──────────
async function processAttachments (payload, msgId, token) {
  const found = []
  function collectParts (part) {
    if (!part) return
    if (part.filename && part.filename.length > 0) found.push(part)
    if (part.parts) part.parts.forEach(collectParts)
  }
  collectParts(payload)

  // ── Emails transférés (TR: / Fwd:) — PJ dans une partie message/rfc822 ──
  // Gmail n'expose pas les PJ imbriquées comme parts directs dans format=full
  if (found.length === 0) {
    const rfc822Parts = []
    ;(function findRfc822 (part) {
      if (!part) return
      if (part.mimeType === 'message/rfc822') rfc822Parts.push(part)
      if (part.parts) part.parts.forEach(findRfc822)
    })(payload)

    for (const rfc822 of rfc822Parts) {
      let rfc822Bytes = null
      if (rfc822.body?.data) {
        rfc822Bytes = Buffer.from(rfc822.body.data, 'base64url')
      } else if (rfc822.body?.attachmentId) {
        try {
          const att = await gmailGet(
            `/users/me/messages/${msgId}/attachments/${rfc822.body.attachmentId}`, token
          )
          if (att.data) rfc822Bytes = Buffer.from(att.data, 'base64url')
        } catch (e) {
          console.warn(`[Gmail] ⚠️  RFC822 fetch: ${e.message}`)
        }
      }
      if (!rfc822Bytes) continue

      console.log(`[Gmail] 📨 Email transféré détecté — analyse PJ imbriquées (${(rfc822Bytes.length / 1024).toFixed(0)} KB)`)
      const nested = parseMimeAttachments(rfc822Bytes)
      for (const a of nested) {
        found.push({ mimeType: a.mimeType, filename: a.filename, _preData: a.data })
      }
    }
  }

  const textBlocks   = []  // strings à injecter dans le message texte
  const visionBlocks = []  // blocs image base64 pour l'API vision (images + PDFs scannés)

  for (const part of found) {
    const mime  = (part.mimeType || '').toLowerCase()
    const fname = part.filename || 'attachment'

    try {
      // Support PJ pré-décodées (extraites d'un RFC822 imbriqué)
      let data = part._preData || null
      if (!data) {
        let raw = part.body?.data
        if (!raw && part.body?.attachmentId) {
          const att = await gmailGet(
            `/users/me/messages/${msgId}/attachments/${part.body.attachmentId}`, token
          )
          raw = att.data
        }
        if (!raw) continue
        data = Buffer.from(raw, 'base64url')
      }

      // ── PDF ──
      if (mime === 'application/pdf' || fname.toLowerCase().endsWith('.pdf')) {
        // Essai 1 : pdf-parse (couche texte native — PDFs bien formés)
        let pdfTextOk = false
        try {
          const parsed  = await pdfParse(data)
          const pdfText = parsed.text.trim()
          if (pdfText.length >= 100) {
            textBlocks.push(`[PDF: ${fname}]\n${pdfText}`)
            pdfTextOk = true
          }
        } catch {}

        if (!pdfTextOk) {
          // Essai 2 : Mindee — OCR spécialisé reçus/factures (meilleure précision)
          const mindeeText = await mindeeExtract(data, fname)
          if (mindeeText) textBlocks.push(mindeeText)

          // Essai 3 : extraction JPEG brut + Vision (complément visuel)
          const jpegs = extractJpegsFromPdf(data)
          if (jpegs.length > 0) {
            console.log(`[Gmail] 🔍 PDF scanné ${fname} : ${jpegs.length} JPEG + Mindee=${!!mindeeText}`)
            for (const jpeg of jpegs) {
              const processed = await preprocessForOCR(jpeg)
              const ocrText   = await paddleOCR(processed, fname)
              visionBlocks.push({
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${processed.toString('base64')}` }
              })
              // PaddleOCR seulement si Mindee n'a rien donné (évite la redondance)
              if (ocrText && !mindeeText) {
                textBlocks.push(
                  `[PDF scanné: ${fname} — OCR brut]\n` +
                  `(Utilise l'image ET ce texte pour confirmer chaque valeur.)\n` +
                  `---\n${ocrText}`
                )
              }
            }
          } else if (!mindeeText) {
            textBlocks.push(`[PDF: ${fname}] — document scanné, aucune donnée extractible`)
            console.log(`[Gmail] ⚠️  PDF scanné ${fname} : Mindee KO + aucun JPEG`)
          }
        }

      // ── Excel ──
      } else if (
        mime.includes('spreadsheet') || mime.includes('excel') ||
        fname.toLowerCase().endsWith('.xlsx') || fname.toLowerCase().endsWith('.xls')
      ) {
        try {
          const wb = XLSX.read(data, { type: 'buffer' })
          let text = `[Excel: ${fname}]\n`
          wb.SheetNames.forEach(name => {
            text += `=== Feuille: ${name} ===\n${XLSX.utils.sheet_to_csv(wb.Sheets[name])}\n`
          })
          textBlocks.push(text)
          console.log(`[Gmail] 📊 Excel lu : ${fname}`)
        } catch (e) {
          console.error(`[Gmail] ❌ Erreur parsing Excel ${fname} : ${e.message}`)
        }

      // ── Images (JPEG, PNG, GIF, WebP) ──
      } else if (mime.startsWith('image/')) {
        // Étape 1 : Mindee — OCR spécialisé reçus/factures (données structurées)
        const mindeeText = await mindeeExtract(data, fname)
        if (mindeeText) textBlocks.push(mindeeText)

        // Étape 2 : Sharp preprocessing (rotation EXIF, resize 2400px, grayscale, netteté)
        const processed = await preprocessForOCR(data)

        // Étape 3 : PaddleOCR — texte brut complémentaire (si Mindee insuffisant)
        const ocrText = await paddleOCR(processed, fname)

        // Étape 4 : vision block — Claude voit l'image directement
        visionBlocks.push({
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${processed.toString('base64')}` }
        })

        // PaddleOCR seulement si Mindee n'a rien extrait
        if (ocrText && !mindeeText) {
          textBlocks.push(
            `[Image: ${fname} — OCR brut]\n` +
            `(Utilise l'image ET ce texte pour confirmer chaque valeur.)\n` +
            `---\n${ocrText}`
          )
        } else if (!ocrText && !mindeeText) {
          textBlocks.push(`[Image jointe: ${fname}]`)
        }

        const src = [mindeeText ? 'Mindee' : '', ocrText && !mindeeText ? 'PaddleOCR' : '', 'Vision']
          .filter(Boolean).join(' + ')
        console.log(`[Gmail] 🖼️  Image : ${fname} — ${src}`)
      }

    } catch (e) {
      console.error(`[Gmail] ❌ Erreur pièce jointe ${fname} : ${e.message}`)
    }
  }

  return { textBlocks, visionBlocks }
}

function getHeader (headers, name) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''
}

// ── Label Gmail visible (emails traités par un agent) ────────────────────
async function ensureLabel (token, labelName) {
  const list = await gmailGet('/users/me/labels', token)
  const existing = (list.labels || []).find(l => l.name === labelName)
  if (existing) return existing.id
  const created = await gmailPost('/users/me/labels', token, {
    name: labelName, labelListVisibility: 'labelShow', messageListVisibility: 'show'
  })
  return created.id
}

// ── Label Gmail caché (tracking interne — empêche le re-traitement) ───────
async function ensureLabelHidden (token, labelName) {
  const list = await gmailGet('/users/me/labels', token)
  const existing = (list.labels || []).find(l => l.name === labelName)
  if (existing) return existing.id
  const created = await gmailPost('/users/me/labels', token, {
    name: labelName, labelListVisibility: 'labelHide', messageListVisibility: 'hide'
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
        return { id: base.toLowerCase(), name, systemPrompt }
      })
  } catch { return [] }
}

// ── Détection de l'agent par le sujet + fallback ticket/facture → Christian ─
// Règle 1 (priorité) : nom d'agent explicitement dans le sujet (ex: "Christian - ...")
// Règle 2 (fallback) : email de type facture/ticket/reçu/note de frais → Christian
//   - mots-clés sujet (français + anglais, gère "Fwd:" / "TR:")
//   - OU filenames PJ qui ressemblent à un document comptable
function detectAgent (subject, agents, attachmentFilenames) {
  const lc = (subject || '').toLowerCase()
  // 1. Match direct sur le nom d'agent
  const direct = agents.find(a => lc.includes(a.name.toLowerCase()))
  if (direct) return direct

  // 2. Fallback Christian — ticket/facture/reçu/note de frais
  const fnames = (attachmentFilenames || []).join(' ').toLowerCase()
  const haystack = lc + ' ' + fnames
  const RX_COMPTABLE = /\b(ticket|facture|fact[\.\s_-]|fa[\.\s_-]?\d|re[cç]u|receipt|invoice|note\s*de\s*frais|justificatif|quittance|bon\s*de\s*caisse)\b/i
  if (RX_COMPTABLE.test(haystack)) {
    const christian = agents.find(a => a.id === 'christian')
    if (christian) {
      console.log(`[Gmail] 🧾 Fallback comptable détecté ("${subject}") → Christian`)
      return christian
    }
  }
  return null
}

// Pré-scan des filenames PJ (sans télécharger les bytes) — sert au fallback Christian
function collectAttachmentFilenames (payload) {
  const names = []
  function walk (part) {
    if (!part) return
    if (part.filename && part.filename.length > 0) names.push(part.filename)
    if (part.parts) part.parts.forEach(walk)
  }
  walk(payload)
  return names
}

// ── Tool definition: generate_excel ───────────────────────────────────────
const GENERATE_EXCEL_TOOL = {
  type: 'function',
  function: {
    name: 'generate_excel',
    description: 'Génère un fichier Excel (.xlsx) avec plusieurs feuilles et l\'envoie en pièce jointe dans la réponse email. Utilise cet outil quand l\'utilisateur demande un tableau, un budget, un export de données, ou tout fichier Excel.',
    parameters: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'Nom du fichier sans extension, ex: "budget_2026" ou "rapport_client"'
        },
        sheets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name:    { type: 'string', description: 'Nom de l\'onglet (max 31 caractères)' },
              headers: { type: 'array', items: { type: 'string' }, description: 'En-têtes de colonnes' },
              rows:    { type: 'array', items: { type: 'array' }, description: 'Lignes de données — chaque ligne est un tableau de valeurs' }
            },
            required: ['name', 'headers', 'rows']
          }
        }
      },
      required: ['filename', 'sheets']
    }
  }
}

// ── Appel Claude via OpenRouter API avec support tools + vision + documents ─
async function callAgent (agent, email, textBlocks, visionBlocks) {
  textBlocks   = textBlocks   || []
  visionBlocks = visionBlocks || []

  const baseText = `Tu as reçu un email professionnel${textBlocks.length > 0 ? ` avec pièce(s) jointe(s)` : ''}. Réponds directement, sans commenter ta démarche.

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

  const hasMultimodal = visionBlocks.length > 0

  // Instruction OCR forcée quand une image est jointe
  const ocrInstruction = hasMultimodal
    ? `\n\nINSTRUCTION LECTURE DOCUMENT — PRIORITÉ ABSOLUE :
Tu as un document ou une image en pièce jointe. Applique ces règles sans exception :
- Lis le document attentivement même si la qualité est faible, flou, ou pris en photo
- Tente de lire TOUS les champs visibles — ne déclare JAMAIS un champ "illisible" sans avoir vraiment essayé
- Sur un ticket de caisse, les montants apparaissent souvent 2 à 3 fois (ligne article, sous-total, total) — utilise ces répétitions pour confirmer chaque valeur
- Si tu es incertain d'une valeur, donne quand même ta meilleure estimation suivie de [?]
- N'écris jamais "contenu non lisible", "document vide" ou "impossible à lire" — fais toujours de ton mieux`
    : ''

  const fullText = textBlocks.length > 0
    ? baseText + ocrInstruction + '\n\n' + textBlocks.join('\n\n')
    : baseText + ocrInstruction

  const userContent = hasMultimodal
    ? [{ type: 'text', text: fullText }, ...visionBlocks]
    : fullText

  const messages = [
    { role: 'system', content: agent.systemPrompt },
    { role: 'user',   content: userContent }
  ]

  let excelBuffer   = null
  let excelFilename = null
  let reply         = ''

  // ── Boucle tool calls (max 5 tours) ────────────────────────────────────
  for (let turn = 0; turn < 5; turn++) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization':  `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type':   'application/json',
        'HTTP-Referer':   'https://atum-five.vercel.app',
        'X-Title':        'ATUM Gmail Daemon',
      },
      body: JSON.stringify({
        model:      'anthropic/claude-sonnet-4-6',
        max_tokens: 2048,
        tools:      [GENERATE_EXCEL_TOOL],
        messages
      })
    })
    const data = await res.json()
    if (data.error) throw new Error(`OpenRouter: ${data.error.message}`)

    const choice  = data.choices?.[0]
    const msg     = choice?.message
    const finish  = choice?.finish_reason

    // ── Réponse finale texte ──────────────────────────────────────────────
    if (finish !== 'tool_calls' && !msg?.tool_calls?.length) {
      reply = msg?.content || ''
      break
    }

    // ── L'agent appelle un tool ───────────────────────────────────────────
    messages.push(msg)  // ajouter le message assistant avec tool_calls

    const toolResults = []
    for (const tc of (msg.tool_calls || [])) {
      if (tc.function?.name === 'generate_excel') {
        try {
          const args = JSON.parse(tc.function.arguments)
          const wb = XLSX.utils.book_new()
          for (const sheet of (args.sheets || [])) {
            const wsData = [sheet.headers || [], ...(sheet.rows || [])]
            const ws = XLSX.utils.aoa_to_sheet(wsData)
            XLSX.utils.book_append_sheet(wb, ws, (sheet.name || 'Sheet1').slice(0, 31))
          }
          excelBuffer   = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
          excelFilename = (args.filename || 'reponse').replace(/\.xlsx$/i, '') + '.xlsx'
          console.log(`[Gmail] 📊 Excel généré : ${excelFilename} (${excelBuffer.length} octets)`)
          toolResults.push({
            tool_call_id: tc.id,
            role:         'tool',
            content:      `✅ Excel généré : ${excelFilename} — sera envoyé en pièce jointe`
          })
        } catch (e) {
          console.error(`[Gmail] ❌ generate_excel error : ${e.message}`)
          toolResults.push({
            tool_call_id: tc.id,
            role:         'tool',
            content:      `❌ Erreur lors de la génération Excel : ${e.message}`
          })
        }
      } else {
        toolResults.push({
          tool_call_id: tc.id,
          role:         'tool',
          content:      `❌ Tool inconnu : ${tc.function?.name}`
        })
      }
    }
    messages.push(...toolResults)
  }

  return { reply, excelBuffer, excelFilename }
}

// ── Construction de l'email MIME (texte seul) ─────────────────────────────
function buildMime ({ to, from, subject, body, replyToMsgId, references }) {
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`
  let mime = `From: ${from}\r\nTo: ${to}\r\n`
  if (replyToMsgId) mime += `In-Reply-To: ${replyToMsgId}\r\n`
  if (references)   mime += `References: ${references}\r\n`
  mime += `Subject: Re: ${subjectEncoded}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`
  mime += Buffer.from(body).toString('base64')
  return Buffer.from(mime).toString('base64url')
}

// ── Construction de l'email MIME avec pièce jointe Excel ─────────────────
function buildMimeWithAttachment ({ to, from, subject, body, replyToMsgId, references, attachmentBuffer, attachmentFilename }) {
  const boundary       = `PAI_BOUNDARY_${Date.now()}`
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`

  let mime = `From: ${from}\r\nTo: ${to}\r\n`
  if (replyToMsgId) mime += `In-Reply-To: ${replyToMsgId}\r\n`
  if (references)   mime += `References: ${references}\r\n`
  mime += `Subject: Re: ${subjectEncoded}\r\n`
  mime += `MIME-Version: 1.0\r\n`
  mime += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`

  // Partie 1 : corps texte
  mime += `--${boundary}\r\n`
  mime += `Content-Type: text/plain; charset=UTF-8\r\n`
  mime += `Content-Transfer-Encoding: base64\r\n\r\n`
  mime += Buffer.from(body).toString('base64') + '\r\n'

  // Partie 2 : pièce jointe Excel
  mime += `--${boundary}\r\n`
  mime += `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n`
  mime += `Content-Transfer-Encoding: base64\r\n`
  mime += `Content-Disposition: attachment; filename="${attachmentFilename}"\r\n\r\n`
  mime += attachmentBuffer.toString('base64') + '\r\n'

  mime += `--${boundary}--`
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

  const token       = await refreshAccessToken()
  const labelId     = await ensureLabel(token, LABEL_PROCESSED)
  const labelSeenId = await ensureLabelHidden(token, LABEL_SEEN)
  const profile     = await gmailGet('/users/me/profile', token)
  const ownerEmail  = profile.emailAddress || ''

  const q    = encodeURIComponent(`is:unread -label:${LABEL_SEEN} -label:${LABEL_PROCESSED}`)
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

      // ── Anti-boucle : ignorer uniquement les RÉPONSES envoyées par le daemon ──
      // On laisse passer les emails originaux (self-to-self) pour permettre le test
      // et l'envoi d'emails à soi-même avec un nom d'agent dans le sujet.
      // Seules les réponses "Re:" auto-envoyées sont bloquées (le daemon qui se répond).
      const fromEmail = from.replace(/.*<(.+)>.*/, '$1').trim() || from.trim()
      const isSelfSent = fromEmail === ownerEmail || from.includes(ownerEmail)
      const isReply = /^re:\s/i.test(subject.trim())
      if (isSelfSent && isReply) {
        console.log(`[Gmail] 🚫 Réponse auto-envoyée ignorée (anti-boucle) — ${from}`)
        await gmailPost(`/users/me/messages/${msg.id}/modify`, token, { addLabelIds: [labelSeenId] })
        continue
      }

      // Pré-scan filenames PJ (lecture metadata uniquement, pas de download)
      // — utile au fallback Christian quand le sujet ne mentionne pas l'agent
      // mais qu'une PJ ressemble à un document comptable (ticket_*, facture_*, etc.)
      const attachmentFilenames = collectAttachmentFilenames(full.payload)
      const agent = detectAgent(subject, agents, attachmentFilenames)
      if (!agent) {
        // Aucun agent ne correspond — label caché uniquement (pas de PAI-Processed visible)
        console.log(`[Gmail] ⏭️  Aucun agent pour "${subject}" — marqué PAI-Seen (caché)`)
        await gmailPost(`/users/me/messages/${msg.id}/modify`, token, { addLabelIds: [labelSeenId] })
        continue
      }

      // ── Traitement des pièces jointes ────────────────────────────────────
      const { textBlocks, visionBlocks } = await processAttachments(full.payload, msg.id, token)
      if (textBlocks.length > 0 || visionBlocks.length > 0) {
        console.log(`[Gmail] 📎 ${textBlocks.length + visionBlocks.length} pièce(s) jointe(s) traitée(s)`)
      }

      console.log(`[Gmail] ✍️  ${agent.name} répond à ${from} (sujet: "${subject}")`)
      const { reply, excelBuffer, excelFilename } = await callAgent(agent, { from, subject, body }, textBlocks, visionBlocks)

      // ── Construction et envoi de la réponse ──────────────────────────────
      const raw = excelBuffer
        ? buildMimeWithAttachment({
            to: from, from: ownerEmail, subject, body: reply,
            replyToMsgId: msgId,
            references: refs ? `${refs} ${msgId}` : msgId,
            attachmentBuffer: excelBuffer,
            attachmentFilename: excelFilename
          })
        : buildMime({
            to: from, from: ownerEmail, subject, body: reply,
            replyToMsgId: msgId,
            references: refs ? `${refs} ${msgId}` : msgId
          })

      await gmailPost('/users/me/messages/send', token, { raw, threadId: full.threadId })
      if (excelBuffer) {
        console.log(`[Gmail] ✅ Réponse + Excel (${excelFilename}) envoyés à ${from} par ${agent.name}`)
      } else {
        console.log(`[Gmail] ✅ Réponse envoyée à ${from} par ${agent.name}`)
      }

      recordAgentUsage(agent.id, agent.name)
      // Label visible PAI-Processed + label caché PAI-Seen
      await gmailPost(`/users/me/messages/${msg.id}/modify`, token, { addLabelIds: [labelId, labelSeenId] })

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
