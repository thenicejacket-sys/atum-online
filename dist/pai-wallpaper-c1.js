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
    },
    {
      key:         'atum',
      label:       'ATUM',
      dark:        './assets/atum-welcome-bg.png',
      light:       './assets/atum-welcome-bg-light.png',
      rightDark:   './assets/atum-right-bg.png',
      rightLight:  './assets/atum-right-bg-light.png',
      leftDark:    './assets/atum-right-bg.png',
      leftLight:   './assets/atum-right-bg-light.png',
      centerDark:  './assets/atum-right-bg.png',
      centerLight: './assets/atum-right-bg-light.png',
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

  // ── Trouver le sidebar gauche ─────────────────────────────────────────────
  function _getSidebar () {
    var btn = document.querySelector('button[title="Parametres"]')
    return btn ? btn.closest('[class*="w-[60px]"]') : null
  }

  // ── Appliquer une image de fond sur un élément ───────────────────────────
  function _applyBg (el, src) {
    if (!el) return
    if (src) {
      el.style.backgroundImage = 'url(' + src + ')'
      el.style.backgroundSize = 'cover'
      el.style.backgroundPosition = 'center'
      el.style.backgroundRepeat = 'no-repeat'
    } else {
      el.style.backgroundImage = ''
    }
  }

  // ── Appliquer toutes les images de fond (sidebar + panneaux) ─────────────
  function _applyAllBg (theme) {
    var isDark = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark'

    // Attribut data-wallpaper pour les règles CSS
    if (theme && theme.key !== 'ai') {
      document.documentElement.setAttribute('data-wallpaper', theme.key)
    } else {
      document.documentElement.removeAttribute('data-wallpaper')
    }

    // Sidebar gauche (60px)
    var sidebar = _getSidebar()
    _applyBg(sidebar, theme && (isDark ? theme.leftDark : theme.leftLight))

    // Panneaux liste gauche (w-[280px]) — agents, chats
    document.querySelectorAll('[class*="w-[280px]"]').forEach(function (el) {
      var src = theme && (isDark ? theme.centerDark : theme.centerLight)
      _applyBg(el, src)
      el.style.backgroundColor = src ? 'transparent' : ''
      el.querySelectorAll('*').forEach(function (child) {
        child.style.backgroundColor = src ? 'transparent' : ''
      })
    })

    // Ciblage explicite du header bg-[#F0ECE4] (light mode + topbar)
    var centerSrc = theme && (isDark ? theme.centerDark : theme.centerLight)
    document.querySelectorAll('[class*="bg-[#F0ECE4]"]').forEach(function (el) {
      if (centerSrc) {
        el.style.backgroundImage = 'url(' + centerSrc + ')'
        el.style.backgroundSize = 'cover'
        el.style.backgroundPosition = 'center'
        el.style.backgroundRepeat = 'no-repeat'
        el.style.backgroundColor = 'transparent'
        el.querySelectorAll('*').forEach(function (child) {
          child.style.backgroundColor = 'transparent'
        })
      } else {
        el.style.backgroundImage = ''
        el.style.backgroundColor = ''
        el.querySelectorAll('*').forEach(function (child) {
          child.style.backgroundColor = ''
        })
      }
    })

    // ── Injection CSS haute-spécificité pour centre + panneau droit ───────────
    // Le CSS pai-theme-c1.css utilise !important sur bg-[#F5F6FA] et bg-white.
    // Pour gagner, on injecte une règle avec spécificité plus haute (html[attr][attr] > 1 attr).
    var styleEl = document.getElementById('_pai-wp-css')
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = '_pai-wp-css'
      document.head.appendChild(styleEl)
    }
    if (theme && theme.key !== 'ai' && theme.centerDark) {
      var k = theme.key
      var iD = 'url(' + theme.centerDark + ')'
      var iL = 'url(' + (theme.centerLight || theme.centerDark) + ')'
      // Sélecteurs dark / light / fallback (sans data-theme = dark par défaut)
      var sd = 'html[data-wallpaper="' + k + '"][data-theme="dark"]'
      var sl = 'html[data-wallpaper="' + k + '"][data-theme="light"]'
      var sf = 'html[data-wallpaper="' + k + '"]:not([data-theme="light"])'
      styleEl.textContent = [
        // ── DARK ─────────────────────────────────────────────────────────────
        // Centre
        sd + ' [class*="bg-[#F5F6FA]"] { background-image:' + iD + ' !important; background-color:transparent !important; }',
        sd + ' [class*="bg-[#F5F6FA]"] > * { background-color:transparent !important; }',
        // Panneau droit — * pour atteindre les wrappers bg-white imbriqués
        sd + ' [class*="w-[300px]"] { background-image:' + iD + ' !important; background-color:transparent !important; }',
        sd + ' [class*="w-[300px]"] * { background-color:transparent !important; }',
        // ── LIGHT ────────────────────────────────────────────────────────────
        sl + ' [class*="bg-[#F5F6FA]"] { background-image:' + iL + ' !important; background-color:transparent !important; }',
        sl + ' [class*="bg-[#F5F6FA]"] > * { background-color:transparent !important; }',
        sl + ' [class*="w-[300px]"] { background-image:' + iL + ' !important; background-color:transparent !important; }',
        sl + ' [class*="w-[300px]"] * { background-color:transparent !important; }',
        // ── FALLBACK (data-theme absent = dark) ───────────────────────────────
        sf + ' [class*="bg-[#F5F6FA]"] { background-image:' + iD + ' !important; background-color:transparent !important; }',
        sf + ' [class*="bg-[#F5F6FA]"] > * { background-color:transparent !important; }',
        sf + ' [class*="w-[300px]"] { background-image:' + iD + ' !important; background-color:transparent !important; }',
        sf + ' [class*="w-[300px]"] * { background-color:transparent !important; }',
        // ── Console exclusion (tous modes) ────────────────────────────────────
        'html[data-wallpaper="' + k + '"] [class*="bg-[#192a2a]"] { background-color:#192a2a !important; }',
      ].join('\n')
    } else {
      styleEl.textContent = ''
    }
  }

  // ── Observer le changement dark/light pour mettre à jour tous les fonds ───
  new MutationObserver(function () {
    var key = localStorage.getItem('pai_wallpaper') || 'ai'
    var theme = window._paiWallpapers.find(function (w) { return w.key === key })
    _applyAllBg(theme || null)
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

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
    // Fonds gauche + panneaux centraux
    _applyAllBg(theme)
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
    }

    // Observer PERMANENT — réapplique le wallpaper après chaque navigation React
    // React recrée les éléments DOM → styles inline perdus → cet observer les restaure
    var _reapplyTimer = null
    var _persistObs = new MutationObserver(function (mutations) {
      var hasAdded = mutations.some(function (m) { return m.addedNodes.length > 0 })
      if (!hasAdded) return
      clearTimeout(_reapplyTimer)
      _reapplyTimer = setTimeout(function () {
        var k = localStorage.getItem('pai_wallpaper') || 'ai'
        var t = window._paiWallpapers.find(function (w) { return w.key === k })
        if (t) _applyAllBg(t)
      }, 200)
    })

    function _startObs () {
      _persistObs.observe(document.body, { childList: true, subtree: true })
    }
    if (document.body) _startObs()
    else document.addEventListener('DOMContentLoaded', _startObs)
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

  // ── Init ──────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initWallpaper() })
  } else {
    initWallpaper()
  }

})()
