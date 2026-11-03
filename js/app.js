/* Preenche — telas e fluxo. Depende de Core e Sheet. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Estado
   * ------------------------------------------------------------------ */
  var nextId = 1;
  function newState() {
    return {
      step: 1, maxStep: 1,
      delimId: 'chaves',
      doc: null,
      fields: [],        // {id, type:'marker'|'literal', name, key, find?, count, context, enabled}
      records: [{}],     // [{[fieldId]: valor}]
      cur: 0,
      mode: null,        // 'manual' | 'sheet'
      wizardIdx: 0,
      sheetInfo: null,
      nameField: '',     // id do campo usado para nomear arquivos (lote)
      onlyFields: null,  // prévia: só parágrafos com campos
      error: '',
      busy: false
    };
  }
  var state = newState();

  /* ------------------------------------------------------------------ *
   * Utilidades de DOM
   * ------------------------------------------------------------------ */
  var ICONS = {
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    right: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
    left: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
    table: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    eyeoff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
    undo: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m5 0V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2"/>',
    cleft: '<polyline points="15 18 9 12 15 6"/>',
    cright: '<polyline points="9 18 15 12 9 6"/>',
    share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>'
  };

  function icon(name, size) {
    size = size || 20;
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', size); s.setAttribute('height', size);
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'ic');
    s.innerHTML = ICONS[name] || '';
    return s;
  }

  function h(tag, props) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'open') { if (v) el[k] = true; }
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { append(el, x); });
    else if (typeof c === 'string' || typeof c === 'number') el.appendChild(document.createTextNode(c));
    else el.appendChild(c);
  }

  var toastTimer;
  function toast(msg, kind) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (kind === 'err' ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast' + (kind === 'err' ? ' err' : ''); }, 4200);
  }

  function autosize(el) {
    el.style.height = 'auto';
    el.style.height = (el.scrollHeight + 2) + 'px';
  }
  function textarea(props) {
    props = props || {};
    props.rows = 1;
    var el = h('textarea', props);
    el.addEventListener('input', function () { autosize(el); });
    requestAnimationFrame(function () { autosize(el); });
    return el;
  }

  function formatSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  var HINTS = [
    [/cnpj/, '12.345.678/0001-90'], [/cpf/, '123.456.789-09'], [/e-?mail/, 'nome@empresa.com'],
    [/telefone|celular|whats|fone/, '(11) 91234-5678'], [/cep/, '01310-100'], [/data/, '03/11/2026'],
    [/endereco|logradouro|rua/, 'Rua, número, bairro, cidade'], [/valor|preco|total/, 'R$ 1.500,00'],
    [/razao|empresa|contratante|contratada/, 'Empresa Exemplo Ltda'], [/nome|cliente|responsavel/, 'Maria da Silva']
  ];
  function hintFor(f) {
    var k = f.key || Core.normalizeKey(f.name);
    for (var i = 0; i < HINTS.length; i++) if (HINTS[i][0].test(k)) return 'Ex.: ' + HINTS[i][1];
    return 'Digite o valor';
  }

  /* ------------------------------------------------------------------ *
   * Dados derivados
   * ------------------------------------------------------------------ */
  function delim() { return Core.DELIMITERS[state.delimId]; }
  function fieldById(id) { return state.fields.filter(function (f) { return f.id === id; })[0]; }
  function activeFields() { return state.fields.filter(function (f) { return f.enabled; }); }
  function valueOf(ri, f) { var v = (state.records[ri] || {})[f.id]; return v ? String(v).trim() : ''; }
  function wrapMarker(f) { var d = delim(); return d.open + f.name + d.close; }

  function fmtValue(f, v) {
    return f.fmtOn && f.fmt ? Format.apply(f.fmt, v).value : v;
  }

  function hasValues() {
    return state.records.some(function (r) {
      return Object.keys(r).some(function (k) { return r[k] && String(r[k]).trim(); });
    });
  }

  function exportCurrentData() {
    var act = activeFields();
    var rows = state.records.map(function (r) {
      var o = {};
      act.forEach(function (f) { var v = r[f.id] ? String(r[f.id]).trim() : ''; o[f.id] = v ? fmtValue(f, v) : ''; });
      return o;
    });
    Sheet.exportData(act, rows).then(function (b) { download(b, 'dados-preenchidos.xlsx'); });
    toast('Dados baixados em planilha.');
  }

  /** Caixa "Formatar como [tipo]" + prévia do resultado. */
  function fmtControl(f, input, compact) {
    var out = h('span', { class: 'fmt-out', 'aria-live': 'polite' });
    var sel = h('select', {
      class: 'fmt-sel', 'aria-label': 'Tipo de formatação para ' + f.name, hidden: !f.fmtOn,
      onchange: function (e) { f.fmt = e.target.value; update(); changed(); }
    }, Format.TYPES.map(function (t) {
      return h('option', { value: t.id, text: t.label, selected: t.id === (f.fmt || 'telefone') ? true : null });
    }));
    var cb = h('input', {
      type: 'checkbox', checked: f.fmtOn,
      onchange: function (e) {
        f.fmtOn = e.target.checked;
        if (f.fmtOn && !f.fmt) f.fmt = sel.value;
        sel.hidden = !f.fmtOn; update(); changed();
      }
    });
    function update() {
      out.className = 'fmt-out'; out.textContent = '';
      if (!f.fmtOn || !f.fmt) return;
      var t = Format.typeOf(f.fmt), v = input.value.trim();
      if (!v) { out.textContent = 'Ex.: ' + t.example; return; }
      var r = Format.apply(f.fmt, v);
      if (r.ok) { if (!(compact && r.value === v)) { out.textContent = '→ ' + r.value; out.className = 'fmt-out ok'; } }
      else { out.textContent = 'Não reconhecido como ' + t.label.toLowerCase() + ' — ficará como digitado'; out.className = 'fmt-out warn'; }
    }
    function changed() { if (compact) schedulePreview(); }
    input.addEventListener('input', update);
    update();
    var lbl = h('span', { text: f.fmtOn ? 'Formatar como' : 'Formatar automaticamente' });
    cb.addEventListener('change', function () { lbl.textContent = f.fmtOn ? 'Formatar como' : 'Formatar automaticamente'; });
    return h('div', { class: 'fmtbox' + (compact ? ' compact' : '') },
      h('label', { class: 'check' }, cb, lbl), sel, out);
  }

  function makeCtx(ri) {
    var rec = state.records[ri] || {};
    var byKey = new Map();
    state.fields.forEach(function (f) { if (f.type === 'marker') byKey.set(f.key, f); });
    return {
      delim: delim(),
      lookup: function (key) {
        var f = byKey.get(key);
        if (!f) return null;
        var v = rec[f.id] ? String(rec[f.id]).trim() : '';
        return { id: f.id, value: f.enabled && v ? fmtValue(f, v) : null };
      },
      literals: state.fields.filter(function (f) { return f.type === 'literal' && f.enabled; }).map(function (f) {
        var v = rec[f.id] ? String(rec[f.id]).trim() : '';
        return { id: f.id, find: f.find, value: v ? fmtValue(f, v) : null };
      })
    };
  }

  /* ------------------------------------------------------------------ *
   * Ações
   * ------------------------------------------------------------------ */
  function detect() {
    var found = Core.detectFields(state.doc, delim());
    state.fields = found.map(function (f) {
      var fmt = Format.detect(f.key);
      return { id: 'f' + (nextId++), type: 'marker', name: f.name, key: f.key, count: f.count, context: f.context, enabled: true, fmt: fmt, fmtOn: !!fmt };
    });
    state.records = [{}]; state.cur = 0; state.mode = null; state.wizardIdx = 0; state.sheetInfo = null; state.nameField = '';
    state.onlyFields = null;
  }

  async function handleDocFile(file) {
    if (!file) return;
    state.error = '';
    try {
      state.doc = await Core.loadDocument(file);
      detect();
      state.step = 1; state.maxStep = 1;
    } catch (e) {
      state.doc = null; state.fields = [];
      state.error = e.message || 'Não foi possível abrir o arquivo.';
    }
    render();
  }

  function go(step) {
    if (step > 1 && !state.doc) return;
    state.step = step;
    state.maxStep = Math.max(state.maxStep, step);
    render();
    window.scrollTo({ top: 0 });
    var v = document.getElementById('view');
    if (v) v.focus({ preventScroll: true });
  }

  function reset() {
    state = newState();
    render();
  }

  function pendingStats() {
    var act = activeFields(), out = [];
    act.forEach(function (f) {
      var empty = 0;
      for (var i = 0; i < state.records.length; i++) if (!valueOf(i, f)) empty++;
      if (empty) out.push({ field: f, empty: empty });
    });
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Etapas (barra superior)
   * ------------------------------------------------------------------ */
  var STEPS = ['Documento', 'Dados', 'Conferir', 'Baixar'];

  function renderStepper() {
    var ol = document.getElementById('stepper');
    ol.innerHTML = '';
    STEPS.forEach(function (label, i) {
      var n = i + 1;
      var cls = n === state.step ? 'active' : (n < state.step ? 'done' : '');
      var btn = h('button', {
        class: 'step-btn', type: 'button', disabled: n > state.maxStep || !state.doc && n > 1,
        'aria-current': n === state.step ? 'step' : null,
        onclick: function () { go(n); }
      },
        h('span', { class: 'step-num' }, n < state.step ? icon('check', 15) : String(n)),
        h('span', { class: 'step-label' }, label));
      ol.appendChild(h('li', { class: cls }, btn));
    });
  }

  /* ------------------------------------------------------------------ *
   * Etapa 1 — Documento
   * ------------------------------------------------------------------ */
  function dropzone(opts) {
    var input = h('input', { type: 'file', accept: opts.accept, onchange: function (e) { opts.onFile(e.target.files[0]); e.target.value = ''; } });
    var dz = h('label', { class: 'dropzone' + (opts.compact ? ' compact' : '') },
      h('span', { class: 'dz-icon' }, icon('upload', 26)),
      h('strong', { text: opts.title }),
      h('span', { class: 'muted', text: opts.sub }),
      h('span', { class: 'formats' }, opts.formats.map(function (f) { return h('span', { class: 'fmt', text: f }); })),
      input);
    ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); }); });
    dz.addEventListener('drop', function (e) { if (e.dataTransfer.files.length) opts.onFile(e.dataTransfer.files[0]); });
    return dz;
  }

  function delimiterPicker() {
    var sel = h('select', {
      id: 'delim', onchange: function (e) {
        state.delimId = e.target.value;
        if (state.doc) { detect(); }
        render();
      }
    }, Object.keys(Core.DELIMITERS).map(function (k) {
      var d = Core.DELIMITERS[k];
      return h('option', { value: k, selected: k === state.delimId ? true : null, text: d.label + (k === 'chaves' ? ' (recomendado)' : '') });
    }));
    return h('details', { class: 'adv', open: state.delimId !== 'chaves' },
      h('summary', { text: 'Opções avançadas' }),
      h('label', { class: 'lbl', for: 'delim', text: 'Como os campos estão marcados no seu documento?' }),
      sel,
      state.delimId === 'colchete' ? h('p', { class: 'small muted', style: 'margin-top:8px', text: 'Atenção: com [colchetes], links do Markdown como [texto](url) não são confundidos com campos, mas outros textos entre colchetes, como [sic], serão.' }) : null);
  }

  function viewDocument() {
    var root = h('div');
    root.appendChild(h('section', { class: 'hero' },
      h('h1', { text: 'Preencha seu documento em segundos' }),
      h('p', { text: 'Envie um modelo com campos como {{nome}}, {{telefone}} e {{cnpj}}. Você digita os valores ou importa de uma planilha, confere e baixa pronto.' })));

    if (state.error) {
      root.appendChild(h('div', { class: 'notice err', role: 'alert' }, icon('alert'), h('div', { text: state.error })));
      root.lastChild.style.marginBottom = '16px';
    }

    if (!state.doc) {
      root.appendChild(dropzone({
        accept: '.docx,.txt,.md', title: 'Arraste seu documento aqui ou clique para escolher',
        sub: 'O arquivo é lido no seu computador e nunca é enviado a lugar nenhum.', formats: ['.docx', '.txt', '.md'], onFile: handleDocFile
      }));
      var d = delim();
      root.appendChild(h('div', { class: 'grid-2' },
        h('div', { class: 'card howto' },
          h('h3', { text: 'Como marcar os campos no documento' }),
          h('p', { class: 'muted small', text: 'Escreva o nome do campo entre chaves duplas, onde o valor deve entrar:' }),
          h('div', { class: 'example-box' },
            'Contrato com ', h('b', { text: '{{nome}}' }), ', CNPJ ', h('b', { text: '{{cnpj}}' }), ', telefone ', h('b', { text: '{{telefone}}' }), '.'),
          h('ul', null,
            h('li', { text: 'Pode repetir o mesmo campo quantas vezes quiser.' }),
            h('li', { text: 'Maiúsculas e acentos não fazem diferença.' }),
            h('li', { text: 'Funciona em tabelas, cabeçalho e rodapé.' }),
            h('li', { text: 'Documento sem marcações? Dá para trocar textos soltos na etapa 3.' }))),
        h('div', { class: 'card sample' },
          h('h3', { text: 'Ainda não tem um modelo?' }),
          h('p', { class: 'muted small', text: 'Baixe um exemplo pronto para testar o app:' }),
          h('div', { class: 'links' },
            h('a', { href: 'exemplos/modelo-contrato.docx', download: '' }, icon('file', 18), 'Contrato de exemplo (.docx)'),
            h('a', { href: 'exemplos/modelo-proposta.md', download: '' }, icon('file', 18), 'Proposta de exemplo (.md)'),
            h('a', { href: 'exemplos/modelo-carta.txt', download: '' }, icon('file', 18), 'Carta de exemplo (.txt)')))));
      root.appendChild(delimiterPicker());
      return root;
    }

    var doc = state.doc, markerCount = state.fields.length;
    root.appendChild(h('div', { class: 'card' },
      h('div', { class: 'filecard' },
        h('div', { class: 'file-ic' }, icon('file', 24)),
        h('div', { class: 'file-meta' },
          h('strong', { text: doc.name }),
          h('span', { class: 'muted small', text: '.' + doc.ext + ' · ' + formatSize(doc.size) + ' · ' + plural(doc.paragraphs.filter(function (p) { return p.text.trim(); }).length, 'parágrafo', 'parágrafos') })),
        h('label', { class: 'btn sm' }, 'Trocar arquivo',
          h('input', { type: 'file', accept: '.docx,.txt,.md', style: 'display:none', onchange: function (e) { handleDocFile(e.target.files[0]); } }))),
      doc.legacyEncoding ? h('div', { class: 'notice warn' }, icon('info'), h('div', { text: 'Este arquivo usa uma codificação antiga de acentos. Ele foi lido corretamente e o resultado será salvo em UTF-8.' })) : null));

    if (markerCount) {
      var total = state.fields.reduce(function (s, f) { return s + f.count; }, 0);
      root.appendChild(h('div', { class: 'card' },
        h('h2', { class: 'section-title', text: 'Encontramos ' + plural(markerCount, 'campo', 'campos') }),
        h('p', { class: 'section-sub', text: total + (total === 1 ? ' ocorrência será trocada' : ' ocorrências serão trocadas') + ' no documento.' }),
        h('div', { class: 'chips' }, state.fields.map(function (f) {
          return h('span', { class: 'chip' }, f.name, h('small', { text: f.count + '×' }));
        }))));
      root.appendChild(h('div', { class: 'actions' },
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn primary big', type: 'button', onclick: function () { go(2); } }, 'Continuar', icon('right', 20))));
    } else {
      root.appendChild(h('div', { class: 'card' },
        h('div', { class: 'notice info' }, icon('info'),
          h('div', null,
            h('strong', { text: 'Não encontramos campos marcados com ' + delim().label + '.' }),
            h('div', { class: 'small', style: 'margin-top:4px', text: 'Você pode marcar os campos no documento e enviar de novo, escolher outro formato de marcação abaixo, ou trocar textos soltos na etapa de conferência.' })))));
      root.appendChild(h('div', { class: 'actions' },
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn primary', type: 'button', onclick: function () { state.mode = null; go(3); } }, 'Trocar textos soltos', icon('right', 18))));
    }
    root.appendChild(delimiterPicker());
    return root;
  }

  /* ------------------------------------------------------------------ *
   * Etapa 2 — Dados
   * ------------------------------------------------------------------ */
  function viewData() {
    var root = h('div');
    if (!state.mode) {
      root.appendChild(h('section', { class: 'hero' },
        h('h1', { text: 'Como você quer informar os dados?' }),
        h('p', { text: 'Os dois caminhos levam à mesma tela de conferência, onde você pode ajustar tudo antes de baixar.' })));
      root.appendChild(h('div', { class: 'choice-grid' },
        h('button', { class: 'choice', type: 'button', onclick: function () { state.mode = 'manual'; state.wizardIdx = 0; render(); } },
          h('span', { class: 'c-ic' }, icon('edit', 26)),
          h('span', { class: 'tag', text: 'Rápido para 1 documento' }),
          h('h3', { text: 'Digitar manualmente' }),
          h('p', { text: 'O app pergunta cada campo, um de cada vez (' + plural(activeFields().length, 'campo', 'campos') + '). Basta digitar e apertar Enter.' })),
        h('button', { class: 'choice', type: 'button', onclick: function () { state.mode = 'sheet'; render(); } },
          h('span', { class: 'c-ic' }, icon('table', 26)),
          h('span', { class: 'tag', text: 'Ideal para vários documentos' }),
          h('h3', { text: 'Usar uma planilha' }),
          h('p', { text: 'Baixe a planilha modelo com os campos já identificados, preencha e envie. Cada linha gera um documento.' }))));
      root.appendChild(h('div', { class: 'actions' },
        h('button', { class: 'btn ghost', type: 'button', onclick: function () { go(1); } }, icon('left', 18), 'Voltar'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn ghost', type: 'button', onclick: function () { go(3); } }, 'Pular para a conferência')));
      return root;
    }
    if (state.mode === 'manual') return viewWizard();
    return viewSheet();
  }

  function viewWizard() {
    var list = activeFields();
    if (!list.length) { state.mode = null; return viewData(); }
    var i = Math.min(state.wizardIdx, list.length - 1), f = list[i];
    var last = i === list.length - 1;
    var rec = state.records[0];

    function save() { var v = input.value.trim(); rec[f.id] = v ? fmtValue(f, v) : ''; }
    function next() {
      save();
      if (last) go(3); else { state.wizardIdx = i + 1; render(); }
    }
    function prev() { save(); state.wizardIdx = Math.max(0, i - 1); render(); }

    var input = textarea({
      class: 'wiz-input', id: 'wiz-in', value: rec[f.id] || '', placeholder: hintFor(f), autocomplete: 'off',
      'aria-label': 'Valor para ' + f.name,
      onkeydown: function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); next(); } }
    });

    var ctx = f.context;
    var root = h('div', { class: 'wizard' },
      h('div', { class: 'hero', style: 'padding-bottom:8px' }, h('p', { class: 'wiz-step', text: 'Campo ' + (i + 1) + ' de ' + list.length })),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': list.length, 'aria-valuenow': i },
        h('div', { style: 'width:' + Math.round(((i) / list.length) * 100) + '%' })),
      h('div', { class: 'card' },
        h('label', { for: 'wiz-in', class: 'muted small', text: 'Qual valor entra em' }),
        h('div', { class: 'wiz-field', text: f.name }),
        input,
        fmtControl(f, input, false),
        ctx ? h('div', { class: 'ctx' },
          h('div', { class: 'ctx-t', text: 'Onde aparece no documento' + (f.count > 1 ? ' (+' + (f.count - 1) + ' vezes)' : '') }),
          ctx.before, h('mark', { text: ctx.match }), ctx.after) : null,
        h('div', { class: 'actions' },
          h('button', { class: 'btn', type: 'button', onclick: i === 0 ? function () { save(); state.mode = null; render(); } : prev }, icon('left', 18), i === 0 ? 'Voltar' : 'Anterior'),
          h('span', { class: 'spacer' }),
          h('button', { class: 'btn ghost', type: 'button', onclick: function () { rec[f.id] = ''; input.value = ''; next(); } }, 'Pular'),
          h('button', { class: 'btn primary', type: 'button', onclick: next }, last ? 'Revisar' : 'Próximo', icon('right', 18)))),
      h('p', { class: 'small muted', style: 'text-align:center;margin-top:14px', text: 'Dica: Enter avança · Shift+Enter quebra a linha. Na próxima tela você poderá corrigir qualquer valor.' }));
    setTimeout(function () { input.focus(); input.select(); }, 0);
    return root;
  }

  function viewSheet() {
    var root = h('div');
    var fields = activeFields();
    var info = state.sheetInfo;
    root.appendChild(h('section', { class: 'hero' },
      h('h1', { text: 'Usar uma planilha' }),
      h('p', { text: 'Baixe o modelo, preencha no Excel (ou Google Planilhas) e envie de volta. Cada linha preenchida gera um documento.' })));

    root.appendChild(h('div', { class: 'card step-card' },
      h('div', { class: 'n', text: '1' }),
      h('div', { class: 'body' },
        h('h3', { text: 'Baixe a planilha modelo' }),
        h('p', { class: 'muted small', text: 'Ela já vem com uma coluna para cada um dos ' + fields.length + ' campos encontrados no seu documento.' }),
        h('div', { style: 'margin-top:14px' },
          h('button', {
            class: 'btn', type: 'button', onclick: function () {
              Sheet.buildTemplate(fields).then(function (b) { download(b, 'planilha-modelo.xlsx'); });
              toast('Planilha modelo baixada.');
            }
          }, icon('download', 18), 'Baixar planilha modelo (.xlsx)')))));

    var body = h('div', { class: 'body' },
      h('h3', { text: 'Envie a planilha preenchida' }),
      h('p', { class: 'muted small', text: 'Aceita .xlsx, .xls e .csv.' }),
      h('div', { style: 'margin-top:14px' }, dropzone({
        compact: true, accept: '.xlsx,.xls,.csv', title: info ? 'Enviar outra planilha' : 'Arraste a planilha aqui ou clique para escolher',
        sub: '', formats: ['.xlsx', '.xls', '.csv'], onFile: handleSheet
      })));

    if (info) {
      body.appendChild(h('div', { class: 'notice ok', style: 'margin-top:14px' }, icon('check'),
        h('div', null, h('strong', { text: plural(info.rows, 'documento', 'documentos') + ' lido' + (info.rows === 1 ? '' : 's') + ' · ' + info.matched.length + ' de ' + fields.length + ' campos encontrados' }))));
      if (info.missing.length) body.appendChild(h('div', { class: 'notice warn' }, icon('alert'),
        h('div', null, 'Sem coluna na planilha: ', h('strong', { text: info.missing.join(', ') }), '. Você poderá digitar esses valores na conferência.')));
      if (info.extra.length) body.appendChild(h('div', { class: 'notice info' }, icon('info'),
        h('div', null, 'Colunas ignoradas (não existem no documento): ', h('strong', { text: info.extra.join(', ') }), '.')));
    }
    root.appendChild(h('div', { class: 'card step-card' }, h('div', { class: 'n', text: '2' }), body));

    root.appendChild(h('div', { class: 'actions' },
      h('button', { class: 'btn ghost', type: 'button', onclick: function () { state.mode = null; render(); } }, icon('left', 18), 'Escolher outra forma'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn primary', type: 'button', disabled: !info, onclick: function () { go(3); } }, 'Conferir dados', icon('right', 18))));
    return root;
  }

  async function handleSheet(file) {
    if (!file) return;
    try {
      var info = await Sheet.parseFile(file, activeFields());
      if (!info.records.length) { toast('Nenhuma linha preenchida foi encontrada na planilha.', 'err'); return; }
      if (!info.matched.length) { toast('Nenhuma coluna da planilha corresponde aos campos do documento.', 'err'); return; }
      state.records = info.records; state.cur = 0; state.sheetInfo = info;
      toast('Planilha importada.');
    } catch (e) {
      toast(e.message || 'Erro ao ler a planilha.', 'err');
    }
    render();
  }

  /* ------------------------------------------------------------------ *
   * Etapa 3 — Conferir
   * ------------------------------------------------------------------ */
  var previewRaf = 0;
  function schedulePreview() {
    cancelAnimationFrame(previewRaf);
    previewRaf = requestAnimationFrame(function () { refreshPreview(); refreshSummary(); });
  }

  function refreshSummary() {
    var el = document.getElementById('summary');
    if (!el) return;
    var act = activeFields(), filled = act.filter(function (f) { return valueOf(state.cur, f); }).length;
    var pend = act.length - filled, off = state.fields.length - act.length;
    el.innerHTML = '';
    el.appendChild(h('span', { class: 'badge', text: plural(act.length, 'campo', 'campos') }));
    el.appendChild(h('span', { class: 'badge ok', text: plural(filled, 'preenchido', 'preenchidos') }));
    if (pend) el.appendChild(h('span', { class: 'badge warn', text: plural(pend, 'pendente', 'pendentes') }));
    if (off) el.appendChild(h('span', { class: 'badge', text: plural(off, 'ignorado', 'ignorados') }));
  }

  function refreshPreview() {
    var box = document.getElementById('paper');
    if (!box) return;
    var ctx = makeCtx(state.cur);
    var frag = document.createDocumentFragment();
    var onlyF = state.onlyFields == null ? state.doc.paragraphs.length > 40 : state.onlyFields;
    var lastPart = null, shown = 0, MAX = 1500, hasAny = false;

    for (var i = 0; i < state.doc.paragraphs.length; i++) {
      var p = state.doc.paragraphs[i];
      if (!p.text.trim()) continue;
      var ms = Core.findMatches(p.text, ctx);
      if (onlyF && !ms.length) continue;
      if (shown >= MAX) { frag.appendChild(h('div', { class: 'empty-prev', text: '… prévia limitada aos primeiros ' + MAX + ' parágrafos.' })); break; }
      if (p.part && p.part !== lastPart && p.part !== 'Corpo') frag.appendChild(h('div', { class: 'part', text: p.part }));
      lastPart = p.part;
      var para = h('div', { class: 'para' });
      var pos = 0;
      ms.forEach(function (m) {
        if (m.start > pos) para.appendChild(document.createTextNode(p.text.slice(pos, m.start)));
        var f = m.id ? fieldById(m.id) : null;
        if (!f || !f.enabled) para.appendChild(h('mark', { class: 'mk-off', title: 'Ignorado — será mantido como está', text: m.raw }));
        else if (m.value != null) para.appendChild(h('mark', { class: 'mk-ok', title: 'Será trocado por este valor', text: m.value.replace(/\r?\n/g, ' ⏎ ') }));
        else para.appendChild(h('mark', { class: 'mk-pending', title: 'Sem valor — será mantido como está', text: m.raw }));
        pos = m.end;
      });
      if (pos < p.text.length) para.appendChild(document.createTextNode(p.text.slice(pos)));
      frag.appendChild(para); shown++; hasAny = true;
    }
    box.innerHTML = '';
    if (!hasAny) box.appendChild(h('div', { class: 'empty-prev', text: onlyF ? 'Nenhum trecho com campos para mostrar. Desmarque "Só trechos com campos" para ver o documento inteiro.' : 'Documento sem texto.' }));
    else box.appendChild(frag);
  }

  function fieldRow(f) {
    var rec = state.records[state.cur];
    var input = textarea({
      value: rec[f.id] || '', disabled: !f.enabled, placeholder: f.enabled ? hintFor(f) : 'Ignorado — será mantido como está',
      'aria-label': 'Valor para ' + f.name,
      oninput: function (e) { state.records[state.cur][f.id] = e.target.value; schedulePreview(); },
      onblur: function (e) {
        var v = e.target.value.trim();
        if (!v || !f.fmtOn) return;
        var nv = fmtValue(f, v);
        if (nv !== e.target.value) { e.target.value = nv; state.records[state.cur][f.id] = nv; autosize(e.target); }
      }
    });
    var title = f.type === 'literal'
      ? h('div', { class: 'frow-name', title: f.find }, '“' + f.find + '”')
      : h('div', { class: 'frow-name', title: wrapMarker(f) }, f.name);
    var top = h('div', { class: 'frow-top' },
      title,
      f.type === 'literal' ? h('span', { class: 'badge lit', text: 'texto livre' }) : null,
      f.count === 0 ? h('span', { class: 'badge warn', text: 'não encontrado' }) : h('span', { class: 'badge', title: 'Aparece ' + f.count + ' vez(es) no documento', text: f.count + '×' }),
      f.type === 'literal'
        ? h('button', { class: 'icon-btn danger', type: 'button', title: 'Remover', 'aria-label': 'Remover ' + f.name, onclick: function () { removeField(f.id); } }, icon('trash', 18))
        : h('button', {
          class: 'icon-btn', type: 'button', title: f.enabled ? 'Ignorar este campo (não será trocado)' : 'Voltar a trocar este campo',
          'aria-label': f.enabled ? 'Ignorar ' + f.name : 'Restaurar ' + f.name,
          onclick: function () { f.enabled = !f.enabled; renderReviewBody(); }
        }, icon(f.enabled ? 'eyeoff' : 'undo', 18)));
    return h('li', { class: 'frow' + (f.enabled ? '' : ' off') }, top, input, f.enabled ? fmtControl(f, input, true) : null);
  }

  function removeField(id) {
    state.fields = state.fields.filter(function (f) { return f.id !== id; });
    state.records.forEach(function (r) { delete r[id]; });
    renderReviewBody();
  }

  function addLiteral(find, value) {
    find = find.trim();
    if (!find) { toast('Digite o texto que deve ser localizado.', 'err'); return false; }
    if (/[\r\n]/.test(find)) { toast('O texto a localizar deve ter uma única linha.', 'err'); return false; }
    var d = delim();
    if (find.indexOf(d.open) !== -1) { toast('Para campos marcados, use a lista acima.', 'err'); return false; }
    if (state.fields.some(function (f) { return f.type === 'literal' && f.find === find; })) { toast('Esse texto já foi adicionado.', 'err'); return false; }
    var count = Core.countLiteral(state.doc, find);
    if (!count) { toast('Esse texto não aparece no documento (diferencia maiúsculas e minúsculas).', 'err'); return false; }
    var f = { id: 'f' + (nextId++), type: 'literal', name: find, key: Core.normalizeKey(find), find: find, count: count, context: Core.firstLiteralContext(state.doc, find), enabled: true, fmt: '', fmtOn: false };
    state.fields.push(f);
    state.records[state.cur][f.id] = value;
    return true;
  }

  function viewReview() {
    var root = h('div', { id: 'review-root' });
    renderReviewInto(root);
    return root;
  }

  function renderReviewBody() {
    var root = document.getElementById('review-root');
    if (root) { root.innerHTML = ''; renderReviewInto(root); }
  }

  function renderReviewInto(root) {
    root.appendChild(h('section', { class: 'hero', style: 'padding-bottom:14px' },
      h('h1', { text: 'Confira antes de baixar' }),
      h('p', { text: 'Edite os valores, ignore campos ou adicione trocas de texto. A prévia mostra como o documento vai ficar.' })));

    // Coluna esquerda
    var left = h('div');
    var card = h('div', { class: 'card' });
    card.appendChild(h('div', { class: 'summary-bar', id: 'summary' }));

    if (state.records.length > 1 || state.mode === 'sheet') {
      var n = state.records.length;
      var firstF = activeFields()[0];
      var lbl = firstF && valueOf(state.cur, firstF) ? ' — ' + valueOf(state.cur, firstF) : '';
      card.appendChild(h('div', { class: 'recnav' },
        h('button', { class: 'icon-btn', type: 'button', title: 'Documento anterior', 'aria-label': 'Documento anterior', disabled: state.cur === 0, onclick: function () { state.cur--; renderReviewBody(); } }, icon('cleft', 20)),
        h('div', { class: 'title', text: 'Documento ' + (state.cur + 1) + ' de ' + n + lbl }),
        h('button', { class: 'icon-btn', type: 'button', title: 'Próximo documento', 'aria-label': 'Próximo documento', disabled: state.cur >= n - 1, onclick: function () { state.cur++; renderReviewBody(); } }, icon('cright', 20)),
        h('button', { class: 'icon-btn', type: 'button', title: 'Adicionar documento', 'aria-label': 'Adicionar documento', onclick: function () { state.records.push({}); state.cur = state.records.length - 1; renderReviewBody(); } }, icon('plus', 20)),
        n > 1 ? h('button', { class: 'icon-btn danger', type: 'button', title: 'Remover este documento', 'aria-label': 'Remover este documento', onclick: function () { state.records.splice(state.cur, 1); state.cur = Math.min(state.cur, state.records.length - 1); renderReviewBody(); } }, icon('trash', 18)) : null));
    }

    if (state.fields.length) card.appendChild(h('ul', { class: 'frows' }, state.fields.map(fieldRow)));
    else card.appendChild(h('div', { class: 'notice info' }, icon('info'), h('div', { text: 'Nenhum campo marcado. Adicione abaixo os textos que deseja trocar.' })));

    var findIn = h('input', { type: 'text', id: 'lit-find', placeholder: 'Texto a localizar (ex.: Empresa XYZ)', 'aria-label': 'Texto a localizar' });
    var valIn = h('input', { type: 'text', id: 'lit-val', placeholder: 'Substituir por…', 'aria-label': 'Substituir por' });
    function add() { if (addLiteral(findIn.value, valIn.value)) renderReviewBody(); }
    [findIn, valIn].forEach(function (el) { el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } }); });
    card.appendChild(h('div', { class: 'add-box' },
      h('strong', { text: 'Adicionar troca de texto' }),
      h('p', { class: 'small muted', text: 'Para trechos que não têm marcador, como o nome de uma empresa do modelo antigo. O texto precisa estar escrito exatamente igual no documento.' }),
      h('div', { class: 'row' }, findIn, valIn),
      h('button', { class: 'btn sm', type: 'button', onclick: add }, icon('plus', 16), 'Adicionar')));
    left.appendChild(card);

    // Coluna direita
    var onlyF = state.onlyFields == null ? state.doc.paragraphs.length > 40 : state.onlyFields;
    var right = h('div', { class: 'sticky' }, h('div', { class: 'card' },
      h('div', { class: 'preview-head' },
        h('strong', { text: 'Prévia' }),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: onlyF, onchange: function (e) { state.onlyFields = e.target.checked; refreshPreview(); } }), 'Só trechos com campos')),
      h('div', { class: 'legend', style: 'margin-bottom:12px' },
        h('span', { class: 'l-ok', text: 'será trocado' }), h('span', { class: 'l-pend', text: 'sem valor' }), h('span', { class: 'l-off', text: 'ignorado' })),
      h('div', { class: 'paper', id: 'paper', tabindex: '0', 'aria-label': 'Prévia do documento' })));

    root.appendChild(h('div', { class: 'review' }, left, right));
    root.appendChild(h('div', { class: 'actions' },
      h('button', { class: 'btn ghost', type: 'button', onclick: function () { go(2); } }, icon('left', 18), 'Voltar'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn primary big', type: 'button', onclick: function () { go(4); } }, 'Continuar', icon('right', 20))));
    refreshSummary();
    refreshPreview();
  }

  /* ------------------------------------------------------------------ *
   * Etapa 4 — Baixar
   * ------------------------------------------------------------------ */
  function baseName() { return state.doc.name.replace(/\.[^.]+$/, ''); }

  /** Gera todos os documentos preenchidos: [{name, ext, blob}]. */
  async function buildOutputs(onProgress) {
    var doc = state.doc, base = baseName(), n = state.records.length, out = [], used = new Set();
    for (var i = 0; i < n; i++) {
      if (onProgress) onProgress(i + 1, n);
      await new Promise(function (r) { setTimeout(r, 0); });
      var blob = await Core.renderDocument(doc, makeCtx(i));
      var fname;
      if (n === 1) fname = base + '_preenchido.' + doc.ext;
      else {
        var f = state.nameField && fieldById(state.nameField);
        var label = f ? Core.sanitizeFileName(fmtValue(f, valueOf(i, f))) : '';
        if (!label) label = String(i + 1).padStart(String(n).length, '0');
        fname = base + '_' + label + '.' + doc.ext;
        var k = 2;
        while (used.has(fname.toLowerCase())) fname = base + '_' + label + '_' + (k++) + '.' + doc.ext;
      }
      used.add(fname.toLowerCase());
      out.push({ name: fname, ext: doc.ext, blob: blob });
    }
    return out;
  }

  // Os documentos são preparados ao entrar na etapa 4, para que baixar,
  // gerar PDF e compartilhar respondam na hora (o compartilhamento no
  // celular exige resposta imediata ao toque).
  var outputs = null;
  function prepareOutputs() {
    var job = { files: null };
    var status = function (i, n) { var el = document.getElementById('gen-status'); if (el && n > 1) el.textContent = 'Preparando ' + i + ' de ' + n + '…'; };
    job.promise = buildOutputs(status).then(function (files) {
      job.files = files;
      var el = document.getElementById('gen-status'); if (el) el.textContent = '';
      return files;
    });
    job.promise.catch(function (e) {
      console.error(e);
      toast('Não foi possível gerar o documento: ' + (e.message || e), 'err');
    });
    outputs = job;
    return job.promise;
  }
  function getOutputs() { return outputs && outputs.files ? Promise.resolve(outputs.files) : (outputs ? outputs.promise : prepareOutputs()); }

  async function busy(btn, label, fn) {
    var keep = Array.prototype.slice.call(btn.childNodes);
    btn.disabled = true; btn.textContent = label;
    try { await fn(); }
    catch (e) { if (e && e.name !== 'AbortError') { console.error(e); toast('Algo deu errado: ' + (e.message || e), 'err'); } }
    btn.disabled = false; btn.textContent = ''; keep.forEach(function (c) { btn.appendChild(c); });
  }

  function doDownload(btn) {
    return busy(btn, 'Gerando…', async function () {
      var files = await getOutputs();
      if (files.length === 1) { download(files[0].blob, files[0].name); toast('Documento baixado!'); return; }
      btn.textContent = 'Compactando…';
      var zip = new JSZip();
      files.forEach(function (f) { zip.file(f.name, f.blob); });
      download(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), baseName() + '_documentos.zip');
      toast(files.length + ' documentos baixados em um .zip!');
    });
  }

  function doPdfFiles(btn) {
    return busy(btn, 'Gerando PDF…', async function () {
      var files = await getOutputs();
      var pdfs = await Pdf.toFiles(files, function (i, n) { btn.textContent = n > 1 ? 'Gerando PDF ' + i + ' de ' + n + '…' : 'Gerando PDF…'; });
      if (pdfs.length === 1) { download(pdfs[0].blob, pdfs[0].name); toast('PDF baixado!'); return; }
      btn.textContent = 'Compactando…';
      var zip = new JSZip();
      pdfs.forEach(function (f) { zip.file(f.name, f.blob); });
      download(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), baseName() + '_pdfs.zip');
      toast(pdfs.length + ' PDFs baixados em um .zip!');
    });
  }

  function doPdf(btn) {
    return busy(btn, 'Preparando PDF…', async function () {
      var files = await getOutputs();
      var title = files.length === 1 ? files[0].name.replace(/\.[^.]+$/, '') : baseName() + '_documentos';
      await Pdf.print(files, title);
    });
  }

  var canShareFiles = (function () {
    try { return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] })); }
    catch (e) { return false; }
  })();

  async function doShare() {
    var files = outputs && outputs.files;
    if (!files) { toast('Ainda preparando os documentos… toque de novo em um instante.'); return; }
    var list = files.map(function (f) { return new File([f.blob], f.name, { type: f.blob.type || 'application/octet-stream' }); });
    var data = { files: list, title: list.length === 1 ? list[0].name : baseName() };
    if (!navigator.canShare(data)) {
      toast('Este celular não permite compartilhar esse tipo de arquivo. Use “Baixar”.', 'err');
      return;
    }
    try { await navigator.share(data); }
    catch (e) { if (e.name !== 'AbortError') toast('Não foi possível compartilhar: ' + e.message, 'err'); }
  }

  function viewDownload() {
    var n = state.records.length, act = activeFields(), pend = pendingStats();
    var replaced = 0;
    for (var i = 0; i < n; i++) act.forEach(function (f) { if (valueOf(i, f)) replaced += f.count; });

    var root = h('div', { class: 'done-wrap' });
    root.appendChild(h('div', { class: 'done-hero' },
      h('div', { class: 'big-ic' }, icon('check', 32)),
      h('h2', { text: 'Tudo pronto' }),
      h('p', { text: plural(n, 'documento será gerado', 'documentos serão gerados') + ' · ' + plural(replaced, 'ocorrência trocada', 'ocorrências trocadas') + '.' })));

    var card = h('div', { class: 'card', style: 'margin-top:20px' });
    if (!act.length) card.appendChild(h('div', { class: 'notice warn' }, icon('alert'), h('div', { text: 'Nenhuma troca está ativa — o documento será baixado sem alterações.' })));
    if (pend.length) {
      card.appendChild(h('div', { class: 'notice warn' }, icon('alert'),
        h('div', null, h('strong', { text: 'Alguns campos estão sem valor e serão mantidos como estão no texto:' }),
          h('ul', null, pend.map(function (p) {
            return h('li', { text: (p.field.type === 'literal' ? '“' + p.field.find + '”' : p.field.name) + (n > 1 ? ' — vazio em ' + p.empty + ' de ' + n + ' documentos' : '') });
          })))));
    } else if (act.length) {
      card.appendChild(h('div', { class: 'notice ok' }, icon('check'), h('div', { text: 'Todos os campos têm valor.' })));
    }

    if (n > 1) {
      if (!state.nameField || !fieldById(state.nameField)) { var first = act[0]; state.nameField = first ? first.id : ''; }
      var sel = h('select', { id: 'namef', onchange: function (e) { state.nameField = e.target.value; prepareOutputs(); } },
        h('option', { value: '', text: 'Número (01, 02, 03…)', selected: !state.nameField ? true : null }),
        act.map(function (f) { return h('option', { value: f.id, text: (f.type === 'literal' ? f.find : f.name), selected: f.id === state.nameField ? true : null }); }));
      card.appendChild(h('div', { style: 'margin-top:16px' },
        h('label', { class: 'lbl', for: 'namef', text: 'Nome de cada arquivo no .zip' }), sel));
    }

    var btn = h('button', { class: 'btn primary big', type: 'button', id: 'btn-download' }, icon('download', 22), n === 1 ? 'Baixar documento (.' + state.doc.ext + ')' : 'Baixar ' + n + ' documentos (.zip)');
    btn.addEventListener('click', function () { doDownload(btn); });
    var pdfBtn = h('button', { class: 'btn big', type: 'button', id: 'btn-pdfs' }, icon('file', 20), n === 1 ? 'Baixar PDF' : 'Baixar ' + n + ' PDFs (.zip)');
    pdfBtn.addEventListener('click', function () { doPdfFiles(pdfBtn); });
    var printBtn = h('button', { class: 'btn sm', type: 'button', id: 'btn-print', title: 'Abre a impressão do navegador. Escolha “Salvar como PDF” para um PDF com texto vetorial.' }, icon('file', 16), n === 1 ? 'Imprimir' : 'Imprimir todos (1 PDF)');
    printBtn.addEventListener('click', function () { doPdf(printBtn); });
    var shareBtn = canShareFiles ? h('button', { class: 'btn big', type: 'button', id: 'btn-share', onclick: doShare }, icon('share', 20), 'Compartilhar') : null;
    root.appendChild(card);
    prepareOutputs();
    root.appendChild(h('div', { class: 'done-actions' },
      h('div', { class: 'main-actions' }, btn, pdfBtn, shareBtn),
      h('p', { class: 'small muted', id: 'gen-status', 'aria-live': 'polite' }),
      h('p', { class: 'small muted pdf-hint', text: n > 1 ? 'Os PDFs saem separados, um por documento, como os arquivos do Word. Para um PDF único com todos, use “Imprimir todos”.' : 'O PDF mantém a formatação do documento e o texto pode ser pesquisado e copiado.' }),
      h('div', { class: 'done-links' }, printBtn,
        h('button', {
          class: 'btn sm', type: 'button', onclick: function () {
            exportCurrentData();
          }
        }, icon('table', 16), 'Baixar dados em planilha'),
        h('button', { class: 'btn sm', type: 'button', onclick: function () { go(3); } }, icon('left', 16), 'Voltar e editar'),
        h('button', { class: 'btn sm ghost', type: 'button', onclick: reset }, icon('undo', 16), 'Começar de novo'))));
    return root;
  }

  /* ------------------------------------------------------------------ *
   * Render
   * ------------------------------------------------------------------ */
  function render() {
    renderStepper();
    var view = document.getElementById('view');
    view.innerHTML = '';
    var node = state.step === 1 ? viewDocument() : state.step === 2 ? viewData() : state.step === 3 ? viewReview() : viewDownload();
    view.appendChild(node);
    if (state.step === 3) { refreshSummary(); refreshPreview(); }
  }

  /* ------------------------------------------------------------------ *
   * Voltar ao início (logo / nome)
   * ------------------------------------------------------------------ */
  function goHome() {
    if (!state.doc || (state.step === 1 && !hasValues())) { reset(); window.scrollTo({ top: 0 }); return; }
    var dlg = h('dialog', { class: 'modal', 'aria-labelledby': 'dlg-t', 'aria-describedby': 'dlg-d' });
    var stay = h('button', { class: 'btn', type: 'button', autofocus: true, onclick: function () { dlg.close(); } }, 'Continuar editando');
    var leave = h('button', { class: 'btn danger', type: 'button', onclick: function () { dlg.close(); reset(); window.scrollTo({ top: 0 }); } }, 'Sim, voltar ao início');
    append(dlg, h('div', { class: 'modal-in' },
      h('div', { class: 'modal-ic' }, icon('alert', 24)),
      h('h2', { id: 'dlg-t', text: 'Voltar para o início?' }),
      h('p', { id: 'dlg-d', text: 'Você perderá o documento carregado' + (hasValues() ? ' e os dados preenchidos até agora' : '') + '. Nada fica salvo no navegador.' }),
      hasValues() ? h('button', { class: 'btn sm', type: 'button', onclick: exportCurrentData }, icon('table', 16), 'Baixar meus dados em planilha antes') : null,
      h('div', { class: 'modal-actions' }, stay, leave)));
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    dlg.showModal();
    stay.focus();
  }
  document.getElementById('home').addEventListener('click', function (e) { e.preventDefault(); goHome(); });

  // Aviso ao fechar/recarregar a aba com dados preenchidos
  window.addEventListener('beforeunload', function (e) {
    if (state.doc && hasValues()) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ------------------------------------------------------------------ *
   * PWA: funcionar offline e instalar como app
   * ------------------------------------------------------------------ */
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var installBtn = document.getElementById('install');
  var deferredPrompt = null;

  if (location.protocol === 'http:' || location.protocol === 'https:') {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('Service worker não registrado:', e); });
      });
    }
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault(); deferredPrompt = e; installBtn.hidden = false;
    });
    window.addEventListener('appinstalled', function () { installBtn.hidden = true; deferredPrompt = null; toast('App instalado! Ele também funciona sem internet.'); });
    if (isIOS && !isStandalone) installBtn.hidden = false;
  }

  function iosInstallHelp() {
    var dlg = h('dialog', { class: 'modal', 'aria-labelledby': 'ios-t' });
    var ok = h('button', { class: 'btn primary', type: 'button', onclick: function () { dlg.close(); } }, 'Entendi');
    append(dlg, h('div', { class: 'modal-in' },
      h('div', { class: 'modal-ic info' }, icon('download', 24)),
      h('h2', { id: 'ios-t', text: 'Instalar no iPhone ou iPad' }),
      h('ol', { class: 'ios-steps' },
        h('li', null, 'No Safari, toque em ', h('strong', null, 'Compartilhar '), icon('share', 16), ' na barra de baixo.'),
        h('li', null, 'Role a lista e toque em ', h('strong', { text: 'Adicionar à Tela de Início' }), '.'),
        h('li', null, 'Toque em ', h('strong', { text: 'Adicionar' }), '. O Preenche abre como app e funciona sem internet.')),
      h('div', { class: 'modal-actions' }, ok)));
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg); dlg.showModal(); ok.focus();
  }

  installBtn.addEventListener('click', async function () {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      var choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') installBtn.hidden = true;
      deferredPrompt = null;
    } else if (isIOS) {
      iosInstallHelp();
    }
  });

  // Gancho para testes automatizados
  window.__app = { get state() { return state; } };

  render();
})();
