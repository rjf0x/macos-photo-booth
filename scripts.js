(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };

  /* ---------- canvases ---------- */
  var RW = 800, RH = 600;
  var base = document.createElement('canvas'); base.width = RW; base.height = RH;
  var bctx = base.getContext('2d', { willReadFrequently: true });
  var view = $('#view'); view.width = RW; view.height = RH;
  var vctx = view.getContext('2d', { willReadFrequently: true });
  var video = $('#cam');

  /* ---------- effects ---------- */
  function lutFrom(stops) {
    var lut = new Uint8ClampedArray(768);
    for (var i = 0; i < 256; i++) {
      var t = i / 255, k = 0;
      while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
      var a = stops[k], b = stops[k + 1];
      var u = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])));
      for (var c = 0; c < 3; c++) lut[i * 3 + c] = a[1][c] + (b[1][c] - a[1][c]) * u;
    }
    return lut;
  }
  var THERMAL = lutFrom([
    [0, [5, 0, 25]], [0.2, [30, 0, 110]], [0.4, [160, 0, 130]],
    [0.6, [240, 40, 40]], [0.8, [255, 170, 0]], [1, [255, 255, 200]]
  ]);
  var POP = (function () {
    var pal = [[22, 16, 84], [222, 30, 118], [255, 206, 32], [255, 247, 226]];
    var l = new Uint8ClampedArray(768);
    for (var i = 0; i < 256; i++) {
      var c = pal[Math.min(3, i >> 6)];
      l[i * 3] = c[0]; l[i * 3 + 1] = c[1]; l[i * 3 + 2] = c[2];
    }
    return l;
  })();
  function lum(r, g, b) { return (r * 77 + g * 151 + b * 28) >> 8; }

  var EFFECTS = [
    { name: 'Normal', fn: null },
    { name: 'Black & White', fn: function (d) {
      for (var i = 0; i < d.length; i += 4) {
        var g = (lum(d[i], d[i + 1], d[i + 2]) - 128) * 1.12 + 128;
        d[i] = d[i + 1] = d[i + 2] = g;
      }
    } },
    { name: 'Sepia', fn: function (d) {
      for (var i = 0; i < d.length; i += 4) {
        var r = d[i], g = d[i + 1], b = d[i + 2];
        d[i] = r * 0.393 + g * 0.769 + b * 0.189;
        d[i + 1] = r * 0.349 + g * 0.686 + b * 0.168;
        d[i + 2] = r * 0.272 + g * 0.534 + b * 0.131;
      }
    } },
    { name: 'Thermal', fn: function (d) {
      for (var i = 0; i < d.length; i += 4) {
        var k = lum(d[i], d[i + 1], d[i + 2]) * 3;
        d[i] = THERMAL[k]; d[i + 1] = THERMAL[k + 1]; d[i + 2] = THERMAL[k + 2];
      }
    } },
    { name: 'X-Ray', fn: function (d) {
      for (var i = 0; i < d.length; i += 4) {
        var v = (255 - lum(d[i], d[i + 1], d[i + 2]) - 128) * 1.3 + 128;
        d[i] = v * 0.72; d[i + 1] = v * 0.93; d[i + 2] = v + 12;
      }
    } },
    { name: 'Pop Art', fn: function (d) {
      for (var i = 0; i < d.length; i += 4) {
        var g = (lum(d[i], d[i + 1], d[i + 2]) - 128) * 1.25 + 128;
        g = g < 0 ? 0 : g > 255 ? 255 : g | 0;
        var k = g * 3;
        d[i] = POP[k]; d[i + 1] = POP[k + 1]; d[i + 2] = POP[k + 2];
      }
    } },
    { name: 'Vivid', fn: function (d) {
      for (var i = 0; i < d.length; i += 4) {
        var r = d[i], g = d[i + 1], b = d[i + 2], y = lum(r, g, b);
        d[i] = (y + (r - y) * 1.6 - 128) * 1.08 + 128;
        d[i + 1] = (y + (g - y) * 1.6 - 128) * 1.08 + 128;
        d[i + 2] = (y + (b - y) * 1.6 - 128) * 1.08 + 128;
      }
    } },
    { name: 'Faded', fn: function (d) {
      for (var i = 0; i < d.length; i += 4) {
        var r = d[i], g = d[i + 1], b = d[i + 2], y = lum(r, g, b);
        d[i] = (y + (r - y) * 0.7) * 0.84 + 38;
        d[i + 1] = (y + (g - y) * 0.7) * 0.84 + 34;
        d[i + 2] = (y + (b - y) * 0.7) * 0.84 + 32;
      }
    } },
    { name: 'Noir', fn: function (d) {
      for (var i = 0; i < d.length; i += 4) {
        var g = ((lum(d[i], d[i + 1], d[i + 2]) / 255 - 0.5) * 1.6 + 0.5) * 235;
        d[i] = d[i + 1] = d[i + 2] = g;
      }
    } }
  ];
  var cur = 0;

  /* ---------- source: camera, demo scene or photo ---------- */
  var src = 'demo', starting = true, stream = null, photoImg = null, photoName = '', photoURL = '';
  var mirror = true, devices = [], cameraRequest = 0;

  function coverDraw(ctx, el, sw, sh, w, h, flip) {
    var s = Math.max(w / sw, h / sh), dw = sw * s, dh = sh * s;
    ctx.save();
    if (flip) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(el, (w - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.restore();
  }

  function demoScene(ctx, w, h, t) {
    var u = h / 600, i;
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2b3a67'); g.addColorStop(0.55, '#8a5a8c'); g.addColorStop(1, '#f0a36b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (i = 0; i < 14; i++) {
      var x = ((i * 173 + t * (8 + (i % 5) * 3)) % (w + 200)) - 100;
      var y = ((i * 97) % h) + Math.sin(t * 0.5 + i) * 20 * u;
      ctx.fillStyle = 'hsla(' + (20 + i * 14) + ',90%,72%,' + (0.1 + (i % 3) * 0.05) + ')';
      ctx.beginPath(); ctx.arc(x, y, (26 + (i % 4) * 18) * u, 0, 7); ctx.fill();
    }
    var cx = w / 2 + Math.sin(t * 0.8) * 14 * u, cy = h * 0.46 + Math.sin(t * 1.6) * 4 * u;
    ctx.fillStyle = '#1f3a5f';
    ctx.beginPath(); ctx.ellipse(cx, h * 0.99, 235 * u, 205 * u, 0, Math.PI, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = '#c99573';
    ctx.fillRect(cx - 30 * u, cy + 70 * u, 60 * u, 70 * u);
    ctx.fillStyle = '#2a1b17';
    ctx.beginPath(); ctx.ellipse(cx, cy - 12 * u, 100 * u, 112 * u, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#e9b48f';
    ctx.beginPath(); ctx.ellipse(cx, cy, 90 * u, 106 * u, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#2a1b17';
    ctx.beginPath(); ctx.ellipse(cx, cy - 58 * u, 94 * u, 52 * u, 0, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
    var blink = (t % 4) > 3.85 ? 0.1 : 1;
    ctx.beginPath(); ctx.ellipse(cx - 34 * u, cy - 4 * u, 9 * u, 11 * u * blink, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 34 * u, cy - 4 * u, 9 * u, 11 * u * blink, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(235,110,110,0.28)';
    ctx.beginPath(); ctx.arc(cx - 56 * u, cy + 26 * u, 16 * u, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 56 * u, cy + 26 * u, 16 * u, 0, 7); ctx.fill();
    ctx.strokeStyle = '#8a3b3b'; ctx.lineWidth = 5 * u; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy + 30 * u, 34 * u, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke();
  }

  function drawSource(ctx, w, h, t) {
    if (src === 'camera' && video.readyState >= 2 && video.videoWidth) {
      coverDraw(ctx, video, video.videoWidth, video.videoHeight, w, h, mirror);
    } else if (src === 'photo' && photoImg) {
      coverDraw(ctx, photoImg, photoImg.naturalWidth, photoImg.naturalHeight, w, h, false);
    } else {
      demoScene(ctx, w, h, t);
    }
  }

  /* ---------- effects grid ---------- */
  var fxGrid = $('#fxgrid'), tiles = [], fxLabelTimer = 0;
  EFFECTS.forEach(function (e, i) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'fx'; b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
    var c = document.createElement('canvas'); c.width = 120; c.height = 90;
    var s = document.createElement('span'); s.textContent = e.name;
    b.appendChild(c); b.appendChild(s);
    b.addEventListener('click', function () { pick(i); });
    fxGrid.appendChild(b);
    tiles.push({ c: c, ctx: c.getContext('2d', { willReadFrequently: true }), b: b });
  });
  function pick(i) {
    cur = i;
    tiles.forEach(function (t, k) { t.b.setAttribute('aria-pressed', k === i ? 'true' : 'false'); });
    var l = $('#fxname'); l.textContent = EFFECTS[i].name; l.classList.add('show');
    clearTimeout(fxLabelTimer); fxLabelTimer = setTimeout(function () { l.classList.remove('show'); }, 1300);
  }

  /* ---------- render loop ---------- */
  var frame = 0, lastTs = 0;
  function resizePreview() {
    var rect = view.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
    var sourceWidth = src === 'camera' ? video.videoWidth : src === 'photo' && photoImg ? photoImg.naturalWidth : 1920;
    var sourceHeight = src === 'camera' ? video.videoHeight : src === 'photo' && photoImg ? photoImg.naturalHeight : 1440;
    var available = Math.min(sourceWidth || 1920, (sourceHeight || 1440) * 4 / 3);
    var width = Math.max(4, Math.round(Math.min(1920, available, Math.min(rect.width, rect.height * 4 / 3) * ratio) / 4) * 4);
    if (width === RW) return;
    RW = width; RH = width * 3 / 4;
    base.width = view.width = RW; base.height = view.height = RH;
  }
  function loop(ts) {
    requestAnimationFrame(loop);
    if (document.hidden || $('.window').hidden || ts - lastTs < 28) return;
    lastTs = ts;
    resizePreview();
    drawSource(bctx, RW, RH, ts / 1000);
    var fn = EFFECTS[cur].fn;
    if (fn) {
      var id = bctx.getImageData(0, 0, RW, RH);
      fn(id.data); vctx.putImageData(id, 0, 0);
    } else {
      vctx.drawImage(base, 0, 0);
    }
    if (frame % 3 === 0 && !$('#fxpanel').classList.contains('off')) {
      for (var i = 0; i < tiles.length; i++) {
        var t = tiles[i], f = EFFECTS[i].fn;
        t.ctx.drawImage(base, 0, 0, 120, 90);
        if (f) { var td = t.ctx.getImageData(0, 0, 120, 90); f(td.data); t.ctx.putImageData(td, 0, 0); }
      }
    }
    frame++;
  }

  /* ---------- status UI ---------- */
  function refreshStatus() {
    var chip = $('#chip'), txt = $('#chipTxt'), sub = $('#sub');
    var kind = src;
    if (starting && src !== 'camera') { txt.textContent = 'Starting camera'; sub.textContent = 'Waiting for camera'; }
    else if (src === 'camera') {
      txt.textContent = 'Live';
      var tr = stream && stream.getVideoTracks()[0];
      sub.textContent = (tr && tr.label) || 'Camera';
    } else if (src === 'photo') { txt.textContent = 'Photo'; sub.textContent = photoName || 'Photo'; }
    else { txt.textContent = 'Demo scene'; sub.textContent = 'Demo scene'; }
    chip.setAttribute('data-k', kind);
    $('#camdot').hidden = src !== 'camera';
  }

  /* ---------- source menu ---------- */
  var sel = $('#source');
  function currentValue() {
    if (src === 'camera') {
      var tr = stream && stream.getVideoTracks()[0];
      var id = tr && tr.getSettings && tr.getSettings().deviceId;
      for (var i = 0; i < devices.length; i++) if (devices[i].deviceId === id) return 'cam:' + id;
      return 'cam:' + (devices[0] ? devices[0].deviceId : '');
    }
    return src === 'photo' ? 'photo' : 'demo';
  }
  function buildMenu() {
    sel.textContent = '';
    function add(v, t) { var o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); }
    if (devices.length) devices.forEach(function (d, i) { add('cam:' + d.deviceId, d.label || ('Camera ' + (i + 1))); });
    else add('cam:', 'Camera');
    add('demo', 'Demo scene');
    if (photoName) add('photo', photoName);
    add('photo-new', 'Choose photo…');
    sel.value = currentValue();
  }
  function refreshDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) { buildMenu(); return Promise.resolve(); }
    return navigator.mediaDevices.enumerateDevices().then(function (l) {
      devices = l.filter(function (d) { return d.kind === 'videoinput' && d.deviceId; });
    }).catch(function () {}).then(buildMenu);
  }

  /* ---------- camera ---------- */
  function stopCamera() {
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null; video.srcObject = null;
  }
  function startCamera(deviceId) {
    var request = ++cameraRequest;
    starting = true; refreshStatus();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.resolve(failCamera());
    }
    var vc = { width: { ideal: 1920 }, height: { ideal: 1440 } };
    if (deviceId) vc.deviceId = { exact: deviceId }; else vc.facingMode = 'user';
    return navigator.mediaDevices.getUserMedia({ video: vc, audio: false }).then(function (s) {
      if (request !== cameraRequest) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      stopCamera(); stream = s; video.srcObject = s;
      return video.play().catch(function () {});
    }).then(function () {
      if (request !== cameraRequest) return;
      src = 'camera'; starting = false; $('#notice').hidden = true;
      return refreshDevices();
    }).then(function () { refreshStatus(); return true; }, function () { if (request === cameraRequest) return failCamera(); return false; });
  }
  function failCamera() {
    starting = false;
    if (src === 'camera') { stopCamera(); src = 'demo'; }
    $('#notice').hidden = false;
    refreshStatus(); buildMenu();
    return false;
  }

  /* ---------- photo as source ---------- */
  var fileIn = $('#file');
  function loadPhoto(file) {
    if (!file || file.type.indexOf('image/') !== 0) { toast('Choose an image file'); return; }
    var url = URL.createObjectURL(file), im = new Image();
    im.onload = function () {
      if (photoURL) URL.revokeObjectURL(photoURL);
      photoURL = url; photoImg = im; photoName = file.name.length > 28 ? file.name.slice(0, 25) + '…' : file.name;
      stopCamera(); src = 'photo'; starting = false; $('#notice').hidden = true;
      refreshStatus(); buildMenu();
    };
    im.onerror = function () { URL.revokeObjectURL(url); toast('That image could not be opened'); };
    im.src = url;
  }
  fileIn.addEventListener('change', function () { loadPhoto(fileIn.files[0]); fileIn.value = ''; });
  $('#usePhoto').addEventListener('click', function () { fileIn.click(); });
  $('#retry').addEventListener('click', function () { startCamera(); });

  sel.addEventListener('change', function () {
    var v = sel.value;
    if (v === 'demo') { stopCamera(); src = 'demo'; starting = false; refreshStatus(); }
    else if (v === 'photo') { stopCamera(); src = 'photo'; starting = false; refreshStatus(); }
    else if (v === 'photo-new') { sel.value = currentValue(); fileIn.click(); }
    else if (v.indexOf('cam:') === 0) { startCamera(v.slice(4) || undefined).then(function () { sel.value = currentValue(); }); }
  });

  var vf = $('#vf');
  ['dragenter', 'dragover'].forEach(function (n) {
    vf.addEventListener(n, function (e) { e.preventDefault(); vf.classList.add('drop'); });
  });
  ['dragleave', 'dragend'].forEach(function (n) {
    vf.addEventListener(n, function () { vf.classList.remove('drop'); });
  });
  vf.addEventListener('drop', function (e) {
    e.preventDefault(); vf.classList.remove('drop');
    if (e.dataTransfer && e.dataTransfer.files[0]) loadPhoto(e.dataTransfer.files[0]);
  });

  /* ---------- window controls ---------- */
  var cameraWindow = $('.window'), reopen = $('#reopenWindow'), fullButton = $('#fullscreenWindow');
  var windowClosed = false, resumeCamera = false;
  function updateFullscreen() {
    var full = document.fullscreenElement === cameraWindow || cameraWindow.classList.contains('expanded');
    fullButton.setAttribute('aria-pressed', String(full));
    fullButton.setAttribute('aria-label', full ? 'Exit full screen' : 'Enter full screen');
    fullButton.title = full ? 'Exit full screen' : 'Enter full screen';
  }
  function hideWindow(close) {
    cancelled = true;
    if (document.fullscreenElement === cameraWindow) document.exitFullscreen().catch(function () {});
    cameraWindow.classList.remove('expanded'); updateFullscreen();
    windowClosed = close;
    if (close) {
      resumeCamera = src === 'camera' || starting;
      ++cameraRequest; stopCamera(); starting = false;
      if (src === 'camera') src = 'demo';
      refreshStatus();
    }
    cameraWindow.hidden = true; reopen.hidden = false;
    reopen.textContent = close ? 'Open Camera' : 'Restore Camera'; reopen.focus();
  }
  $('#closeWindow').addEventListener('click', function () { hideWindow(true); });
  $('#minimizeWindow').addEventListener('click', function () { hideWindow(false); });
  reopen.addEventListener('click', function () {
    cameraWindow.hidden = false; reopen.hidden = true;
    if (windowClosed && resumeCamera) startCamera();
    windowClosed = false; $('#minimizeWindow').focus();
  });
  fullButton.addEventListener('click', function () {
    if (document.fullscreenElement === cameraWindow) {
      document.exitFullscreen().catch(function () {});
    } else if (cameraWindow.classList.contains('expanded')) {
      cameraWindow.classList.remove('expanded'); updateFullscreen();
    } else if (cameraWindow.requestFullscreen) {
      cameraWindow.requestFullscreen().catch(function () { cameraWindow.classList.add('expanded'); updateFullscreen(); });
    } else { cameraWindow.classList.add('expanded'); updateFullscreen(); }
  });
  document.addEventListener('fullscreenchange', updateFullscreen);

  /* ---------- toolbar ---------- */
  var mirrorBtn = $('#mirrorBtn'), fxBtn = $('#fxBtn');
  mirrorBtn.addEventListener('click', function () {
    mirror = !mirror; mirrorBtn.setAttribute('aria-pressed', String(mirror));
  });
  fxBtn.addEventListener('click', function () {
    var off = $('#fxpanel').classList.toggle('off');
    fxBtn.setAttribute('aria-pressed', String(!off));
    fxBtn.title = off ? 'Show effects' : 'Hide effects';
  });
  var mode = 'single';
  function setMode(m) {
    mode = m;
    $('#mSingle').setAttribute('aria-pressed', String(m === 'single'));
    $('#mQuad').setAttribute('aria-pressed', String(m === 'quad'));
    vf.classList.toggle('quad', m === 'quad');
  }
  $('#mSingle').addEventListener('click', function () { if (!busy) setMode('single'); });
  $('#mQuad').addEventListener('click', function () { if (!busy) setMode('quad'); });

  /* ---------- sound ---------- */
  var actx = null;
  function audio() {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { actx = null; }
  }
  function tick() {
    if (!actx) return;
    var o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
    o.frequency.value = 880; g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.14);
  }
  function clickSound() {
    if (!actx) return;
    var n = Math.floor(actx.sampleRate * 0.12), buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    var s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
    s.buffer = buf; f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.7; g.gain.value = 0.5;
    s.connect(f); f.connect(g); g.connect(actx.destination); s.start();
  }

  /* ---------- capture ---------- */
  var busy = false, cancelled = false, shutter = $('#shutter');
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function showCount(n) {
    var c = $('#count'); c.textContent = '';
    var s = document.createElement('span'); s.textContent = n; c.appendChild(s);
  }
  function countdown(n) {
    var chain = Promise.resolve(true);
    function step(i) {
      chain = chain.then(function (ok) {
        if (!ok || cancelled) return false;
        showCount(i); tick();
        return wait(900).then(function () { return !cancelled; });
      });
    }
    for (var i = n; i > 0; i--) step(i);
    return chain.then(function (ok) { $('#count').textContent = ''; return ok; });
  }
  function fire() {
    var f = $('#flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
    clickSound();
  }
  function snap(w, h) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var cx = c.getContext('2d', { willReadFrequently: true });
    drawSource(cx, w, h, performance.now() / 1000);
    var fn = EFFECTS[cur].fn;
    if (fn) { var id = cx.getImageData(0, 0, w, h); fn(id.data); cx.putImageData(id, 0, 0); }
    return c;
  }
  function shotSize() {
    if (src === 'camera' && video.videoWidth) {
      var cw = Math.min(video.videoWidth, video.videoHeight * 4 / 3), w = Math.min(1280, Math.round(cw));
      return [w, Math.round(w * 3 / 4)];
    }
    return [1280, 960];
  }
  function compose(frames) {
    var gap = 16, fw = 640, fh = 480;
    var c = document.createElement('canvas'); c.width = fw * 2 + gap * 3; c.height = fh * 2 + gap * 3;
    var cx = c.getContext('2d'); cx.fillStyle = '#101012'; cx.fillRect(0, 0, c.width, c.height);
    frames.forEach(function (f, i) {
      cx.drawImage(f, gap + (i % 2) * (fw + gap), gap + Math.floor(i / 2) * (fh + gap), fw, fh);
    });
    return c;
  }
  function setBusy(b) {
    vf.classList.toggle('busy', b);
    shutter.classList.toggle('busy', b);
    shutter.setAttribute('aria-label', b ? 'Cancel' : 'Take photo');
    if (!b) setPips(0);
  }
  function setPips(n) {
    var p = $('#pips').children;
    for (var i = 0; i < p.length; i++) p[i].classList.toggle('on', i < n);
  }
  function shoot() {
    if (busy) { cancelled = true; return; }
    busy = true; cancelled = false; setBusy(true); audio();
    var done = function () { busy = false; cancelled = false; $('#count').textContent = ''; setBusy(false); };
    countdown(3).then(function (ok) {
      if (!ok) return;
      if (mode === 'single') {
        var sz = shotSize(); fire();
        return addPhoto(snap(sz[0], sz[1]));
      }
      var frames = [], p = Promise.resolve();
      [0, 1, 2, 3].forEach(function (i) {
        p = p.then(function () {
          if (cancelled) return;
          fire(); frames.push(snap(640, 480)); setPips(i + 1);
          return i < 3 ? wait(1000) : null;
        });
      });
      return p.then(function () { if (frames.length === 4) return addPhoto(compose(frames)); });
    }).then(done, done);
  }
  shutter.addEventListener('click', shoot);

  /* ---------- photo strip ---------- */
  var photos = [], seq = 0, MAX = 40;
  var reel = $('#reel'), tally = $('#tally');
  function pad(n) { return String(n).padStart(2, '0'); }
  function fileName(p) {
    var d = p.time;
    return 'Photo on ' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' at ' + pad(d.getHours()) + '.' + pad(d.getMinutes()) + '.' + pad(d.getSeconds()) + '.jpg';
  }
  function addPhoto(canvas) {
    return new Promise(function (r) { canvas.toBlob(r, 'image/jpeg', 0.92); }).then(function (blob) {
      if (!blob) return;
      photos.unshift({ id: ++seq, blob: blob, url: URL.createObjectURL(blob), time: new Date(), fx: EFFECTS[cur].name });
      while (photos.length > MAX) URL.revokeObjectURL(photos.pop().url);
      renderReel(true);
    });
  }
  function renderReel(animate) {
    reel.textContent = '';
    if (!photos.length) {
      var e = document.createElement('div'); e.className = 'empty';
      e.innerHTML = '<i></i><span>Photos you take appear here. Press Space or the red button.</span>';
      reel.appendChild(e); tally.textContent = ''; return;
    }
    photos.forEach(function (p, i) {
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'th' + (animate && i === 0 ? ' new' : '');
      var im = document.createElement('img'); im.src = p.url;
      im.alt = 'Photo taken at ' + p.time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      b.appendChild(im); b.addEventListener('click', function () { openLb(i); });
      reel.appendChild(b);
    });
    reel.scrollLeft = 0;
    tally.textContent = photos.length + (photos.length === 1 ? ' photo' : ' photos');
  }

  /* ---------- lightbox ---------- */
  var lb = $('#lb'), idx = 0;
  function showLb() {
    var p = photos[idx];
    $('#lbImg').src = p.url;
    $('#lbImg').alt = 'Photo, ' + p.fx + ' effect';
    $('#lbMeta').textContent = p.fx + ' · ' + p.time.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    $('#lbPrev').disabled = idx === 0;
    $('#lbNext').disabled = idx === photos.length - 1;
  }
  function openLb(i) { idx = i; showLb(); lb.hidden = false; $('#lbDone').focus(); }
  function closeLb() {
    lb.hidden = true;
    var t = reel.children[idx]; if (t && t.focus) t.focus();
  }
  $('#lbDone').addEventListener('click', closeLb);
  $('#lbPrev').addEventListener('click', function () { if (idx > 0) { idx--; showLb(); } });
  $('#lbNext').addEventListener('click', function () { if (idx < photos.length - 1) { idx++; showLb(); } });
  $('#lbDel').addEventListener('click', function () {
    var p = photos.splice(idx, 1)[0]; URL.revokeObjectURL(p.url);
    renderReel(false);
    if (!photos.length) { lb.hidden = true; return; }
    idx = Math.min(idx, photos.length - 1); showLb();
  });
  $('#lbSave').addEventListener('click', function () { save(photos[idx]); });

  function save(p) {
    var name = fileName(p);
    var get = (window.claude && window.claude.use) ? window.claude.use('downloads').catch(function () { return null; }) : Promise.resolve(null);
    get.then(function (dl) {
      if (dl) {
        return dl.save({ filename: name, data: p.blob }).then(function () { toast('Saved'); }, function (err) {
          if (err && err.code === 'declined') return;
          toast('Saving is not available here');
        });
      }
      var a = document.createElement('a'); a.href = p.url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove(); toast('Download started');
    });
  }

  /* ---------- toast, clock, keys ---------- */
  var toastTimer = 0;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }
  function clock() {
    $('#clock').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date());
  }
  clock(); setInterval(clock, 15000);

  document.addEventListener('keydown', function (e) {
    if (!lb.hidden) {
      if (e.key === 'Escape') closeLb();
      else if (e.key === 'ArrowLeft' && idx > 0) { idx--; showLb(); }
      else if (e.key === 'ArrowRight' && idx < photos.length - 1) { idx++; showLb(); }
      return;
    }
    if (e.key === 'Escape' && cameraWindow.classList.contains('expanded')) { cameraWindow.classList.remove('expanded'); updateFullscreen(); }
    if (cameraWindow.hidden) return;
    if (e.code === 'Space' && !e.target.closest('button,select,input,textarea,a')) { e.preventDefault(); shoot(); }
  });

  /* ---------- go ---------- */
  renderReel(false);
  buildMenu();
  refreshStatus();
  requestAnimationFrame(loop);
  startCamera();
})();
