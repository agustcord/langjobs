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

  var api = { run: run, trace: trace, ids: ids, ariaLabels: ariaLabels, mark: mark, getDomCards: getDomCards, cards: [] };
  window.__LJF_DIAG = api;
  run();
  console.log('Comandos: __LJF_DIAG.run() | .trace("texto del título") | .ids() | .ariaLabels() | .mark()');
})();
