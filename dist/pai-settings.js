;(function () {

  // ── Panel Paramètres unifié ────────────────────────────────────────────────
  window._paiShowSettingsPanel = function () {
    var existing = document.getElementById('pai-settings-panel')
    if (existing) { existing.remove(); return }

    var currentTheme = document.documentElement.getAttribute('data-theme') || 'dark'
    var currentWall  = localStorage.getItem('pai_wallpaper') || 'ai'

    var panel = document.createElement('div')
    panel.id = 'pai-settings-panel'
    panel.style.cssText = [
      'position:fixed', 'bottom:20px', 'left:70px', 'z-index:99998',
      'background:var(--panel-bg,#1C1C28)',
      'border:1px solid var(--color-border,rgba(255,255,255,0.1))',
      'border-radius:14px', 'padding:20px', 'width:300px',
      'box-shadow:0 8px 32px rgba(0,0,0,0.55)',
      'font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif',
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
        var btn = document.getElementById('pai-settings-panel-btn')
        if (!panel.contains(e.target) && (!btn || !btn.contains(e.target))) {
          panel.remove()
          document.removeEventListener('click', onOut)
        }
      })
    }, 60)

    document.body.appendChild(panel)
  }

  // ── Injecter le bouton ⚙ dans la sidebar ─────────────────────────────────
  window._paiInjectSettingsBtn = function () {
    if (document.getElementById('pai-settings-panel-btn')) return
    var sidebar = document.querySelector('[class*="w-\\[60px\\]"]')
      || document.querySelector('[class*="#1C1C28"]')
    if (!sidebar) { setTimeout(window._paiInjectSettingsBtn, 800); return }

    var btn = document.createElement('button')
    btn.id = 'pai-settings-panel-btn'
    btn.title = 'Paramètres (thème, fond d\'écran)'
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
    btn.style.cssText = [
      'width:40px','height:40px','border-radius:12px','border:none',
      'background:transparent','color:var(--sidebar-icon,#888)',
      'cursor:pointer','display:flex','align-items:center','justify-content:center',
      'flex-shrink:0','padding:0','margin-top:4px','outline:none',
    ].join(';')
    btn.addEventListener('mouseenter', function () {
      btn.style.background = 'var(--sidebar-hover,rgba(255,255,255,0.06))'
    })
    btn.addEventListener('mouseleave', function () {
      btn.style.background = 'transparent'
    })
    btn.addEventListener('click', function (e) {
      e.stopPropagation()
      window._paiShowSettingsPanel()
    })
    sidebar.appendChild(btn)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function sectionTitle (text) {
    var el = document.createElement('p')
    el.textContent = text
    el.style.cssText = 'margin:0 0 10px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--color-foreground-muted,#666)'
    return el
  }

  function themeButtonStyle (active) {
    return [
      'flex:1','padding:10px','border-radius:8px','border:none','cursor:pointer',
      'font-size:13px','font-weight:500',
      'background:' + (active ? 'var(--color-primary,#14b8a6)' : 'var(--color-background-tertiary,#1E1E1E)'),
      'color:' + (active ? '#ffffff' : 'var(--color-foreground-secondary,#A8A8A8)'),
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

    var lbl = document.createElement('div')
    lbl.textContent = w.label
    lbl.style.cssText = [
      'padding:4px 6px','font-size:11px','font-weight:500','text-align:center',
      'background:var(--color-background-secondary,#161616)',
      'color:var(--color-foreground-secondary,#A8A8A8)',
    ].join(';')

    card.appendChild(img)
    card.appendChild(lbl)
    return card
  }

})()
