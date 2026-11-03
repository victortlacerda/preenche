# Preenche

[![Testes](https://github.com/victortlacerda/preenche/actions/workflows/testes.yml/badge.svg)](https://github.com/victortlacerda/preenche/actions/workflows/testes.yml)

**Abrir o app:** https://victortlacerda.github.io/preenche/

Preencha documentos `.docx`, `.txt` e `.md` trocando campos como nome, telefone e CNPJ — digitando ou importando de planilha. **Tudo roda no navegador: nenhum arquivo é enviado a servidor.**

## Usar localmente
Dê duplo clique em `index.html`. Não precisa instalar nada nem ter internet (as bibliotecas estão em `vendor/`).
Aberto assim (arquivo local), tudo funciona, menos "Instalar como app", que exige um endereço `https://`, como o do GitHub Pages.

## No celular (app instalável)
Depois de publicado no GitHub Pages, abra o endereço no celular:
- **Android (Chrome):** toque em **Instalar** no topo da página (ou menu ⋮ → *Instalar app*).
- **iPhone (Safari):** toque em **Instalar** para ver o passo a passo: *Compartilhar → Adicionar à Tela de Início*.

Depois da primeira visita o app funciona **sem internet**. Na etapa final há **Salvar em PDF** e, no celular, **Compartilhar** (WhatsApp, e-mail…).

## Como marcar os campos no documento
Escreva o nome entre chaves duplas: `{{nome}}`, `{{cnpj}}`, `{{razão social}}`.
Maiúsculas/acentos não importam; o mesmo campo pode repetir; funciona em tabelas, cabeçalho e rodapé.
Documentos de teste em `exemplos/`.

Campos como `{{telefone}}`, `{{cnpj}}`, `{{cpf}}`, `{{cep}}`, `{{data}}` e `{{valor}}` são formatados automaticamente (pode desligar por campo).

## Publicar no GitHub Pages
1. Crie um repositório no GitHub e envie o conteúdo desta pasta (com `index.html` na raiz).
2. Em **Settings → Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`.
3. Em um ou dois minutos o app estará em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.
4. Para publicar uma atualização, basta enviar os arquivos novos: quem já instalou recebe a versão nova na próxima vez que abrir com internet.

## Testes
Rodam automaticamente no GitHub a cada envio (aba **Actions**). Para rodar no computador:
```
pip install playwright python-docx openpyxl pypdf lxml && playwright install chromium
python3 tests/e2e.py
```
Para recriar os documentos de exemplo: `python3 tests/gerar_exemplos.py`.

## Bibliotecas incluídas (`vendor/`)
- [JSZip](https://stuk.github.io/jszip/) 3.10.1 — MIT
- [SheetJS CE](https://sheetjs.com/) 0.18.5 — Apache-2.0
- [docx-preview](https://github.com/VolodymyrBaydalka/docxjs) 0.4.1 — Apache-2.0
- [marked](https://marked.js.org/) 12.0.2 — MIT

Veja o `ROADMAP.md` para decisões e próximos passos.
