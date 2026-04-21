;(function () {
  'use strict'

  // ── Son de cloche Web Audio (pas de fichier externe nécessaire) ──────────
  function playBell () {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)()
      var osc = ctx.createOscillator()
      var gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      // C6 → G5 : two-tone bell
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(784.0, ctx.currentTime + 0.15)
      gain.gain.setValueAtTime(0.35, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 1.2)
    } catch (e) {
      // AudioContext non disponible ou bloqué — silencieux
    }
  }

  // Exposer globalement pour debug
  window.__paiPlayBell = playBell

  // ── Intercepteur fetch — écoute le stream NDJSON /api/chat ───────────────
  var _origFetch = window.fetch.bind(window)
  window.fetch = function (url, opts) {
    var p = _origFetch(url, opts)
    if (typeof url === 'string' && url.indexOf('/api/chat') !== -1) {
      p.then(function (res) {
        if (!res.body) return
        var clone = res.clone()
        var reader = clone.body.getReader()
        var dec = new TextDecoder()
        var buf = ''
        ;(function pump () {
          reader.read().then(function (chunk) {
            if (chunk.done) return
            buf += dec.decode(chunk.value, { stream: true })
            var lines = buf.split('\n')
            buf = lines.pop() || ''
            for (var i = 0; i < lines.length; i++) {
              var line = lines[i].trim()
              if (!line) continue
              try {
                var ev = JSON.parse(line)
                if (ev.type === 'bell') { playBell(); return }
              } catch (e) {}
            }
            pump()
          }).catch(function () {})
        })()
      }).catch(function () {})
    }
    return p
  }
})()
