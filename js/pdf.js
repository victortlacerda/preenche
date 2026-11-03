/* Preenche — exportar em PDF.
 * Desenha os documentos já preenchidos numa área de impressão e abre a janela
 * de impressão do navegador ("Salvar como PDF"). O PDF sai com texto real
 * (selecionável e nítido), sem enviar nada para a internet.
 * .docx → docx-preview (mantém fontes, tabelas, negrito, imagens)
 * .md   → marked (HTML bruto desativado por segurança)
 * .txt  → texto com quebras preservadas
 * Exposto como window.Pdf.
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  var markedReady = false;
  function mdToHtml(text) {
    if (!markedReady) {
      // Não interpreta HTML escrito dentro do .md (evita scripts de modelos de terceiros)
      marked.use({ gfm: true, breaks: true, renderer: { html: function (t) { return esc(typeof t === 'string' ? t : (t && t.text) || ''); } } });
      markedReady = true;
    }
    var div = document.createElement('div');
    div.innerHTML = marked.parse(text);
    div.querySelectorAll('a[href]').forEach(function (a) {
      if (/^\s*(javascript|data|vbscript):/i.test(a.getAttribute('href'))) a.removeAttribute('href');
    });
    return div;
  }

  function area() {
    var el = document.getElementById('print-area');
    if (!el) { el = document.createElement('div'); el.id = 'print-area'; document.body.appendChild(el); }
    return el;
  }

  function pageStyle(css) {
    var st = document.getElementById('print-page-style');
    if (!st) { st = document.createElement('style'); st.id = 'print-page-style'; document.head.appendChild(st); }
    st.textContent = css;
  }

  /** Lê tamanho do papel e margens que o docx-preview aplicou à primeira página. */
  function docxPageCss(root) {
    var sec = root.querySelector('section.docx');
    if (!sec) return null;
    var s = sec.style;
    var w = s.width, h = s.minHeight || s.height;
    var pad = [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(function (v) { return v || '2cm'; });
    if (!w || !h) return null;
    return '@page { size: ' + w + ' ' + h + '; margin: ' + pad.join(' ') + '; }';
  }

  async function renderOne(item, holder) {
    if (item.ext === 'docx') {
      var box = document.createElement('div');
      box.className = 'pdoc-docx';
      holder.appendChild(box);
      await docx.renderAsync(item.blob, box, box, {
        inWrapper: false, ignoreWidth: false, ignoreHeight: false, breakPages: true,
        renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true,
        useBase64URL: true, experimental: false, ignoreLastRenderedPageBreak: true
      });
      return docxPageCss(box);
    }
    var text = (await item.blob.text()).replace(/^﻿/, '');
    if (item.ext === 'md') {
      var md = mdToHtml(text);
      md.className = 'pdoc-md';
      holder.appendChild(md);
    } else {
      var pre = document.createElement('div');
      pre.className = 'pdoc-txt';
      pre.textContent = text;
      holder.appendChild(pre);
    }
    return null;
  }

  function waitImages(root) {
    var imgs = Array.prototype.slice.call(root.querySelectorAll('img'));
    return Promise.all(imgs.map(function (img) {
      return img.complete ? Promise.resolve() : new Promise(function (r) { img.onload = img.onerror = r; });
    }));
  }

  /**
   * items: [{name, ext, blob}] — cada item começa numa página nova.
   * title: nome sugerido para o arquivo PDF.
   */
  async function print(items, title) {
    var root = area();
    root.innerHTML = '';
    var pageCss = null;
    for (var i = 0; i < items.length; i++) {
      var holder = document.createElement('div');
      holder.className = 'pdoc';
      root.appendChild(holder);
      var css = await renderOne(items[i], holder);
      if (!pageCss && css) pageCss = css;
    }
    pageStyle(pageCss || '@page { size: A4; margin: 2cm; }');
    await waitImages(root);

    var oldTitle = document.title;
    document.title = title; // o Chrome usa o título como nome do PDF
    var restored = false;
    function restore() {
      if (restored) return; restored = true;
      document.title = oldTitle;
      window.removeEventListener('afterprint', restore);
    }
    window.addEventListener('afterprint', restore);
    await new Promise(function (r) { setTimeout(r, 50); });
    window.print();
    setTimeout(restore, 1500);
  }

  global.Pdf = { print: print };
})(window);
