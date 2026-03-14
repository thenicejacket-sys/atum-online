;(function () {

  // ══════════════════════════════════════════════════════════════════════
  //  PAI Language Manager — FR ↔ EN
  // ══════════════════════════════════════════════════════════════════════

  // ── Traductions FR → EN (exact match sur les text nodes) ──────────────
  var _t = {

    // ── Navigation & Structure ─────────────────────────────────────────
    'Assistants':                                     'Assistants',
    'Chats':                                          'Chats',
    'Statistiques':                                   'Statistics',
    'Parametres':                                     'Settings',
    'Dossier':                                        'Folder',

    // ── Mode Agents (aT sidebar) ───────────────────────────────────────
    'Sélectionnez un agent pour démarrer un chat':    'Select an assistant to start a chat',
    'Selectionnez un agent pour demarrer un chat':    'Select an assistant to start a chat',

    // ── Mode Chats (lT sidebar) ────────────────────────────────────────
    'Aucune conversation':                            'No conversations',
    'Démarrez un chat depuis la section Agents':      'Start a chat from the Assistants section',
    'Demarrez un chat depuis la section Agents':      'Start a chat from the Assistants section',
    'Voir les agents':                                'View assistants',

    // ── Zone chat (kh) ─────────────────────────────────────────────────
    'Ecrivez votre message ci-dessous.':              'Write your message below.',
    'Commencez une conversation avec':                'Start a conversation with',

    // ── Pipeline view ──────────────────────────────────────────────────
    'Selectionnez un agent pour commencer':           'Select an assistant to get started',
    'Aucune execution':                               'No execution',
    'Aucun pipeline':                                 'No pipeline',

    // ── Statuts pipeline ───────────────────────────────────────────────
    'En attente':   'Pending',
    'En cours':     'Running',
    'Termine':      'Completed',
    'Echoue':       'Failed',
    'Total':        'Total',
    'Actif':        'Active',
    'Erreur':       'Error',
    'Statut':       'Status',
    'Progression':  'Progress',
    'Etapes':       'Steps',
    'Debut':        'Start',
    'Execution':    'Execution',
    'Infos':        'Info',
    'Disponible':   'Available',
    'Pipeline':     'Pipeline',

    // ── Tooltips & titres ──────────────────────────────────────────────
    'Plein écran / Quitter plein écran': 'Fullscreen / Exit fullscreen',
    'Joindre un fichier':               'Attach a file',
    'Envoyer':                          'Send',
    'Application desktop requise':      'Desktop application required',

    // ── Groupes d\'agents (sidebar sections) ───────────────────────────
    'Assistants PAI':        'PAI Assistants',
    'Assistants Perso':      'Personal Assistants',
    'Assistants Pro':        'Pro Assistants',
    'Assistants Comptables': 'Accounting Assistants',
    'Consultant IA ATUM':    'ATUM AI Consultant',

    // ── Descriptions courtes des agents (sous le nom) ──────────────────
    'Orchestrateur d Assistants':                    'Assistants Orchestrator',
    'Orchestrateur IA':                              'AI Orchestrator',
    'Diagnostic IA':                                 'AI Diagnostic',
    'Analyse processus IA':                          'AI Process Analysis',
    'Proposition et implementation IA':              'AI Proposal & Implementation',
    'Coach Sportif et Nutrition':                    'Sports & Nutrition Coach',
    'Expert N8N et Automatisation':                  'N8N & Automation Expert',
    'Consultant SAP FICO Senior':                    'Senior SAP FICO Consultant',
    'Associé & Coordinateur équipe experts comptables': 'Partner & Accounting Team Coordinator',
    'Experte Closing & Consolidation':               'Closing & Consolidation Expert',
    'Consultant SAP Signavio':                       'SAP Signavio Consultant',
    'Expert Migration SAP ECC vers S/4HANA':         'SAP ECC to S/4HANA Migration Expert',
    'Experte RH & Design de Carrière':               'HR & Career Design Expert',
    'Expert-Comptable Fiscaliste Senior':             'Senior CPA & Tax Expert',
    'Expert Ingénierie Comptable & Migration ERP':   'Accounting Engineering & ERP Migration Expert',
    'Expert Senior Audit & Standards Internationaux': 'Senior Audit & International Standards Expert',
    'Experte Audit & Contrôle Interne / DPO':        'Internal Audit & DPO Expert',
    'Experte Senior Paie & Droit Social':             'Senior Payroll & Labor Law Expert',
    'Explorateur d Idees':                           'Ideas Explorer',
    'Architecte Systemes':                           'Systems Architect',
    'Ingenieur Developpeur Elite':                   'Elite Developer Engineer',
    'Expert Securite Offensive':                     'Offensive Security Expert',
    'Generaliste IA Polyvalent':                     'Versatile AI Generalist',
    'Chercheuse Multi-Sources':                      'Multi-Source Researcher',
    'Analyste Perplexity':                           'Perplexity Analyst',
    'Analyste Gemini Multi-Angles':                  'Multi-Angle Gemini Analyst',
    'Designer UX et Interface':                      'UX & Interface Designer',
    'Artiste Visuel IA':                             'AI Visual Artist',
    'Redactrice et Storyteller':                     'Writer & Storyteller',
    'Astrologue et Numerologue':                     'Astrologer & Numerologist',
    'Tarologue Trois Voix':                          'Three-Voice Tarot Reader',
    'Coach de Vie':                                  'Life Coach',

    // ── Settings panel ─────────────────────────────────────────────────
    'Thème':                        'Theme',
    '🌙  Sombre':                   '🌙  Dark',
    '☀️  Clair':                    '☀️  Light',
    'Sombre':                       'Dark',
    'Clair':                        'Light',
    'Fond d\'écran':                'Wallpaper',
    "Fond d\u2019\u00e9cran":       'Wallpaper',
    'Mail actif':                   'Active Mail',
    'Réponses email automatiques':  'Automatic email responses',
    '🔑  Clé API / Modèle':         '🔑  API Key / Model',
    'Langue':                       'Language',
    'LANGUE':                       'LANGUAGE',
  }

  // ── Suffixes dynamiques (texte partiellement dynamique) ───────────────
  // Ex: "Tom reflechit..." → "Tom is thinking..."
  var _suffixes = [
    { fr: ' reflechit...',  en: ' is thinking...'  },
    { fr: ' réfléchit...', en: ' is thinking...'  },
  ]

  // ── Reverse map EN → FR ───────────────────────────────────────────────
  var _r = {}
  for (var k in _t) { if (_t[k] !== k) _r[_t[k]] = k }

  // ── État ──────────────────────────────────────────────────────────────
  var _lang  = localStorage.getItem('pai_lang') || 'fr'
  var _busy  = false
  var _timer = null

  // ── Applique les traductions sur tous les text nodes ──────────────────
  function _translate (map, suffixes) {
    if (_busy) return
    _busy = true

    // 1. Nœuds texte
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false)
    var nodes = []
    var node
    while ((node = walker.nextNode())) nodes.push(node)

    nodes.forEach(function (n) {
      if (!n.parentNode) return
      var v = n.nodeValue
      // Exact match
      if (map[v] !== undefined) { n.nodeValue = map[v]; return }
      // Suffix match (ex: "Tom reflechit...")
      if (suffixes) {
        for (var i = 0; i < suffixes.length; i++) {
          var s = suffixes[i]
          if (v.endsWith(s.fr)) {
            n.nodeValue = v.slice(0, v.length - s.fr.length) + s.en
            return
          }
        }
      }
    })

    // 2. Attributs placeholder
    document.querySelectorAll('[placeholder]').forEach(function (el) {
      var p = el.getAttribute('placeholder')
      if (map[p] !== undefined) el.setAttribute('placeholder', map[p])
    })

    // 3. Attributs title
    document.querySelectorAll('[title]').forEach(function (el) {
      var t = el.getAttribute('title')
      if (map[t] !== undefined) el.setAttribute('title', map[t])
    })

    _busy = false
  }

  // ── API publique ──────────────────────────────────────────────────────
  window._paiSetLang = function (lang) {
    _lang = lang
    localStorage.setItem('pai_lang', lang)
    if (lang === 'en') {
      _translate(_t, _suffixes)
    } else {
      // Revertir EN→FR sur les nodes encore présents, puis laisser React
      // reprendre la main (ses re-renders produisent toujours du FR)
      _translate(_r, null)
    }
    // Notifier les settings panels ouverts
    document.querySelectorAll('[data-lang-btn]').forEach(function (b) {
      var active = b.getAttribute('data-lang-btn') === lang
      b.style.background = active ? '#14b8a6' : (
        (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark' ? '#2A2A3C' : '#E8E8E8'
      )
      b.style.color = active ? '#ffffff' : (
        (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark' ? '#A8A8A8' : '#444444'
      )
    })
  }

  window._paiGetLang = function () { return _lang }

  // ── Observer DOM — réapplique la traduction après chaque re-render React
  var _obs = new MutationObserver(function (muts) {
    if (_busy || _lang !== 'en') return
    var added = muts.some(function (m) { return m.addedNodes.length > 0 })
    if (!added) return
    clearTimeout(_timer)
    _timer = setTimeout(function () { _translate(_t, _suffixes) }, 250)
  })

  function _init () {
    _obs.observe(document.body, { childList: true, subtree: true })
    if (_lang === 'en') {
      setTimeout(function () { _translate(_t, _suffixes) }, 600)
    }
  }

  if (document.body) _init()
  else document.addEventListener('DOMContentLoaded', _init)

})()
