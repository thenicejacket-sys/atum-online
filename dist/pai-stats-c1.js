;(function () {

  var SUPA_URL = 'https://ataxqfqlprndcjisepbn.supabase.co'
  var SUPA_KEY = 'sb_publishable_qZMWIStnnUbnmdVxKB4DyA_Bpj10XoY'

  // Palette couleurs agents (cycling)
  var COLORS = [
    '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6',
    '#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16',
    '#6366f1','#d946ef','#0ea5e9','#22c55e','#eab308',
    '#64748b','#a855f7','#e11d48','#059669','#dc2626'
  ]

  function getYTDRange () {
    var now = new Date()
    var start = new Date(now.getFullYear(), 0, 1)
    return { start: start.toISOString(), end: now.toISOString() }
  }

  function fmtDate (iso) {
    if (!iso) return ''
    return iso.slice(0, 10).split('-').reverse().join('/')
  }

  async function fetchUsage (start, end) {
    try {
      var url = SUPA_URL + '/rest/v1/agent_usage'
        + '?select=agent_id,agent_name'
        + '&created_at=gte.' + encodeURIComponent(start)
        + '&created_at=lte.' + encodeURIComponent(end)
        + '&order=created_at.asc'
        + '&limit=10000'
      var res = await fetch(url, {
        headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY }
      })
      return res.ok ? await res.json() : []
    } catch (e) { return [] }
  }

  function groupByAgent (rows) {
    var map = {}
    rows.forEach(function (r) {
      var id = r.agent_id || 'inconnu'
      var name = r.agent_name || id
      if (!map[id]) map[id] = { name: name, count: 0 }
      map[id].count++
    })
    return Object.keys(map)
      .map(function (id) { return { id: id, name: map[id].name, count: map[id].count } })
      .sort(function (a, b) { return b.count - a.count })
  }

  function buildDonut (agents, total) {
    if (total === 0) {
      return '<svg viewBox="0 0 200 200" width="180" height="180">'
        + '<circle cx="100" cy="100" r="68" fill="none" stroke="#1f2937" stroke-width="26"/>'
        + '<text x="100" y="95" text-anchor="middle" font-size="22" fill="#4b5563" font-family="Inter,sans-serif" font-weight="600">0</text>'
        + '<text x="100" y="116" text-anchor="middle" font-size="10" fill="#4b5563" font-family="Inter,sans-serif">interactions</text>'
        + '</svg>'
    }

    var R = 68
    var C = 2 * Math.PI * R
    var accumulated = 0
    var circles = ''

    agents.slice(0, 20).forEach(function (agent, i) {
      var arc = (agent.count / total) * C
      var dasharray = arc.toFixed(2) + ' ' + (C - arc).toFixed(2)
      var dashoffset = (-accumulated).toFixed(2)
      var color = COLORS[i % COLORS.length]
      circles += '<circle cx="100" cy="100" r="' + R + '" fill="none"'
        + ' stroke="' + color + '" stroke-width="26"'
        + ' stroke-dasharray="' + dasharray + '"'
        + ' stroke-dashoffset="' + dashoffset + '"'
        + ' transform="rotate(-90,100,100)"'
        + ' style="transition:stroke-dasharray .5s ease"/>'
      accumulated += arc
    })

    return '<svg viewBox="0 0 200 200" width="180" height="180">'
      + '<circle cx="100" cy="100" r="' + R + '" fill="none" stroke="#1a1a2e" stroke-width="26"/>'
      + circles
      + '<text x="100" y="93" text-anchor="middle" font-size="28" fill="#f9fafb"'
      + ' font-family="Inter,sans-serif" font-weight="700">' + total + '</text>'
      + '<text x="100" y="115" text-anchor="middle" font-size="10" fill="#6b7280"'
      + ' font-family="Inter,sans-serif">interactions</text>'
      + '</svg>'
  }

  function buildLegend (agents, total) {
    if (agents.length === 0) {
      return '<p style="color:#4b5563;font-size:12px;text-align:center;padding:16px 0">Aucune donnée pour cette période</p>'
    }
    return agents.slice(0, 15).map(function (agent, i) {
      var pct = total > 0 ? ((agent.count / total) * 100).toFixed(1) : '0.0'
      var color = COLORS[i % COLORS.length]
      return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04)">'
        + '<div style="width:9px;height:9px;border-radius:50%;background:' + color + ';flex-shrink:0"></div>'
        + '<span style="flex:1;font-size:12px;color:#d1d5db;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + agent.name + '</span>'
        + '<span style="font-size:12px;color:#f9fafb;font-weight:600;min-width:24px;text-align:right">' + agent.count + '</span>'
        + '<span style="font-size:11px;color:#6b7280;min-width:38px;text-align:right">' + pct + '%</span>'
        + '</div>'
    }).join('')
  }

  async function renderStats (panel, startISO, endISO) {
    var donutEl  = panel.querySelector('#_s-donut')
    var legendEl = panel.querySelector('#_s-legend')
    var statusEl = panel.querySelector('#_s-status')
    if (donutEl)  donutEl.innerHTML  = '<p style="color:#4b5563;font-size:12px;text-align:center;padding:30px 0">Chargement…</p>'
    if (legendEl) legendEl.innerHTML = ''

    var rows   = await fetchUsage(startISO, endISO)
    var agents = groupByAgent(rows)
    var total  = rows.length

    if (donutEl)  donutEl.innerHTML  = buildDonut(agents, total)
    if (legendEl) legendEl.innerHTML = buildLegend(agents, total)
    if (statusEl) statusEl.textContent = total + ' interactions · '
      + fmtDate(startISO) + ' → ' + fmtDate(endISO)
  }

  function activateBtn (panel, period) {
    panel.querySelectorAll('[data-period]').forEach(function (b) {
      var active = b.getAttribute('data-period') === period
      b.style.background   = active ? '#14b8a6' : 'transparent'
      b.style.borderColor  = active ? '#14b8a6' : 'rgba(255,255,255,0.12)'
      b.style.color        = active ? '#fff'    : '#9ca3af'
      b.style.fontWeight   = active ? '600'     : '400'
    })
  }

  window._paiShowStats = function () {
    var existing = document.getElementById('_pai-stats-panel')
    if (existing) { existing.remove(); return }

    // Saved custom range
    var saved = null
    try { saved = JSON.parse(localStorage.getItem('pai_stats_range') || 'null') } catch (e) {}
    var ytd      = getYTDRange()
    var todayStr = new Date().toISOString().slice(0, 10)
    var startVal = saved ? saved.start : ytd.start.slice(0, 10)
    var endVal   = saved ? saved.end   : todayStr

    var panel = document.createElement('div')
    panel.id = '_pai-stats-panel'
    panel.style.cssText = [
      'position:fixed', 'top:0', 'left:60px', 'bottom:0',
      'width:460px', 'z-index:99990',
      'background:#0d0d1a',
      'border-right:1px solid rgba(255,255,255,0.07)',
      'display:flex', 'flex-direction:column',
      'font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif',
      'box-shadow:4px 0 24px rgba(0,0,0,0.4)',
    ].join(';')

    panel.innerHTML = [
      // ── Header ──────────────────────────────────────────────────────────────
      '<div style="padding:18px 20px 14px;border-bottom:1px solid rgba(255,255,255,0.07);flex-shrink:0">',
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">',
          '<h2 style="margin:0;font-size:15px;font-weight:700;color:#f9fafb;letter-spacing:.2px">',
            '📊 Utilisation des agents',
          '</h2>',
          '<button id="_s-close" style="background:none;border:none;cursor:pointer;color:#6b7280;padding:4px 6px;border-radius:6px;font-size:16px;line-height:1">✕</button>',
        '</div>',
        '<p id="_s-status" style="margin:0;font-size:11px;color:#4b5563">Chargement…</p>',
      '</div>',
      // ── Period selector ──────────────────────────────────────────────────────
      '<div style="padding:12px 20px;border-bottom:1px solid rgba(255,255,255,0.07);flex-shrink:0">',
        '<div style="display:flex;gap:6px;flex-wrap:wrap">',
          '<button data-period="ytd"    style="padding:5px 11px;border-radius:20px;border:1px solid #14b8a6;background:#14b8a6;color:#fff;font-size:11px;font-weight:600;cursor:pointer">Année en cours</button>',
          '<button data-period="30d"    style="padding:5px 11px;border-radius:20px;border:1px solid rgba(255,255,255,0.12);background:transparent;color:#9ca3af;font-size:11px;cursor:pointer">30 jours</button>',
          '<button data-period="90d"    style="padding:5px 11px;border-radius:20px;border:1px solid rgba(255,255,255,0.12);background:transparent;color:#9ca3af;font-size:11px;cursor:pointer">90 jours</button>',
          '<button data-period="custom" style="padding:5px 11px;border-radius:20px;border:1px solid rgba(255,255,255,0.12);background:transparent;color:#9ca3af;font-size:11px;cursor:pointer">Personnalisée</button>',
        '</div>',
        // Custom date range (hidden by default)
        '<div id="_s-custom" style="margin-top:10px;display:none;align-items:center;gap:8px;flex-wrap:wrap">',
          '<input type="date" id="_s-date-start" value="' + startVal + '"',
            ' style="background:#131325;border:1px solid rgba(255,255,255,0.12);color:#d1d5db;',
            'border-radius:8px;padding:5px 9px;font-size:11px;outline:none;color-scheme:dark"/>',
          '<span style="color:#4b5563;font-size:12px">→</span>',
          '<input type="date" id="_s-date-end" value="' + endVal + '"',
            ' style="background:#131325;border:1px solid rgba(255,255,255,0.12);color:#d1d5db;',
            'border-radius:8px;padding:5px 9px;font-size:11px;outline:none;color-scheme:dark"/>',
          '<button id="_s-apply" style="padding:5px 13px;border-radius:8px;border:none;',
            'background:#14b8a6;color:#fff;font-size:11px;font-weight:600;cursor:pointer">Appliquer</button>',
        '</div>',
      '</div>',
      // ── Chart area ────────────────────────────────────────────────────────────
      '<div style="flex:1;overflow-y:auto;padding:20px">',
        '<div style="display:flex;gap:18px;align-items:flex-start">',
          '<div id="_s-donut" style="flex-shrink:0"></div>',
          '<div id="_s-legend" style="flex:1;min-width:0;padding-top:4px"></div>',
        '</div>',
      '</div>',
    ].join('')

    document.body.appendChild(panel)

    // ── Auto-refresh toutes les 30 secondes ──────────────────────────────────
    var _autoRefreshInterval = null
    function _startAutoRefresh (startISO, endISO) {
      if (_autoRefreshInterval) clearInterval(_autoRefreshInterval)
      _autoRefreshInterval = setInterval(function () {
        if (!document.getElementById('_pai-stats-panel')) {
          clearInterval(_autoRefreshInterval)
          return
        }
        renderStats(panel, startISO, endISO)
      }, 30000)
    }

    // ── Event: close ────────────────────────────────────────────────────────
    panel.querySelector('#_s-close').addEventListener('click', function () {
      if (_autoRefreshInterval) clearInterval(_autoRefreshInterval)
      panel.remove()
    })

    // ── Event: period buttons ────────────────────────────────────────────────
    panel.querySelectorAll('[data-period]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var period = btn.getAttribute('data-period')
        activateBtn(panel, period)
        var customEl = panel.querySelector('#_s-custom')
        if (period === 'custom') {
          customEl.style.display = 'flex'
          return
        }
        customEl.style.display = 'none'
        var now   = new Date()
        var start, end = now.toISOString()
        if (period === 'ytd') {
          start = new Date(now.getFullYear(), 0, 1).toISOString()
        } else if (period === '30d') {
          start = new Date(now.getTime() - 30 * 864e5).toISOString()
        } else if (period === '90d') {
          start = new Date(now.getTime() - 90 * 864e5).toISOString()
        }
        renderStats(panel, start, end)
        _startAutoRefresh(start, end)
      })
    })

    // ── Event: apply custom range ────────────────────────────────────────────
    panel.querySelector('#_s-apply').addEventListener('click', function () {
      var s = panel.querySelector('#_s-date-start').value
      var e = panel.querySelector('#_s-date-end').value
      if (!s || !e) return
      var start = new Date(s).toISOString()
      var end   = new Date(e + 'T23:59:59').toISOString()
      localStorage.setItem('pai_stats_range', JSON.stringify({ start: s, end: e }))
      renderStats(panel, start, end)
      _startAutoRefresh(start, end)
    })

    // ── Initial render : YTD ─────────────────────────────────────────────────
    renderStats(panel, ytd.start, ytd.end)
    _startAutoRefresh(ytd.start, ytd.end)
  }

})()
