/* Preenche — formatação automática de valores (telefone, CNPJ, CPF, CEP, data, moeda).
 * Exposto como window.Format.
 * apply(tipo, valor) -> { ok, value }. Se o valor não for reconhecido, ok=false e value = original.
 * Todas as funções são idempotentes: formatar um valor já formatado não muda nada.
 */
(function (global) {
  'use strict';

  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  var TYPES = [
    { id: 'telefone', label: 'Telefone', example: '(11) 91234-5678' },
    { id: 'cnpj', label: 'CNPJ', example: '12.345.678/0001-90' },
    { id: 'cpf', label: 'CPF', example: '123.456.789-09' },
    { id: 'cpfcnpj', label: 'CPF ou CNPJ', example: '123.456.789-09 ou 12.345.678/0001-90' },
    { id: 'cep', label: 'CEP', example: '01310-100' },
    { id: 'data', label: 'Data', example: '03/11/2026' },
    { id: 'data_extenso', label: 'Data por extenso', example: '3 de novembro de 2026' },
    { id: 'moeda', label: 'Valor em R$', example: 'R$ 1.500,00' }
  ];

  function digits(v) { return String(v).replace(/\D/g, ''); }
  function no(v) { return { ok: false, value: v }; }
  function yes(v) { return { ok: true, value: v }; }
  // Planilhas costumam perder zeros à esquerda (CNPJ 01.234… vira 1234…)
  function pad(d, len, maxMissing) { return d.length < len && d.length >= len - maxMissing ? '0'.repeat(len - d.length) + d : d; }

  function telefone(v) {
    var d = digits(v);
    if (/^0800\d{7}$/.test(d)) return yes(d.replace(/^(0800)(\d{3})(\d{4})$/, '$1 $2 $3'));
    if (d.length >= 11 && d.length <= 12 && d[0] === '0') d = d.slice(1); // 011 9xxxx-xxxx
    var intl = '';
    if ((d.length === 12 || d.length === 13) && d.slice(0, 2) === '55') { intl = '+55 '; d = d.slice(2); }
    var m;
    if (d.length === 11) m = /^(\d{2})(\d{5})(\d{4})$/.exec(d);
    else if (d.length === 10) m = /^(\d{2})(\d{4})(\d{4})$/.exec(d);
    if (m) return yes(intl + '(' + m[1] + ') ' + m[2] + '-' + m[3]);
    if (!intl && d.length === 9) return yes(d.slice(0, 5) + '-' + d.slice(5));
    if (!intl && d.length === 8) return yes(d.slice(0, 4) + '-' + d.slice(4));
    return no(v);
  }

  function cnpj(v) {
    var d = pad(digits(v), 14, 2);
    if (d.length !== 14) return no(v);
    return yes(d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'));
  }

  function cpf(v) {
    var d = pad(digits(v), 11, 2);
    if (d.length !== 11) return no(v);
    return yes(d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4'));
  }

  function cpfcnpj(v) {
    var n = digits(v).length;
    if (n === 14) return cnpj(v);
    if (n === 11) return cpf(v);
    return no(v);
  }

  function cep(v) {
    var d = pad(digits(v), 8, 1);
    if (d.length !== 8) return no(v);
    return yes(d.slice(0, 5) + '-' + d.slice(5));
  }

  /**
   * Entende datas digitadas de vários jeitos, inclusive quando o Excel
   * apaga o zero da frente: 010126 vira 10126 e 01012026 vira 1012026.
   * Também aceita o número de série que o Excel usa para datas (46023 = 01/01/2026).
   */
  function parseDate(v) {
    var s = String(v).trim();
    var lostZero = /^\d{5}$/.test(s) || /^\d{7}$/.test(s);
    var r = parseDateText(lostZero ? '0' + s : s);
    if (!r && /^\d{5}$/.test(s)) r = excelSerial(+s);
    return r;
  }

  function excelSerial(n) {
    if (n < 20000 || n > 80000) return null; // ~1954 a ~2119
    var d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return { d: d.getUTCDate(), m: d.getUTCMonth() + 1, y: d.getUTCFullYear() };
  }

  function parseDateText(s) {
    var m, dd, mm, yy;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) { yy = +m[1]; mm = +m[2]; dd = +m[3]; }
    else if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/.exec(s))) { dd = +m[1]; mm = +m[2]; yy = +m[3]; }
    else if ((m = /^(\d{2})(\d{2})(\d{4})$/.exec(s))) { dd = +m[1]; mm = +m[2]; yy = +m[3]; }
    else if ((m = /^(\d{2})(\d{2})(\d{2})$/.exec(s))) { dd = +m[1]; mm = +m[2]; yy = +m[3]; }
    else if ((m = /^(\d{1,2}) de ([a-zç]+) de (\d{4})$/i.exec(s))) {
      dd = +m[1]; mm = MESES.indexOf(m[2].toLowerCase()) + 1; yy = +m[3];
    }
    else return null;
    if (yy < 100) yy += 2000;
    var dt = new Date(yy, mm - 1, dd);
    if (dt.getFullYear() !== yy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return null;
    return { d: dd, m: mm, y: yy };
  }

  function data(v) {
    var p = parseDate(v);
    if (!p) return no(v);
    return yes(String(p.d).padStart(2, '0') + '/' + String(p.m).padStart(2, '0') + '/' + p.y);
  }

  function dataExtenso(v) {
    var p = parseDate(v);
    if (!p) return no(v);
    return yes((p.d === 1 ? '1º' : p.d) + ' de ' + MESES[p.m - 1] + ' de ' + p.y);
  }

  function moeda(v) {
    var s = String(v).replace(/R\$|\s| /g, '');
    if (!/^-?\d[\d.,]*$/.test(s)) return no(v);
    var n;
    if (s.indexOf(',') !== -1) n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    else if (/\.\d{1,2}$/.test(s) && s.split('.').length === 2) n = parseFloat(s);
    else n = parseFloat(s.replace(/\./g, ''));
    if (!isFinite(n)) return no(v);
    var out = n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return yes((n < 0 ? '-R$ ' : 'R$ ') + out.replace('-', ''));
  }

  var FN = { telefone: telefone, cnpj: cnpj, cpf: cpf, cpfcnpj: cpfcnpj, cep: cep, data: data, data_extenso: dataExtenso, moeda: moeda };

  function apply(type, v) {
    if (!type || !FN[type] || v == null || !String(v).trim()) return no(v);
    return FN[type](String(v).trim());
  }

  /** Sugere o tipo a partir do nome do campo (chave normalizada, sem acento). */
  function detect(key) {
    var t = String(key || '').split(/[^a-z0-9]+/).filter(Boolean);
    function has() { for (var i = 0; i < arguments.length; i++) if (t.indexOf(arguments[i]) !== -1) return true; return false; }
    if (has('cnpj')) return 'cnpj';
    if (has('cpf')) return 'cpf';
    if (has('documento', 'doc')) return 'cpfcnpj';
    if (has('cep')) return 'cep';
    if (has('telefone', 'tel', 'celular', 'cel', 'whatsapp', 'whats', 'fone', 'fax')) return 'telefone';
    if (has('data', 'dt', 'vencimento', 'nascimento')) return has('extenso') ? 'data_extenso' : 'data';
    if (has('valor', 'preco', 'total', 'montante', 'salario', 'mensalidade')) return 'moeda';
    return '';
  }

  function typeOf(id) { return TYPES.filter(function (t) { return t.id === id; })[0]; }

  global.Format = { TYPES: TYPES, apply: apply, detect: detect, typeOf: typeOf };
})(window);
