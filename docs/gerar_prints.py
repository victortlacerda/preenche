"""Gera os prints do README (docs/prints/).

Uso, na raiz do projeto:
    python3 docs/gerar_prints.py

Requer: pip install playwright pypdf  (e o Chromium do Playwright)
Os dados usados são fictícios.
"""
import base64, io, subprocess, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / 'index.html').as_uri()
OUT = ROOT / 'docs' / 'prints'
OUT.mkdir(parents=True, exist_ok=True)
TMP = Path(tempfile.mkdtemp())

DADOS = {
    'razão social': 'Acme Tecnologia Ltda', 'cnpj': '12345678000190', 'nome': 'Maria da Silva',
    'valor': '1500', 'data': '03/11/2026', 'telefone': '11912345678', 'email': 'maria@acme.com.br',
    'endereco': 'Av. Paulista, 1000 — Bela Vista, São Paulo/SP',
}
LOTE = [
    {'nome': 'Ana Souza', 'razão social': 'Alfa Engenharia Ltda', 'cnpj': '00123456000100', 'telefone': '11999990000', 'email': 'ana@alfa.com.br', 'valor': '4800', 'data': '01/12/2026'},
    {'nome': 'Bruno Lima', 'razão social': 'Beta Construções S.A.', 'cnpj': '98765432000110', 'telefone': '21988881111', 'email': 'bruno@beta.com.br', 'valor': '12500', 'data': '02/12/2026'},
    {'nome': 'Carla Dias', 'razão social': 'Gama Projetos ME', 'cnpj': '11111111000111', 'telefone': '31977772222', 'email': 'carla@gama.com.br', 'valor': '3200', 'data': '03/12/2026'},
]

SET_RECORDS = '''(rows) => { const s = __app.state; const norm = k => k.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();
  s.records = rows.map(r => { const o = {}; s.fields.forEach(f => { for (const k in r) if (norm(k) === f.key) o[f.id] = r[k]; }); return o; }); }'''


def b64(path):
    return 'data:image/png;base64,' + base64.b64encode(Path(path).read_bytes()).decode()


def open_doc(page, name):
    page.goto(URL)
    page.set_input_files('input[type=file]', str(ROOT / 'exemplos' / name))
    page.wait_for_selector('text=Encontramos')


def to_review(page, rows):
    page.click('text=Continuar'); page.click('text=Pular para a conferência')
    page.wait_for_selector('text=Confira antes de baixar')
    page.evaluate(SET_RECORDS, rows)
    page.click('[aria-label="Documento anterior"]') if page.locator('.recnav').count() else None
    # re-render da conferência com os dados
    page.click('.stepper li:nth-child(2) button'); page.click('text=Pular para a conferência')
    page.wait_for_selector('text=Confira antes de baixar')


def shot(page, name, full=False, clip_h=None):
    if clip_h:
        page.screenshot(path=str(OUT / name), clip={'x': 0, 'y': 0, 'width': page.viewport_size['width'], 'height': clip_h})
    else:
        page.screenshot(path=str(OUT / name), full_page=full)
    print('  ', name)


def pdf_page_png(page, rows, out_png):
    page.evaluate('() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; window.__printed = 0; }')
    page.click('#btn-pdf')
    page.wait_for_function('window.__printed > 0', timeout=20000)
    page.emulate_media(media='print')
    pdf = page.pdf(prefer_css_page_size=True, print_background=True)
    page.emulate_media(media='screen')
    p = TMP / 'x.pdf'; p.write_bytes(pdf)
    subprocess.run(['pdftoppm', '-r', '200', '-png', '-f', '1', '-l', '1', '-singlefile', str(p), str(out_png.with_suffix(''))], check=True)


with sync_playwright() as pw:
    br = pw.chromium.launch()

    # ---------------- Desktop ----------------
    ctx = br.new_context(viewport={'width': 1280, 'height': 820}, device_scale_factor=2)
    page = ctx.new_page()

    page.goto(URL)
    shot(page, '1-inicio.png')

    open_doc(page, 'modelo-contrato.docx')
    shot(page, '2-campos-encontrados.png', clip_h=640)

    page.click('text=Continuar'); page.click('text=Digitar manualmente')
    for v in ['Acme Tecnologia Ltda', '12345678000190', 'Maria da Silva', '1500', '03/11/2026']:
        page.fill('#wiz-in', v); page.press('#wiz-in', 'Enter')
    page.fill('#wiz-in', '11912345678')
    shot(page, '3-digitar-com-formatacao.png', clip_h=700)

    page.press('#wiz-in', 'Enter'); page.fill('#wiz-in', 'maria@acme.com.br'); page.press('#wiz-in', 'Enter')
    page.press('#wiz-in', 'Enter')  # endereço vazio
    page.wait_for_selector('text=Confira antes de baixar')  # endereço fica pendente (âmbar) de propósito
    page.set_viewport_size({'width': 1440, 'height': 900})
    page.evaluate('document.getElementById("paper").style.maxHeight = "560px"')
    page.evaluate('window.scrollTo(0, 0)')
    shot(page, '4-conferir.png')
    page.set_viewport_size({'width': 1280, 'height': 820})

    # Planilha em lote
    open_doc(page, 'modelo-proposta.md')
    page.click('text=Continuar'); page.click('text=Usar uma planilha')
    import openpyxl
    with page.expect_download() as dl:
        page.click('text=Baixar planilha modelo')
    tpl = TMP / 'm.xlsx'; dl.value.save_as(str(tpl))
    wb = openpyxl.load_workbook(tpl); ws = wb['Dados']; hdr = [c.value for c in ws[1]]
    for r, row in enumerate(LOTE, start=2):
        for c, h in enumerate(hdr, start=1): ws.cell(r, c).value = row.get(h, '')
    wb.save(TMP / 'p.xlsx')
    page.set_input_files('.dropzone input[type=file]', str(TMP / 'p.xlsx'))
    page.wait_for_selector('text=3 documentos lidos')
    shot(page, '5-planilha.png', clip_h=760)
    page.click('text=Conferir dados'); page.click('text=Continuar >> nth=-1'); page.wait_for_selector('text=Tudo pronto')
    shot(page, '6-baixar.png', clip_h=800)

    # Antes e depois (PDF)
    open_doc(page, 'modelo-contrato.docx')
    page.click('text=Continuar'); page.click('text=Pular para a conferência'); page.click('text=Continuar >> nth=-1'); page.wait_for_selector('text=Tudo pronto')
    pdf_page_png(page, [], TMP / 'antes.png')
    open_doc(page, 'modelo-contrato.docx')
    page.click('text=Continuar'); page.click('text=Pular para a conferência'); page.wait_for_selector('text=Confira antes de baixar')
    page.evaluate(SET_RECORDS, [DADOS])
    page.click('text=Continuar >> nth=-1'); page.wait_for_selector('text=Tudo pronto')
    pdf_page_png(page, [DADOS], TMP / 'depois.png')
    ctx.close()

    # ---------------- Celular ----------------
    mctx = br.new_context(viewport={'width': 390, 'height': 780}, device_scale_factor=2, is_mobile=True, has_touch=True)
    m = mctx.new_page()
    open_doc(m, 'modelo-contrato.docx')
    m.screenshot(path=str(TMP / 'm1.png'))
    m.click('text=Continuar'); m.click('text=Digitar manualmente')
    for v in ['Acme Tecnologia Ltda']:
        m.fill('#wiz-in', v); m.press('#wiz-in', 'Enter')
    m.fill('#wiz-in', '12345678000190'); m.screenshot(path=str(TMP / 'm2.png'))
    m.press('#wiz-in', 'Enter')
    for v in ['Maria da Silva', '1500', '03/11/2026', '11912345678', 'maria@acme.com.br', 'Av. Paulista, 1000']:
        m.fill('#wiz-in', v); m.press('#wiz-in', 'Enter')
    m.wait_for_selector('text=Tudo pronto') if m.locator('text=Tudo pronto').count() else m.click('text=Continuar >> nth=-1')
    m.wait_for_selector('text=Tudo pronto')
    m.evaluate('() => { document.getElementById("install").hidden = false; }')
    m.screenshot(path=str(TMP / 'm3.png'))
    mctx.close()

    # ---------------- Montagens ----------------
    comp = br.new_page(viewport={'width': 1400, 'height': 900}, device_scale_factor=2)
    phones = ''.join(f'<figure><img src="{b64(TMP / f"m{i}.png")}"><figcaption>{c}</figcaption></figure>'
                     for i, c in [(1, 'Campos encontrados'), (2, 'Digite — já formata'), (3, 'Baixar, PDF ou compartilhar')])
    comp.set_content(f'''<html><body style="margin:0;background:linear-gradient(160deg,#eef1fe,#f6f7fb 55%,#e6f6ed);font-family:system-ui,sans-serif">
      <div id="c" style="display:flex;gap:56px;justify-content:center;padding:56px 60px 44px">
      <style>figure{{margin:0;text-align:center}} img{{width:330px;border-radius:34px;border:10px solid #1c2333;box-shadow:0 24px 60px rgba(28,35,51,.22);display:block}}
      figcaption{{margin-top:18px;font-weight:600;color:#1c2333;font-size:19px}}</style>{phones}</div></body></html>''')
    comp.locator('#c').screenshot(path=str(OUT / '7-celular.png')); print('   7-celular.png')

    for nm in ('antes', 'depois'):
        im = Image.open(TMP / f'{nm}.png'); w, h = im.size
        im.crop((int(w * 0.10), int(h * 0.06), int(w * 0.90), int(h * 0.62))).save(TMP / f'{nm}.png')
    comp.set_content(f'''<html><body style="margin:0;background:#f6f7fb;font-family:system-ui,sans-serif">
      <div id="c" style="display:flex;align-items:center;gap:28px;justify-content:center;padding:44px 48px">
      <style>figure{{margin:0;text-align:center}} img{{width:560px;border-radius:8px;box-shadow:0 10px 36px rgba(28,35,51,.16);display:block;background:#fff}}
      figcaption{{margin-bottom:14px;font-weight:700;color:#1c2333;font-size:20px}} .tag{{display:inline-block;padding:3px 12px;border-radius:999px;font-size:14px;margin-left:8px;vertical-align:2px}}
      .arrow{{font-size:54px;color:#4f6bed;font-weight:700}}</style>
      <figure><figcaption>Modelo <span class="tag" style="background:#fff3dc;color:#a15c07">com {{{{campos}}}}</span></figcaption><img src="{b64(TMP / 'antes.png')}"></figure>
      <div class="arrow">→</div>
      <figure><figcaption>Pronto <span class="tag" style="background:#e6f6ed;color:#178a4a">em PDF ou .docx</span></figcaption><img src="{b64(TMP / 'depois.png')}"></figure>
      </div></body></html>''')
    comp.locator('#c').screenshot(path=str(OUT / '8-antes-e-depois.png')); print('   8-antes-e-depois.png')
    br.close()

# Reduz o tamanho dos arquivos (paleta de 256 cores, sem perda visível)
for p in OUT.glob('*.png'):
    im = Image.open(p).convert('RGB')
    im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(p, optimize=True)
print('Prints em', OUT)
