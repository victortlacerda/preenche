/* Preenche — planilhas: modelo para download, importação e exportação.
 * Leitura: SheetJS (vendor/xlsx.full.min.js).
 * Escrita: gerador próprio com JSZip, no mesmo formato que o Excel salva.
 *   (O SheetJS CE gravava marcas de pasta com macro e um formato numérico
 *   inválido, que fazem o Modo de Exibição Protegida do Excel recusar o
 *   arquivo baixado.)
 * Exposto como window.Sheet.
 */
(function (global) {
  'use strict';

  var TEMPLATE_ROWS = 200;
  var XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  var NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  var NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  var HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';

  // Estilos (índices de cellXfs)
  var S_TEXT = 1;   // formato Texto (@)
  var S_HEADER = 2; // cabeçalho: negrito, fundo azul-claro, borda inferior, Texto
  var S_TITLE = 3;  // título da aba de instruções
  var S_WRAP = 4;   // texto com quebra automática

  function x(s) {
    return String(s == null ? '' : s)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function colName(i) {
    var s = '';
    for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  }

  /** Monta um .xlsx. sheets: [{name, cols:[largura], rows:[[{v, s}]], styleCols, freezeHeader, emptyRows}] */
  function buildXlsx(sheets) {
    var strings = [], index = new Map();
    function sst(v) {
      v = String(v);
      if (!index.has(v)) { index.set(v, strings.length); strings.push(v); }
      return index.get(v);
    }

    function sheetXml(sh) {
      var width = Math.max(1, sh.cols.length);
      var last = colName(width - 1) + Math.max(1, sh.rows.length, sh.emptyRows || 0);
      var out = HEAD + '<worksheet xmlns="' + NS + '" xmlns:r="' + NS_R + '">';
      out += '<dimension ref="A1:' + last + '"/>';
      out += '<sheetViews><sheetView workbookViewId="0"' + (sh.first ? ' tabSelected="1"' : '') + '>';
      if (sh.freezeHeader) out += '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>';
      out += '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>';
      out += '<cols>' + sh.cols.map(function (w, i) {
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"' + (sh.styleCols ? ' style="' + sh.styleCols + '"' : '') + '/>';
      }).join('') + '</cols><sheetData>';
      var total = Math.max(sh.rows.length, sh.emptyRows || 0);
      for (var r = 0; r < total; r++) {
        var row = sh.rows[r];
        out += '<row r="' + (r + 1) + '">';
        for (var c = 0; c < width; c++) {
          var cell = row ? row[c] : null;
          var ref = colName(c) + (r + 1);
          var style = cell && cell.s != null ? cell.s : sh.styleCols;
          var v = cell ? cell.v : '';
          if (v === '' || v == null) { if (style) out += '<c r="' + ref + '" s="' + style + '"/>'; }
          else out += '<c r="' + ref + '"' + (style ? ' s="' + style + '"' : '') + ' t="s"><v>' + sst(v) + '</v></c>';
        }
        out += '</row>';
      }
      out += '</sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';
      return out;
    }

    var zip = new JSZip();
    // Sem entradas de pasta no .zip, como o Excel salva
    var add = zip.file.bind(zip);
    zip.file = function (name, data) { return add(name, data, { createFolders: false }); };
    var sheetXmls = sheets.map(function (sh, i) { sh.first = i === 0; return sheetXml(sh); });
    var n = sheets.length;

    zip.file('[Content_Types].xml', HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets.map(function (sh, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>');

    zip.file('_rels/.rels', HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      '</Relationships>');

    var now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    zip.file('docProps/core.xml', HEAD + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:creator>Preenche</dc:creator><cp:lastModifiedBy>Preenche</cp:lastModifiedBy>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified>' +
      '</cp:coreProperties>');

    zip.file('docProps/app.xml', HEAD + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
      '<Application>Microsoft Excel</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop>' +
      '<HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Planilhas</vt:lpstr></vt:variant><vt:variant><vt:i4>' + n + '</vt:i4></vt:variant></vt:vector></HeadingPairs>' +
      '<TitlesOfParts><vt:vector size="' + n + '" baseType="lpstr">' + sheets.map(function (sh) { return '<vt:lpstr>' + x(sh.name) + '</vt:lpstr>'; }).join('') + '</vt:vector></TitlesOfParts>' +
      '<LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0300</AppVersion>' +
      '</Properties>');

    zip.file('xl/workbook.xml', HEAD + '<workbook xmlns="' + NS + '" xmlns:r="' + NS_R + '">' +
      '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="15000" activeTab="0"/></bookViews><sheets>' +
      sheets.map(function (sh, i) { return '<sheet name="' + x(sh.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') +
      '</sheets></workbook>');

    zip.file('xl/_rels/workbook.xml.rels', HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map(function (sh, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
      '<Relationship Id="rId' + (n + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rId' + (n + 2) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>' +
      '</Relationships>');

    zip.file('xl/styles.xml', HEAD + '<styleSheet xmlns="' + NS + '">' +
      '<fonts count="3">' +
      '<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FF1C2333"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>' +
      '<font><b/><sz val="14"/><color rgb="FF3D58D6"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>' +
      '</fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFEEF1FE"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left/><right/><top/><bottom style="thin"><color rgb="FF4F6BED"/></bottom><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="5">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="49" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' +
      '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '<dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>' +
      '</styleSheet>');

    sheetXmls.forEach(function (xml, i) { zip.file('xl/worksheets/sheet' + (i + 1) + '.xml', xml); });

    zip.file('xl/sharedStrings.xml', HEAD + '<sst xmlns="' + NS + '" count="' + strings.length + '" uniqueCount="' + strings.length + '">' +
      strings.map(function (v) { return '<si><t' + (/^\s|\s$|\n/.test(v) ? ' xml:space="preserve"' : '') + '>' + x(v) + '</t></si>'; }).join('') + '</sst>');

    return zip.generateAsync({ type: 'blob', mimeType: XLSX_MIME, compression: 'DEFLATE' });
  }

  function dataSheet(headers, rows, emptyRows) {
    return {
      name: 'Dados', freezeHeader: true, styleCols: S_TEXT, emptyRows: emptyRows,
      // Colunas inteiras no formato Texto: evita perder zeros à esquerda (CNPJ, CEP, datas como 010126…)
      cols: headers.map(function (h) { return Math.max(20, Math.min(60, String(h).length + 6)); }),
      rows: [headers.map(function (h) { return { v: h, s: S_HEADER }; })].concat(rows.map(function (r) {
        return r.map(function (v) { return { v: v == null ? '' : String(v) }; });
      }))
    };
  }

  function instructionsSheet() {
    var lines = [
      '1. Na aba "Dados", cada coluna é um campo do documento. Não altere os nomes da primeira linha.',
      '2. Cada linha preenchida gera UM documento. Para um único documento, preencha só a linha 2.',
      '3. Deixe a célula vazia se não quiser trocar aquele campo.',
      '4. As colunas já estão no formato Texto, para não perder zeros à esquerda (CNPJ, CEP, telefone, datas como 010126).',
      '5. Pode digitar só os números: o app formata telefone, CNPJ, CPF, CEP, datas e valores.',
      '6. Salve o arquivo (.xlsx ou .csv) e envie de volta no app.'
    ];
    return {
      name: 'Instruções', cols: [110],
      rows: [[{ v: 'Como preencher', s: S_TITLE }], [{ v: '' }]].concat(lines.map(function (l) { return [{ v: l, s: S_WRAP }]; }))
    };
  }

  /** Planilha-modelo com um cabeçalho por campo. fields: [{name}] → Promise<Blob> */
  function buildTemplate(fields) {
    var headers = fields.map(function (f) { return f.name; });
    return buildXlsx([dataSheet(headers, [], TEMPLATE_ROWS + 1), instructionsSheet()]);
  }

  /** Exporta os dados atuais. records: [{[fieldId]: valor}] → Promise<Blob> */
  function exportData(fields, records) {
    var headers = fields.map(function (f) { return f.name; });
    var rows = records.map(function (rec) {
      return fields.map(function (f) { return rec[f.id] || ''; });
    });
    return buildXlsx([dataSheet(headers, rows, Math.max(rows.length + 1, 50))]);
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
