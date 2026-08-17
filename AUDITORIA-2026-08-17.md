# Auditoria agressiva — Ajar · 17 de agosto de 2026

**Baseline:** commit `3edac23` · `index.html` 861.544 bytes, 12.367 linhas · suite 2.911 verde
**Final:** commit `da7ad00` · suite **3.018 verde**, 31 arquivos · 4 verificadores novos

---

## Em 30 segundos

| | Achados | Corrigidos | Abertos |
|---|---|---|---|
| 🔴 Crítico | 3 | **3** | 0 |
| 🟠 Alto | 8 | **7** | 1 |
| 🟡 Médio | 6 | **5** | 1 |
| 🟢 Baixo / latente | 4 | **3** | 1 |
| **Total** | **21** | **18** | **3** |

**Os três críticos, em uma frase cada:**

1. **O telefone de cada aluno guardava as notas privadas da professora sobre os 13 colegas.** Um documento só, regra `read: if isSignedIn()`, baixado em toda carga de página e escrito no `localStorage`. Só a interface filtrava. Sem exploit — bastava abrir o inspetor de armazenamento.
2. **Três gabaritos ensinavam inglês quebrado.** `"it's the whole only way I get through the commute"` era a resposta modelo que o aluno deve imitar.
3. **Nove de dez lacunas certas valiam ZERO.** E 20 dos 50 itens da seção de Reading são esses blocos, então todo padrão que a professora lê foi construído sobre isso.

---

## O que eu discordei do documento, e por quê

O documento pede 11 fases e 13 artefatos. Segui a ordem de risco dele — autorização e dados primeiro, aparência por último — mas três recomendações contrariam a arquitetura, e obedecer teria piorado o produto:

**"Use TypeScript where possible" / migrar para `src/` modular.** Não há `package.json` por decisão. O app é um arquivo servido como está, e é por isso que um conserto chega na sala em segundos. Adicionar build é adicionar uma coisa que pode quebrar entre o conserto e a aula. **Não feito.**

**"Elimina handlers inline como `onclick`."** São 129. O app é construído sobre eles. Uma regra violada na linha um não é seguida, é ignorada — e as boas regras ao lado passam a ser ignoradas junto. A direção está certa e foi aplicada onde havia bug real (os botões de áudio saíram do atributo). **Migração gradual, não regra absoluta.**

**"CSP com nonces, sem `unsafe-inline`."** Com 9 blocos de script inline, 233 `style=` e 129 handlers, essa CSP não endurece o app: mata. E a versão que "funciona" seria uma que alguém enfraqueceu depois sem escrever por quê. **Entreguei CSP parcial e documentei o teto em voz alta**, porque `connect-src` faz o trabalho de verdade — um script injetado não tem para onde mandar o que rouba.

**13 artefatos.** Escrevi este resumo e mais nada em Markdown. Os outros 12 já existem como **código executável**: matriz de autorização, contrato de conteúdo, gabaritos, acessibilidade, deploy e cabeçalhos são 31 arquivos de checagem que falham quando a regra é rompida. Um documento não pode falhar.

---

## Corrigidos

### 🔴 SEC-001 — notas privadas da professora em todos os aparelhos
`classroom/notes` era **um** documento `{ notes: { Ana: "…", Bruno: "…" } }`. A regra é `read: if isSignedIn()` e todo visitante está logado anonimamente. `hydrateNotesFromCloud` buscava em **toda** carga e gravava o objeto inteiro no `localStorage`.
**Agora:** um documento por aluno, buscado por nome. `pruneForeignNotes()` limpa o que versões antigas já deixaram nos telefones. Nenhuma mudança de regra foi necessária — `classroom/*` já era escrita-só-da-professora.
**O que isto NÃO é:** privacidade criptográfica. Auth anônima não dá identidade para checar um pedido, então quem souber o nome de um colega ainda pode pedir aquela nota. Mesmo limite aceito do histórico, e está escrito no código. O que acabou foi o despejo automático da turma inteira. **24 checagens.**

### 🔴 CONTENT-005 — três gabaritos com inglês quebrado
Uma reescrita em massa trocou `a` → `a single`, `the` → `the whole`, `about` → `round about` sem ler as frases. Onze strings, três delas o gabarito. Confirmei que foram escritas assim, não geradas: as formas quebradas estão no arquivo e as corretas não.

### 🔴 CONTENT-001 — 9 de 10 valia zero
`logUsage(..., ok ? 1 : 0)` onde `ok` significa as dez. **Agora proporcional.** Verificado no navegador: 0,9.

### 🟠 CONTENT-002 — o enunciado pedia as letras, o corretor exigia a palavra
A acusação do seu documento, reproduzida exatamente: `doz___` + `"ens"` era marcado errado. **As duas grafias são aceitas agora** — as duas leituras são razoáveis e nenhuma deve custar ponto.

### 🟠 CONTENT-003 — 15 de 44 frases escondiam uma palavra a mais
E nada dizia. Quem usava todos os blocos errava sem saber por quê. **A tela avisa**, calculado do dado para não envelhecer.

### 🟠 CONTENT-006 — 141 palavras valiam zero
A ETS publica um **piso** de 100; estávamos pontuando faixa fechada 100–130. Quem escrevia 140 palavras bem argumentadas era registrado como falha. **Piso agora**, e o número de cima voltou a ser conselho.

### 🟠 CONTENT-009 — "seria pontuado como está" e nada era pontuado
O tempo esgotado chamava `goToNextExercise`, que não corrige nada: a tentativa era descartada e o denominador da seção encolhia calado. **Cada tipo corrige antes de avançar**, que é o que a mensagem sempre prometeu.

### 🟠 A11Y-003 — meu `aria-live` gritava a cada segundo
**Eu introduzi isso ontem** e o agente estava certo em me contradizer. `polite` espera uma pausa — e anuncia de todo jeito, uma vez por segundo, por toda a tarefa: 400 interrupções numa redação de 7 minutos, lidas por cima da digitação do próprio aluno. **E minha própria checagem exigia isso.** Agora o relógio é visual e uma região separada fala em cinco limiares.

### 🟠 A11Y-004 — o foco morria a cada re-render
Responder uma questão jogava o foco no `<body>`, então um usuário de teclado voltava ao topo do documento com o relógio correndo. Corrigido no invólucro **e** com um `MutationObserver`, porque seis handlers de resposta não passam pelo invólucro. Verificado no navegador antes e depois.

### 🟠 A11Y-005 — 8 de 10 resultados não eram anunciados
Minha correção de ontem cobriu 2. As outras oito são as de múltipla escolha e fala — a maior parte do app.

### 🟡 Cabeçalhos de segurança: não havia nenhum
`_headers` só tinha cache. CSP, HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy` e anti-framing, todos ausentes. Validei no navegador que a CSP permite exatamente o que o app carrega.

### 🟡 Rotas especiais e privacidade dos links
`robots.txt` e `sitemap.xml` não existiam. Criados com `canonical` — e isso é privacidade antes de SEO: um link de compartilhamento leva o `schoolId`, que é senha morando numa URL.

### 🟡 A11Y-007 / 001 / 006 — modal, marcos, grupos
Modal sem `role="dialog"`, sem prender foco, sem devolver foco. Zero marcos e nenhum link de salto. Alternativas sem semântica de grupo. Todos corrigidos.

### 🟢 CONTENT-007, 010, 011
90s para dez lacunas contra os 360s que a própria conta do app implica. Conselho da entrevista (150 palavras) contradizia o próprio aviso de "rápido demais" (190 wpm). Destaque de vocabulário por substring — latente, resolvido com limite de palavra.

---

## Abertos — decisão sua

### 🟠 CONTENT-004 — dá para acertar sem entender inglês
Um aluno que nunca lê a pergunta e sempre escolhe a opção mais curta (ou mais longa):

| tipo | n | sempre a mais longa | sempre a mais curta |
|---|---|---|---|
| conversation | 56 | **57%** | 14% |
| passage | 140 | 33% | **44%** |
| choose-response | 84 | 20% | **43%** |
| announcement | 56 | **43%** | 25% |
| talk | 112 | 30% | **38%** |

Acaso é 25%. **Conversation é mais que o dobro com o som desligado.** Isso infla todo escore que o app relata e treina uma estratégia que a prova real não recompensa.

**Não corrigi de propósito.** Rebalancear centenas de distratores é autoria de conteúdo, e a edição em massa que quebrou três gabaritos é exatamente como isso termina sem supervisão. Está travado nos números de hoje: não pode piorar.

### 🟠 Nada executa o `firestore.rules`
Nenhum teste roda as regras — são verificadas por leitura. É o único lugar onde um erro expõe dado real de aluno. Precisa do emulador do Firebase (npm + Java), o que contraria a ausência de toolchain. **Aqui o risco justifica.**

### ✅ App Check — resolvido no mesmo dia, falta só aplicar
Chave de site no ar (`ef558b9`), verificada num navegador antes de subir: as duas
chaves do reCAPTCHA têm 40 caracteres e começam com `6Le`, e só uma pode viver
num repositório público. A CSP foi alargada **antes** (script-src, frame-src,
connect-src do reCAPTCHA) — sem isso, aplicar o App Check recusaria toda
requisição e derrubaria a turma sem causa aparente.

**Falta um passo, e ele é de calendário, não de código:** deixar rodando um dia,
conferir no painel do App Check que as requisições aparecem como verificadas, e
só então clicar em aplicar no Firestore. Aplicar antes de ver o gráfico é o erro
que esse produto não pode cometer no meio de uma aula.

### 🟡 O id da escola ainda soletra a escola — ADIADO por decisão
`schools/cse-den-8f3a91/` continua sendo o caminho real, e ele viaja em **todo
link que os alunos recebem**. Tirar do código foi o pedido original (repositório
público) e está feito; o caminho no banco sobrou.

**O tamanho disso depende de um número que ainda não medimos:** quantos
documentos existem em `schools/cse-den-8f3a91/students`. Quase tudo sob esse
caminho se refaz sozinho — o lote do dia é regenerado, a lista da turma volta do
aparelho dela ao salvar, e não há notas ainda. **Só `students` e seus `attempts`
são insubstituíveis.**

- **Poucos ou nenhum** → não é migração: id novo aleatório, um campo trocado no
  registro dela, um documento criado. Cinco minutos.
- **Vários com histórico real** → migração de verdade, com cópia documento a
  documento e reemissão dos links.

Adiado a pedido, com o método já definido para quando for a hora.

### 🟡 Entropia do `schoolId`
Nada no código garante que um id de escola seja aleatório — é disciplina manual
no console. Vale virar passo escrito no runbook de criação de escola.

---

## Meus próprios erros nesta passada

O documento pede honestidade sobre o que não foi testado. Também vale sobre o que eu errei:

- **Quatro checagens minhas codificavam a regra errada** e tiveram de ser invertidas — incluindo a do relógio, que exigia o anti-padrão.
- **Uma checagem lia o template onde devia ler a tela renderizada**, e deu por ausente uma correção que funcionava. A mesma armadilha de afirmar que um arquivo contém uma string em vez de rodar o código.
- **Um escape de regex produziu barra literal** em vez de limite de palavra.
- **Três edições de string falharam no mesmo apóstrofo** — tipográfico, depois escapado com barra — antes de eu olhar os bytes.
- **Duas sondas minhas reportaram "12 de 12 quebrados"** quando nada estava, por lerem o app pelas minhas suposições.

Registro porque a lição que mais custou hoje é a mais barata de esquecer: **verde não é o mesmo que exercitado**, e verificador que grita falso ensina quem lê a ignorá-lo.

---

## Como rodar

```
sh scripts/qa.sh                    # 3.018 checagens, ~15s
AJAR_QR=1 sh scripts/qa.sh          # inclui QR pelo Vision da Apple
node scripts/ip_audit.js index.html # sobreposição com material da ETS
AJAR_SMOKE=1 node scripts/check_deploy.js index.html   # lista de smoke pós-deploy
```

O hook de pre-commit recusa commit vermelho.

## Pendente com você

1. **Republicar `firestore.rules`** no console — o campo `schoolName` não salva sem isso.
2. **Deploy** para os cabeçalhos novos valerem (Cloudflare lê `_headers`; não dá para verificar em servidor local — a lista de smoke está no `check_deploy.js`).
3. Decidir sobre CONTENT-004, o emulador, e o App Check.
