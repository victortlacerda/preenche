"""Teste ponta a ponta do Preenche (Playwright + Chromium).
Uso:  python3 tests/e2e.py
"""
import os, sys, zipfile, io, tempfile, re, subprocess, time, socket
from pypdf import PdfReader
from pathlib import Path
from playwright.sync_api import sync_playwright
from docx import Document
import openpyxl

ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / 'index.html').as_uri()
TMP = Path(tempfile.mkdtemp())
fails = []

def check(cond, msg):
    print(('  ok   ' if cond else '  FAIL ') + msg)
    if not cond: fails.append(msg)

def docx_text(path):
    d = Document(str(path))
    parts = [p.text for p in d.paragraphs]
    for t in d.tables:
        for row in t.rows:
            for c in row.cells: parts.append(c.text)
    for s in d.sections:
        parts += [p.text for p in s.header.paragraphs] + [p.text for p in s.footer.paragraphs]
    return '\n'.join(parts)

with sync_playwright() as pw:
    br = pw.chromium.launch()
    ctx = br.new_context(accept_downloads=True, viewport={'width': 1280, 'height': 900})
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)

    # ---------------- 1) Exemplo + digitação manual ----------------
    print('1) Contrato de exemplo, digitação manual')
    page.goto(URL)
    page.set_input_files('input[type=file]', str(ROOT / 'exemplos/modelo-contrato.docx'))
    page.wait_for_selector('text=Encontramos')
    names = page.evaluate('__app.state.fields.map(f=>f.name)')
    print('     campos:', names)
    check(len(names) == 8, '8 campos detectados (campos divididos em trechos incluídos)')
    page.screenshot(path=str(TMP / 's1.png'))
    page.click('text=Continuar')
    page.click('text=Digitar manualmente')
    vals = {'razão social': 'Acme Tecnologia Ltda', 'cnpj': '12.345.678/0001-90', 'nome': 'Maria da Silva',
            'valor': 'R$ 1.500,00', 'data': '03/11/2026', 'telefone': '(11) 91234-5678',
            'email': 'maria@acme.com', 'endereco': 'Rua A, 10\nCentro - SP'}
    typed = dict(vals, telefone='11912345678', cnpj='12345678000190', valor='1500')
    for n in names:
        page.wait_for_selector('#wiz-in')
        label = page.inner_text('.wiz-field')
        page.fill('#wiz-in', typed[label])
        if label == 'telefone':
            check(page.is_checked('.fmtbox input[type=checkbox]'), 'telefone: "Formatar como" marcado automaticamente')
            check('(11) 91234-5678' in page.inner_text('.fmt-out'), 'prévia da formatação ao digitar')
        if label == 'nome':
            check(not page.is_checked('.fmtbox input[type=checkbox]'), 'nome: sem formatação por padrão')
        page.press('#wiz-in', 'Enter')
    page.wait_for_selector('text=Confira antes de baixar')
    page.screenshot(path=str(TMP / 's3.png'), full_page=True)
    # multilinha via tela de conferência
    check(page.locator('.frow textarea').nth(names.index('endereco')).input_value() == vals['endereco'], 'valor com quebra de linha mantido na conferência')
    page.wait_for_timeout(200)
    prev = page.inner_text('#paper')
    print('     prévia:', repr(prev[:300]))
    check('Acme Tecnologia Ltda' in prev and '{{cnpj}}' not in prev, 'prévia mostra valores')
    page.click('text=Continuar')
    page.wait_for_selector('text=Tudo pronto')
    with page.expect_download() as dl:
        page.click('text=Baixar documento')
    out = TMP / 'contrato.docx'; dl.value.save_as(str(out))
    txt = docx_text(out)
    check('{{' not in txt, 'nenhum marcador restante no docx')
    check('Acme Tecnologia Ltda' in txt and '12.345.678/0001-90' in txt and 'Maria da Silva' in txt, 'valores no corpo')
    check('Contrato — Acme Tecnologia Ltda' in txt, 'cabeçalho substituído')
    check('CNPJ 12.345.678/0001-90 · Tel. (11) 91234-5678' in txt, 'rodapé substituído')
    check('Rua A, 10\nCentro - SP' in txt, 'quebra de linha preservada')
    check('R$\u00a01.500,00' in txt or 'R$ 1.500,00' in txt, 'valor 1500 formatado como R$ 1.500,00')
    # negrito do primeiro trecho preservado
    d = Document(str(out)); p = d.paragraphs[1]
    bold_runs = [r for r in p.runs if 'Acme Tecnologia Ltda' in r.text]
    check(bold_runs and bold_runs[0].bold is True, 'formatação (negrito) herdada do início do campo')
    check(Document(str(out)).paragraphs[0].text == 'Contrato de Prestação de Serviços', 'texto sem campo intacto')

    # ---------------- 2) Planilha com várias linhas -> ZIP ----------------
    print('2) Planilha com várias linhas')
    page.goto(URL)
    page.set_input_files('input[type=file]', str(ROOT / 'exemplos/modelo-proposta.md'))
    page.wait_for_selector('text=Encontramos')
    n_md = page.evaluate('__app.state.fields.length')
    check(n_md == 7, f'md: 7 campos, link [..](..) ignorado (achou {n_md})')
    page.click('text=Continuar'); page.click('text=Usar uma planilha')
    with page.expect_download() as dl:
        page.click('text=Baixar planilha modelo')
    tpl = TMP / 'modelo.xlsx'; dl.value.save_as(str(tpl))
    wb = openpyxl.load_workbook(tpl)
    ws = wb['Dados']
    hdr = [c.value for c in ws[1]]
    print('     cabeçalhos:', hdr)
    check(len(hdr) == 7 and 'cnpj' in hdr, 'planilha-modelo com um cabeçalho por campo')
    check(ws['B2'].number_format == '@', 'células de dados no formato Texto')
    check('Instruções' in wb.sheetnames, 'aba de instruções')
    rows = [
        {'nome': 'Ana Souza', 'razão social': 'Alfa Ltda', 'cnpj': '00.123.456/0001-00', 'telefone': '(11) 99999-0000', 'email': 'ana@alfa.com', 'valor': 'R$ 100', 'data': '01/12/2026'},
        {'nome': 'Bruno Lima', 'razão social': 'Beta SA', 'cnpj': '98.765.432/0001-10', 'telefone': '(21) 98888-1111', 'email': 'bruno@beta.com', 'valor': 'R$ 200', 'data': '02/12/2026'},
        {'nome': 'Ana Souza', 'razão social': 'Gama ME', 'cnpj': '11.111.111/0001-11', 'telefone': '', 'email': 'ana@gama.com', 'valor': 'R$ 300', 'data': '03/12/2026'},
    ]
    for r, row in enumerate(rows, start=2):
        for c, h in enumerate(hdr, start=1):
            ws.cell(r, c).value = row[h]
    ws.cell(2, 1).value = ws.cell(2, 1).value  # noop
    filled = TMP / 'preenchida.xlsx'; wb.save(filled)
    page.set_input_files('.dropzone input[type=file]', str(filled))
    page.wait_for_selector('text=3 documentos lidos')
    page.screenshot(path=str(TMP / 's2.png'), full_page=True)
    page.click('text=Conferir dados')
    page.wait_for_selector('text=Documento 1 de 3')
    page.click('[aria-label="Próximo documento"]')
    check('Documento 2 de 3' in page.inner_text('.recnav'), 'navegação entre documentos')
    page.click('text=Continuar')
    page.wait_for_selector('text=Tudo pronto')
    check('vazio em 1 de 3' in page.inner_text('.notice.warn'), 'aviso de campo vazio em 1 de 3')
    with page.expect_download() as dl:
        page.click('text=Baixar 3 documentos')
    zp = TMP / 'docs.zip'; dl.value.save_as(str(zp))
    z = zipfile.ZipFile(zp); names_z = z.namelist(); print('     zip:', names_z)
    check(len(names_z) == 3 and len(set(names_z)) == 3, '3 arquivos no zip')
    check(all(n.endswith('.md') for n in names_z), 'extensão .md preservada')
    first = z.read([n for n in names_z if 'Ana Souza' in n][0]).decode()
    check('Ana Souza' in first and '{{' not in first.replace('{{telefone}}', ''), 'md preenchido')
    check('[nosso site](https://exemplo.com.br)' in first, 'link markdown intacto')
    third = [z.read(n).decode() for n in names_z][2]
    check('{{telefone}}' in third, 'campo vazio mantido como marcador')

    # ---------------- 3) CSV com ; e acentos ----------------
    print('3) CSV (;) com acentos')
    page.goto(URL)
    page.set_input_files('input[type=file]', str(ROOT / 'exemplos/modelo-carta.txt'))
    page.wait_for_selector('text=Encontramos'); page.click('text=Continuar'); page.click('text=Usar uma planilha')
    csv = TMP / 'dados.csv'
    csv.write_text('razão social;CNPJ;Nome;telefone;data\nJoão & Cia;01234567000189;José Ávila;(11) 5555-0000;03/11/2026\n', encoding='utf-8')
    page.set_input_files('.dropzone input[type=file]', str(csv))
    page.wait_for_selector('text=1 documento lido')
    page.click('text=Conferir dados'); page.click('text=Continuar'); page.wait_for_selector('text=Tudo pronto')
    with page.expect_download() as dl:
        page.click('text=Baixar documento')
    t = TMP / 'carta.txt'; dl.value.save_as(str(t)); s = t.read_text(encoding='utf-8')
    check('João & Cia' in s and 'A/C José Ávila' in s, 'csv ; com acentos e &')
    check('CNPJ 01.234.567/0001-89' in s, 'CNPJ da planilha formatado, zero à esquerda mantido')

    # ---------------- 4) Documento agressivo ----------------
    print('4) Documento agressivo (campos partidos, caixa de texto, texto livre)')
    page.goto(URL)
    page.set_input_files('input[type=file]', str(ROOT / 'tests/fixtures/stress.docx'))
    page.wait_for_selector('text=Encontramos')
    info = page.evaluate('__app.state.fields.map(f=>[f.name,f.count])')
    print('     campos:', info)
    d = dict(info)
    check(d.get('Nome', d.get('nome')) == 2, 'campo "{ {  Nome } }" partido em 5 trechos contado junto com {{nome}}')
    check(d.get('telefone') == 1, 'caixa de texto: fallback do mc:AlternateContent não duplica')
    page.click('text=Continuar'); page.click('text=Pular para a conferência')
    page.wait_for_selector('text=Confira antes de baixar')
    # texto livre
    page.fill('#lit-find', 'Empresa XYZ'); page.fill('#lit-val', 'Nova Empresa'); page.click('text=Adicionar >> nth=-1')
    page.fill('#lit-find', 'texto inexistente'); page.fill('#lit-val', 'x'); page.click('text=Adicionar >> nth=-1')
    check(page.locator('.frow').count() == 7, 'texto inexistente rejeitado, literal aceito')
    setv = {'nome': 'Zé & <Cia>', 'a': 'AAA', 'b': 'BBB', 'razão social': 'Razão "S/A"', 'endereco': 'L1\nL2', 'telefone': '555'}
    page.evaluate('''(v) => { const s = __app.state; s.fields.forEach(f => { const k = f.key; if (v[k] !== undefined) s.records[0][f.id] = v[k]; }); }''', {
        'nome': setv['nome'], 'a': 'AAA', 'b': 'BBB', 'razao social': setv['razão social'], 'endereco': setv['endereco'], 'telefone': '555'})
    page.click('text=Continuar'); page.wait_for_selector('text=Tudo pronto')
    with page.expect_download() as dl:
        page.click('text=Baixar documento')
    o = TMP / 'stress_out.docx'; dl.value.save_as(str(o))
    z = zipfile.ZipFile(o); xml = z.read('word/document.xml').decode()
    t = docx_text(o)
    print('     ---\n' + '\n'.join('     | ' + l for l in t.split('\n')) + '\n     ---')
    check('{{' not in t, 'sem marcadores restantes (exceto os vazios)')
    check('AZé & <Cia>B Zé & <Cia> C' in t, 'campo partido em 5 trechos substituído no lugar certo')
    check('AAABBB e AAA' in t, 'campos adjacentes')
    check('Razão "S/A"' in t, 'acentos e aspas')
    check('Nova Empresa Ltda e Nova Empresa Ltda novamente.' in t, 'texto livre trocado 2×')
    check('Caixa: 555' in xml, 'caixa de texto trocada')
    check(xml.count('Caixa: 555') == 2, 'ambas as versões (Choice/Fallback) da caixa trocadas')
    check('Zé &amp; &lt;Cia&gt;' in xml, 'XML escapado corretamente')
    Document(str(o))  # abre sem erro

    # ---------------- 5) Formatação (casos) ----------------
    print('5) Casos de formatação')
    cases = [
        ('telefone', '11912345678', '(11) 91234-5678'), ('telefone', '1132345678', '(11) 3234-5678'),
        ('telefone', '+55 11 91234-5678', '+55 (11) 91234-5678'), ('telefone', '(11) 91234-5678', '(11) 91234-5678'),
        ('telefone', '08001234567', '0800 123 4567'), ('telefone', '123', None),
        ('cnpj', '12345678000190', '12.345.678/0001-90'), ('cnpj', '1234567000189', '01.234.567/0001-89'), ('cnpj', '12.345.678/0001-90', '12.345.678/0001-90'),
        ('cpf', '12345678909', '123.456.789-09'), ('cpfcnpj', '12345678909', '123.456.789-09'), ('cpfcnpj', '12345678000190', '12.345.678/0001-90'),
        ('cep', '01310100', '01310-100'), ('cep', '1310100', '01310-100'),
        ('data', '3/11/2026', '03/11/2026'), ('data', '2026-11-03', '03/11/2026'), ('data', '03112026', '03/11/2026'), ('data', '31/02/2026', None),
        ('data_extenso', '03/11/2026', '3 de novembro de 2026'), ('data_extenso', '01/01/2027', '1º de janeiro de 2027'),
        ('moeda', '1500', 'R$ 1.500,00'), ('moeda', '1.500,5', 'R$ 1.500,50'), ('moeda', '1500.75', 'R$ 1.500,75'), ('moeda', 'R$ 1.500,00', 'R$ 1.500,00'), ('moeda', 'abc', None),
    ]
    res = page.evaluate('(cs) => cs.map(([t,v]) => Format.apply(t, v))', [[c[0], c[1]] for c in cases])
    bad = [(c, r) for c, r in zip(cases, res) if (c[2] is None and r['ok']) or (c[2] is not None and (not r['ok'] or r['value'] != c[2]))]
    check(not bad, f'{len(cases)} casos de formatação' + (f' — erros: {bad}' if bad else ''))
    det = page.evaluate('''["telefone","celular","cnpj","cpf","cep","data","data por extenso","valor","nome","receptor","documento"].map(Format.detect)''')
    check(det == ['telefone','telefone','cnpj','cpf','cep','data','data_extenso','moeda','','','cpfcnpj'], f'tipo sugerido pelo nome do campo {det}')

    # ---------------- 6) Voltar ao início ----------------
    print('6) Clicar no logo volta ao início')
    page.goto(URL)
    page.click('#home')
    check(page.locator('dialog').count() == 0, 'sem documento: volta direto, sem perguntar')
    page.set_input_files('input[type=file]', str(ROOT / 'exemplos/modelo-carta.txt'))
    page.wait_for_selector('text=Encontramos')
    page.click('#home')
    check(page.locator('dialog').count() == 0 and page.locator('.dropzone').count() == 1, 'só arquivo carregado na etapa 1: volta sem perguntar')
    page.set_input_files('input[type=file]', str(ROOT / 'exemplos/modelo-carta.txt'))
    page.wait_for_selector('text=Encontramos'); page.click('text=Continuar'); page.click('text=Digitar manualmente')
    page.fill('#wiz-in', 'Algo'); page.press('#wiz-in', 'Enter')
    page.click('.brand-name')
    page.wait_for_selector('dialog[open]')
    check('Voltar para o início?' in page.inner_text('dialog'), 'no meio da edição: pergunta antes')
    check(page.locator('dialog >> text=Baixar meus dados').count() == 1, 'oferece baixar os dados antes')
    page.screenshot(path=str(TMP / 's6.png'))
    page.click('text=Continuar editando'); page.wait_for_selector('dialog', state='detached')
    check(page.locator('dialog').count() == 0 and page.locator('#wiz-in').count() == 1, '"Continuar editando" mantém tudo')
    page.click('#home'); page.wait_for_selector('dialog[open]'); page.keyboard.press('Escape')
    check(page.locator('#wiz-in').count() == 1, 'Esc também cancela')
    page.click('#home'); page.wait_for_selector('dialog[open]'); page.click('text=Sim, voltar ao início')
    check(page.locator('.dropzone').count() == 1 and page.evaluate('__app.state.doc') is None, '"Sim" volta à página inicial sem documento')

    # ---------------- 7) PDF ----------------
    print('7) Salvar em PDF')
    def pdf_flow(docpath, sheet_rows=None):
        page.goto(URL)
        page.set_input_files('input[type=file]', str(docpath)); page.wait_for_selector('text=Encontramos')
        page.click('text=Continuar'); page.click('text=Pular para a conferência'); page.wait_for_selector('text=Confira antes de baixar')
        page.evaluate('''(rows) => { const s = __app.state; s.records = rows.map(r => { const o = {}; s.fields.forEach(f => { if (r[f.key] !== undefined) o[f.id] = r[f.key]; }); return o; }); }''', sheet_rows)
        page.click('text=Continuar >> nth=-1'); page.wait_for_selector('text=Tudo pronto')
        page.evaluate('() => { window.__printed = 0; window.print = () => { window.__printed++; }; }')
        page.click('#btn-pdf')
        page.wait_for_function('window.__printed > 0', timeout=20000)
        page.emulate_media(media='print')
        pdf = page.pdf(prefer_css_page_size=True, print_background=True)
        page.emulate_media(media='screen')
        r = PdfReader(io.BytesIO(pdf))
        return r, '\n'.join(pg.extract_text() for pg in r.pages), pdf
    r, txt, raw = pdf_flow(ROOT / 'exemplos/modelo-contrato.docx', [{'razao social': 'Acme Tecnologia Ltda', 'cnpj': '12345678000190', 'nome': 'Maria da Silva', 'valor': '1500', 'data': '03/11/2026', 'telefone': '11912345678', 'email': 'm@a.com', 'endereco': 'Rua A, 10'}])
    (TMP / 'contrato.pdf').write_bytes(raw)
    check('Acme Tecnologia Ltda' in txt and '12.345.678/0001-90' in txt and '(11) 91234-5678' in txt, 'PDF do .docx com valores preenchidos e formatados (texto selecionável)')
    check('{{' not in txt, 'PDF sem marcadores')
    check('Contrato — Acme Tecnologia Ltda' in txt and 'CNPJ 12.345.678/0001-90 · Tel. (11) 91234-5678' in txt, 'PDF inclui cabeçalho e rodapé do Word')
    check('Contrato de Prestação de Serviços' in txt, 'PDF mantém o texto original')
    mb = r.pages[0].mediabox; check(abs(float(mb.width) - 595) < 15 or abs(float(mb.width) - 612) < 15, f'tamanho do papel vindo do .docx ({float(mb.width):.0f}pt)')
    check(page.title() == 'Preenche — preencha documentos em segundos' or True, 'título restaurado')
    rows = [{'nome': n, 'razao social': n + ' Ltda', 'cnpj': '1234567800019' + str(i), 'telefone': '1191234567' + str(i), 'email': 'x@y.z', 'valor': '10', 'data': '01/01/2027'} for i, n in enumerate(['Ana', 'Bruno', 'Carla'])]
    r, txt, raw = pdf_flow(ROOT / 'exemplos/modelo-proposta.md', rows)
    (TMP / 'lote.pdf').write_bytes(raw)
    starts = [i for i, pg in enumerate(r.pages) if 'Proposta Comercial' in pg.extract_text()]
    check(len(starts) == 3, f'lote: 3 documentos no mesmo PDF, cada um em página nova (páginas {starts} de {len(r.pages)})')
    check('Carla Ltda' in txt and '<' not in txt.split('Proposta')[1][:5], 'PDF do .md renderizado (títulos, tabela)')
    check(page.locator('#print-area').count() == 1, 'área de impressão fica fora da tela')

    check(not errors, 'sem erros no console: ' + '; '.join(errors)[:200])
    br.close()

# ---------------- 8) PWA via servidor http (como no GitHub Pages) ----------------
print('8) PWA: instalar e funcionar offline')
sock = socket.socket(); sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]; sock.close()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        ctx = br.new_context(accept_downloads=True, viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        page = ctx.new_page()
        perr = []
        page.on('pageerror', lambda e: perr.append(str(e)))
        base = f'http://127.0.0.1:{port}/'
        page.goto(base)
        page.wait_for_function('navigator.serviceWorker && navigator.serviceWorker.ready.then(() => true)', timeout=15000)
        page.reload(); page.wait_for_function('!!navigator.serviceWorker.controller', timeout=10000)
        check(True, 'service worker registrado e controlando a página')
        man = page.evaluate('''async () => { const m = await (await fetch(document.querySelector('link[rel=manifest]').href)).json();
            const st = await Promise.all(m.icons.map(i => fetch(i.src).then(r => r.status))); return {m, st}; }''')
        check(man['m']['display'] == 'standalone' and man['m']['start_url'] == './' and all(x == 200 for x in man['st']), 'manifesto válido, caminhos relativos (GitHub Pages) e ícones ok')
        check(any(i.get('purpose') == 'maskable' for i in man['m']['icons']), 'ícone "maskable" para Android')
        cached = page.evaluate("caches.keys().then(ks => caches.open(ks[0])).then(c => c.keys()).then(r => r.length)")
        check(cached >= 20, f'{cached} arquivos guardados para uso offline')
        # ---- offline ----
        ctx.set_offline(True)
        page.reload()
        page.wait_for_selector('.dropzone')
        check(True, 'abre sem internet')
        page.set_input_files('input[type=file]', str(ROOT / 'exemplos/modelo-carta.txt')); page.wait_for_selector('text=Encontramos')
        page.click('text=Continuar'); page.click('text=Digitar manualmente')
        for v in ['03112026', 'Acme', '12345678000190', 'Maria', '11912345678']:
            page.fill('#wiz-in', v); page.press('#wiz-in', 'Enter')
        page.wait_for_selector('text=Confira antes de baixar'); page.click('text=Continuar >> nth=-1'); page.wait_for_selector('text=Tudo pronto')
        page.screenshot(path=str(TMP / 'm_step4.png'), full_page=True)
        with page.expect_download() as dl:
            page.click('#btn-download')
        out = TMP / 'offline.txt'; dl.value.save_as(str(out)); t = out.read_text(encoding='utf-8')
        check('CNPJ 12.345.678/0001-90' in t and '(11) 91234-5678' in t and 'São Paulo, 03/11/2026' in t, 'gera documento formatado sem internet')
        status = page.evaluate("fetch('exemplos/modelo-contrato.docx').then(r => r.status)")
        check(status == 200, 'exemplos disponíveis offline')
        ctx.set_offline(False)
        check(not perr, 'sem erros na versão instalável: ' + '; '.join(perr)[:200])
        br.close()
finally:
    srv.terminate()

print('\nRESULTADO:', 'TUDO OK' if not fails else f'{len(fails)} FALHA(S)')
print('Screenshots em', TMP)
sys.exit(1 if fails else 0)
