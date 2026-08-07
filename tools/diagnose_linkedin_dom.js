/*
 * LangJobs — Diagnóstico del DOM de LinkedIn (pegar en la consola del navegador)
 * ---------------------------------------------------------------------------
 * AUTOCONTENIDO A PROPÓSITO: no depende de LangJobsApp. La consola de la página
 * corre en el "main world" y NO ve los globals del content script (world
 * aislado), así que este script reimplementa el descubrimiento de tarjetas para
 * poder comparar "lo que la extensión debería encontrar" con "lo que se ve".
 *
 * Uso:
 *   1. Abrir linkedin.com/jobs/search-results/…  (lista cargada, F12 → Console)
 *   2. Pegar TODO este archivo y Enter.
 *   3. Comandos extra:
 *        __LJF_DIAG.run()                  → repetir el informe
 *        __LJF_DIAG.lines()                → ¿hay texto aprovechable en la tarjeta?
 *        __LJF_DIAG.internals()            → ¿el jobId vive en los internals del framework?
 *        __LJF_DIAG.trace('MKT Digital')   → cadena de ancestros de una tarjeta
 *        __LJF_DIAG.ids()                  → buscar ids de vacante en atributos
 *        __LJF_DIAG.mark()                 → pintar borde rojo en cada tarjeta
 *        __LJF_DIAG.cards                  → array de nodos detectados
 */
(function () {
  'use strict';

  var DISMISS_SEL =
    'button[aria-label^="Descartar empleo"], button[aria-label^="Dismiss job"], ' +
    'button[aria-label^="Descartar el empleo"], button[aria-label^="Ocultar empleo"]';
  var DETAIL_BODY_SEL = '#job-details, .jobs-description, .jobs-description__content, .jobs-box__html-content';
  var LEFT_LIST_MAX_X = 400; // zona de la lista izquierda (según forense 2026)

  function box(el) {
    var r = el.getBoundingClientRect();
    return {
      x: Math.round(r.left), y: Math.round(r.top),
      w: Math.round(r.width), h: Math.round(r.height),
    };
  }
  function display(el) {
    try { return getComputedStyle(el).display; } catch (e) { return '?'; }
  }
  function position(el) {
    try { return getComputedStyle(el).position; } catch (e) { return '?'; }
  }
  function desc(el) {
    if (!el) return 'null';
    var cls = (typeof el.className === 'string' && el.className) ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    return el.tagName + cls;
  }
  function hasLayoutBox(el) {
    return !!el && el.offsetWidth > 0 && el.offsetHeight > 0;
  }

  // Misma lógica que src/app.js → getDomCards (mantener sincronizadas).
  function cardFromAnchor(anchor, detailBody) {
    if (!anchor || !anchor.parentElement) return null;
    var el = anchor, boxed = null, solid = null;
    for (var i = 0; i < 25; i++) {
      var p = el.parentElement;
      if (!p || !p.querySelectorAll) break;
      if (p.querySelectorAll(DISMISS_SEL).length !== 1) break;
      if (detailBody && p.contains(detailBody) && !el.contains(detailBody)) break;
      el = p;
      if (hasLayoutBox(el)) boxed = el;
      if (display(el) !== 'contents') solid = el;
    }
    return boxed || solid || (el !== anchor ? el : null);
  }
  function getDomCards(root) {
    root = root || document;
    var cands = [];
    var detailBody = root.querySelector(DETAIL_BODY_SEL);
    var anchors = root.querySelectorAll(DISMISS_SEL);
    for (var i = 0; i < anchors.length; i++) {
      var c = cardFromAnchor(anchors[i], detailBody);
      if (c) cands.push(c);
    }
    var dj = root.querySelectorAll('[data-job-id]');
    for (var j = 0; j < dj.length; j++) cands.push(dj[j]);
    var links = root.querySelectorAll('a[href*="/jobs/view/"]');
    for (var k = 0; k < links.length; k++) {
      var lc = links[k].closest('[data-job-id]') || links[k].closest('li');
      if (lc) cands.push(lc);
    }
    var uniq = [];
    for (var m = 0; m < cands.length; m++) if (cands[m] && uniq.indexOf(cands[m]) === -1) uniq.push(cands[m]);
    return uniq.filter(function (c) {
      return !uniq.some(function (o) { return o !== c && c.contains(o); });
    });
  }

  function titleOf(card) {
    var btn = card.querySelector(DISMISS_SEL);
    if (btn) {
      var aria = btn.getAttribute('aria-label') || '';
      var mm = aria.match(/[«“"'‘](.+?)[»”"'’]/);
      if (mm) return mm[1];
      return aria.replace(/^(Descartar (el )?empleo|Dismiss job|Ocultar empleo)\s*/i, '');
    }
    var t = (card.textContent || '').replace(/\s+/g, ' ').trim();
    return t.slice(0, 40);
  }

  function run() {
    var anchors = document.querySelectorAll(DISMISS_SEL);
    var legacyIds = document.querySelectorAll('[data-job-id]');
    var viewLinks = document.querySelectorAll('a[href*="/jobs/view/"]');
    var currentIdLinks = document.querySelectorAll('a[href*="currentJobId="]');
    var cards = getDomCards(document);
    var badges = document.querySelectorAll('.llf-badge');
    var tagged = document.querySelectorAll('[data-llf-lang]');
    var hosts = document.querySelectorAll('.llf-badge-host');

    console.log('%c LangJobs — diagnóstico DOM ', 'background:#0a66c2;color:#fff;font-weight:700');
    console.log('URL:', location.href);
    console.table([{
      'botones ✕ (ancla 2026)': anchors.length,
      '[data-job-id] (legacy)': legacyIds.length,
      'a[/jobs/view/]': viewLinks.length,
      'a[currentJobId=]': currentIdLinks.length,
      'tarjetas detectadas': cards.length,
      'badges .llf-badge': badges.length,
      '[data-llf-lang]': tagged.length,
      '.llf-badge-host': hosts.length,
    }]);

    // Detalle por tarjeta: geometría, host válido y badge visible + en su sitio.
    var rows = cards.map(function (card, i) {
      var b = box(card);
      var badge = card.querySelector('.llf-badge');
      var bb = badge ? box(badge) : null;
      return {
        '#': i,
        titulo: titleOf(card).slice(0, 34),
        nodo: desc(card),
        display: display(card),
        position: position(card),
        'card x': b.x, 'card y': b.y, 'card w': b.w, 'card h': b.h,
        zona: b.x < LEFT_LIST_MAX_X ? 'LISTA-IZQ' : 'panel/otro',
        lang: card.getAttribute('data-llf-lang') || '—',
        badge: badge ? 'sí' : 'NO',
        'badge x': bb ? bb.x : '—',
        'badge y': bb ? bb.y : '—',
        'badge dentro': (badge && bb) ? ((bb.x >= b.x - 4 && bb.x <= b.x + b.w + 4 && bb.y >= b.y - 4 && bb.y <= b.y + b.h + 4) ? 'sí' : 'FUERA') : '—',
      };
    });
    console.table(rows);

    // ── Veredictos ──
    var left = rows.filter(function (r) { return r.zona === 'LISTA-IZQ'; });
    var leftWithBadge = left.filter(function (r) { return r.badge === 'sí'; });
    var badgesOutside = rows.filter(function (r) { return r['badge dentro'] === 'FUERA'; });
    var contentsHosts = cards.filter(function (c) { return display(c) === 'contents'; });
    var zeroBoxHosts = cards.filter(function (c) { return !hasLayoutBox(c); });
    var staticHosts = cards.filter(function (c) { return c.querySelector('.llf-badge') && position(c) === 'static'; });

    function verdict(ok, msg) {
      console.log('%c' + (ok ? ' OK  ' : ' FALLA ') + '%c ' + msg,
        'background:' + (ok ? '#16a34a' : '#dc2626') + ';color:#fff;font-weight:700', '');
    }
    verdict(cards.length > 0, 'tarjetas detectadas: ' + cards.length);
    verdict(left.length > 0, 'tarjetas en la lista izquierda (x < ' + LEFT_LIST_MAX_X + '): ' + left.length);
    verdict(left.length > 0 && leftWithBadge.length === left.length,
      'badges en la lista izquierda: ' + leftWithBadge.length + '/' + left.length);
    verdict(badgesOutside.length === 0, 'badges fuera de su tarjeta: ' + badgesOutside.length);
    verdict(contentsHosts.length === 0, 'tarjetas con display:contents (0x0, no ancla el badge): ' + contentsHosts.length);
    verdict(zeroBoxHosts.length === 0, 'tarjetas sin caja de layout: ' + zeroBoxHosts.length);
    verdict(staticHosts.length === 0, 'tarjetas con badge y position:static (falta .llf-badge-host): ' + staticHosts.length);

    if (!badges.length && tagged.length) {
      console.warn('Hay nodos con data-llf-lang pero 0 badges → LinkedIn re-renderizó y borró los badges; ' +
                   'el runtime debe reponerlos (ver processCard/hasBadge en src/app.js).');
    }
    if (!anchors.length) {
      console.warn('CERO botones ✕: LinkedIn cambió el aria-label o el idioma de la UI. ' +
                   'Buscar el nuevo ancla con: __LJF_DIAG.ariaLabels()');
    }

    api.cards = cards;
    return { cards: cards.length, badges: badges.length, izquierda: left.length };
  }

  // Cadena de ancestros desde el nodo que contiene un texto (forense original).
  function trace(needle, maxLevels) {
    maxLevels = maxLevels || 18;
    var all = document.querySelectorAll('span, p, div, strong, a, h3');
    var hit = null;
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.children.length === 0 && (el.textContent || '').indexOf(needle) !== -1) { hit = el; break; }
    }
    if (!hit) { console.warn('No se encontró un nodo hoja con el texto:', needle); return null; }
    var rows = [];
    var el2 = hit;
    for (var lvl = 0; lvl <= maxLevels && el2; lvl++) {
      var b = box(el2);
      rows.push({
        nivel: 'L' + lvl,
        nodo: desc(el2),
        display: display(el2),
        position: position(el2),
        w: b.w, h: b.h, x: b.x, y: b.y,
        hijos: el2.children.length,
        hermanos: el2.parentElement ? el2.parentElement.children.length - 1 : 0,
        '✕ dentro': el2.querySelectorAll ? el2.querySelectorAll(DISMISS_SEL).length : 0,
        'aria-label': (el2.getAttribute && el2.getAttribute('aria-label')) || '',
      });
      el2 = el2.parentElement;
    }
    console.log('%c Cadena de ancestros de: ' + needle + ' ', 'background:#0a66c2;color:#fff');
    console.table(rows);
    console.log('Regla LangJobs: la tarjeta es el ancestro MÁS EXTERNO con "✕ dentro"=1 y caja propia (w>0,h>0).');
    return rows;
  }

  // Busca ids de vacante escondidos en atributos de la primera tarjeta.
  function ids() {
    var cards = api.cards && api.cards.length ? api.cards : getDomCards(document);
    if (!cards.length) { console.warn('sin tarjetas'); return []; }
    var out = [];
    cards.slice(0, 3).forEach(function (card, ci) {
      var nodes = [card].concat(Array.prototype.slice.call(card.querySelectorAll('*')));
      nodes.forEach(function (n) {
        (n.getAttributeNames ? n.getAttributeNames() : []).forEach(function (name) {
          if (name === 'class' || name === 'style') return;
          var v = n.getAttribute(name) || '';
          if (/\d{5,14}/.test(v) || name.indexOf('job') !== -1 || name.indexOf('urn') !== -1) {
            out.push({ tarjeta: ci, nodo: desc(n), atributo: name, valor: v.slice(0, 90) });
          }
        });
      });
    });
    console.table(out);
    if (!out.length) console.warn('Ningún atributo con id numérico: la tarjeta NO expone jobId (usar título como clave).');
    return out;
  }

  // Inventario de aria-labels: para encontrar el nuevo ancla si LinkedIn lo cambia.
  function ariaLabels(limit) {
    var map = {};
    document.querySelectorAll('[aria-label]').forEach(function (el) {
      var k = (el.getAttribute('aria-label') || '').replace(/«.*?»|".*?"/g, '«…»').slice(0, 60);
      map[el.tagName + ' | ' + k] = (map[el.tagName + ' | ' + k] || 0) + 1;
    });
    var rows = Object.keys(map).map(function (k) { return { 'aria-label (normalizado)': k, veces: map[k] }; })
      .sort(function (a, b) { return b.veces - a.veces; })
      .slice(0, limit || 30);
    console.table(rows);
    console.log('El ancla de tarjeta es el aria-label que se repite ~1 vez por vacante (25 por página).');
    return rows;
  }

  // ── Medición: ¿cuánto texto APROVECHABLE tiene la tarjeta? ────────────────
  // Hoy el detector recibe solo título + empresa. El resto del texto de la
  // tarjeta es chrome de UI (está en el idioma de la interfaz, así que sesgaría
  // la detección). Esto mide si hay alguna línea con texto REAL del aviso
  // (preview de descripción, insight) que se pueda sumar como señal.
  var UI_NOISE = /^(promocionado|promoted|patrocinad|postulaci[oó]n sencilla|solicitud sencilla|easy apply|guardar|guardado|save|saved|nuevo|new|verificado|verified|visto|viewed|ver empleo|ver oferta|contrataci[oó]n activa|revisado por|respuesta|se busca|hace \d|\d+ (d[ií]a|hora|semana|mes|day|hour|week|month)|candidat|solicitante|applicant|es|en|\?\?)/i;
  var META_RE = /(remoto|remote|h[íi]brido|hybrid|presencial|on-?site|jornada|full[- ]time|part[- ]time|contrato|pasant[ií]a|internship)/i;

  function leafLines(card) {
    var out = [];
    var nodes = card.querySelectorAll('p, span, div, strong, h1, h2, h3, li');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.children && n.children.length > 0) continue;
      if (n.closest && n.closest('button, .llf-badge')) continue;
      var t = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length > 400) continue;
      if (out.indexOf(t) === -1) out.push(t);
    }
    return out;
  }

  function lines(limit, quiet) {
    var cards = api.cards && api.cards.length ? api.cards : getDomCards(document);
    if (!cards.length) { if (!quiet) console.warn('sin tarjetas'); return { cardsWithExtra: 0, extras: [] }; }
    var rows = [];
    var extras = [];
    var cardsWithExtra = 0;

    cards.slice(0, limit || cards.length).forEach(function (card, ci) {
      var title = titleOf(card).replace(/\s+/g, ' ').trim();
      var ls = leafLines(card);
      var seenTitle = false;
      var companyTaken = false;
      var extraEnEstaTarjeta = 0;

      ls.forEach(function (t, li) {
        var tipo;
        if (title && (t === title || t.indexOf(title) === 0)) { tipo = 'TÍTULO'; seenTitle = true; }
        else if (UI_NOISE.test(t)) tipo = 'ruido UI';
        else if (META_RE.test(t) || /[()]/.test(t) || /^\d/.test(t)) tipo = 'ubic/meta';
        else if (seenTitle && !companyTaken) { tipo = 'EMPRESA'; companyTaken = true; }
        else { tipo = '★ EXTRA'; extraEnEstaTarjeta++; extras.push(t); }
        rows.push({ '#': ci, línea: li, tipo: tipo, chars: t.length, texto: t.slice(0, 70) });
      });
      if (extraEnEstaTarjeta > 0) cardsWithExtra++;
    });

    var totalChars = extras.reduce(function (a, t) { return a + t.length; }, 0);
    if (quiet) return { cardsWithExtra: cardsWithExtra, extras: extras, totalChars: totalChars };

    console.log('%c Texto por tarjeta (★ EXTRA = señal potencialmente aprovechable) ',
      'background:#0a66c2;color:#fff;font-weight:700');
    console.table(rows);

    console.log('%c RESULTADO DE LA MEDICIÓN ', 'background:#111;color:#fff;font-weight:700');
    console.log('Tarjetas analizadas:        ', Math.min(cards.length, limit || cards.length));
    console.log('Tarjetas con línea ★ EXTRA: ', cardsWithExtra);
    console.log('Líneas ★ EXTRA totales:     ', extras.length, '(' + totalChars + ' chars)');
    if (extras.length) {
      console.log('Muestras ★ EXTRA:');
      extras.slice(0, 12).forEach(function (t) { console.log('   ·', t.slice(0, 120)); });
      console.log('%c → Revisar si es texto DEL AVISO (sirve) o de la interfaz (sesga: NO usar).',
        'color:#b45309;font-weight:700');
    } else {
      console.log('%c → No hay texto extra: la tarjeta solo ofrece título + empresa + metadatos.',
        'color:#b45309;font-weight:700');
      console.log('   Conclusión: el idioma de las «??» solo se resuelve con la descripción');
      console.log('   (abrir la vacante, o recuperar el jobId → __LJF_DIAG.internals()).');
    }
    return { cardsWithExtra: cardsWithExtra, extras: extras, totalChars: totalChars };
  }

  // ── Probe: ¿el jobId vive en los internals del framework? ─────────────────
  // Si aparece, se puede reactivar la Capa 4 (fetch de la descripción) para
  // TODAS las tarjetas. Ojo: en la extensión esto exige un script en
  // world:"MAIN" (el world aislado no ve los expandos de la página); en el
  // userscript de Tampermonkey ya corre en el world correcto.
  function internals(maxCards, quiet) {
    var cards = api.cards && api.cards.length ? api.cards : getDomCards(document);
    if (!cards.length) { if (!quiet) console.warn('sin tarjetas'); return []; }

    // Acepta urn:li:jobPosting:, urn:li:fs_jobPosting:, urn:li:fsd_jobPosting:
    // y variantes (LinkedIn cambió el prefijo entre versiones de Voyager).
    var URN_RE = /urn:li:[a-z_]*job[a-z]*:(\d{5,14})/i;
    var KEY_RE = /(job.?id|jobposting|entityurn|objecturn|trackingid|reference|preDashEntityUrn)/i;
    var findings = [];

    function scan(root, rootLabel, cardIdx) {
      var seen = new Set();
      var queue = [{ v: root, path: rootLabel, d: 0 }];
      var budget = 4000;
      while (queue.length && budget-- > 0) {
        var it = queue.shift();
        var v = it.v;
        if (v == null || it.d > 6) continue;
        var t = typeof v;
        if (t === 'string') {
          var m = v.match(URN_RE);
          if (m) findings.push({ tarjeta: cardIdx, jobId: m[1], vía: 'urn', path: it.path, valor: v.slice(0, 70) });
          else if (/^\d{7,14}$/.test(v) && KEY_RE.test(it.path)) {
            findings.push({ tarjeta: cardIdx, jobId: v, vía: 'clave+dígitos', path: it.path, valor: v });
          }
          continue;
        }
        if (t === 'number') {
          if (v > 1e6 && KEY_RE.test(it.path)) {
            findings.push({ tarjeta: cardIdx, jobId: String(v), vía: 'clave+número', path: it.path, valor: String(v) });
          }
          continue;
        }
        if (t !== 'object') continue;
        if (v.nodeType) continue;              // no bajar al DOM
        if (seen.has(v)) continue;
        seen.add(v);
        var keys;
        try { keys = Object.keys(v); } catch (e) { continue; }
        for (var i = 0; i < keys.length && i < 60; i++) {
          var k = keys[i];
          if (k === 'return' || k === '_owner' || k === 'stateNode' || k === 'alternate') continue; // ciclos de React
          var val;
          try { val = v[k]; } catch (e) { continue; }
          queue.push({ v: val, path: it.path + '.' + k, d: it.d + 1 });
        }
      }
    }

    var expandoReport = [];
    cards.slice(0, maxCards || 3).forEach(function (card, ci) {
      var nodes = [card].concat(Array.prototype.slice.call(card.querySelectorAll('*')).slice(0, 40));
      nodes.forEach(function (n) {
        var keys;
        try { keys = Object.keys(n); } catch (e) { return; }
        keys.forEach(function (k) {
          if (k.indexOf('__') !== 0 && !/react|ember|vue|svelte/i.test(k)) return;
          expandoReport.push({ tarjeta: ci, nodo: desc(n), expando: k });
          try { scan(n[k], k, ci); } catch (e) {}
        });
      });
    });

    var uniqQ = [];
    findings.forEach(function (f) {
      if (!uniqQ.some(function (u) { return u.tarjeta === f.tarjeta && u.jobId === f.jobId; })) uniqQ.push(f);
    });
    if (quiet) {
      api._lastInternals = {
        expandos: expandoReport.length,
        expandoKeys: expandoReport.slice(0, 6).map(function (e) { return e.expando; }),
        hallazgos: uniqQ.slice(0, 6),
      };
      return uniqQ;
    }

    console.log('%c Internals del framework en las tarjetas ', 'background:#0a66c2;color:#fff;font-weight:700');
    if (!expandoReport.length) {
      console.log('%c FALLA %c No se encontró NINGÚN expando (__reactProps$, __ember, …).',
        'background:#dc2626;color:#fff;font-weight:700', '');
      console.log('Dos explicaciones posibles:');
      console.log('  1. Estás pegando esto en un world AISLADO (no debería pasar en la consola normal).');
      console.log('  2. LinkedIn no deja props del framework en los nodos → el jobId no se puede recuperar por esta vía.');
      console.log('Probá también, con una tarjeta seleccionada en Elements:  Object.keys($0)');
      return [];
    }
    console.table(expandoReport.slice(0, 20));

    var uniq = [];
    findings.forEach(function (f) {
      if (!uniq.some(function (u) { return u.tarjeta === f.tarjeta && u.jobId === f.jobId; })) uniq.push(f);
    });
    if (uniq.length) {
      console.log('%c OK  %c jobId RECUPERABLE desde los internals — ' + uniq.length + ' hallazgo(s)',
        'background:#16a34a;color:#fff;font-weight:700', '');
      console.table(uniq.slice(0, 20));
      console.log('Siguiente paso: implementar la lectura en el userscript (ya corre en el main world)');
      console.log('y evaluar world:"MAIN" para la extensión. Reactiva la Capa 4 en TODAS las tarjetas.');
    } else {
      console.log('%c FALLA %c Hay expandos pero ningún jobId/urn adentro (profundidad 6, 4000 nodos).',
        'background:#dc2626;color:#fff;font-weight:700', '');
      console.log('Queda la vía de interceptar la respuesta de la API interna que LinkedIn ya pidió.');
    }
    return uniq;
  }

  // ── Cacería dirigida: buscar un jobId CONOCIDO en toda la página ──────────
  // internals() buscó patrones a ciegas y no encontró nada a profundidad 6.
  // Esto es distinto: la URL nos da el id de la vacante ABIERTA, así que
  // buscamos ese string exacto y averiguamos DÓNDE vive. Cubre las 5 vías
  // posibles, en orden de conveniencia para la extensión:
  //   1. Texto del DOM (<code>/<script> con los modelos de Voyager) → legible
  //      desde un content script en world AISLADO. Es la vía ideal.
  //   2. Atributos de algún elemento.
  //   3. Expandos de React (profundo, siguiendo memoizedProps/child/sibling).
  //   4. Globals de window.
  //   5. Nada → solo queda interceptar la respuesta de red.
  function hunt(knownId) {
    var known = String(knownId || (location.search.match(/currentJobId=(\d+)/) || [])[1] || '');
    if (!known) {
      console.warn('No hay currentJobId en la URL: abrí una vacante primero, o pasá el id: __LJF_DIAG.hunt("4442412166")');
      return null;
    }
    console.log('%c Cacería del jobId ' + known + ' ', 'background:#0a66c2;color:#fff;font-weight:700');
    var out = { jobId: known, via: [], detalle: {} };

    // ── 1. Blobs de JSON embebidos en el DOM ──
    var blobs = document.querySelectorAll('code, script[type="application/json"], script[type="application/ld+json"]');
    var blobsConId = 0, blobsConJobPosting = 0, primerHit = null, muestraShape = '';
    for (var i = 0; i < blobs.length; i++) {
      var txt = '';
      try { txt = blobs[i].textContent || ''; } catch (e) { continue; }
      if (!txt || txt.length < 20) continue;
      var tieneJP = txt.indexOf('jobPosting') !== -1;
      if (tieneJP) blobsConJobPosting++;
      if (txt.indexOf(known) !== -1) {
        blobsConId++;
        if (!primerHit) {
          primerHit = { idx: i, tag: blobs[i].tagName, id: blobs[i].id || '', chars: txt.length };
          // Reportar la FORMA (claves), no el contenido: puede haber datos personales.
          var pos = txt.indexOf(known);
          var win = txt.slice(Math.max(0, pos - 400), pos + 400);
          var keys = {};
          (win.match(/"([a-zA-Z_][a-zA-Z0-9_]{2,40})":/g) || []).forEach(function (k) {
            keys[k.replace(/[":]/g, '')] = true;
          });
          muestraShape = Object.keys(keys).slice(0, 40).join(', ');
          api._huntWindow = win; // crudo, para inspeccionar A MANO en la consola
        }
      }
    }
    out.detalle.blobs = {
      total: blobs.length, con_jobPosting: blobsConJobPosting, con_el_id: blobsConId,
      primer_hit: primerHit, claves_alrededor: muestraShape,
    };
    if (blobsConId > 0) out.via.push('dom-json-blob');

    // ── 2. Atributos ──
    var attrHit = null;
    var all = document.querySelectorAll('*');
    for (var j = 0; j < all.length && !attrHit; j++) {
      var el = all[j];
      var names;
      try { names = el.getAttributeNames ? el.getAttributeNames() : []; } catch (e) { continue; }
      for (var n = 0; n < names.length; n++) {
        if (names[n] === 'class' || names[n] === 'style') continue;
        // OJO: no llamar `v` a esta variable — colisiona con la función de
        // veredicto declarada más abajo (var gana sobre function declaration).
        var attrVal = el.getAttribute(names[n]) || '';
        if (attrVal.indexOf(known) !== -1) {
          attrHit = { nodo: desc(el), atributo: names[n], valor: attrVal.slice(0, 90) };
          break;
        }
      }
    }
    out.detalle.atributo = attrHit;
    if (attrHit) out.via.push('atributo');

    // ── 3. Expandos de React, profundo ──
    var reactHit = null;
    var seen = new Set();
    var budget = 40000;
    var queue = [];
    var roots = document.querySelectorAll('div');
    for (var r = 0; r < roots.length && queue.length < 400; r++) {
      var keysR;
      try { keysR = Object.keys(roots[r]); } catch (e) { continue; }
      for (var kk = 0; kk < keysR.length; kk++) {
        if (keysR[kk].indexOf('__react') === 0) {
          queue.push({ v: roots[r][keysR[kk]], path: keysR[kk], d: 0 });
        }
      }
    }
    out.detalle.react_raices = queue.length;
    while (queue.length && budget-- > 0 && !reactHit) {
      var it = queue.shift();
      var val = it.v;
      if (val == null || it.d > 12) continue;
      var t = typeof val;
      if (t === 'string') {
        if (val.indexOf(known) !== -1) reactHit = { path: it.path, valor: val.slice(0, 90) };
        continue;
      }
      if (t === 'number') {
        if (String(val).indexOf(known) !== -1) reactHit = { path: it.path, valor: String(val) };
        continue;
      }
      if (t !== 'object' || val.nodeType) continue;
      if (seen.has(val)) continue;
      seen.add(val);
      var ks;
      try { ks = Object.keys(val); } catch (e) { continue; }
      for (var m = 0; m < ks.length && m < 80; m++) {
        var key = ks[m];
        if (key === '_owner' || key === 'stateNode' || key === 'alternate' || key === '_debugOwner') continue;
        // 'return' (fiber padre) sí se sigue, pero solo un nivel para no explotar.
        if (key === 'return' && it.d > 1) continue;
        var sub;
        try { sub = val[key]; } catch (e) { continue; }
        queue.push({ v: sub, path: it.path + '.' + key, d: it.d + 1 });
      }
    }
    out.detalle.react = reactHit;
    if (reactHit) out.via.push('react-expando');

    // ── 4. Globals de window ──
    var globalHit = null;
    try {
      var gk = Object.keys(window);
      for (var g = 0; g < gk.length && !globalHit; g++) {
        var name = gk[g];
        if (name === '__LJF_DIAG') continue; // no contarnos a nosotros mismos
        if (!/^__|linkedin|voyager|artdeco|preload|apollo|redux|store/i.test(name)) continue;
        var gv;
        try { gv = window[name]; } catch (e) { continue; }
        var s = '';
        try { s = (typeof gv === 'string') ? gv : JSON.stringify(gv).slice(0, 400000); } catch (e) { continue; }
        if (s && s.indexOf(known) !== -1) globalHit = { global: name, tipo: typeof gv };
      }
    } catch (e) {}
    out.detalle.global = globalHit;
    if (globalHit) out.via.push('window-global');

    // ── Veredicto ──
    var say = function (ok, msg) {
      console.log('%c ' + (ok ? 'OK  ' : '—   ') + '%c ' + msg,
        'background:' + (ok ? '#16a34a' : '#4b5563') + ';color:#fff;font-weight:700', '');
    };
    say(blobsConId > 0, 'JSON embebido en el DOM: ' + blobsConId + ' blob(s) con el id, ' +
      blobsConJobPosting + ' con "jobPosting" (de ' + blobs.length + ' totales)');
    say(!!attrHit, 'atributo con el id' + (attrHit ? ': ' + attrHit.atributo + ' en ' + attrHit.nodo : ''));
    say(!!reactHit, 'expando de React con el id' + (reactHit ? ': ' + reactHit.path.slice(0, 80) : ''));
    say(!!globalHit, 'global de window con el id' + (globalHit ? ': window.' + globalHit.global : ''));

    if (muestraShape) {
      console.log('%c Claves alrededor del id (¿hay description/title?) ', 'background:#111;color:#0f0');
      console.log(muestraShape);
      console.log('Para ver el texto crudo (puede tener datos personales, NO pegarlo a ciegas): __LJF_DIAG._huntWindow');
    }
    if (!out.via.length) {
      console.log('%c Ninguna vía DOM/JS expone el id → solo queda interceptar la respuesta de red. ',
        'background:#b45309;color:#fff;font-weight:700');
    }

    var json = JSON.stringify(out, null, 2);
    console.log(json);
    try { if (typeof copy === 'function') { copy(json); console.log('%c 📋 Copiado al portapapeles ', 'background:#16a34a;color:#fff;font-weight:700'); } } catch (e) {}
    return out;
  }

  function mark() {
    var cards = api.cards && api.cards.length ? api.cards : getDomCards(document);
    cards.forEach(function (c, i) {
      c.style.outline = '2px solid red';
      c.style.outlineOffset = '-2px';
      var tag = document.createElement('span');
      tag.textContent = '#' + i;
      tag.style.cssText = 'position:absolute;left:2px;top:2px;z-index:2147483647;background:red;color:#fff;font:10px monospace;padding:0 3px;';
      if (getComputedStyle(c).position === 'static') c.style.position = 'relative';
      c.appendChild(tag);
    });
    console.log('Marcadas', cards.length, 'tarjetas. Si un borde rojo abarca varias vacantes → el descubrimiento devuelve un contenedor compartido.');
    return cards.length;
  }

  // ── UN comando que junta todo y lo deja en el portapapeles ────────────────
  // Pensado para no tener que ir comando por comando ni mandar capturas: corre
  // los tres diagnósticos, arma un JSON compacto y lo copia (console.copy).
  function report() {
    var cards = getDomCards(document);
    api.cards = cards;

    var langs = { es: 0, en: 0, unknown: 0, sin_marca: 0 };
    var sinBadge = 0;
    var fueraDeTarjeta = 0;
    var izquierda = 0;
    var unknownTitles = [];

    cards.forEach(function (card) {
      var l = card.getAttribute('data-llf-lang');
      if (l === 'es') langs.es++;
      else if (l === 'en') langs.en++;
      else if (l === 'unknown') { langs.unknown++; unknownTitles.push(titleOf(card).slice(0, 50)); }
      else langs.sin_marca++;

      var b = box(card);
      if (b.x < LEFT_LIST_MAX_X) izquierda++;
      var badge = card.querySelector('.llf-badge');
      if (!badge) sinBadge++;
      else {
        var bb = box(badge);
        if (!(bb.x >= b.x - 4 && bb.x <= b.x + b.w + 4 && bb.y >= b.y - 4 && bb.y <= b.y + b.h + 4)) fueraDeTarjeta++;
      }
    });

    var med = lines(null, true);
    internals(3, true);
    var int = api._lastInternals || { expandos: 0, expandoKeys: [], hallazgos: [] };

    var out = {
      version_diag: '2026-08-06',
      url: location.href.slice(0, 160),
      idioma_ui: document.documentElement.getAttribute('lang') || '?',
      conteos: {
        botones_dismiss: document.querySelectorAll(DISMISS_SEL).length,
        data_job_id: document.querySelectorAll('[data-job-id]').length,
        links_jobs_view: document.querySelectorAll('a[href*="/jobs/view/"]').length,
        tarjetas: cards.length,
        badges: document.querySelectorAll('.llf-badge').length,
        en_lista_izquierda: izquierda,
        sin_badge: sinBadge,
        badges_fuera_de_su_tarjeta: fueraDeTarjeta,
      },
      idiomas: langs,
      pct_unknown: cards.length ? Math.round((langs.unknown / cards.length) * 100) + '%' : 'n/a',
      titulos_unknown: unknownTitles.slice(0, 10),
      medicion_texto_extra: {
        tarjetas_con_texto_extra: med.cardsWithExtra,
        lineas_extra: med.extras.length,
        chars_extra: med.totalChars || 0,
        muestras: med.extras.slice(0, 8).map(function (t) { return t.slice(0, 110); }),
      },
      internals_framework: {
        expandos_encontrados: int.expandos,
        claves: int.expandoKeys,
        jobid_recuperable: int.hallazgos.length > 0,
        hallazgos: int.hallazgos.map(function (h) { return { jobId: h.jobId, via: h.vía, path: String(h.path).slice(0, 90) }; }),
      },
    };

    var json = JSON.stringify(out, null, 2);
    console.log('%c INFORME COMPLETO ', 'background:#0a66c2;color:#fff;font-weight:700');
    console.log(json);
    try {
      if (typeof copy === 'function') {
        copy(json);
        console.log('%c 📋 Copiado al portapapeles — pegalo tal cual en el chat ',
          'background:#16a34a;color:#fff;font-weight:700');
      } else {
        console.log('(no hay copy() disponible: seleccioná el JSON de arriba y copialo a mano)');
      }
    } catch (e) {
      console.log('(no se pudo copiar automáticamente; copiá el JSON de arriba)');
    }
    return out;
  }

  var api = {
    report: report, hunt: hunt,
    run: run, trace: trace, ids: ids, ariaLabels: ariaLabels, mark: mark,
    lines: lines, internals: internals,
    getDomCards: getDomCards, cards: [],
  };
  window.__LJF_DIAG = api;
  run();
  console.log('%c → Para el informe completo (y copiado al portapapeles):  __LJF_DIAG.report()',
    'background:#111;color:#0f0;font-weight:700');
  console.log('%c → Cacería del jobId de la vacante abierta (dice si se puede recuperar):  __LJF_DIAG.hunt()',
    'background:#111;color:#0f0;font-weight:700');
  console.log('Otros: .lines() | .internals() | .trace("texto del título") | .ids() | .ariaLabels() | .mark()');
})();
