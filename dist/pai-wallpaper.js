;(function () {

  // ── Registre des thèmes de fond ────────────────────────────────────────────
  window._paiWallpapers = [
    {
      key:         'ai',
      label:       'IA',
      dark:        './assets/pai-welcome-bg.png',
      light:       './assets/pai-welcome-bg-light.png',
      rightDark:   './assets/pai-right-bg.jpg',
      rightLight:  './assets/pai-right-bg-light.png',
    }
    // Nouveaux thèmes ajoutés via window._paiAddWallpaper(theme)
  ]

  // Ajouter un thème depuis l'extérieur
  window._paiAddWallpaper = function (theme) {
    window._paiWallpapers.push(theme)
    // Rafraîchir le picker s'il est ouvert
    var panel = document.getElementById('pai-wallpaper-panel')
    if (panel) { panel.remove(); window._paiShowWallpaperPicker() }
  }

  // ── Appliquer un thème ────────────────────────────────────────────────────
  window._paiApplyWallpaper = function (key) {
    var theme = window._paiWallpapers.find(function (w) { return w.key === key })
    if (!theme) return
    localStorage.setItem('pai_wallpaper', key)
    document.querySelectorAll('.pai-bg-dark').forEach(function (el) {
      if (el.tagName === 'IMG') el.src = theme.dark
    })
    document.querySelectorAll('.pai-bg-light').forEach(function (el) {
      if (el.tagName === 'IMG') el.src = theme.light
    })
    document.querySelectorAll('.pai-right-dark').forEach(function (el) {
      if (el.tagName === 'IMG') el.src = theme.rightDark
    })
    document.querySelectorAll('.pai-right-light').forEach(function (el) {
      if (el.tagName === 'IMG') el.src = theme.rightLight
    })
    // Mettre à jour l'état actif dans le picker
    document.querySelectorAll('[data-wallpaper-key]').forEach(function (el) {
      el.setAttribute('data-active', el.getAttribute('data-wallpaper-key') === key ? '1' : '0')
      el.style.outline = el.getAttribute('data-wallpaper-key') === key
        ? '2px solid #14b8a6' : '2px solid transparent'
    })
  }

  // ── Observer le DOM pour appliquer dès que les images sont rendues ─────────
  function initWallpaper () {
    var key = localStorage.getItem('pai_wallpaper') || 'ai'
    var imgs = document.querySelectorAll('.pai-bg-dark, .pai-bg-light')
    if (imgs.length > 0) {
      window._paiApplyWallpaper(key)
    } else {
      var obs = new MutationObserver(function () {
        var found = document.querySelectorAll('.pai-bg-dark, .pai-bg-light')
        if (found.length > 0) {
          obs.disconnect()
          window._paiApplyWallpaper(key)
        }
      })
      if (document.body) obs.observe(document.body, { childList: true, subtree: true })
    }
  }

  // ── Panel de sélection ────────────────────────────────────────────────────
  window._paiShowWallpaperPicker = function () {
    var existing = document.getElementById('pai-wallpaper-panel')
    if (existing) { existing.remove(); return }

    var currentKey = localStorage.getItem('pai_wallpaper') || 'ai'

    var panel = document.createElement('div')
    panel.id = 'pai-wallpaper-panel'
    panel.style.cssText = [
      'position:fixed',
      'bottom:90px',
      'left:70px',
      'z-index:99998',
      'background:var(--panel-bg,#1C1C28)',
      'border:1px solid var(--color-border,rgba(255,255,255,0.1))',
      'border-radius:14px',
      'padding:18px',
      'min-width:240px',
      'box-shadow:0 8px 32px rgba(0,0,0,0.5)',
      'font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif',
    ].join(';')

    var title = document.createElement('p')
    title.textContent = 'Thèmes de fond'
    title.style.cssText = 'color:var(--color-foreground,#EDEDED);font-size:13px;font-weight:600;margin:0 0 14px;letter-spacing:.3px'
    panel.appendChild(title)

    var grid = document.createElement('div')
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:10px'

    window._paiWallpapers.forEach(function (w) {
      var card = document.createElement('div')
      card.setAttribute('data-wallpaper-key', w.key)
      card.style.cssText = [
        'border-radius:10px',
        'overflow:hidden',
        'cursor:pointer',
        'outline:' + (w.key === currentKey ? '2px solid #14b8a6' : '2px solid transparent'),
        'transition:outline 0.15s',
      ].join(';')

      var img = document.createElement('img')
      img.src = w.dark
      img.style.cssText = 'width:100%;height:60px;object-fit:cover;display:block;pointer-events:none'

      var lbl = document.createElement('div')
      lbl.textContent = w.label
      lbl.style.cssText = [
        'padding:5px 6px',
        'font-size:11px',
        'font-weight:500',
        'color:var(--color-foreground-secondary,#A8A8A8)',
        'background:var(--color-background-secondary,#161616)',
        'text-align:center',
      ].join(';')

      card.appendChild(img)
      card.appendChild(lbl)
      card.addEventListener('click', function () {
        window._paiApplyWallpaper(w.key)
      })
      grid.appendChild(card)
    })

    panel.appendChild(grid)

    // Fermer en cliquant dehors
    setTimeout(function () {
      document.addEventListener('click', function onOutside (e) {
        var btn = document.getElementById('pai-wallpaper-btn')
        if (!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
          panel.remove()
          document.removeEventListener('click', onOutside)
        }
      })
    }, 50)

    document.body.appendChild(panel)
  }

  // ── Injecter le bouton 🖼 dans la sidebar ─────────────────────────────────
  function injectWallpaperBtn () {
    if (document.getElementById('pai-wallpaper-btn')) return
    var sidebar = document.querySelector('[class*="w-\\[60px\\]"]')
      || document.querySelector('[class*="#1C1C28"]')
    if (!sidebar) { setTimeout(injectWallpaperBtn, 800); return }

    var btn = document.createElement('button')
    btn.id = 'pai-wallpaper-btn'
    btn.title = 'Thèmes de fond'
    btn.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
    btn.style.cssText = [
      'width:40px', 'height:40px', 'border-radius:12px', 'border:none',
      'background:transparent', 'color:var(--sidebar-icon,#888)',
      'cursor:pointer', 'display:flex', 'align-items:center',
      'justify-content:center', 'flex-shrink:0', 'padding:0',
      'margin-top:4px', 'outline:none',
    ].join(';')

    btn.addEventListener('mouseenter', function () {
      btn.style.background = 'var(--sidebar-hover,rgba(255,255,255,0.06))'
    })
    btn.addEventListener('mouseleave', function () {
      btn.style.background = 'transparent'
    })
    btn.addEventListener('click', function (e) {
      e.stopPropagation()
      window._paiShowWallpaperPicker()
    })

    sidebar.appendChild(btn)
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initWallpaper()
      setTimeout(injectWallpaperBtn, 1500)
    })
  } else {
    initWallpaper()
    setTimeout(injectWallpaperBtn, 1500)
  }

})()
