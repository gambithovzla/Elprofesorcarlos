/* El Profesor Carlos — checkout compartido (portada y página del curso).
   Requiere en la página: el modal #checkout con sus campos, botones .js-buy
   con data-course, y opcionalmente elementos [data-price-for="slug"]. */
(function checkout() {
  var COURSES = {};        // slug → {title, price_pen, sessions_included}
  var CONFIG = null;       // llaves públicas + datos de pago manual
  var current = null;      // curso seleccionado
  var purchaseId = null;   // compra creada en el backend
  var culqiLoaded = false;

  var $modal = document.getElementById('checkout');
  var $form = document.getElementById('checkout-form');
  var $success = document.getElementById('checkout-success');
  var $title = document.getElementById('co-title');
  var $price = document.getElementById('co-price');
  var $sessions = document.getElementById('co-sessions');
  var $name = document.getElementById('co-name');
  var $email = document.getElementById('co-email');
  var $error = document.getElementById('co-error');
  var $submit = document.getElementById('co-submit');
  var $manualBlock = document.getElementById('manual-block');
  var $manualInfo = document.getElementById('manual-info');
  var method = 'culqi';

  if (!$modal || !$form) return;

  function fmtPEN(n) {
    return 'S/ ' + Number(n).toFixed(2);
  }

  /* Carga catálogo y config; rellena precios en la página */
  fetch('/api/courses').then(function(r) { return r.json(); }).then(function(list) {
    list.forEach(function(c) {
      COURSES[c.slug] = c;
      document.querySelectorAll('[data-price-for="' + c.slug + '"]').forEach(function(el) {
        var small = el.getAttribute('data-price-label');
        el.innerHTML = (small ? '<small>' + small.replace('{n}', c.sessions_included) + '</small>' : '') + fmtPEN(c.price_pen);
      });
    });
    document.dispatchEvent(new CustomEvent('courses:loaded', { detail: COURSES }));
  }).catch(function() {});
  fetch('/api/config').then(function(r) { return r.json(); }).then(function(cfg) { CONFIG = cfg; }).catch(function() {});

  function showError(msg) {
    $error.textContent = msg;
    $error.classList.add('is-visible');
  }
  function clearError() {
    $error.classList.remove('is-visible');
  }
  function setBusy(busy, label) {
    $submit.disabled = busy;
    $submit.textContent = label || (busy ? 'Procesando…' : 'Continuar al pago');
  }

  function renderManualInfo() {
    if (!CONFIG) return;
    var mp = CONFIG.manualPayment || {};
    var rows = [];
    if (mp.zelle)     rows.push('<p><strong>Zelle:</strong> ' + mp.zelle + '</p>');
    if (mp.pagomovil) rows.push('<p><strong>Pago Móvil:</strong> ' + mp.pagomovil + '</p>');
    if (mp.binance)   rows.push('<p><strong>Binance:</strong> ' + mp.binance + '</p>');
    if (!rows.length) rows.push('<p>Escríbenos para coordinar el pago y luego reporta aquí tu referencia.</p>');
    $manualInfo.innerHTML = '<h4>Realiza tu pago a</h4>' + rows.join('') +
      '<p>Monto: <strong>' + fmtPEN(current.price_pen) + '</strong> (o su equivalente acordado)</p>';
  }

  function selectMethod(m) {
    method = m;
    document.getElementById('pm-card').classList.toggle('is-selected', m === 'culqi');
    document.getElementById('pm-manual').classList.toggle('is-selected', m === 'manual');
    $manualBlock.hidden = m !== 'manual';
    $submit.textContent = m === 'manual' ? 'Reportar mi pago' : 'Continuar al pago';
    if (m === 'manual') renderManualInfo();
    clearError();
  }
  document.getElementById('pm-card').addEventListener('click', function() { selectMethod('culqi'); });
  document.getElementById('pm-manual').addEventListener('click', function() { selectMethod('manual'); });

  function openCheckout(slug) {
    current = COURSES[slug];
    if (!current) { window.location.hash = '#contacto'; return; }
    purchaseId = null;
    $title.textContent = current.title;
    $price.textContent = fmtPEN(current.price_pen);
    $sessions.textContent = current.sessions_included;
    $form.hidden = false;
    $success.hidden = true;
    clearError();
    setBusy(false);
    selectMethod('culqi');
    $modal.hidden = false;
    requestAnimationFrame(function() { $modal.classList.add('is-open'); });
    document.body.style.overflow = 'hidden';
  }
  function closeCheckout() {
    $modal.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(function() { $modal.hidden = true; }, 280);
  }
  document.querySelectorAll('.js-buy').forEach(function(btn) {
    btn.addEventListener('click', function() { openCheckout(btn.getAttribute('data-course')); });
  });
  document.getElementById('checkout-close').addEventListener('click', closeCheckout);
  $modal.addEventListener('click', function(ev) { if (ev.target === $modal) closeCheckout(); });
  document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape' && !$modal.hidden) closeCheckout();
  });

  function showSuccess(title, body) {
    $form.hidden = true;
    $success.hidden = false;
    document.getElementById('cs-title').textContent = title;
    document.getElementById('cs-body').textContent = body;
  }

  function api(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function(r) {
      return r.json().then(function(data) {
        if (!r.ok) throw new Error(data.error || 'Ocurrió un error. Inténtalo de nuevo.');
        return data;
      });
    });
  }

  /* Carga perezosa del script de Culqi Checkout */
  function loadCulqi() {
    return new Promise(function(resolve, reject) {
      if (culqiLoaded && window.Culqi) return resolve();
      var s = document.createElement('script');
      s.src = 'https://checkout.culqi.com/js/v4';
      s.onload = function() { culqiLoaded = true; resolve(); };
      s.onerror = function() { reject(new Error('No se pudo cargar la pasarela de pago. Revisa tu conexión.')); };
      document.head.appendChild(s);
    });
  }

  /* Culqi invoca window.culqi() cuando el comprador completa el formulario de tarjeta */
  window.culqi = function() {
    if (window.Culqi && Culqi.token) {
      var tokenId = Culqi.token.id;
      Culqi.close();
      setBusy(true, 'Confirmando tu pago…');
      api('/api/purchases/' + purchaseId + '/charge', { tokenId: tokenId })
        .then(function(res) {
          showSuccess('¡Pago confirmado!', 'Tu acceso está listo. Te estamos redirigiendo a tu curso…');
          setTimeout(function() { window.location.href = res.accessUrl; }, 1600);
        })
        .catch(function(err) {
          setBusy(false);
          showError(err.message);
        });
    } else if (window.Culqi && Culqi.error) {
      setBusy(false);
      showError(Culqi.error.user_message || 'El pago no pudo procesarse.');
    }
  };

  $form.addEventListener('submit', function(e) {
    e.preventDefault();
    clearError();
    var name = $name.value.trim();
    var email = $email.value.trim();
    if (name.length < 2) return showError('Ingresa tu nombre completo.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError('Ingresa un correo válido.');

    if (method === 'manual') {
      var reference = document.getElementById('co-reference').value.trim();
      if (reference.length < 4) return showError('Ingresa el número de referencia de tu pago.');
      setBusy(true, 'Enviando…');
      api('/api/purchases', {
        courseSlug: current.slug,
        buyerName: name,
        buyerEmail: email,
        method: 'manual',
        manualChannel: document.getElementById('co-channel').value,
        manualReference: reference,
      }).then(function() {
        showSuccess('Pago en verificación', 'Recibimos tu reporte. En cuanto confirmemos el pago (normalmente en pocas horas) te llegará un correo a ' + email + ' con tu acceso al curso y a las sesiones en vivo.');
      }).catch(function(err) {
        setBusy(false);
        showError(err.message);
      });
      return;
    }

    /* Tarjeta / Yape vía Culqi */
    if (!CONFIG || !CONFIG.culqiPublicKey) {
      return showError('Los pagos con tarjeta aún no están habilitados. Usa la opción Zelle · Pago Móvil · Binance o inténtalo más tarde.');
    }
    setBusy(true, 'Abriendo pago seguro…');
    api('/api/purchases', {
      courseSlug: current.slug,
      buyerName: name,
      buyerEmail: email,
      method: 'culqi',
    }).then(function(res) {
      purchaseId = res.purchaseId;
      return loadCulqi().then(function() {
        Culqi.publicKey = CONFIG.culqiPublicKey;
        Culqi.settings({
          title: 'El Profesor Carlos',
          currency: 'PEN',
          amount: Math.round(Number(res.amountPen) * 100),
        });
        Culqi.options({
          lang: 'auto',
          installments: false,
          paymentMethods: { tarjeta: true, yape: true },
        });
        setBusy(false, 'Reabrir pago');
        Culqi.open();
      });
    }).catch(function(err) {
      setBusy(false);
      showError(err.message);
    });
  });
})();
