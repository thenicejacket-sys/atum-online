;(function () {

  // ── Panel Paramètres unifié ────────────────────────────────────────────────
  window._paiShowSettingsPanel = function () {
    var existing = document.getElementById('pai-settings-panel')
    if (existing) { existing.remove(); return }

    var currentTheme = document.documentElement.getAttribute('data-theme') || 'dark'
    var currentWall  = localStorage.getItem('pai_wallpaper') || 'ai'

    var isDark = currentTheme === 'dark'
    var panelBg = isDark ? '#1E1E2E' : '#FFFFFF'
    var panelBorder = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
    var panelText = isDark ? '#EDEDED' : '#171717'

    var panel = document.createElement('div')
    panel.id = 'pai-settings-panel'
    panel.style.cssText = [
      'position:fixed', 'bottom:20px', 'left:70px', 'z-index:999999',
      'background:' + panelBg,
      'border:1px solid ' + panelBorder,
      'border-radius:14px', 'padding:20px', 'width:300px',
      'box-shadow:0 8px 32px rgba(0,0,0,0.55)',
      'font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif',
      'color:' + panelText,
    ].join(';')

    // ── SECTION Thème ──────────────────────────────────────────────────────
    panel.appendChild(sectionTitle('Thème'))

    var themeRow = document.createElement('div')
    themeRow.style.cssText = 'display:flex;gap:8px;margin-bottom:20px'
    ;['dark','light'].forEach(function (t) {
      var b = document.createElement('button')
      b.textContent = t === 'dark' ? '🌙  Sombre' : '☀️  Clair'
      b.setAttribute('data-theme-btn', t)
      b.style.cssText = themeButtonStyle(t === currentTheme)
      b.addEventListener('click', function () {
        document.documentElement.setAttribute('data-theme', t)
        localStorage.setItem('pai_theme', t)
        panel.querySelectorAll('[data-theme-btn]').forEach(function (x) {
          x.style.cssText = themeButtonStyle(x.getAttribute('data-theme-btn') === t)
        })
      })
      themeRow.appendChild(b)
    })
    panel.appendChild(themeRow)

    // ── SECTION Fond d'écran ───────────────────────────────────────────────
    if (window._paiWallpapers && window._paiWallpapers.length > 0) {
      panel.appendChild(sectionTitle('Fond d\'écran'))

      var grid = document.createElement('div')
      grid.id = 'pai-wall-grid'
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:' +
        (window._atumShowApiKeyModal ? '20px' : '4px')

      window._paiWallpapers.forEach(function (w) {
        var card = wallCard(w, w.key === currentWall)
        card.addEventListener('click', function () {
          if (window._paiApplyWallpaper) window._paiApplyWallpaper(w.key)
          panel.querySelectorAll('[data-wk]').forEach(function (c) {
            c.style.outline = c.getAttribute('data-wk') === w.key
              ? '2px solid #14b8a6' : '2px solid transparent'
          })
        })
        grid.appendChild(card)
      })
      panel.appendChild(grid)
    }

    // ── SECTION Clé API (version web uniquement) ───────────────────────────
    if (window._atumShowApiKeyModal) {
      var sep = document.createElement('div')
      sep.style.cssText = 'border-top:1px solid var(--color-border,rgba(255,255,255,0.07));margin:4px 0 14px'
      panel.appendChild(sep)

      var apiBtn = document.createElement('button')
      apiBtn.textContent = '🔑  Clé API / Modèle'
      apiBtn.style.cssText = [
        'width:100%', 'padding:10px 12px', 'border-radius:8px', 'text-align:left',
        'border:1px solid var(--color-border,rgba(255,255,255,0.1))',
        'background:transparent', 'color:var(--color-foreground-secondary,#A8A8A8)',
        'cursor:pointer', 'font-size:13px',
      ].join(';')
      apiBtn.addEventListener('click', function () {
        panel.remove()
        window._atumShowApiKeyModal()
      })
      panel.appendChild(apiBtn)
    }

    // Fermer en cliquant dehors
    setTimeout(function () {
      document.addEventListener('click', function onOut (e) {
        var btn = document.querySelector('button[title="Parametres"]')
        if (!panel.contains(e.target) && (!btn || !btn.contains(e.target))) {
          panel.remove()
          document.removeEventListener('click', onOut)
        }
      })
    }, 60)

    document.body.appendChild(panel)
  }

  // ── Intercepter le clic sur le bouton Paramètres React (phase capture)
  // Fonctionne MÊME si le bundle est en cache avec disabled:true (aucun onClick React).
  // La CSS (pai-theme.css) rend le bouton visuellement actif.
  window._paiInjectSettingsBtn = function () {
    document.addEventListener('click', function (e) {
      var t = e.target
      // Remonter jusqu'à 3 niveaux (clic sur le SVG enfant du bouton)
      for (var i = 0; i < 3; i++) {
        if (!t) break
        if (t.tagName === 'BUTTON' && t.getAttribute('title') === 'Parametres') {
          e.stopImmediatePropagation()
          e.preventDefault()
          if (window._paiShowSettingsPanel) window._paiShowSettingsPanel()
          return
        }
        t = t.parentElement
      }
    }, true) // capture: true = avant tous les handlers React
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function sectionTitle (text) {
    var el = document.createElement('p')
    el.textContent = text
    el.style.cssText = 'margin:0 0 10px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:#888888'
    return el
  }

  function themeButtonStyle (active) {
    var isDark = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark'
    return [
      'flex:1','padding:10px','border-radius:8px','border:none','cursor:pointer',
      'font-size:13px','font-weight:500',
      'background:' + (active ? '#14b8a6' : (isDark ? '#2A2A3C' : '#E8E8E8')),
      'color:' + (active ? '#ffffff' : (isDark ? '#A8A8A8' : '#444444')),
    ].join(';')
  }

  function wallCard (w, active) {
    var card = document.createElement('div')
    card.setAttribute('data-wk', w.key)
    card.style.cssText = [
      'border-radius:8px','overflow:hidden','cursor:pointer',
      'outline:' + (active ? '2px solid #14b8a6' : '2px solid transparent'),
    ].join(';')

    var img = document.createElement('img')
    img.src = w.dark
    img.style.cssText = 'width:100%;height:56px;object-fit:cover;display:block;pointer-events:none'

    var isDarkW = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark'
    var lbl = document.createElement('div')
    lbl.textContent = w.label
    lbl.style.cssText = [
      'padding:4px 6px','font-size:11px','font-weight:500','text-align:center',
      'background:' + (isDarkW ? '#161616' : '#E8E8E8'),
      'color:' + (isDarkW ? '#A8A8A8' : '#444444'),
    ].join(';')

    card.appendChild(img)
    card.appendChild(lbl)
    return card
  }

})()
