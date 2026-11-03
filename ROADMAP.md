# Roadmap — Preenche (nome provisório)

> Documento vivo: atualizamos a cada etapa do desenvolvimento.
> **Legenda:** ✅ feito · 🚧 em andamento · 📝 planejado · ❓ decisão em aberto
> **Última atualização:** 03/11/2026 — v0.2 (PDF + app instalável/offline)

---

## 1. Visão

App web, de cores claras e muito simples de usar, em que a pessoa:

1. envia um documento-modelo (`.docx`, `.txt` ou `.md`) que tem campos como nome, telefone, CNPJ…;
2. informa os valores digitando um a um **ou** importando uma planilha;
3. confere (e edita, adiciona ou remove) o que será trocado, vendo uma prévia;
4. baixa o documento pronto — ou vários, se a planilha tiver várias linhas.

**Princípio de privacidade:** tudo roda no navegador. Nenhum arquivo é enviado a servidor. Isso permite publicar no GitHub Pages sem backend.

---

## 2. Decisões de arquitetura

| # | Decisão | Status | Motivo |
|---|---------|--------|--------|
| A1 | **HTML + CSS + JavaScript puro**, sem build, sem framework | ✅ | Abre com duplo clique (`index.html`) e funciona direto no GitHub Pages. |
| A2 | Nada de Python/Node em servidor | ✅ | GitHub Pages só serve arquivos estáticos. Python no navegador (Pyodide) pesaria ~10 MB+ e seria lento para abrir. |
| A3 | Bibliotecas **incluídas na pasta `vendor/`** (JSZip, SheetJS) | ✅ | Funciona offline e o usuário não instala nada. |
| A4 | `.docx` editado direto no XML interno (zip) | ✅ | Preserva fontes, tabelas, imagens, cabeçalho e rodapé. Só o texto dos campos muda. |
| A5 | Substituição que **funciona mesmo quando o Word divide o campo em pedaços** | ✅ | O Word costuma quebrar `{{nome}}` em vários trechos internos ("runs"). O motor junta o texto do parágrafo, localiza o campo e redistribui. |
| A6 | Interface em português do Brasil | ✅ | Público-alvo. Estrutura pronta para outros idiomas depois. |
| A7 | Sem salvar nada no navegador (sem localStorage) na v0.1 | ✅ | Documentos têm dados sensíveis (CNPJ, telefone). |

---

## 3. Como identificar os campos (a decisão mais importante)

Comparativo das formas possíveis:

| Forma | Funciona em | Falsos positivos | Facilidade p/ o usuário | Veredito |
|-------|-------------|------------------|--------------------------|----------|
| **`{{campo}}`** (chaves duplas) | docx, txt, md | Quase nenhum | Fácil de digitar e de achar com Ctrl+F | ✅ **Padrão recomendado** |
| `[campo]` (colchetes) | docx, txt, md | Médio: conflita com links do Markdown `[texto](url)` e com "[sic]", "[•]" | Muito natural | 🟡 Opcional (em *Opções avançadas*) |
| `[[campo]]` | docx, txt, md | Baixo | Boa | 🟡 Opcional |
| `MAIÚSCULAS` | docx, txt, md | **Alto**: "CNPJ", "LTDA", títulos e siglas seriam confundidos com campos | Fácil, mas ambíguo | ❌ Descartado |
| Texto **vermelho / destacado** no Word | **Só docx** | Médio: a cor pode ter outro uso; se o texto for copiado de outro lugar, perde a cor | Visual, mas a cor não diz *qual* campo é | 📝 Modo opcional na v0.3 (para documentos antigos) |
| Controles de conteúdo do Word | Só docx | Nenhum | Difícil: exige a aba Desenvolvedor do Word | 📝 Avaliar na v1.0 |
| **Texto livre** (o usuário diz "troque *Empresa XYZ* por …") | docx, txt, md | Nenhum (é literal) | Fácil | ✅ Já incluso na v0.1 como complemento |

**Recomendação:** `{{campo}}` como padrão + "texto livre" como plano B para documentos que já existem sem marcações. A cor vermelha entra depois, só como atalho para documentos legados.

**Por que `{{ }}` e não só `[ ]`?** É o formato usado por quase todo gerador de documentos (mala direta, contratos, e-mails), então quem já viu "template" reconhece. Sobrevive a formatação, é fácil de achar com Ctrl+F e praticamente não aparece em texto normal.

**Regras de reconhecimento (v0.1):**

- O nome do campo pode ter letras, números, espaços, acentos e `_` — ex.: `{{nome}}`, `{{Razão Social}}`, `{{data_assinatura}}`.
- Espaços dentro das chaves são ignorados: `{{ nome }}` = `{{nome}}`.
- Maiúsculas/minúsculas e acentos **não** diferenciam: `{{Nome}}` e `{{nome}}` são o mesmo campo.
- O mesmo campo pode aparecer várias vezes; todas as ocorrências são trocadas.
- Funciona em corpo, tabelas, cabeçalho, rodapé, notas de rodapé e caixas de texto.

---

## 4. Fluxo do usuário (4 passos)

```
1 Documento  →  2 Dados  →  3 Conferir  →  4 Baixar
```

1. **Documento** — arrastar/escolher o arquivo. O app mostra "Encontramos N campos" com a lista. Link para baixar documentos de exemplo e um quadro "Como marcar os campos".
2. **Dados** — duas opções lado a lado:
   - **Digitar manualmente:** o app pergunta campo por campo ("Campo 2 de 5 — telefone"), mostrando o trecho do documento onde ele aparece. `Enter` avança.
   - **Usar planilha:** baixa a planilha-modelo já com os campos identificados → preenche → envia de volta.
3. **Conferir** — lista de campos (editar valor, ignorar/restaurar, adicionar texto livre) + **prévia** do documento com destaque: verde = será trocado, âmbar = sem valor. Se houver várias linhas na planilha, navega entre os documentos.
4. **Baixar** — um arquivo, ou um `.zip` com um documento por linha. Também dá para baixar os dados em planilha.

---

## 5. Planilha

- **Planilha-modelo gerada pelo app** com os campos encontrados no documento (`.xlsx`). Colunas formatadas como **texto** para não perder zeros à esquerda (CNPJ, CEP, telefone). Aba "Instruções" incluída.
- **Layout padrão (horizontal):** 1ª linha = nomes dos campos; **cada linha seguinte = um documento**.

  | nome | telefone | cnpj |
  |------|----------|------|
  | Ana Souza | (11) 99999-0000 | 12.345.678/0001-90 |
  | Bruno Lima | (21) 98888-1111 | 98.765.432/0001-10 |

- **Também aceito (vertical):** duas colunas `Campo | Valor` para um único documento.
- Formatos aceitos: `.xlsx`, `.xls`, `.csv` (com `,` ou `;`).
- Cabeçalhos são comparados ignorando maiúsculas, acentos e chaves (`{{Nome}}` = `nome`).
- Relatório de importação: colunas reconhecidas, campos que ficaram sem coluna, colunas desconhecidas.

---

## 6. Regras de comportamento

| Situação | Comportamento (v0.1) | Status |
|----------|----------------------|--------|
| Campo sem valor | O marcador `{{campo}}` é **mantido** no documento e o app avisa antes de baixar | ❓ ver D2 |
| Valor com várias linhas | Vira quebra de linha no Word (Shift+Enter ao digitar) | ✅ |
| Valor com caracteres especiais (`& < >`) | Tratados corretamente | ✅ |
| Formatação do campo (negrito, fonte) | O valor herda a formatação do início do marcador | ✅ |
| Arquivo `.txt` em Windows-1252 (acentos antigos) | Detectado e lido corretamente; saída em UTF-8 | ✅ |
| `.doc` (Word antigo), `.pdf` | Não suportados — orientar a salvar como `.docx` | 📝 |
| Documento com 0 campos | Mensagem amigável + opção de usar só "texto livre" | ✅ |
| Arquivo `.docx` protegido por senha / corrompido | Mensagem de erro clara | ✅ |

---

## 7. Fases

### v0.1 — Primeira versão utilizável ✅ (aguardando seu teste)
- [x] Estrutura do projeto + bibliotecas locais
- [x] Roadmap
- [x] Motor de substituição (`docx`, `txt`, `md`) — campos divididos em trechos
- [x] Detecção de campos + contexto
- [x] Digitação campo a campo
- [x] Planilha-modelo + importação (várias linhas → `.zip`)
- [x] Conferência: editar, ignorar, adicionar texto livre, prévia
- [x] Download (único, `.zip`) + exportar dados em planilha
- [x] Documentos de exemplo
- [x] Testes automatizados no navegador
- [x] README com passo a passo do GitHub Pages

### v0.1.1 — Pedidos após o primeiro teste ✅
- [x] Clicar no logo/nome volta ao início. Se houver dados preenchidos, pergunta antes ("Voltar para o início?") e oferece baixar os dados em planilha. Sem dados, volta direto.
- [x] Aviso do navegador ao fechar ou recarregar a aba com dados preenchidos
- [x] **Formatação automática** por campo: caixa "Formatar como [tipo]" no preenchimento manual e na conferência, com prévia ao vivo ("→ (11) 91234-5678")
  - Tipos: telefone, CNPJ, CPF, CPF ou CNPJ, CEP, data, data por extenso, valor em R$
  - Tipo sugerido pelo nome do campo (`{{telefone}}`, `{{cnpj}}`, `{{valor}}`…) e já marcado; o usuário pode desmarcar ou trocar
  - Vale também para dados da planilha; recupera zeros à esquerda perdidos pelo Excel (CNPJ, CPF, CEP)
  - Valor não reconhecido (ex.: telefone incompleto) fica como digitado, com aviso

### v0.2 — PDF e app no celular ✅
- [x] **Salvar em PDF**: o documento preenchido é desenhado com a formatação do Word (fontes, negrito, tabelas, imagens, cabeçalho e rodapé) e abre a janela de impressão → "Salvar como PDF". Texto selecionável e nítido.
  - Tamanho do papel e margens copiados do `.docx`
  - `.md` vira PDF formatado (títulos, tabelas, negrito); `.txt` mantém as quebras de linha
  - Lote: **todos os documentos num PDF só**, cada um começando em página nova
- [x] **PWA (app instalável)** pelo GitHub Pages
  - Manifesto, ícones (incl. "maskable" para Android e ícone do iPhone)
  - Funciona **sem internet** depois da primeira visita (service worker: rede primeiro, cache como reserva)
  - Botão **Instalar** no topo (Android/Chrome/Edge); no iPhone, o botão mostra o passo a passo "Compartilhar → Adicionar à Tela de Início"
  - Botão **Compartilhar** na etapa final quando o aparelho permite (enviar direto por WhatsApp, e-mail…)
  - Caminhos relativos: funciona em `usuario.github.io/repositorio/`

**Limitações conhecidas (v0.2)**
- No PDF, cabeçalho e rodapé do Word aparecem uma vez (no início e no fim do documento), não repetidos em toda página.
- Layouts muito elaborados do Word (caixas de texto flutuantes, colunas, formas) podem sair um pouco diferentes no PDF. O `.docx` baixado continua idêntico ao original.
- "Compartilhar" depende do celular aceitar o tipo de arquivo; quando não aceita, o app avisa e o "Baixar" continua disponível.
- No iPhone, o PDF é salvo pela tela de impressão (gesto de "pinça" na prévia ou "Salvar em Arquivos"), conforme a versão do iOS.

### v0.3 — Conforto
- [ ] Formatação: valor por extenso ("mil e quinhentos reais"), validação de dígito do CPF/CNPJ
- [ ] Valor vazio intencional ("apagar o campo")
- [ ] Renomear campo na conferência (altera o marcador no documento)
- [ ] Duplicar documento e colar várias linhas direto na conferência (adicionar/remover já existe na v0.1)
- [ ] Atalhos de teclado e melhorias de acessibilidade
- [ ] Marcar campos diretamente na prévia (selecionar texto → "transformar em campo")

### v0.4 — Documentos legados
- [ ] Modo "texto destacado": reconhecer trechos em vermelho/amarelo no Word e pedir o nome do campo
- [ ] Sugestão automática de campos (padrões de CNPJ, CPF, e-mail, telefone no texto)
- [ ] `.odt` e `.rtf`

### v1.0 — Polimento
- [ ] Salvar "perfis" de dados no navegador (opt-in, com aviso de privacidade)
- [ ] Idiomas (EN/ES)
- [ ] PDF com cabeçalho/rodapé repetidos em cada página e PDFs separados por documento (dentro do .zip)
- [ ] Receber arquivos pelo menu "Compartilhar" do celular (ex.: modelo vindo do WhatsApp direto para o app)
- [ ] Abrir `.docx` com duplo clique no computador quando o app estiver instalado
- [ ] Modo escuro opcional

---

## 8. Decisões em aberto — preciso de você

| # | Pergunta | Sugestão |
|---|----------|----------|
| **D1** | Aprova `{{campo}}` como padrão (com `[campo]` e `[[campo]]` como opções avançadas)? | Sim |
| **D2** | Campo sem valor: **manter** o marcador no documento (e avisar) ou **apagar** o marcador? | Manter e avisar — evita enviar documento com buraco sem perceber |
| **D3** | Planilha com várias linhas gerando **vários documentos num .zip** — faz sentido pro seu uso, ou é sempre 1 documento? | Manter (custa pouco e é muito útil) |
| ~~D4~~ | ~~Formatação automática~~ | ✅ Decidido: sim, feito na v0.1.1 (marcada por padrão quando o tipo é reconhecido) |
| **D5** | Nome do app. "Preenche" é provisório. | Escolher antes de publicar |
| ~~D6~~ | ~~Exportar PDF~~ | ✅ Decidido: feito na v0.2 (via "Salvar como PDF" do navegador) |
| **D7** | O repositório do GitHub Pages será público? (O app não envia dados, mas o código fica visível.) | Tanto faz para a segurança dos documentos |
| **D8** | Precisa lembrar dados entre sessões (ex.: seus dados de empresa preenchidos)? | Só na v1.0, opt-in |
| **D9** | Os documentos reais usam caixas de texto, colunas ou campos de formulário do Word? | Se sim, mande um exemplo para testarmos |

---

## 9. Estrutura de pastas

```
preenche/
├── index.html          # página única
├── css/style.css       # visual (cores claras)
├── js/
│   ├── core.js         # detecção e substituição (docx / txt / md)
│   ├── format.js       # formatação automática (telefone, CNPJ, data…)
│   ├── sheet.js        # planilha-modelo e importação
│   ├── pdf.js          # salvar em PDF (impressão)
│   └── app.js          # telas e fluxo
├── vendor/             # JSZip, SheetJS, docx-preview, marked (sem CDN)
├── icons/              # ícones do app instalável
├── manifest.webmanifest # dados do app instalável (PWA)
├── sw.js               # funcionamento offline
├── exemplos/           # documentos de exemplo
├── tests/              # testes automatizados (e2e.py + fixtures)
├── docs/prints/        # prints do README (gerados por docs/gerar_prints.py)
├── ROADMAP.md          # este arquivo
└── README.md           # como usar e publicar
```

## 10. Publicar no GitHub Pages
Passo a passo no `README.md`. Resumo: subir a pasta para um repositório → *Settings → Pages → Deploy from a branch → main / root*.

---

## 11. Histórico

| Data | Mudança |
|------|---------|
| 03/11/2026 | Roadmap criado; arquitetura e método de marcação definidos; início da v0.1 |
| 03/11/2026 | v0.1 implementada: 4 passos, digitação campo a campo, planilha (várias linhas → .zip), conferência com prévia, texto livre. 34 verificações automatizadas passando (campos partidos em até 5 trechos, caixas de texto, cabeçalho/rodapé, CSV com `;`, acentos). |
| 03/11/2026 | v0.1.1: logo volta ao início com confirmação; formatação automática por campo (8 tipos). 48 verificações automatizadas passando. |
| 03/11/2026 | v0.2: salvar em PDF (1 documento ou lote num PDF só); PWA instalável e offline; compartilhar no celular. 65 verificações automatizadas passando (incl. PDF gerado e lido de volta, e uso offline via servidor http). |
| 03/11/2026 | Projeto publicado no GitHub com CI de testes. README em formato de apresentação, com prints do app (desktop, celular, antes e depois) gerados por `docs/gerar_prints.py`. |
