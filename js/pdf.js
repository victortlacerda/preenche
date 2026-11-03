/* Preenche — PDF.
 *
 * Duas formas de gerar:
 *  1) print(items)   → janela de impressão do navegador ("Salvar como PDF").
 *                      Texto vetorial; vários documentos saem num PDF só.
 *  2) toFiles(items) → arquivos .pdf prontos, um por documento, sem janela.
 *                      Cada página vira uma imagem em alta resolução (~190 dpi)
 *                      com uma camada de texto invisível por cima, para o texto
 *                      continuar pesquisável e copiável. Usa jsPDF + html2canvas
 *                      (carregados só na primeira vez que são usados).
 *
 * Desenho dos documentos: .docx → docx-preview · .md → marked · .txt → texto.
 * Exposto como window.Pdf.
 */
(function (global) {
  'use strict';

  var PX_PER_PT = 96 / 72;
  var A4 = { w: 595.28, h: 841.89, mt: 56.69, mr: 56.69, mb: 56.69, ml: 56.69 };

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

  function container(id) {
    var el = document.getElementById(id);
    if (!el) { el = document.createElement('div'); el.id = id; document.body.appendChild(el); }
    return el;
  }

  function toPt(v, fallback) {
    var m = /^(-?[\d.]+)(pt|px|cm|mm|in)?$/.exec(String(v || '').trim());
    if (!m) return fallback;
    var n = parseFloat(m[1]), u = m[2] || 'px';
    return u === 'pt' ? n : u === 'px' ? n * 0.75 : u === 'cm' ? n * 28.3465 : u === 'mm' ? n * 2.83465 : n * 72;
  }

  /** Tamanho do papel e margens (em pt) que o docx-preview leu do .docx. */
  function docxGeometry(root) {
    var sec = root.querySelector('section.docx');
    if (!sec) return null;
    var s = sec.style;
    return {
      w: toPt(s.width, A4.w), h: toPt(s.minHeight || s.height, A4.h),
      mt: toPt(s.paddingTop, A4.mt), mr: toPt(s.paddingRight, A4.mr),
      mb: toPt(s.paddingBottom, A4.mb), ml: toPt(s.paddingLeft, A4.ml)
    };
  }

  /** Desenha um documento dentro de holder. Retorna a geometria da página. */
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
      return docxGeometry(box) || A4;
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
    return A4;
  }

  function waitImages(root) {
    var imgs = Array.prototype.slice.call(root.querySelectorAll('img'));
    return Promise.all(imgs.map(function (img) {
      return img.complete ? Promise.resolve() : new Promise(function (r) { img.onload = img.onerror = r; });
    }));
  }

  /* ------------------------------------------------------------------ *
   * 1) Impressão
   * ------------------------------------------------------------------ */
  function pageStyle(css) {
    var st = document.getElementById('print-page-style');
    if (!st) { st = document.createElement('style'); st.id = 'print-page-style'; document.head.appendChild(st); }
    st.textContent = css;
  }

  async function print(items, title) {
    var root = container('print-area');
    root.innerHTML = '';
    var g = null;
    for (var i = 0; i < items.length; i++) {
      var holder = document.createElement('div');
      holder.className = 'pdoc';
      root.appendChild(holder);
      var gi = await renderOne(items[i], holder);
      if (!g) g = gi;
    }
    g = g || A4;
    pageStyle('@page { size: ' + g.w + 'pt ' + g.h + 'pt; margin: ' + g.mt + 'pt ' + g.mr + 'pt ' + g.mb + 'pt ' + g.ml + 'pt; }');
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

  /* ------------------------------------------------------------------ *
   * 2) Arquivos PDF
   * ------------------------------------------------------------------ */
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve;
      s.onerror = function () { reject(new Error('Não foi possível carregar ' + src)); };
      document.head.appendChild(s);
    });
  }

  async function ensureLibs() {
    if (!global.jspdf) await loadScript('vendor/jspdf.umd.min.js');
    if (!global.html2canvas) await loadScript('vendor/html2canvas.min.js');
  }

  /** Palavras do documento com a posição de cada uma (px, relativo ao holder). */
  function collectWords(holder) {
    var base = holder.getBoundingClientRect(), words = [];
    var walker = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT, null);
    var range = document.createRange(), node;
    while ((node = walker.nextNode())) {
      var t = node.nodeValue;
      if (!t || !t.trim()) continue;
      var parent = node.parentElement;
      if (parent && (parent.closest('style') || getComputedStyle(parent).visibility === 'hidden')) continue;
      var re = /\S+/g, m;
      while ((m = re.exec(t)) !== null) {
        range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
        var rects = range.getClientRects();
        if (!rects.length) continue;
        var r = rects[0];
        if (r.width < 0.5 || r.height < 0.5) continue;
        words.push({ text: m[0], left: r.left - base.left, top: r.top - base.top, right: r.right - base.left, bottom: r.bottom - base.top });
      }
    }
    return words;
  }

  /** Onde cortar as páginas sem partir linhas, imagens ou quebras do Word. */
  function pageBreaks(holder, words, pageH) {
    var base = holder.getBoundingClientRect();
    var total = holder.scrollHeight;
    var boxes = words.map(function (w) { return { top: w.top, bottom: w.bottom }; });
    holder.querySelectorAll('img, svg, tr').forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.height > 0 && r.height < pageH * 0.9) boxes.push({ top: r.top - base.top, bottom: r.bottom - base.top });
    });
    var forced = [];
    holder.querySelectorAll('section.docx').forEach(function (sec, i) {
      if (i > 0) forced.push(sec.getBoundingClientRect().top - base.top);
    });

    var starts = [0], y = 0;
    while (y + pageH < total - 1) {
      var b = y + pageH;
      for (var f = 0; f < forced.length; f++) {
        if (forced[f] > y + 1 && forced[f] < b) { b = forced[f]; break; }
      }
      var changed = true, guard = 0;
      while (changed && guard++ < 200) {
        changed = false;
        for (var i = 0; i < boxes.length; i++) {
          var bx = boxes[i];
          if (bx.top < b - 0.5 && bx.bottom > b + 0.5 && bx.top > y + 1) { b = bx.top; changed = true; }
        }
      }
      if (b <= y + 20) b = y + pageH; // não há como evitar o corte
      starts.push(b); y = b;
    }
    // Página extra para cada quebra forçada ainda não usada (seções curtas)
    forced.forEach(function (fy) { if (starts.indexOf(fy) === -1 && fy > 0 && fy < total) starts.push(fy); });
    starts.sort(function (a, b) { return a - b; });
    var pages = [];
    for (var p = 0; p < starts.length; p++) {
      var end = p + 1 < starts.length ? starts[p + 1] : total;
      if (end - starts[p] > 1) pages.push({ top: starts[p], bottom: end });
    }
    return pages.length ? pages : [{ top: 0, bottom: total }];
  }

  function addTextLayer(pdf, words, page, g) {
    pdf.setFont('helvetica', 'normal');
    var lines = [];
    words.forEach(function (w) {
      var mid = (w.top + w.bottom) / 2; // a caixa da fonte pode passar um pouco da linha
      if (mid < page.top || mid >= page.bottom) return;
      var line = lines.length && Math.abs(lines[lines.length - 1].top - w.top) < (w.bottom - w.top) * 0.5 ? lines[lines.length - 1] : null;
      if (!line) { line = { top: w.top, words: [] }; lines.push(line); }
      line.words.push(w);
    });
    lines.forEach(function (line) {
      line.words.sort(function (a, b) { return a.left - b.left; });
      line.words.forEach(function (w, i) {
        var next = line.words[i + 1];
        var text = next ? w.text + ' ' : w.text;
        var hPt = (w.bottom - w.top) / PX_PER_PT;
        var size = Math.max(4, hPt * 0.8);
        var target = ((next ? next.left : w.right) - w.left) / PX_PER_PT;
        pdf.setFontSize(size);
        var natural = pdf.getTextWidth(text);
        var charSpace = text.length > 1 ? (target - natural) / (text.length - 1) : 0;
        var x = g.ml + w.left / PX_PER_PT;
        var yBase = g.mt + (w.bottom - page.top) / PX_PER_PT - hPt * 0.22;
        try { pdf.text(text, x, yBase, { renderingMode: 'invisible', charSpace: charSpace }); }
        catch (e) { /* caractere fora da fonte padrão: só não fica pesquisável */ }
      });
    });
  }

  async function renderPdfFile(item, stage, scale) {
    stage.innerHTML = '';
    var holder = document.createElement('div');
    holder.className = 'pdoc';
    stage.appendChild(holder);
    // largura provisória; o .docx define a geometria real ao ser desenhado
    holder.style.width = (A4.w - A4.ml - A4.mr) + 'pt';
    var g = await renderOne(item, holder);
    holder.style.width = (g.w - g.ml - g.mr) + 'pt';
    await waitImages(holder);
    if (document.fonts && document.fonts.ready) await document.fonts.ready;

    var pageH = (g.h - g.mt - g.mb) * PX_PER_PT;
    var words = collectWords(holder);
    var pages = pageBreaks(holder, words, pageH);
    var widthPx = holder.getBoundingClientRect().width;
    // A área fica fora da tela; só na cópia que o html2canvas fotografa ela vai para o canto (0,0).
    var onclone = function (d) {
      var st = d.getElementById('pdf-stage');
      st.style.left = '0px'; st.style.top = '0px'; st.style.zIndex = '2147483647';
    };

    var pdf = new global.jspdf.jsPDF({ unit: 'pt', format: [g.w, g.h], orientation: g.w > g.h ? 'landscape' : 'portrait', compress: true });
    for (var i = 0; i < pages.length; i++) {
      var pg = pages[i];
      if (i > 0) pdf.addPage([g.w, g.h], g.w > g.h ? 'landscape' : 'portrait');
      var canvas = await global.html2canvas(holder, {
        scale: scale, backgroundColor: '#ffffff', logging: false, useCORS: true,
        x: 0, y: pg.top, width: Math.ceil(widthPx), height: Math.ceil(pg.bottom - pg.top),
        scrollX: 0, scrollY: 0, windowWidth: Math.max(1280, Math.ceil(widthPx) + 40), onclone: onclone
      });
      // PNG: fundo branco puro e letras nítidas; páginas de texto ficam até menores que em JPEG
      pdf.addImage(canvas, 'PNG', g.ml, g.mt, widthPx / PX_PER_PT, (pg.bottom - pg.top) / PX_PER_PT, undefined, 'FAST');
      canvas.width = canvas.height = 0; // libera memória (celular)
      addTextLayer(pdf, words, pg, g);
    }
    pdf.setProperties({ title: item.name.replace(/\.[^.]+$/, ''), creator: 'Preenche' });
    return pdf.output('blob');
  }

  /**
   * items: [{name, ext, blob}] → [{name: 'x.pdf', ext: 'pdf', blob}]
   * onProgress(i, n) é chamado antes de cada documento.
   */
  async function toFiles(items, onProgress) {
    await ensureLibs();
    var stage = container('pdf-stage');
    var out = [];
    try {
      for (var i = 0; i < items.length; i++) {
        if (onProgress) onProgress(i + 1, items.length);
        await new Promise(function (r) { setTimeout(r, 0); });
        var blob = await renderPdfFile(items[i], stage, 2);
        out.push({ name: items[i].name.replace(/\.[^.]+$/, '') + '.pdf', ext: 'pdf', blob: blob });
      }
    } finally {
      stage.innerHTML = '';
    }
    return out;
  }

  global.Pdf = { print: print, toFiles: toFiles, _internals: { collectWords: collectWords, pageBreaks: pageBreaks, renderOne: renderOne } };
})(window);
