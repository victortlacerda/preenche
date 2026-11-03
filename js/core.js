/* Preenche — núcleo: leitura de documentos, detecção de campos e substituição.
 * Funciona 100% no navegador. Depende de JSZip (vendor/jszip.min.js).
 * Exposto como window.Core.
 */
(function (global) {
  'use strict';

  var W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  var MC_NS = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
  var XML_NS = 'http://www.w3.org/XML/1998/namespace';
  var DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  /* ------------------------------------------------------------------ *
   * Marcadores de campo
   * ------------------------------------------------------------------ */
  var DELIMITERS = {
    chaves: { id: 'chaves', label: '{{campo}}', open: '{{', close: '}}', skipLinks: false },
    duplo: { id: 'duplo', label: '[[campo]]', open: '[[', close: ']]', skipLinks: false },
    colchete: { id: 'colchete', label: '[campo]', open: '[', close: ']', skipLinks: true }
  };

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Chave de comparação: sem acento, minúscula, espaços colapsados. */
  function normalizeKey(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function markerRegex(delim) {
    var o = escapeRe(delim.open), c = escapeRe(delim.close);
    var src = o + '\\s*((?:(?!' + o + '|' + c + ')[^\\n\\r]){1,80}?)\\s*' + c + (delim.skipLinks ? '(?!\\()' : '');
    return new RegExp(src, 'g');
  }

  /**
   * Localiza tudo o que deve ser trocado em um trecho de texto.
   * ctx = {
   *   delim,                         // um item de DELIMITERS
   *   lookup(key) -> {id, value} | null,   // value: string | null (null = manter como está)
   *   literals: [{id, find, value}]  // substituições de texto livre
   * }
   * Retorna [{start, end, raw, kind:'marker'|'literal', key, name, id, value}], sem sobreposição.
   */
  function findMatches(text, ctx) {
    var found = [];
    var m, re = markerRegex(ctx.delim);
    while ((m = re.exec(text)) !== null) {
      var name = m[1].trim();
      if (!name) continue;
      var key = normalizeKey(name);
      var hit = ctx.lookup ? ctx.lookup(key) : null;
      found.push({
        start: m.index, end: m.index + m[0].length, raw: m[0], kind: 'marker',
        key: key, name: name, id: hit ? hit.id : null,
        value: hit && hit.value != null ? hit.value : null
      });
    }
    var lits = ctx.literals || [];
    for (var i = 0; i < lits.length; i++) {
      var lit = lits[i];
      if (!lit.find) continue;
      var pos = 0, at;
      while ((at = text.indexOf(lit.find, pos)) !== -1) {
        found.push({
          start: at, end: at + lit.find.length, raw: lit.find, kind: 'literal',
          key: null, name: lit.find, id: lit.id,
          value: lit.value != null ? lit.value : null
        });
        pos = at + lit.find.length;
      }
    }
    // Ordena e remove sobreposições (vence quem começa antes; em empate, o mais longo)
    found.sort(function (a, b) { return a.start - b.start || b.end - a.end; });
    var out = [], lastEnd = -1;
    for (var k = 0; k < found.length; k++) {
      if (found[k].start >= lastEnd) { out.push(found[k]); lastEnd = found[k].end; }
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * XML / DOCX
   * ------------------------------------------------------------------ */
  function parseXml(xml) {
    var dom = new DOMParser().parseFromString(xml, 'application/xml');
    if (dom.getElementsByTagName('parsererror').length) {
      throw new Error('Não foi possível ler o conteúdo interno do .docx.');
    }
    return dom;
  }

  function serializeXml(dom) {
    var s = new XMLSerializer().serializeToString(dom);
    if (s.indexOf('<?xml') !== 0) s = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + s;
    return s;
  }

  function isW(node, name) { return node && node.namespaceURI === W_NS && node.localName === name; }

  function inFallback(node) {
    for (var n = node.parentNode; n && n.nodeType === 1; n = n.parentNode) {
      if (n.namespaceURI === MC_NS && n.localName === 'Fallback') return true;
    }
    return false;
  }

  function ownerParagraph(node) {
    for (var n = node.parentNode; n && n.nodeType === 1; n = n.parentNode) {
      if (isW(n, 'p')) return n;
    }
    return null;
  }

  // includeFallback=false na leitura (evita contar a caixa de texto duas vezes);
  // true na geração (a cópia de compatibilidade também precisa ser trocada).
  function docxParagraphs(dom, includeFallback) {
    var all = dom.getElementsByTagNameNS(W_NS, 'p'), out = [];
    for (var i = 0; i < all.length; i++) if (includeFallback || !inFallback(all[i])) out.push(all[i]);
    return out;
  }

  function paragraphTextNodes(p) {
    var all = p.getElementsByTagNameNS(W_NS, 't'), out = [];
    for (var i = 0; i < all.length; i++) if (ownerParagraph(all[i]) === p) out.push(all[i]);
    return out;
  }

  function setText(t, str) {
    t.textContent = str;
    t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  }

  var PART_RE = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;

  function partLabel(name) {
    if (/document\.xml$/.test(name)) return 'Corpo';
    if (/header/.test(name)) return 'Cabeçalho';
    if (/footer/.test(name)) return 'Rodapé';
    if (/footnotes/.test(name)) return 'Notas de rodapé';
    return 'Notas de fim';
  }

  function partOrder(name) {
    if (/document\.xml$/.test(name)) return 0;
    if (/header/.test(name)) return 1;
    if (/footer/.test(name)) return 2;
    return 3;
  }

  /**
   * Aplica as substituições em um parágrafo do Word, mesmo quando o campo foi
   * dividido pelo Word em vários trechos (<w:r>/<w:t>). O valor herda a
   * formatação do trecho onde o marcador começa.
   */
  function applyToParagraph(p, ctx) {
    var ts = paragraphTextNodes(p);
    if (!ts.length) return false;
    var starts = [], lens = [], full = '';
    for (var i = 0; i < ts.length; i++) {
      var s = ts[i].textContent;
      starts.push(full.length); lens.push(s.length); full += s;
    }
    var ms = findMatches(full, ctx).filter(function (m) { return m.value != null; });
    if (!ms.length) return false;

    var doc = p.ownerDocument;
    var cur = ts.map(function (t) { return t.textContent; });

    for (var k = ms.length - 1; k >= 0; k--) {
      var m = ms[k], i0 = -1, i1 = -1;
      for (var a = 0; a < ts.length; a++) {
        if (lens[a] > 0 && starts[a] + lens[a] > m.start) { i0 = a; break; }
      }
      for (var b = i0; b < ts.length; b++) {
        if (lens[b] > 0 && starts[b] + lens[b] >= m.end) { i1 = b; break; }
      }
      if (i0 < 0 || i1 < 0) continue;

      var before = cur[i0].slice(0, m.start - starts[i0]);
      var after = cur[i1].slice(m.end - starts[i1]);
      var lines = String(m.value).split(/\r\n|\r|\n/);

      cur[i0] = before + lines[0];
      setText(ts[i0], cur[i0]);

      var last = ts[i0];
      for (var L = 1; L < lines.length; L++) {
        var run = last.parentNode;
        var br = doc.createElementNS(W_NS, 'w:br');
        var nt = doc.createElementNS(W_NS, 'w:t');
        setText(nt, lines[L]);
        run.insertBefore(br, last.nextSibling);
        run.insertBefore(nt, br.nextSibling);
        last = nt;
      }

      if (i1 === i0) {
        if (last === ts[i0]) { cur[i0] += after; setText(ts[i0], cur[i0]); }
        else setText(last, last.textContent + after);
      } else {
        for (var mid = i0 + 1; mid < i1; mid++) { cur[mid] = ''; setText(ts[mid], ''); }
        cur[i1] = after; setText(ts[i1], after);
      }
    }
    return true;
  }

  /* ------------------------------------------------------------------ *
   * Leitura do documento
   * ------------------------------------------------------------------ */
  function extOf(name) {
    var m = /\.([a-z0-9]+)$/i.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  }

  function decodeText(buffer) {
    var bytes = new Uint8Array(buffer);
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
      return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), bom: false, legacy: false, utf16: true };
    }
    var bom = false;
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) { bom = true; bytes = bytes.subarray(3); }
    try {
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), bom: bom, legacy: false };
    } catch (e) {
      return { text: new TextDecoder('windows-1252').decode(bytes), bom: false, legacy: true };
    }
  }

  /**
   * Lê o arquivo e devolve:
   * { name, ext, size, buffer, parts, text, bom, legacyEncoding,
   *   paragraphs: [{part, text}] }
   */
  async function loadDocument(file) {
    var ext = extOf(file.name);
    if (ext === 'doc') throw new Error('Arquivos .doc (Word antigo) não são suportados. No Word, use "Salvar como…" e escolha .docx.');
    if (ext === 'pdf') throw new Error('PDF não é suportado. Use o documento original em .docx, .txt ou .md.');
    if (['docx', 'txt', 'md'].indexOf(ext) === -1) throw new Error('Formato não suportado. Use .docx, .txt ou .md.');

    var buffer = await file.arrayBuffer();
    var doc = { name: file.name, ext: ext, size: file.size, buffer: buffer, parts: null, text: null, bom: false, legacyEncoding: false, paragraphs: [] };

    if (ext === 'docx') {
      var zip;
      try { zip = await JSZip.loadAsync(buffer); }
      catch (e) { throw new Error('Não foi possível abrir este .docx. O arquivo pode estar corrompido ou protegido por senha.'); }
      if (!zip.file('word/document.xml')) throw new Error('Este arquivo não parece ser um documento do Word (.docx) válido.');

      var names = Object.keys(zip.files).filter(function (n) { return PART_RE.test(n); });
      names.sort(function (a, b) { return partOrder(a) - partOrder(b) || a.localeCompare(b); });
      doc.parts = {};
      for (var i = 0; i < names.length; i++) {
        var xml = await zip.file(names[i]).async('string');
        doc.parts[names[i]] = xml;
        var dom = parseXml(xml);
        var ps = docxParagraphs(dom), label = partLabel(names[i]);
        for (var j = 0; j < ps.length; j++) {
          var txt = paragraphTextNodes(ps[j]).map(function (t) { return t.textContent; }).join('');
          doc.paragraphs.push({ part: label, text: txt });
        }
      }
    } else {
      var dec = decodeText(buffer);
      doc.text = dec.text; doc.bom = dec.bom; doc.legacyEncoding = dec.legacy;
      doc.paragraphs = dec.text.split(/\r\n|\n|\r/).map(function (l) { return { part: null, text: l }; });
    }
    return doc;
  }

  /* ------------------------------------------------------------------ *
   * Detecção
   * ------------------------------------------------------------------ */
  function snippet(text, start, end) {
    var b = Math.max(0, start - 45), a = Math.min(text.length, end + 45);
    return {
      before: (b > 0 ? '…' : '') + text.slice(b, start),
      match: text.slice(start, end),
      after: text.slice(end, a) + (a < text.length ? '…' : '')
    };
  }

  /** Campos marcados no documento, na ordem em que aparecem. */
  function detectFields(doc, delim) {
    var map = new Map();
    var ctx = { delim: delim, lookup: null, literals: [] };
    doc.paragraphs.forEach(function (p) {
      findMatches(p.text, ctx).forEach(function (m) {
        var f = map.get(m.key);
        if (!f) {
          f = { key: m.key, name: m.name, count: 0, context: snippet(p.text, m.start, m.end) };
          map.set(m.key, f);
        }
        f.count++;
      });
    });
    return Array.from(map.values());
  }

  /** Quantas vezes um texto livre aparece no documento. */
  function countLiteral(doc, find) {
    if (!find) return 0;
    var n = 0;
    doc.paragraphs.forEach(function (p) {
      var pos = 0, at;
      while ((at = p.text.indexOf(find, pos)) !== -1) { n++; pos = at + find.length; }
    });
    return n;
  }

  function firstLiteralContext(doc, find) {
    for (var i = 0; i < doc.paragraphs.length; i++) {
      var at = doc.paragraphs[i].text.indexOf(find);
      if (at !== -1) return snippet(doc.paragraphs[i].text, at, at + find.length);
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * Geração
   * ------------------------------------------------------------------ */
  function fillText(text, ctx) {
    var ms = findMatches(text, ctx).filter(function (m) { return m.value != null; });
    for (var i = ms.length - 1; i >= 0; i--) {
      text = text.slice(0, ms[i].start) + ms[i].value + text.slice(ms[i].end);
    }
    return text;
  }

  /** Gera o documento preenchido. Retorna um Blob. */
  async function renderDocument(doc, ctx) {
    if (doc.ext === 'docx') {
      var zip = await JSZip.loadAsync(doc.buffer);
      var names = Object.keys(doc.parts);
      for (var i = 0; i < names.length; i++) {
        var dom = parseXml(doc.parts[names[i]]);
        var changed = false;
        docxParagraphs(dom, true).forEach(function (p) { if (applyToParagraph(p, ctx)) changed = true; });
        if (changed) zip.file(names[i], serializeXml(dom));
      }
      return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
    }
    var out = fillText(doc.text, ctx);
    var parts = [];
    if (doc.bom) parts.push(new Uint8Array([0xEF, 0xBB, 0xBF]));
    parts.push(out);
    return new Blob(parts, { type: (doc.ext === 'md' ? 'text/markdown' : 'text/plain') + ';charset=utf-8' });
  }

  function sanitizeFileName(s) {
    return String(s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  global.Core = {
    DELIMITERS: DELIMITERS,
    normalizeKey: normalizeKey,
    findMatches: findMatches,
    loadDocument: loadDocument,
    detectFields: detectFields,
    countLiteral: countLiteral,
    firstLiteralContext: firstLiteralContext,
    renderDocument: renderDocument,
    sanitizeFileName: sanitizeFileName,
    extOf: extOf
  };
})(window);
