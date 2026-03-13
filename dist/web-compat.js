/**
 * web-compat.js — Couche de compatibilité ATUM Online
 * Remplace window.electronAPI (Electron IPC) par des appels HTTP/fetch au serveur Express.
 * Ce fichier est injecté dans index.html AVANT le bundle React.
 */
;(function () {

  // ── Debug: afficher les erreurs JS sur l'écran au lieu de blanc ───────────
  window.addEventListener('error', function (e) {
    var box = document.getElementById('atum-error-box')
    if (!box) {
      box = document.createElement('pre')
      box.id = 'atum-error-box'
      box.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:20px;background:#1a0000;color:#ff6b6b;font-size:13px;z-index:999999;max-height:50vh;overflow:auto;white-space:pre-wrap;'
      document.body.appendChild(box)
    }
    box.textContent += '\n[ERROR] ' + e.message + '\n  at ' + e.filename + ':' + e.lineno + ':' + e.colno
  })
  window.addEventListener('unhandledrejection', function (e) {
    var box = document.getElementById('atum-error-box')
    if (!box) {
      box = document.createElement('pre')
      box.id = 'atum-error-box'
      box.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:20px;background:#1a0000;color:#ff6b6b;font-size:13px;z-index:999999;max-height:50vh;overflow:auto;white-space:pre-wrap;'
      document.body.appendChild(box)
    }
    box.textContent += '\n[UNHANDLED] ' + String(e.reason)
  })

  const API_BASE = window.ATUM_API_URL || ''

  let currentAbortController = null
  let chatStreamHandlers = []
  let paiTriggerHandlers = []

  // ── Utilitaires ───────────────────────────────────────────────────────────

  function getApiKey() {
    return localStorage.getItem('atum_api_key') || ''
  }

  function getModel() {
    return localStorage.getItem('atum_model') || 'claude-haiku-4-5-20251001'
  }

  function getSessionId() {
    let id = sessionStorage.getItem('atum_session_id')
    if (!id) {
      id = 'sess_' + Math.random().toString(36).slice(2) + Date.now()
      sessionStorage.setItem('atum_session_id', id)
    }
    return id
  }

  // ── window.electronAPI ────────────────────────────────────────────────────

  window.electronAPI = {
    isElectron: true,

    // ── Chat avec streaming NDJSON ──────────────────────────────────────────
    chat: async function (params) {
      const apiKey = getApiKey()
      if (!apiKey) {
        window._atumShowApiKeyModal && window._atumShowApiKeyModal()
        chatStreamHandlers.forEach(h => h({
          type: 'stream-text',
          data: '⚠️ Clé API manquante. Configurez votre clé dans les paramètres.',
          timestamp: Date.now()
        }))
        chatStreamHandlers.forEach(h => h({ type: 'end', code: 1, timestamp: Date.now() }))
        return { error: 'no_api_key' }
      }

      currentAbortController = new AbortController()
      const sessionId = getSessionId()

      chatStreamHandlers.forEach(h => h({ type: 'start', timestamp: Date.now() }))

      try {
        const response = await fetch(API_BASE + '/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': apiKey,
            'X-Session-Id': sessionId,
            'X-Model': getModel()
          },
          body: JSON.stringify(params),
          signal: currentAbortController.signal
        })

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Erreur serveur' }))
          chatStreamHandlers.forEach(h => h({
            type: 'stream-text',
            data: '❌ Erreur : ' + (err.error || response.statusText),
            timestamp: Date.now()
          }))
          chatStreamHandlers.forEach(h => h({ type: 'end', code: 1, timestamp: Date.now() }))
          return { error: err.error }
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() // Garder le fragment incomplet

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue
            try {
              const data = JSON.parse(trimmed)
              chatStreamHandlers.forEach(h => h(data))
            } catch { /* fragment partiel, ignoré */ }
          }
        }

        // Traiter le buffer restant
        if (buffer.trim()) {
          try {
            const data = JSON.parse(buffer.trim())
            chatStreamHandlers.forEach(h => h(data))
          } catch {}
        }

      } catch (err) {
        if (err.name === 'AbortError') {
          chatStreamHandlers.forEach(h => h({ type: 'end', code: 0, timestamp: Date.now() }))
        } else {
          chatStreamHandlers.forEach(h => h({
            type: 'stream-text',
            data: '❌ Erreur réseau : ' + err.message,
            timestamp: Date.now()
          }))
          chatStreamHandlers.forEach(h => h({ type: 'end', code: 1, timestamp: Date.now() }))
        }
      }

      currentAbortController = null
      return { success: true }
    },

    // ── Streaming events ────────────────────────────────────────────────────
    onChatStream: function (callback) {
      chatStreamHandlers.push(callback)
    },
    offChatStream: function () {
      chatStreamHandlers = []
    },

    // ── Abort ───────────────────────────────────────────────────────────────
    abortChat: async function () {
      if (currentAbortController) {
        currentAbortController.abort()
        currentAbortController = null
      }
      try {
        await fetch(API_BASE + '/api/abort', {
          method: 'POST',
          headers: { 'X-Session-Id': getSessionId() }
        })
      } catch {}
      return { success: true }
    },

    // ── Conversations (localStorage) ────────────────────────────────────────
    saveConversations: async function (data) {
      try {
        localStorage.setItem('atum_conversations', JSON.stringify(data))
        // Sync avec serveur si dispo
        fetch(API_BASE + '/api/conversations/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-Id': getSessionId()
          },
          body: JSON.stringify(data)
        }).catch(() => {})
        return { success: true }
      } catch (e) {
        return { success: false, error: e.message }
      }
    },

    loadConversations: async function () {
      try {
        const raw = localStorage.getItem('atum_conversations')
        return { success: true, conversations: raw ? JSON.parse(raw) : [] }
      } catch {
        return { success: true, conversations: [] }
      }
    },

    // ── File operations (non disponibles en web) ────────────────────────────
    selectFolder: async function () { return { cancelled: true } },
    selectDirectoryFolder: async function () { return { cancelled: true } },
    listDirectoryRoot: async function () { return { success: false, items: [] } },
    readFolder: async function () { return { success: false, items: [], tree: '' } },

    // ── Window ──────────────────────────────────────────────────────────────
    toggleFullscreen: async function () {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
      } else {
        document.documentElement.requestFullscreen().catch(() => {})
      }
    },

    // ── PAI Daemon triggers (non dispo en web) ──────────────────────────────
    getTriggers: async function () { return [] },
    resetTrigger: async function () { return { success: true } },
    updateTriggerPrompt: async function () { return { success: true } },
    onPaiTrigger: function (callback) { paiTriggerHandlers.push(callback) },
    offPaiTrigger: function () { paiTriggerHandlers = [] }
  }

  // ── Modal de configuration de la clé API ──────────────────────────────────
  window._atumShowApiKeyModal = function () {
    if (document.getElementById('atum-api-modal')) return

    const overlay = document.createElement('div')
    overlay.id = 'atum-api-modal'
    overlay.style.cssText = `
      position:fixed;top:0;left:0;width:100%;height:100%;
      background:rgba(0,0,0,0.7);z-index:99999;
      display:flex;align-items:center;justify-content:center;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    `

    const modal = document.createElement('div')
    modal.style.cssText = `
      background:#1C1C28;border:1px solid #333;border-radius:12px;
      padding:32px;max-width:480px;width:90%;color:#F0ECE4;
    `

    const currentKey = localStorage.getItem('atum_api_key') || ''
    const currentModel = localStorage.getItem('atum_model') || 'claude-sonnet-4-6'

    modal.innerHTML = `
      <h2 style="margin:0 0 8px;font-size:18px;font-weight:600;">⚙️ Configuration ATUM</h2>
      <p style="margin:0 0 20px;font-size:13px;color:#888;line-height:1.5;">
        Clé Anthropic (<code style="color:#7EC8A4">sk-ant-...</code>) ou OpenRouter (<code style="color:#7EC8A4">sk-or-v1-...</code>)<br>
        Anthropic : <a href="https://console.anthropic.com" target="_blank" style="color:#7EC8A4">console.anthropic.com</a> &nbsp;|&nbsp;
        OpenRouter : <a href="https://openrouter.ai/keys" target="_blank" style="color:#7EC8A4">openrouter.ai/keys</a>
      </p>

      <label style="display:block;font-size:12px;color:#888;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">Clé API</label>
      <input id="atum-key-input" type="password" placeholder="sk-ant-... ou sk-or-v1-..."
        value="${currentKey}"
        style="width:100%;box-sizing:border-box;background:#2A2A3C;border:1px solid #444;border-radius:6px;
               padding:10px 12px;color:#F0ECE4;font-size:13px;margin-bottom:16px;outline:none;" />

      <label style="display:block;font-size:12px;color:#888;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">Modèle</label>
      <select id="atum-model-select"
        style="width:100%;box-sizing:border-box;background:#2A2A3C;border:1px solid #444;border-radius:6px;
               padding:10px 12px;color:#F0ECE4;font-size:13px;margin-bottom:24px;outline:none;cursor:pointer;">
        <option value="claude-haiku-4-5-20251001" ${currentModel === 'claude-haiku-4-5-20251001' ? 'selected' : ''}>Haiku 4.5 — Défaut (rapide, économique)</option>
        <option value="claude-sonnet-4-6" ${currentModel === 'claude-sonnet-4-6' ? 'selected' : ''}>Sonnet 4.6 — Analyses complexes</option>
      </select>

      <div style="display:flex;gap:10px;">
        <button id="atum-save-btn"
          style="flex:1;background:#7EC8A4;color:#1C1C28;border:none;border-radius:6px;
                 padding:10px;font-size:14px;font-weight:600;cursor:pointer;">
          Enregistrer
        </button>
        <button id="atum-cancel-btn"
          style="background:#2A2A3C;color:#888;border:1px solid #444;border-radius:6px;
                 padding:10px 16px;font-size:14px;cursor:pointer;">
          Annuler
        </button>
      </div>
      <p id="atum-key-error" style="color:#e74c3c;font-size:12px;margin:8px 0 0;display:none;"></p>
    `

    overlay.appendChild(modal)
    document.body.appendChild(overlay)

    const input = document.getElementById('atum-key-input')
    const modelSelect = document.getElementById('atum-model-select')
    const saveBtn = document.getElementById('atum-save-btn')
    const cancelBtn = document.getElementById('atum-cancel-btn')
    const errorEl = document.getElementById('atum-key-error')

    input.focus()

    saveBtn.addEventListener('click', function () {
      const key = input.value.trim()
      const model = modelSelect.value
      if (!key.startsWith('sk-ant-') && !key.startsWith('sk-or-v1-')) {
        errorEl.textContent = 'Format invalide. La clé doit commencer par sk-ant- (Anthropic) ou sk-or-v1- (OpenRouter)'
        errorEl.style.display = 'block'
        return
      }
      localStorage.setItem('atum_api_key', key)
      localStorage.setItem('atum_model', model)
      overlay.remove()
    })

    cancelBtn.addEventListener('click', function () { overlay.remove() })
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove() })
  }

  // ── Bouton paramètres dans l'interface ────────────────────────────────────
  function injectSettingsButton() {
    if (document.getElementById('atum-settings-btn')) return
    const sidebar = document.querySelector('[class*="sidebar"], [class*="Sidebar"], nav')
    if (!sidebar) { setTimeout(injectSettingsButton, 800); return }

    const btn = document.createElement('button')
    btn.id = 'atum-settings-btn'
    btn.title = 'Paramètres ATUM (clé API, modèle)'
    btn.innerHTML = '⚙️'
    btn.style.cssText = `
      position:fixed;bottom:16px;right:16px;z-index:9999;
      width:36px;height:36px;border-radius:50%;
      background:#2A2A3C;border:1px solid #444;
      color:#888;font-size:16px;cursor:pointer;
      display:flex;align-items:center;justify-content:center;
      transition:background .2s;
    `
    btn.addEventListener('mouseenter', function () { btn.style.background = '#3A3A4C' })
    btn.addEventListener('mouseleave', function () { btn.style.background = '#2A2A3C' })
    btn.addEventListener('click', function () { window._atumShowApiKeyModal() })

    document.body.appendChild(btn)
  }

  // ── Auto-prompt si pas de clé au démarrage ────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      injectSettingsButton()
      if (!localStorage.getItem('atum_api_key')) {
        window._atumShowApiKeyModal()
      }
    }, 1500)
  })

})()
