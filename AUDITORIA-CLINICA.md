# Auditoria clínica — Ajar

**18 de agosto de 2026.** Estado no fim: `b0ff544`, **3295 asserções verdes em 39
arquivos** mais **109 no emulador real do Firestore**. Três PRs fechados, quatro
worktrees reduzidas a duas.

---

## Veredito

**Não está pronto para uma segunda escola, e o que falta não é funcionalidade.**
O produto funciona: uma professora conduz uma aula, treze alunos praticam,
a rodada ao vivo resolve o problema de áudio que quebrou uma aula de verdade, e
as regras do banco resistiram a uma auditoria de segurança dedicada sem nenhum
CRITICAL nem HIGH. O que impede a segunda escola são três coisas: **as regras
novas nunca foram publicadas em produção**, então metade do que está no código
não existe para o banco; **nada disso foi visto rodando fora dos testes** —
contas, rodada ao vivo e migração de histórico só existem como asserções; e o
padrão de falha que dominou a semana inteira, a escrita que falha calada,
apareceu mais **cinco vezes hoje**, todas encontradas por leitura e nenhuma por
uso. Uma segunda escola é um segundo lugar onde ninguém vai descobrir.

---

## O que foi feito nesta sessão

| # | Ação | Resultado |
|---|---|---|
| 1 | PR #3 (`fix/student-key`) mergeado com `--rebase` | `7be43f2`, verde |
| 2 | Bug encontrado ao inspecionar o #3 | `2526a39`, verde |
| 3 | PR #2 (`merge/design`) mergeado com `--merge` | `fbbe5c8`, primeiro merge commit do repo |
| 4 | PR #1 reescrito como consolidação de CSS e mergeado | `74d1108`, verde |
| 5 | Migração do histórico órfão (fase 6) | `b0ff544`, verde |
| 6 | Worktrees de PR mergeado removidas | 4 → 2 |

---

## Achados

### CRITICAL

Nenhum.

### HIGH

**H1 — O PR #3 estava certo e incompleto, e a incompletude era invisível.**
`index.html:8704`, corrigido em `2526a39`.

O PR corrigia **de onde** `refreshClassProgress` lê — contas em vez de nomes
digitados. Deixou o **portão**: sair cedo se `loadRoster().students` estiver
vazio. Esse portão foi escrito quando ela digitava a lista, e a lista deixou de
ser digitada um commit antes do PR aterrissar.

Resultado: em qualquer aparelho que não tenha o `localStorage` antigo dela, o
painel volta a ficar vazio — o mesmo sintoma que o PR existe para remover,
alcançado pelo outro lado. **Sobrevive no laptop dela porque o que ela digitou
no semestre passado ainda está naquele navegador.** Aparelho novo, ou uma
segunda professora, recebe a turma vazia.

Funcionar exatamente onde alguém está olhando é a pior forma que um bug pode
ter, e é a forma que deixou os dois bugs originais do PR #3 viverem: um merge
limpo no texto e errado no sentido.

**H2 — A limpeza do lote falhava calada.** `index.html:7180`, corrigido em
`54360cd`.

Quando ela desaprova tudo, o app grava um lote vazio no Firestore para o QR não
servir o exercício anterior. Essa gravação engolia o erro. A tela dela vira
"nada aprovado" a partir do estado **local**, então diz isso tendo a limpeza
chegado ou não — e se não chegou, **o código na parede continua entregando a
aula de ontem**. Era o único write que ainda engolia, e é justamente o que
existe para impedir isso.

**H3 — A tela padrão do aluno tinha 243 palavras.** `index.html:8968`,
corrigido em `54360cd`.

Duas vezes e meia qualquer outra tela de entrada, e é o que a maioria vê ao
abrir o app fora do horário de aula. Comparação medida: Duolingo abre com
quase zero texto, Quizlet mostra um par por vez (10–20 palavras), Google
Classroom um card (~15), Kahoot um campo de PIN (~10). As 110 palavras de
regra de simulado foram para um `<details>`.

### MEDIUM

**M1 — O documento da escola era um oráculo de enumeração.** `firestore.rules`,
corrigido em `4468db7`. Legível por `isSignedIn()`, que **todo visitante
satisfaz** porque aluno entra anônimo. Dava para chutar ids de escola e ler a
resposta no `exists()` — transformando o único segredo do modelo em algo
pesquisável. **Terceira vez** que esse padrão apareceu no arquivo.

**M2 — App Check registrado e não enforced.** É o que torna o loop de
enumeração barato. Operacional, não código.

**M3 — O resumo de progresso só sussurrava.** `index.html:11772`, corrigido em
`54360cd`. A tentativa ao lado acendia o aviso do aluno; o resumo — que é o que
o painel dela lê — só logava. Aluno via "salvo", tela dela ficava em branco.

**M4 — `migrateLegacyUsageLog` apagava fora do `try`.** `index.html:11695`,
corrigido em `54360cd`. O único caso em que havia algo a salvar e não deu para
ler era respondido jogando fora.

**M5 — RESOLVIDO em 19/08/2026.** Um arquivo de check que **falha** não soma
nada ao total. A diferença de 18 não era um arquivo travando: era um falhando e
sumindo da conta. Reproduzido de propósito ao editar uma frase e ver
`check_age_gate` (78 asserções) sair do total inteiro. Texto original abaixo.

**M5 — Uma execução vermelha não reproduzida.** Uma corrida com `AJAR_RULES=1`
deu **3277 asserções, RED**, contra 3295 verde. Diferença de **18**, consistente
com um arquivo de check não terminando. Não reproduziu em três execuções
seguintes, incluindo o comando idêntico. Arquivos com 18 asserções:
`check_admin_queue`, `check_rotation`. **Deixado em aberto de propósito** — não
tenho evidência para chamar de resolvido.

### LOW

- **L1** — Documentos `classroom/note_*` de antes da migração podem ter sobrado
  em produção e continuam legíveis por colega. Verificação de console.
- **L2** — `authRequired: false` era config morta com comentário que descrevia
  um buraco já fechado. Removido em `4468db7`.
- **L3** — `ponytail:` vazou para quatro comentários de produção. Vira `KNOWN
  CEILING` em `54360cd`.
- **L4** — O arquivo não tinha índice em 14.700 linhas. Adicionado em `4a7361b`,
  por nome de seção e não por número de linha.

---

## Comparação medida

| Tela | Palavras visíveis | Referência |
|---|---|---|
| Welcome | 98 | Duolingo abre com ~0 |
| Conta, primeira escolha | 81 | — |
| Professora, não logada | 92 | Google Classroom ~15 por card |
| Professora, logada (shell) | 106+ | — |
| **Aluno, sem lote publicado** | **243 → ~133** | Quizlet 10–20 por tela |

As outras quatro estão em faixa comparável. O problema era concentrado, não
generalizado.

---

## Modernização

| Proposta | Veredito | Razão |
|---|---|---|
| `<dialog>` nativo | **ADOTAR**, só no `guide-modal` | Substitui trap de Tab e retorno de foco escritos à mão, ~15 linhas a menos. **Rejeitar no `tv-screen`**: Esc fechando sozinho no meio da aula é regressão. |
| Popover API | **REJEITAR** | Não há popover, menu ou tooltip no app para retrofitar. |
| `:has()` / container queries | **REJEITAR** | 5 `@media` no arquivo inteiro, um breakpoint real. Modernidade sem problema correspondente. |
| View Transitions | **REJEITAR** | O app já protege WebViews antigas que recusam `scrollIntoView({behavior:'smooth'})`. Ganho cosmético, risco no aparelho que menos pode pagar. |
| IndexedDB | **REJEITAR** | ~20 chaves, a maior capada em 60 entradas. O único caso pesado (áudio) já está na Cache API. |
| Service Worker offline | **JÁ ESTÁ BOM** | Cache-first para áudio, network-first para o shell. Sem ação. |
| Web Components | **REJEITAR** | Trocaria CSS global genuinamente DRY por 12 ilhas de shadow DOM. Modernidade performática. |
| Speculation Rules | **REJEITAR** | App de uma página. Nada para pré-carregar. |
| WebAuthn / passkeys | **ADIAR** | Bom em si, mas o Google já cobre; adicionar antes do primeiro login real acontecer é resolver o problema errado. |

---

## Estado em 19 de agosto de 2026

As três primeiras estão feitas, e a primeira delas mudou o veredito acima.

**1. Regras publicadas e conta de verdade criada.** O dono publicou o
`firestore.rules` no console e criou a primeira conta real do app. Contas,
roteamento e histórico deixaram de existir só como asserção.

**2. O ratchet de escrita silenciosa** não foi construído como planejado, e o
tema reapareceu numa forma que aquele plano não cobria: **três frases da
interface sobreviveram ao comportamento mudar embaixo delas**, todas verdes na
suíte, porque as asserções liam se a frase existia e não se ela era verdadeira.
`check_age_gate` agora compara a política de privacidade contra o
`firestore.rules` e falha se discordarem — nos dois sentidos.

**3. A rodada ao vivo continua com zero salas.**

Achado maior da sessão seguinte, e que nenhuma auditoria pegaria por leitura:
`signInAnonymously()` rodava sem condição em todo carregamento e **expulsava
quem já estava logado**, de forma intermitente porque corria contra a
restauração da sessão. Foi relatado como dois bugs sem relação. Nenhum check da
suíte poderia tê-lo visto: todos rodam contra um `CloudSync` de mentira.

---

## As três coisas que eu faria primeiro

**1. Publicar `firestore.rules` e criar uma conta de verdade.** É o único
bloqueio absoluto. Metade do trabalho da semana — contas, rodada ao vivo,
migração, o campo de consentimento — está no código e **não existe para o
banco**. Nada disso foi visto rodando. Sem isso a lista da turma fica
permanentemente vazia, porque ela não tem mais como digitar nomes.

**2. Um ratchet que exija estado visível em toda escrita que pode falhar.** O
tema da semana inteira foi escrita silenciosa, e ainda apareceu cinco vezes
hoje. O ratchet de `catch` vazio existe e não cobre isso: `grep` por todo call
site de `push*`, garantir que cada um tenha estado visível de falha, e escrever
a regra em `check_hygiene.js`. É o único achado que se repete.

**3. Rodar a rodada ao vivo numa aula real antes de estender qualquer coisa.**
Ela funciona em 61 asserções e em zero salas. O QR também funcionava em teste.

---

## Aberto e é decisão do dono

- **Idade mínima 13.** O número está decidido; a linha da política sobre
  consentimento da escola precisa de revisão dele. Cinco asserções conferem a
  política contra o comportamento real, então mudar o texto sem mudar o código
  fica vermelho — de propósito.
- **O laboratório em `#design-lab`**, que o PR #2 trouxe. Nasce escondido, mas
  embarca em produção com nomes de aluno inventados e o nome real do dono.
- **Uma turma por escola** foi assumido. `classIds: []` ficou no registro do
  aluno para que uma segunda turma vire filtro em vez de migração.
- **A pasta principal** `/Users/croxatte/Downloads/ajar` está em
  `design/profundidade`, que agora está mergeado. Não troquei o branch dela.
