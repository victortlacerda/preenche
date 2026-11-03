/* Preenche — planilhas: modelo para download, importação e exportação.
 * Depende de SheetJS (vendor/xlsx.full.min.js). Exposto como window.Sheet.
 */
(function (global) {
  'use strict';

  var TEMPLATE_ROWS = 200;

  function toBlob(wb) {
    var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function dataSheet(headers, rows, minRows) {
    var aoa = [headers].concat(rows);
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var total = Math.max(rows.length + 1, minRows);
    // Células como TEXTO: evita perder zeros à esquerda (CNPJ, CEP, telefone…)
    for (var r = 0; r < total; r++) {
      for (var c = 0; c < headers.length; c++) {
        var addr = XLSX.utils.encode_cell({ r: r, c: c });
        var cell = ws[addr] || { t: 's', v: '' };
        if (r > 0) { cell.t = 's'; cell.v = cell.v == null ? '' : String(cell.v); cell.z = '@'; }
        ws[addr] = cell;
      }
    }
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: total - 1, c: Math.max(headers.length - 1, 0) } });
    ws['!cols'] = headers.map(function (h) { return { wch: Math.max(20, String(h).length + 6) }; });
    return ws;
  }

  function instructionsSheet() {
    var ws = XLSX.utils.aoa_to_sheet([
      ['Como preencher'],
      [''],
      ['1. Na aba "Dados", cada coluna é um campo do documento. Não altere os nomes da primeira linha.'],
      ['2. Cada linha preenchida gera UM documento. Para um único documento, preencha só a linha 2.'],
      ['3. Deixe a célula vazia se não quiser trocar aquele campo.'],
      ['4. As células já estão no formato Texto, para não perder zeros à esquerda (CNPJ, CEP, telefone).'],
      ['5. Salve o arquivo (.xlsx ou .csv) e envie de volta no app.']
    ]);
    ws['!cols'] = [{ wch: 100 }];
    return ws;
  }

  /** Planilha-modelo com um cabeçalho por campo. fields: [{name}] */
  function buildTemplate(fields) {
    var headers = fields.map(function (f) { return f.name; });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, dataSheet(headers, [], TEMPLATE_ROWS), 'Dados');
    XLSX.utils.book_append_sheet(wb, instructionsSheet(), 'Instruções');
    return toBlob(wb);
  }

  /** Exporta os dados atuais. records: [{[fieldId]: valor}] */
  function exportData(fields, records) {
    var headers = fields.map(function (f) { return f.name; });
    var rows = records.map(function (rec) {
      return fields.map(function (f) { return rec[f.id] || ''; });
    });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, dataSheet(headers, rows, rows.length + 1), 'Dados');
    return toBlob(wb);
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  /**
   * Texto de uma célula, do jeito que a pessoa espera ver no documento:
   * - célula de data do Excel → dd/mm/aaaa (sem inverter dia e mês)
   * - número → valor guardado (1500.5, 12345678000190), sem o formato
   *   americano que o Excel/SheetJS aplicaria ("1,500.50")
   * - texto → como digitado
   */
  function cellText(cell) {
    if (!cell || cell.v == null) return '';
    if (cell.t === 'd' && cell.v instanceof Date) {
      return pad2(cell.v.getDate()) + '/' + pad2(cell.v.getMonth() + 1) + '/' + cell.v.getFullYear();
    }
    if (cell.t === 'n') {
      var fmt = cell.z || '';
      if (fmt && fmt !== 'General' && XLSX.SSF.is_date(fmt)) {
        var p = XLSX.SSF.parse_date_code(cell.v);
        if (p && p.y) {
          var hasTime = (p.H || p.M) && /[hs]/i.test(fmt.replace(/\[[^\]]*\]|"[^"]*"/g, ''));
          return pad2(p.d) + '/' + pad2(p.m) + '/' + p.y + (hasTime ? ' ' + pad2(p.H) + ':' + pad2(p.M) : '');
        }
      }
      if (/%/.test(fmt)) return cell.w != null ? String(cell.w) : String(cell.v * 100) + '%';
      var n = cell.v;
      return Number.isInteger(n) ? String(n) : String(+n.toFixed(10));
    }
    if (cell.t === 'b') return cell.v ? 'Sim' : 'Não';
    if (cell.t === 'e') return '';
    return String(cell.v);
  }

  function sheetGrid(ws) {
    if (!ws['!ref']) return [];
    var range = XLSX.utils.decode_range(ws['!ref']), grid = [];
    for (var r = range.s.r; r <= range.e.r; r++) {
      var row = [], any = false;
      for (var c = range.s.c; c <= range.e.c; c++) {
        var v = cellText(ws[XLSX.utils.encode_cell({ r: r, c: c })]);
        if (v.trim()) any = true;
        row.push(v);
      }
      if (any) grid.push(row);
    }
    return grid;
  }

  function cleanHeader(h) {
    return Core.normalizeKey(String(h).replace(/[{}\[\]]/g, ''));
  }

  function readWorkbook(file, buffer) {
    var ext = Core.extOf(file.name);
    if (ext === 'csv' || ext === 'txt') {
      var dec = new TextDecoder('utf-8');
      var text = dec.decode(buffer).replace(/^﻿/, '');
      if (text.indexOf('�') !== -1) text = new TextDecoder('windows-1252').decode(buffer);
      // raw: não deixa a biblioteca transformar 010126 em 10126 nem 03/11/2026 em data americana
      return XLSX.read(text, { type: 'string', raw: true });
    }
    return XLSX.read(buffer, { type: 'array', cellNF: true, cellDates: false });
  }

  /**
   * Lê a planilha e associa as colunas aos campos.
   * fields: [{id, key, name, enabled}]  (key = chave normalizada)
   * Retorna { records, layout, matched:[nome], missing:[nome], extra:[cabeçalho], rows }
   */
  async function parseFile(file, fields) {
    var buffer = await file.arrayBuffer();
    var wb;
    try { wb = readWorkbook(file, buffer); }
    catch (e) { throw new Error('Não foi possível ler a planilha. Confira se é um arquivo .xlsx, .xls ou .csv válido.'); }

    var sheetName = wb.SheetNames.indexOf('Dados') !== -1 ? 'Dados' : wb.SheetNames[0];
    var ws = wb.Sheets[sheetName];
    if (!ws) throw new Error('A planilha está vazia.');
    var grid = sheetGrid(ws);
    if (!grid.length) throw new Error('A planilha está vazia.');

    var byKey = new Map();
    fields.forEach(function (f) { byKey.set(f.key, f); });

    var head = grid[0].map(cleanHeader);
    var vertical = head.length >= 2 && (head[0] === 'campo' || head[0] === 'field') && (head[1] === 'valor' || head[1] === 'value');

    var records = [], matched = new Set(), extra = [];

    if (vertical) {
      var rec = {};
      for (var i = 1; i < grid.length; i++) {
        var k = cleanHeader(grid[i][0]);
        if (!k) continue;
        var f = byKey.get(k);
        if (f) { rec[f.id] = String(grid[i][1] == null ? '' : grid[i][1]).trim(); matched.add(f.id); }
        else extra.push(String(grid[i][0]).trim());
      }
      records.push(rec);
    } else {
      var colMap = []; // índice da coluna -> campo
      grid[0].forEach(function (h, idx) {
        var f2 = byKey.get(cleanHeader(h));
        if (f2 && !colMap.some(function (x) { return x && x.f === f2; })) { colMap[idx] = { f: f2 }; matched.add(f2.id); }
        else if (String(h).trim()) extra.push(String(h).trim());
      });
      for (var r = 1; r < grid.length; r++) {
        var rec2 = {}, any = false;
        colMap.forEach(function (c, idx) {
          if (!c) return;
          var v = String(grid[r][idx] == null ? '' : grid[r][idx]).trim();
          rec2[c.f.id] = v;
          if (v) any = true;
        });
        if (any) records.push(rec2);
      }
    }

    var missing = fields.filter(function (f3) { return !matched.has(f3.id); }).map(function (f3) { return f3.name; });
    var matchedNames = fields.filter(function (f4) { return matched.has(f4.id); }).map(function (f4) { return f4.name; });
    return { records: records, layout: vertical ? 'vertical' : 'horizontal', matched: matchedNames, missing: missing, extra: extra, rows: records.length };
  }

  global.Sheet = { buildTemplate: buildTemplate, exportData: exportData, parseFile: parseFile };
})(window);
