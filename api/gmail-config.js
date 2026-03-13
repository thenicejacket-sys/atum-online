// Vercel serverless function — lecture/écriture gmail-config.json dans le repo GitHub
// GET  /api/gmail-config → retourne { enabled: bool }
// POST /api/gmail-config { enabled: bool } → met à jour le fichier dans le repo

const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const OWNER        = 'thenicejacket-sys'
const REPO         = 'atum-online'
const FILE_PATH    = 'gmail-config.json'
const GITHUB_API   = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`

const GH_HEADERS = {
  'Authorization': `token ${GITHUB_TOKEN}`,
  'Accept':        'application/vnd.github.v3+json',
  'Content-Type':  'application/json',
  'User-Agent':    'atum-online-api'
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    try {
      const r    = await fetch(GITHUB_API, { headers: GH_HEADERS })
      const data = await r.json()
      if (!data.content) return res.status(200).json({ enabled: true })
      const cfg  = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'))
      return res.status(200).json({ enabled: !!cfg.enabled, sha: data.sha })
    } catch {
      return res.status(200).json({ enabled: true })
    }
  }

  if (req.method === 'POST') {
    try {
      const { enabled } = req.body || {}

      // Récupérer le SHA actuel du fichier (requis pour PUT GitHub)
      const r1   = await fetch(GITHUB_API, { headers: GH_HEADERS })
      const cur  = await r1.json()
      const sha  = cur.sha

      const newContent = JSON.stringify({ enabled: !!enabled }, null, 2)

      const payload = {
        message: `${enabled ? 'Activer' : 'Désactiver'} les réponses email automatiques`,
        content: Buffer.from(newContent).toString('base64'),
        sha
      }

      const r2 = await fetch(GITHUB_API, {
        method:  'PUT',
        headers: GH_HEADERS,
        body:    JSON.stringify(payload)
      })
      const result = await r2.json()
      if (result.content) {
        return res.status(200).json({ ok: true, enabled: !!enabled })
      } else {
        return res.status(500).json({ error: result.message || 'Erreur GitHub API' })
      }
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
