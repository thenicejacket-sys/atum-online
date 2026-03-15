;(function () {

  // ══════════════════════════════════════════════════════════════════════
  //  PAI Language Manager — FR ↔ EN
  // ══════════════════════════════════════════════════════════════════════

  // ── Traductions FR → EN (exact match sur les text nodes) ──────────────
  var _t = {

    // ── Navigation & Structure ─────────────────────────────────────────
    'Assistants':                                     'Agents',
    'Chats':                                          'Chats',
    'Statistiques':                                   'Statistics',
    'Parametres':                                     'Settings',
    'Dossier':                                        'Folder',

    // ── Mode Agents (aT sidebar) ───────────────────────────────────────
    'Sélectionnez un agent pour démarrer un chat':    'Select an agent to start a chat',
    'Selectionnez un agent pour demarrer un chat':    'Select an agent to start a chat',

    // ── Mode Chats (lT sidebar) ────────────────────────────────────────
    'Aucune conversation':                            'No conversations',
    'Démarrez un chat depuis la section Agents':      'Start a chat from the Agents section',
    'Demarrez un chat depuis la section Agents':      'Start a chat from the Agents section',
    'Voir les agents':                                'View agents',

    // ── Zone chat (kh) ─────────────────────────────────────────────────
    'Ecrivez votre message ci-dessous.':              'Write your message below.',
    'Commencez une conversation avec':                'Start a conversation with',

    // ── Pipeline view ──────────────────────────────────────────────────
    'Selectionnez un agent pour commencer':           'Select an agent to get started',
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
    'Assistants PAI':        'PAI Agents',
    'Assistants Perso':      'Personal Agents',
    'Assistants Pro':        'Pro Agents',
    'Assistants Comptables': 'Accounting Agents',
    'Assistants Compta':     'Accounts Agents',
    'Consultant IA ATUM':    'ATUM AI Agents',
    'Assistants IA ATUM':    'ATUM AI Agents',

    // ── Descriptions courtes des agents (sous le nom) ──────────────────
    'Orchestrateur d Assistants':                    'Agents Orchestrator',
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
    'Executive Assistant':                            'Executive Agent',

    // ── Bios agents — ligne 1 (tooltip au survol de la photo) ──────────
    'Decompose tes demandes et delegue aux bons agents.':
      'Breaks down your requests and delegates to the right agents.',
    'Point d entree unique pour tous tes projets complexes.':
      'Single entry point for all your complex projects.',

    'Pilote les missions de transformation IA de bout en bout.':
      'Drives AI transformation missions from end to end.',
    'Coordonne John, Olivier et Silvia selon tes objectifs.':
      'Coordinates John, Olivier and Silvia according to your goals.',

    'Evalue la maturite IA de ton organisation.':
      'Evaluates the AI maturity of your organization.',
    'Produit un diagnostic avec scoring et recommandations.':
      'Produces a diagnostic with scoring and recommendations.',

    'Cartographie tes processus et identifie les gains d automatisation.':
      'Maps your processes and identifies automation gains.',
    'Calcule le ROI et priorise les projets selon l impact.':
      'Calculates ROI and prioritizes projects by impact.',

    'Conçoit l architecture technique et la proposition commerciale.':
      'Designs the technical architecture and commercial proposal.',
    'Specialiste n8n, LLM, RAG et deploiement en entreprise.':
      'Specialist in n8n, LLM, RAG and enterprise deployment.',

    'Cree tes programmes de musculation et planifie ta nutrition.':
      'Creates your workout programs and plans your nutrition.',
    'Specialiste recomposition corporelle niveau intermediaire.':
      'Specialist in body recomposition for intermediate level.',

    'Conçoit et debogue tes workflows N8N.':
      'Designs and debugs your N8N workflows.',
    'Connecte APIs, webhooks et outils sans friction.':
      'Connects APIs, webhooks and tools without friction.',

    'Expert SAP FI/CO - ECC 6.0 et S/4HANA. Diagnostic, parametrage IMG, ABAP.':
      'Expert SAP FI/CO — ECC 6.0 and S/4HANA. Diagnostics, IMG configuration, ABAP.',

    'Associe cabinet expert-comptable, orchestre une equipe de 7 assistants specialises.':
      'Senior accounting firm partner, orchestrates a team of 7 specialized assistants.',

    'Experte Senior Closing & Consolidation \u2014 15 ans Big Four.':
      'Senior Closing & Consolidation Expert — 15 years Big Four.',
    'PCG, IFRS 15/16, IAS 36/19, consolidation intercompany.':
      'PCG, IFRS 15/16, IAS 36/19, intercompany consolidation.',

    'Expert Senior SAP Signavio. Modelisation BPMN 2.0, Process Mining et Best Practices O2C/P2P/R2R.':
      'Senior SAP Signavio Expert. BPMN 2.0 modeling, Process Mining and Best Practices O2C/P2P/R2R.',
    'Transformation S/4HANA avec rigueur architecturale et vision C-Level.':
      'S/4HANA transformation with architectural rigor and C-Level vision.',

    '15+ ans de migrations SAP ECC vers S/4HANA / SAP Activate, SUM/DMO, cutover, fit-gap, data migration et pilotage programme multi-stakeholders.':
      '15+ years of SAP ECC to S/4HANA migrations. SAP Activate, SUM/DMO, cutover, fit-gap, data migration and multi-stakeholder program management.',

    'Double expertise recruteur Top Tier & DA Personal Branding. Sp\u00e9cialiste ATS, scoring CV, storytelling STAR et optimisation LinkedIn pour candidatures d exception.':
      'Dual expertise Top Tier recruiter & Personal Branding. Specialist in ATS, CV scoring, STAR storytelling and LinkedIn optimization for exceptional applications.',

    'Expert-Comptable Fiscaliste Senior \u2014 10 ans cabinet & DAF.':
      'Senior CPA & Tax Expert — 10 years in accounting firms & CFO roles.',
    'IS, TVA complexe, CIR, liasse fiscale, int\u00e9gration fiscale.':
      'Corporate tax, complex VAT, R&D credit, tax returns, tax consolidation.',

    'Expert Senior Ing\u00e9nierie Comptable & SIF \u2014 Mapping, KPIs, ETL.':
      'Senior Accounting Engineering & SIF Expert — Mapping, KPIs, ETL.',
    'SAP S/4HANA, Oracle Fusion, Power BI, PCG\u2194IFRS.':
      'SAP S/4HANA, Oracle Fusion, Power BI, PCG\u2194IFRS.',

    'Expert Senior Audit Digital & Convergence Normative \u2014 15 ans Big Four.':
      'Senior Digital Audit & Standards Convergence Expert — 15 years Big Four.',
    'PCG, IFRS, US GAAP, SAF-T, FEC, SOX, Loi Sapin II.':
      'PCG, IFRS, US GAAP, SAF-T, FEC, SOX, Sapin II Law.',

    'Experte Senior Audit Interne, Contr\u00f4le Interne & DPO.':
      'Senior Internal Audit, Internal Control & DPO Expert.',
    'RGPD Art.28/30, DPIA, PAF, SoD, LCB-FT, COSO.':
      'GDPR Art.28/30, DPIA, PAF, SoD, AML-CFT, COSO.',

    'Experte Senior Ing\u00e9nierie de la Paie & Droit Social \u2014 15 ans cabinet.':
      'Senior Payroll Engineering & Labor Law Expert — 15 years in accounting firms.',
    'DSN, STC, PAS, URSSAF, Agirc-Arrco, Conventions Collectives.':
      'DSN, STC, PAS, URSSAF, Agirc-Arrco, Collective Agreements.',

    'Brainstorming, naming et exploration d idees.':
      'Brainstorming, naming and idea exploration.',
    'T aide a sortir du cadre et trouver des angles inattendus.':
      'Helps you think outside the box and find unexpected angles.',

    'Conçoit des architectures scalables et des specs techniques.':
      'Designs scalable architectures and technical specs.',
    'A consulter avant de coder pour eviter les erreurs cles.':
      'Consult before coding to avoid key mistakes.',

    'Lit, debogue et ameliore n importe quelle codebase.':
      'Reads, debugs and improves any codebase.',
    'Approche TDD, multi-langage, code propre et maintenable.':
      'TDD approach, multi-language, clean and maintainable code.',

    'Pentest, audit OWASP et revue de code securite.':
      'Pentest, OWASP audit and security code review.',
    'Identifie tes vulnerabilites avant les attaquants.':
      'Identifies your vulnerabilities before attackers do.',

    'Recherche et raisonnement avance sur tous sujets.':
      'Advanced research and reasoning on any topic.',
    'Le polymathe de l equipe pour les questions complexes.':
      "The team's polymath for complex questions.",

    'Recherche approfondie avec triple verification des sources.':
      'In-depth research with triple source verification.',
    'Analyses rigoureuses, citees et structurees.':
      'Rigorous, cited and structured analyses.',

    'Donnees actuelles via Perplexity, sources verifiees.':
      'Current data via Perplexity, verified sources.',
    'Ideale pour veille concurrentielle et faits recents.':
      'Ideal for competitive intelligence and recent facts.',

    'Analyse chaque question sous 3 a 10 angles simultanement.':
      'Analyzes each question from 3 to 10 angles simultaneously.',
    'Ideal pour les decisions complexes a nuancer.':
      'Ideal for complex decisions requiring nuance.',

    'Interfaces accessibles et systemes de design coherents.':
      'Accessible interfaces and consistent design systems.',
    'Figma, shadcn/ui, du concept au livrable.':
      'Figma, shadcn/ui, from concept to deliverable.',

    'Genere des visuels photorealistes avec Flux et GPT-Image.':
      'Generates photorealistic visuals with Flux and GPT-Image.',
    'Expert prompt engineering pour l image IA.':
      'Expert prompt engineering for AI imagery.',

    'Articles, posts LinkedIn, docs techniques ou recits.':
      'Articles, LinkedIn posts, technical docs or narratives.',
    'Adapte le ton et le style a ton audience.':
      'Adapts tone and style to your audience.',

    'Themes natals, transits planetaires et numerologie.':
      'Birth charts, planetary transits and numerology.',
    'Guidance personnalisee avec ta date et lieu de naissance.':
      'Personalized guidance with your date and place of birth.',

    'Lecture tarot selon Waite, Crowley et Pollack.':
      'Tarot reading according to Waite, Crowley and Pollack.',
    'Guidance intuitive sur ta vie, amour et chemin interieur.':
      'Intuitive guidance on your life, love and inner path.',

    'Clarifie tes objectifs et leve tes blocages.':
      'Clarifies your goals and removes your blocks.',
    'Plans d action concrets pour avancer vers tes buts.':
      'Concrete action plans to move toward your goals.',

    // ── Bios complets (avec \n réel) — fallback si rendu mono-node ─────
    'Decompose tes demandes et delegue aux bons agents.\nPoint d entree unique pour tous tes projets complexes.':
      'Breaks down your requests and delegates to the right agents.\nSingle entry point for all your complex projects.',
    'Pilote les missions de transformation IA de bout en bout.\nCoordonne John, Olivier et Silvia selon tes objectifs.':
      'Drives AI transformation missions from end to end.\nCoordinates John, Olivier and Silvia according to your goals.',
    'Evalue la maturite IA de ton organisation.\nProduit un diagnostic avec scoring et recommandations.':
      'Evaluates the AI maturity of your organization.\nProduces a diagnostic with scoring and recommendations.',
    'Cartographie tes processus et identifie les gains d automatisation.\nCalcule le ROI et priorise les projets selon l impact.':
      'Maps your processes and identifies automation gains.\nCalculates ROI and prioritizes projects by impact.',
    'Conçoit l architecture technique et la proposition commerciale.\nSpecialiste n8n, LLM, RAG et deploiement en entreprise.':
      'Designs the technical architecture and commercial proposal.\nSpecialist in n8n, LLM, RAG and enterprise deployment.',
    'Cree tes programmes de musculation et planifie ta nutrition.\nSpecialiste recomposition corporelle niveau intermediaire.':
      'Creates your workout programs and plans your nutrition.\nSpecialist in body recomposition for intermediate level.',
    'Conçoit et debogue tes workflows N8N.\nConnecte APIs, webhooks et outils sans friction.':
      'Designs and debugs your N8N workflows.\nConnects APIs, webhooks and tools without friction.',
    'Expert Senior SAP Signavio. Modelisation BPMN 2.0, Process Mining et Best Practices O2C/P2P/R2R.\nTransformation S/4HANA avec rigueur architecturale et vision C-Level.':
      'Senior SAP Signavio Expert. BPMN 2.0 modeling, Process Mining and Best Practices O2C/P2P/R2R.\nS/4HANA transformation with architectural rigor and C-Level vision.',
    'Brainstorming, naming et exploration d idees.\nT aide a sortir du cadre et trouver des angles inattendus.':
      'Brainstorming, naming and idea exploration.\nHelps you think outside the box and find unexpected angles.',
    'Conçoit des architectures scalables et des specs techniques.\nA consulter avant de coder pour eviter les erreurs cles.':
      'Designs scalable architectures and technical specs.\nConsult before coding to avoid key mistakes.',
    'Lit, debogue et ameliore n importe quelle codebase.\nApproche TDD, multi-langage, code propre et maintenable.':
      'Reads, debugs and improves any codebase.\nTDD approach, multi-language, clean and maintainable code.',
    'Pentest, audit OWASP et revue de code securite.\nIdentifie tes vulnerabilites avant les attaquants.':
      'Pentest, OWASP audit and security code review.\nIdentifies your vulnerabilities before attackers do.',
    'Recherche et raisonnement avance sur tous sujets.\nLe polymathe de l equipe pour les questions complexes.':
      "Advanced research and reasoning on any topic.\nThe team's polymath for complex questions.",
    'Recherche approfondie avec triple verification des sources.\nAnalyses rigoureuses, citees et structurees.':
      'In-depth research with triple source verification.\nRigorous, cited and structured analyses.',
    'Donnees actuelles via Perplexity, sources verifiees.\nIdeale pour veille concurrentielle et faits recents.':
      'Current data via Perplexity, verified sources.\nIdeal for competitive intelligence and recent facts.',
    'Analyse chaque question sous 3 a 10 angles simultanement.\nIdeal pour les decisions complexes a nuancer.':
      'Analyzes each question from 3 to 10 angles simultaneously.\nIdeal for complex decisions requiring nuance.',
    'Interfaces accessibles et systemes de design coherents.\nFigma, shadcn/ui, du concept au livrable.':
      'Accessible interfaces and consistent design systems.\nFigma, shadcn/ui, from concept to deliverable.',
    'Genere des visuels photorealistes avec Flux et GPT-Image.\nExpert prompt engineering pour l image IA.':
      'Generates photorealistic visuals with Flux and GPT-Image.\nExpert prompt engineering for AI imagery.',
    'Articles, posts LinkedIn, docs techniques ou recits.\nAdapte le ton et le style a ton audience.':
      'Articles, LinkedIn posts, technical docs or narratives.\nAdapts tone and style to your audience.',
    'Themes natals, transits planetaires et numerologie.\nGuidance personnalisee avec ta date et lieu de naissance.':
      'Birth charts, planetary transits and numerology.\nPersonalized guidance with your date and place of birth.',
    'Lecture tarot selon Waite, Crowley et Pollack.\nGuidance intuitive sur ta vie, amour et chemin interieur.':
      'Tarot reading according to Waite, Crowley and Pollack.\nIntuitive guidance on your life, love and inner path.',
    'Clarifie tes objectifs et leve tes blocages.\nPlans d action concrets pour avancer vers tes buts.':
      'Clarifies your goals and removes your blocks.\nConcrete action plans to move toward your goals.',

    // ── Onglet Personnalité ─────────────────────────────────────────────
    'Personnalité':   'Personality',
    'Personalite':    'Personality',

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

  // ── Expose la map pour le patch _pShowTip dans le bundle ─────────────
  window._paiTransMap = _t

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
