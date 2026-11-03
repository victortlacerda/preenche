"""Gera os documentos de exemplo (exemplos/) e o documento de teste (tests/fixtures/stress.docx).
Uso, na raiz do projeto:  python3 tests/gerar_exemplos.py
"""
import copy
from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from lxml import etree

def add_split(par, pieces):
    """pieces: list of (text, bold, color) -> separate runs (simulando como o Word quebra campos)"""
    for t, b, c in pieces:
        r = par.add_run(t)
        r.bold = b
        if c: r.font.color.rgb = RGBColor.from_string(c)

# ---------- Exemplo para o usuário ----------
d = Document()
st = d.styles['Normal']; st.font.name = 'Calibri'; st.font.size = Pt(11)
h = d.add_heading('Contrato de Prestação de Serviços', 0)
p = d.add_paragraph()
add_split(p, [('Pelo presente instrumento, ', False, None), ('{{', True, None), ('razão social', True, None), ('}}', True, None),
              (', inscrita no CNPJ sob o nº ', False, None), ('{{cnpj}}', True, None),
              (', doravante denominada CONTRATANTE, e ', False, None), ('{{', False, None), ('nome', False, '1F3A93'), ('}}', False, None),
              (', doravante denominado CONTRATADO, firmam o presente contrato.', False, None)])
d.add_paragraph('Cláusula 1ª — O CONTRATADO prestará serviços à {{razão social}} pelo valor de {{valor}}, a ser pago até {{data}}.')
d.add_paragraph('Cláusula 2ª — Para comunicações, utilize o telefone {{telefone}} ou o e-mail {{email}}.')
d.add_paragraph('Endereço de entrega:\n{{endereco}}')
t = d.add_table(rows=3, cols=2); t.style = 'Table Grid'
rows = [('Responsável', '{{nome}}'), ('Telefone', '{{telefone}}'), ('CNPJ', '{{cnpj}}')]
for i,(a,b) in enumerate(rows):
    t.cell(i,0).text = a
    pr = t.cell(i,1).paragraphs[0]
    half = len(b)//2
    add_split(pr, [(b[:half], False, None), (b[half:], False, None)])
d.add_paragraph()
d.add_paragraph('São Paulo, {{data}}.')
d.add_paragraph('______________________________\n{{nome}}')
sec = d.sections[0]
sec.header.paragraphs[0].text = 'Contrato — {{razão social}}'
sec.footer.paragraphs[0].text = 'CNPJ {{cnpj}} · Tel. {{telefone}}'
d.save('exemplos/modelo-contrato.docx')

# ---------- Documento de teste agressivo ----------
d = Document()
p = d.add_paragraph()
add_split(p, [('A', False, None), ('{', True, None), ('{', False, None), (' Nome ', False, None), ('}', True, None), ('}', False, None), ('B {{nome}} C', False, None)])
p = d.add_paragraph()
add_split(p, [('{{a}}{{b}}', False, None), (' e ', False, None), ('{{', False, None), ('a', True, None), ('}}', False, None)])
d.add_paragraph('Acentuação & símbolos: <ção> "aspas" — {{Razão Social}}')
d.add_paragraph('Texto livre: Empresa XYZ Ltda e Empresa XYZ Ltda novamente.')
d.add_paragraph('Sem campos aqui.')
d.add_paragraph('Linha longa de multilinha: [{{endereco}}]')
# caixa de texto com AlternateContent (Choice + Fallback)
body = d.element.body
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
xml = f'''<w:p xmlns:w="{W}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:v="urn:schemas-microsoft-com:vml"><w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wps:txbx><w:txbxContent><w:p><w:r><w:t>Caixa: {{{{telefone}}}}</w:t></w:r></w:p></w:txbxContent></wps:txbx></w:drawing></mc:Choice><mc:Fallback><w:pict><v:textbox><w:txbxContent><w:p><w:r><w:t>Caixa: {{{{telefone}}}}</w:t></w:r></w:p></w:txbxContent></v:textbox></w:pict></mc:Fallback></mc:AlternateContent></w:r></w:p>'''
el = etree.fromstring(xml)
body.insert(len(body)-1, el)
d.save('tests/fixtures/stress.docx')
print('ok')
