# Relatório de QA — Ajar

**Data:** 17 de agosto de 2026 · **Commit auditado:** `eb226a0` · **Escopo:** todo o projeto como está hoje

---

## Antes do resumo: quatro premissas do pedido que não valem para este projeto

Isso não é ressalva burocrática — muda o que foi possível auditar, e você precisa saber onde o relatório é mais fino do que você esperava.

| O pedido supõe | O que existe | Consequência |
|---|---|---|
| React, componentes, re-renders | **Nenhum React.** `index.html` de 11.900 linhas, `<script>` clássico, sem build, sem `package.json`, sem `node_modules` | Ângulo "re-renders desnecessários" não se aplica. Analisei o custo real de render em vez disso |
| Componentes vindos do 21st.dev | **Zero.** Nenhuma referência no repositório | Nada a verificar |
| Uma camada de IA que responde | **Nenhuma chamada de IA em runtime.** Nenhum `fetch` no app, nenhum endpoint de modelo. Os exercícios são gerados por código determinístico local | "E se a IA não responder / responder mal formatado" não tem sujeito. Regra (b) fica **vacuamente satisfeita** — não há para onde vazar |
| ESLint / Prettier / Vitest | Nenhum, e por decisão de arquitetura | Ver seção **Automação**: entreguei a intenção, não as ferramentas |

Também: **não há back-end de aplicação.** Só Firestore. Então "validação só no front-end sem equivalente no back-end" se traduz em "as regras do Firestore cobrem o que o front-end valida?" — auditei assim.

---

## Resumo em 10 segundos

> **Segunda passada, 17/08 de manhã:** você mandou resolver os bugs. Todos os
> ⚠️ de bug foram corrigidos e verificados. Sobraram só as três sugestões de UX
> que são decisão de produto (20, 21 parcial, 22), marcadas abaixo.

| Severidade | Total | Corrigidos | Aguardando você |
|---|---|---|---|
| 🔴 Crítico | 1 | **1** | 0 |
| 🟠 Alto | 5 | **5** | 0 |
| 🟡 Médio | 7 | **7** | 0 |
| 🟢 Baixo | 5 | **5** | 0 |
| 💡 Sugestão UX | 4 | 3 | 1 |
| **Total** | **22** | **21** | **1** |

*(A primeira versão desta tabela dizia 23 e 4 baixos. São 22 itens numerados e
5 baixos — o item 18, peso dos assets, é informativo e não conta como achado.)*

| Ângulo | Achados |
|---|---|
| Conformidade com regras do Ajar | 1 crítico, 2 informativos |
| Acessibilidade | 8 (7 corrigidos) |
| Responsividade / iPhone / iPad | 4 |
| Bugs funcionais e de lógica | 3 (2 corrigidos) |
| Segurança | 0 problemas — 4 verificações limpas |
| UX | 4 sugestões |
| Qualidade de código | 3 (2 corrigidos) |

**Suite:** 2.732 → **2.852 checagens, verde**, em 24 arquivos. Três verificadores novos (79 checagens) mais uma asserção adicionada ao painel.

---

# 🔴 CRÍTICO

## 1. Atribuição individual publica sem passar por aprovação

**✅ RESOLVIDO (2ª passada).** Nasce `pending`, como o resto. E ganhou revisão de verdade: cartão com o nome, botão "👁 Read it before you send it" (fechado por padrão, porque a tela dela vai para a TV), e "✓ Send to Carla" / "✕ Discard". `individualForShare()` já filtrava por aprovado, então nada a jusante mudou — o portão existia e este caminho passava por fora dele. Seis asserções novas, incluindo o lado do aluno via `applySharedPayload`.

**Ângulo:** Conformidade com regras inegociáveis (a) · **Severidade:** crítico · **Status:** ⚠️ reportado, aguardando sua decisão

**Onde:** [index.html:7368](index.html#L7368), `generateForIndividual()`

```js
individualAssignments[name.toLowerCase()] = {
  displayName: name,
  items: generateBatchItems(type, theme).map(i => ({...i, status:'approved'}))
};
```

**O que acontece:** o caminho da turma inteira gera tudo como `status:'pending'` e exige que ela aprove item por item — verifiquei, funciona, está coberto por 7 asserções novas. O caminho "🎯 Assign to one student" **marca como aprovado no instante da criação**. Ela digita um nome, escolhe tipo e tema, aperta o botão, e o exercício vai para o telefone daquele aluno sem ela ter lido uma palavra dele. `renderIndividualList()` mostra apenas um chip — "Ana — Write an Email · Work & Career" — nunca o conteúdo.

**Cenário concreto:** Michelle quer dar reforço de escrita à Carla. Digita "Carla", escolhe Write an Email + Health, aperta Generate. O gerador sorteia o prompt sobre o app do campus que desloga o usuário. Carla abre o telefone e já está lá. Se o prompt sorteado for inadequado para a Carla — nível, assunto sensível, qualquer coisa — Michelle descobre depois da aula, pela Carla.

**Por que não corrigi:** é exatamente a regra que você marcou como inegociável, e há duas formas de resolver com consequências diferentes para o fluxo dela. Sua decisão:

1. **Nascer `pending` como o resto.** Mais consistente, e o cartão de revisão já existe — a atribuição individual passaria a aparecer na fila de aprovação com a etiqueta do nome. Custo: um passo a mais para ela num fluxo que hoje é um clique.
2. **Mostrar antes de confirmar.** Um cartão "isto é o que a Carla vai receber — Publicar / Descartar". Mantém o fluxo em uma tela, mas é código novo.

Recomendo a **1**: reaproveita o cartão de revisão que já está construído e testado, e a regra passa a ser uma só em todo o app em vez de duas parecidas.

---

# 🟠 ALTO

## 2. Contraste 2,01:1 no botão primário no tema escuro

**Ângulo:** Acessibilidade · **Severidade:** alto · **Status:** ✅ corrigido automaticamente

**Onde:** [index.html:89](index.html#L89) (`.btn`), mais `.switcher button.active`, `.type-tabs button.active`, `#teacher-nav a.here`

**O que acontecia:** `.btn` tinha `color:#fff` fixo sobre `background:var(--accent)`. No tema claro o accent é verde escuro (#0f6e56) e branco sobre ele mede 6,20:1 — bom. No tema escuro o accent é menta clara (#5dcaa5) e branco sobre ela mede **2,01:1**, abaixo do mínimo WCAG AA para qualquer tamanho de texto. Isso valia para **todo botão primário do app**: Start, Approve, Generate, Publish.

Depois de corrigir, o verificador que escrevi achou **três casos mais da mesma classe**, todos em estados "selecionado": o alternador Teacher/Student, o tipo de tarefa escolhido, e a aba atual do painel. Ou seja: no escuro, o indicador de *onde você está* era o elemento menos legível da tela.

**Cenário concreto:** um aluno com o celular em modo escuro — que é o padrão de muita gente — abre um exercício e o botão ▶ Start é texto branco sobre menta clara. Sob luz de sala de aula, praticamente ilegível.

**Correção:** trocado por um token `--btn-ink` que segue o tema. Escuro: #0f1614 sobre a menta = **9,13:1**. Claro: #ffffff sobre o verde = **6,20:1**. Nenhuma cor da paleta mudou; só a tinta deixou de ser fixa.

## 3. `_classProgress` indefinido mata o painel da professora pela sessão inteira

**Ângulo:** Bug funcional / tratamento de erro · **Severidade:** alto · **Status:** ✅ corrigido automaticamente

**Onde:** [index.html:7994](index.html#L7994) e [index.html:8011](index.html#L8011)

```js
_classProgress = await window.CloudSync.pullClassSummaries(roster);   // sem guarda
...
const d = _classProgress[name] || {};                                 // estoura
```

**O que acontece:** se `pullClassSummaries` resolver para qualquer coisa falsa, `_classProgress` fica `undefined`. `renderClassProgress` faz `_classProgress[name]` para cada aluno e lança `TypeError`. Isso acontece **dentro de `renderTeacher()`**, então tudo depois dele nunca roda: `renderProgressBox`, `renderIndividualList`, `renderShareBox`, os cartões da fila, o `showSection` final. Painel em branco.

E porque é estado de módulo, **fica envenenado**: todo render seguinte estoura igual. Não tem volta sem recarregar a página. Encontrei isso ao vivo — o painel morreu no meio do teste e não voltou.

O `try/catch` em volta não salva, ao contrário do que o comentário dele promete ("the panel keeps whatever it last showed"): a atribuição tem sucesso, o erro acontece depois, em outra função.

**Honestidade sobre como achei:** disparou com um CloudSync dublê que devolve `undefined`. A implementação atual sempre devolve objeto, então **não está quebrado em produção hoje**. É uma atribuição sem guarda num caminho de render, onde a única coisa entre ela e um painel morto é que a implementação atual, por acaso, se comporta. Corrigi nos dois lados — `|| {}` na escrita e na leitura.

## 4. Botão ▶ Start abaixo da dobra em 3 das 4 combinações de dispositivo

**✅ RESOLVIDO (2ª passada).** Abrir um exercício rola até ele. E quando o portão está aberto, rola até o **botão**, não até o topo do cartão: em 393px de altura o cartão tem 470px, então nenhuma posição mostra as duas pontas. A ação ganha. Medido no iPhone paisagem: Start em y=218 de 393, visível, com o cartão ainda na tela acima.

**Ângulo:** Responsividade / iPhone e iPad · **Severidade:** alto · **Status:** ⚠️ reportado, aguardando sua decisão

**Onde:** [index.html](index.html) — `startGateHtml()` + `renderStudent()`; a causa é ausência de scroll ao abrir

**Dispositivos e orientações medidos:**

| Dispositivo | Orientação | Viewport | ▶ Start em y= | Visível? |
|---|---|---|---|---|
| iPhone 15 | retrato | 393×852 | 951 | ❌ |
| iPhone 15 | **paisagem** | 852×393 | 951 | ❌ |
| iPad Air | retrato | 820×1180 | 951 | ✅ |
| iPad Air | **paisagem** | 1180×820 | 951 | ❌ |

**O que acontece:** clicar num exercício na lista **não rola a página** (`scrollTop` fica em 0, medido). Antes do exercício há 542px de cabeçalho: masthead 108 + alternador 46 + linha do guia + relógio 18 + a própria lista 157 + barra de voltar 32. O cartão tem 470px, então o Start cai em y=909–951.

**Cenário concreto — e é o seu:** você disse que você e seus amigos usam o iPad **na horizontal**. Nessa exata combinação, um aluno escaneia o QR, a tela mostra o tipo de exercício e o aviso de tempo, e **nenhum botão para começar**. Ele precisa descobrir que tem que rolar. Numa sala com 13 pessoas começando ao mesmo tempo, isso é a primeira mão levantada.

Vale notar: este é um bug que **eu introduzi hoje** ao construir o portão de Start. Antes o aluno caía direto no conteúdo do exercício, então a dobra não escondia uma ação obrigatória.

**Por que não corrigi:** muda o que acontece ao toque. A correção é uma linha — `document.getElementById('practice-wrap').scrollIntoView({behavior:'smooth', block:'start'})` no fim de `renderPractice()` — mas rolar a tela do aluno sozinho é decisão de fluxo, e você mandou reportar essas. Se disser sim, aplico em um minuto.

## 5. O relógio da tarefa fica fora da tela enquanto o aluno escreve

**✅ RESOLVIDO (2ª passada).** `.timer-row` é `position:sticky; top:0`. Verificado no iPhone paisagem: rolando até o campo de resposta, o relógio continua visível.

**Ângulo:** Responsividade / UX · **Severidade:** alto · **Status:** ⚠️ reportado, aguardando sua decisão

**Onde:** [index.html](index.html) — `timerBadgeHtml()` renderiza dentro de `practice-wrap`

**O que acontece:** medido no iPhone paisagem (852×393) e iPad paisagem (1180×820): o relógio fica em **y=563** e o campo de resposta em **y=1010**. Com o teclado virtual aberto sobram ~177px úteis no iPhone paisagem e ~369px no iPad paisagem. O aluno está digitando com o relógio 450px acima da área visível.

**Cenário concreto:** Write an Email dá 7 minutos. O aluno escreve olhando o teclado, não vê o contador, e o tempo acaba sem aviso — inclusive sem o aviso âmbar de 2 minutos e o vermelho de 45 segundos, que existem justamente para isso e que ninguém vê.

**Por que não corrigi:** a solução é `position: sticky` na `.timer-row`, e isso é mudança de layout — pode colidir com a barra de voltar e com a barra da seção, que também são fixas fora do wrap. Precisa de teste nas 4 combinações depois. Recomendo fazer junto com o item 4.

## 6. Alvos de toque de 22 a 31px na navegação do painel

**✅ RESOLVIDO (2ª passada).** Abas do painel e o Sign out a 44px; `.btn.sm` a 34px. Tamanho de fonte intocado, só a caixa cresceu. A tira ganhou máscara de gradiente na borda direita, que é o aviso de que rola.

**Ângulo:** Acessibilidade / mobile · **Severidade:** alto · **Status:** ✅ corrigido automaticamente (foco) / ⚠️ tamanho reportado

**Onde:** [index.html](index.html) — `#teacher-nav a` (31px), `Sign out` (22px), `.btn.sm` (32px)

**O que acontece:** a diretriz da Apple é 44×44pt mínimo. As abas do painel têm 31px de altura e o Sign out 22px. No iPhone retrato a tira de navegação também **rola lateralmente sem indicação visual** — 557px de conteúdo em 357px de largura, então "Account" está fora da tela e nada diz isso.

**Corrigido agora:** foco de teclado visível em `.btn`, `.scenario-pick`, `#teacher-nav a` e `.guide-btn` — antes só os campos de formulário e o alternador de papel tinham contorno de foco, então quem navega por teclado não via em que botão estava.

**Reportado:** aumentar a altura dos alvos e dar indicação de rolagem na tira são mudanças de layout. Sugestão barata para a rolagem: uma máscara de gradiente na borda direita.

---

# 🟡 MÉDIO

## 7. Aspas duplas em texto falado quebram o botão de áudio, silenciosamente

**✅ RESOLVIDO (2ª passada).** O texto saiu do atributo `onclick`. Vai em `data-speak`, escrito via `textContent`, com **um** listener delegado para os seis lugares. Verificado no navegador: `She said "hello" loudly, C:\path and it's fine` volta idêntico. A checagem virou "zero sítios com o padrão antigo", não "seis conhecidos" — a forma velha não pode voltar um lugar por vez.

**Ângulo:** Bug funcional latente · **Severidade:** médio · **Status:** ⚠️ reportado + guarda de regressão adicionada

**Onde:** 6 lugares em `cardBody()` — [index.html](index.html), padrão `onclick="speak('${texto}')"`

**O que acontece:** o texto é interpolado dentro de um atributo HTML delimitado por aspas duplas, escapando apenas aspas simples. Testei no navegador:

| entrada | `onclick` resultante | efeito |
|---|---|---|
| `It's the teacher's book` | `speak('It\'s the teacher\'s book')` | ok |
| `She said "hello" loudly` | `speak('She said ` | **atributo cortado, botão morto** |
| `C:\caminho\arquivo` | `speak('C:\caminho\arquivo')` | fala texto errado (`\c` → `c`) |

Confirmei que o clique não produz chamada nenhuma no caso das aspas duplas.

**Alcance hoje:** varri as 868 strings distintas que chegam a `speak()` nos 6 tipos — talk, conversation, announcement, choose-response, listen-repeat, interview. **Nenhuma tem aspas duplas ou barra invertida.** Então o defeito é latente, não ativo.

**Quando vira real:** no dia em que alguém escrever discurso relatado com aspas num exercício de listening, o que é natural. O botão 🔊 simplesmente não faz nada, sem erro visível, e quem escreveu o exercício não vai suspeitar do atributo.

**Não é XSS.** Verifiquei: `</script><img src=x onerror=...>` dentro do atributo não injeta nada — o parser mantém como texto de atributo. É quebra, não vulnerabilidade.

**Por que não corrigi:** a correção certa é parar de interpolar em atributo — `data-speak` + um listener delegado — e isso mexe em 6 lugares e no padrão de renderização. Reportado. Adicionei uma asserção em `check_hygiene.js` que falha se algum texto falado ganhar aspas duplas, então o problema é detectado no momento em que for escrito.

## 8. Catch vazio esconde a perda do botão "Next exercise"

**✅ RESOLVIDO (2ª passada).** O catch continua (lançar ali levaria a resposta do aluno junto), mas agora escreve no console dizendo que o rodapé não foi substituído. O próximo relato tem o que ler.

**Ângulo:** Falha silenciosa · **Severidade:** médio · **Status:** ⚠️ reportado

**Onde:** [index.html:8449](index.html#L8449), `markExerciseAnswered()`

```js
try{
  const f = document.querySelector('.exam-footer');
  if(f) f.outerHTML = practiceFooter(true);
}catch(e){}
```

**O que acontece:** se `practiceFooter(true)` lançar, o rodapé não é substituído e o aluno fica sem "Next exercise →". O catch engole. Isso é precisamente o bug que você reportou antes — *"o botao sumiu eu errei e nao foi para o proximo exercicio"* — e o caminho que poderia reproduzi-lo de novo está sem instrumentação.

**Sugestão:** trocar o catch vazio por um que ao menos deixa rastro no console. Não corrigi porque decidir o que fazer no erro (redesenhar tudo? mostrar aviso?) é decisão de comportamento.

## 9. Dos 21 catch vazios, nenhum documenta o motivo

**Ângulo:** Qualidade de código / falha silenciosa · **Severidade:** médio · **Status:** ✅ tratado com trava de crescimento

**O que achei:** 21 `catch(e){}` sem comentário. Inspecionei todos: guardam três coisas — `localStorage` no modo privado do Safari, `CloudSync` ausente, e um nó do DOM que pode não estar montado. Cada um tem um fallback funcionando na linha seguinte. Exigir comentário retroativo nos 21 seria ruído de estilo.

**O que fiz:** uma **trava** em `check_hygiene.js` — o número não pode crescer além de 21. Um catch vazio novo é um lugar novo onde uma falha real pode se esconder, e passa a exigir decisão explícita (mover a linha de base à mão).

## 10. Botões só com ícone não tinham nome acessível

**Ângulo:** Acessibilidade · **Severidade:** médio · **Status:** ✅ corrigido automaticamente

**Onde:** 11 botões — as 4 setas de semana/dia (`◀ ▶`, que tinham só `title`, lido de forma inconsistente), o `✕` de remover atribuição, e os 6 botões `🔊`.

**O que acontecia:** um leitor de tela anunciava "black left-pointing triangle" ou "speaker with three sound waves", ou nada.

**Corrigido:** `aria-label` em todos, com contexto real onde havia — "Play sentence 3 aloud", "Play announcement 2 aloud", "Remove Ana from this assignment".

## 11. Campos sem rótulo, incluindo os dois que o aluno mais usa

**Ângulo:** Acessibilidade · **Severidade:** médio · **Status:** ✅ corrigido automaticamente

**Onde:** 10 campos. Os graves: `#response` (a resposta escrita) e `#name-input` (o nome, em 2 lugares) tinham **apenas placeholder** — que desaparece no primeiro caractere digitado, deixando o campo sem nome nenhum.

**Corrigido:** `aria-label` nos 10, incluindo os campos de copiar link, que anunciavam "campo de texto editável" sem dizer de quê.

## 12. Nada que muda sozinho era anunciado

**Ângulo:** Acessibilidade · **Severidade:** médio · **Status:** ✅ corrigido automaticamente

**O que acontecia:** zero `aria-live` no arquivo. O relógio da tarefa, o relógio da seção, o resultado de uma correção e o aviso de colar bloqueado apareciam e mudavam sem que um leitor de tela dissesse nada.

**Corrigido:** `role="timer" aria-live="polite" aria-atomic="true"` nos dois relógios — *polite* e não *assertive* de propósito, porque o número muda a cada segundo e uma região assertiva interromperia o aluno uma vez por segundo, que é pior do que silêncio. `role="status"` nos resultados e `role="alert"` no aviso de colar.

## 13. Um bug que eu mesmo introduzi durante esta varredura

**Ângulo:** Qualidade de código · **Severidade:** médio · **Status:** ✅ corrigido + teste adicionado

**Onde:** [index.html:7382](index.html#L7382), `renderIndividualList()`

Ao adicionar o `aria-label` do item 10 escrevi `${escapeHtml(v.displayName || k)}` onde a variável em escopo é `a`. `v` não existe → `ReferenceError` dentro do template → a lista de atribuições individuais não renderiza e leva o painel com ela.

**Passou por 2.811 checagens verdes**, porque nenhuma delas jamais chamou `renderIndividualList`. Corrigido, verificado no navegador (`erro: null`, chip desenhado), e adicionei uma asserção em `check_teacher_panel.js` que verifica que a função não lê variável que não declarou.

Registro isto no relatório em vez de apagar do histórico porque é o achado mais útil sobre a suite: **2.811 checagens verdes não significam código exercido.** Havia uma função de render inteira sem nenhuma cobertura.

---

# 🟢 BAIXO

## 14. Contraste 3,33:1 no rótulo âmbar (tema claro)

**Ângulo:** Acessibilidade · **Status:** ✅ corrigido

`--amber: #b5720f` sobre `--amber-soft` media 3,33:1, abaixo de AA para texto pequeno. Usado em `.feedback-label`, `.fb-who`, `.ex-status.pending` e — o que importa — **`.timer-badge.caution`**, o relógio quando faltam 2 minutos. Trocado para `#8a5408`: **5,34:1**. Verifiquei que `--amber` nunca é fundo, só texto e borda, então escurecer só melhora.

## 15. Três comentários no `sw.js` descrevem uma hospedagem que o app não usa mais

**Ângulo:** Qualidade de código · **Status:** ✅ corrigido

Comentários explicavam `no-store` pelo "GitHub Pages força max-age=600". O app está no Cloudflare Pages e o `_headers` define `no-cache`. A lógica continua certa; a justificativa estava desatualizada. Reescritos preservando o histórico ("escrito contra o GitHub Pages; vale de todo jeito").

## 16. Portas da capa nasciam sem nome acessível

**Ângulo:** Acessibilidade · **Status:** ✅ corrigido

`<button id="door-teacher"></button>` — vazio no HTML, preenchido por JS. Antes do JS rodar, um leitor de tela não tinha nada. `aria-label` adicionado nos dois.

## 17. `CACHE_NAME = 'ajar-shell-v1'` nunca subiu de versão

**✅ RESOLVIDO (2ª passada).** `ajar-shell-v2`.

**Ângulo:** Performance / cache · **Status:** ⚠️ reportado

O próprio `sw.js` diz para subir à mão quando `index.html` mudar de forma relevante. Mudou muito hoje e continua `v1`. **Impacto real é pequeno**: o shell é network-first com `no-store`, então a versão só decide o que é servido *offline*. Vale subir por higiene.

## 18. Peso: 28 MB de áudio, 820 KB de HTML

**Ângulo:** Performance · **Status:** 💡 informativo, sem ação

Verifiquei e está bem resolvido: os 672 clipes são endereçados por conteúdo (nome = hash do texto falado), o `_headers` os marca `immutable` por um ano, e o service worker os guarda em cache separado que sobrevive a atualizações do app. Um aluno baixa cada clipe uma vez na vida. Os 820 KB de HTML vêm com `no-cache` (revalida, 304 quando não mudou) — correto para um app onde um QR recém-gerado precisa resolver para o exercício certo.

---

# 💡 SUGESTÕES DE UX (não são bugs)

## 19. O modal do guia abre por cima de tudo, todo primeiro acesso, sem X

**✅ Escape agora fecha** (2ª passada) — era a única saída que faltava para quem usa teclado, e em 334px de janela o botão fica abaixo do texto. O X no topo continua sugestão.

334px de altura no iPhone paisagem, com bastante texto. Rola por dentro (`overflow-y: auto`, confirmado) e fecha ao tocar fora, mas: **não fecha com Escape** (testei — não fecha), não tem X no topo, e nada indica que rola. Sugestão: um X no canto e um handler de Escape.

## 20. O campo de resposta está a 1440px do topo no iPhone retrato

O aluno rola por relógio, briefing e enunciado antes de chegar onde escreve. Faz sentido na ordem lógica, mas num celular é muito percurso. Sugestão: colapsar o briefing por padrão depois do primeiro uso.

## 21. A tira de navegação do painel rola sem dizer que rola

**✅ RESOLVIDO (2ª passada).** Máscara de gradiente na borda direita de `#teacher-nav` — quando há aba fora da tela, a última se dissolve, e isso é o aviso. Feito junto com o item 6.

## 22. "Show me the exercise" é o mesmo botão em dois contextos diferentes

**✅ RESOLVIDO (2ª passada) — e não pelo interruptor que eu havia sugerido.**

Minha sugestão era um interruptor no topo do painel, "esta tela está na TV", mudando todos os cartões de uma vez. Você propôs outra coisa: uma tela que mostra **só o QR code** enquanto os alunos leem. É melhor, por três razões:

1. **O interruptor administrava o vazamento; a tela remove a categoria.** Ele esconderia o conteúdo dos exercícios e deixaria na parede o resto do painel — abas, formulários, a lista da turma, a conta dela. Nada disso é para projetar.
2. **Um interruptor depende de lembrar de virar.** Uma tela em que ela *entra* é inequívoca: ou está apresentando, ou está trabalhando.
3. **Resolve algo que o interruptor não tocava.** O código no cartão de revisão tem 150px — pequeno visto do fundo da sala, e código pequeno em projetor é onde o escaneamento falha. Aqui ele é dimensionado pela tela: 331px num viewport de 637, ~560px numa TV 1080p.

**O que está nela:** o tipo de exercício, o QR grande, o nome e a escola dela, a data e a semana. Exatamente o conjunto já acordado como público, e nada além.

**O que não está:** nenhum texto de exercício (asseverado varrendo os dados dos 6 tipos), nem gabarito, nem lista da turma, nem ponto fraco de ninguém, nem `Sign out`, nem as abas.

**As setas** trocam de exercício sem sair da tela — trocar no meio da aula é o caso comum, e obrigá-la a sair, aprovar e voltar seria trocar um incômodo por outro. Dão a volta, porque seta morta na frente de uma turma parece app quebrado. Escape volta.

**Só o aprovado aparece.** Um código para algo não aprovado poria trabalho não revisado na parede.

30 asserções novas, incluindo uma varredura dos dados dos 6 tipos procurando qualquer string na tela. Verificado com o vazamento recolocado de propósito (falha) e com o decodificador Vision da Apple lendo os códigos gerados.

---

# Segurança — quatro verificações, nenhum problema

| Verificação | Resultado |
|---|---|
| Segredos no código | **Limpo.** Varri chaves privadas, tokens OpenAI/GitHub/Slack/AWS, bearer tokens e senhas literais em `index.html`, `sw.js`, `manifest.json`, `_headers`, `firestore.rules` |
| Config do Firebase | `apiKey` presente e **corretamente público** — é identificador, não segredo. O que protege os dados é `firestore.rules`. Registrei isso como asserção para ninguém "corrigir" escondendo e assumir que ficou mais seguro |
| `teacherEmail` | Vazio no config, como tem que ser. Um endereço real ali é o login de uma pessoa real em arquivo público |
| XSS | **Testei injeção real**, não li código. Payload `<img src=x onerror=...>` em: nome do aluno, anúncio da professora, nota para o aluno, nome na lista da turma. **0 de 4 injetaram.** 118 chamadas de `escapeHtml` para 116 `innerHTML` |

**Dependências:** não há gerenciador de pacotes, então não há auditoria a rodar. As duas dependências externas são o SDK do Firebase (pinado em 12.17.1, servido pelo gstatic) e a biblioteca de QR (embutida no arquivo, MIT, de 2009 — vale saber que não recebe correção há tempo, mas ela só desenha matriz de módulos e é verificada de ponta a ponta pelo `qr_verify.py` com o Vision da Apple).

**Validação front-end vs. back-end:** as regras do Firestore replicam o que o front-end valida — `hasOnly` nas chaves, limites de tamanho em nomes, faixa 0–1 em `outcome`, `create` sem `update`/`delete` em tentativas. Auditado em `check_multitenancy.js`. Um cliente malicioso não consegue escrever forma que o app não produz.

---

# Conformidade com as regras do Ajar — item por item

**(a) Nada da IA grava direto sem aprovação pendente**
Parcial. Caminho da turma: ✅ correto, agora com 7 asserções que rodam o código de verdade. Caminho individual: 🔴 **falha** — item 1.

**(b) Nenhum dado de imigração perto da camada de IA**
✅ Satisfeito, e por dois motivos independentes. Não existe campo: varri as formas de dados que o app realmente constrói nos 12 tipos mais o resumo por aluno, procurando `sevis`, `i20`, `visa*`, `passportNumber`, `alienNumber`, `uscis`, `immigration` — zero. E não existe canal: nenhum `fetch`, nenhum endpoint de modelo, nenhuma analítica. As palavras "visa" e "passport" aparecem **como conteúdo de exercício** (texto de prática sobre vida de estudante internacional) — isso é material de inglês, não dado processado.

**(c) Suporte em L1 diminui conforme o nível sobe**
⚠️ **Não implementado, e não pode ser** — não existe modelo de nível por aluno (ver (d)). O que existe: L1 aparece em exatamente **dois** lugares, e verifiquei que são só esses dois — o texto da capa traduzido, e uma nota oferecendo ao aluno escrever *feedback sobre o app* no idioma dele. **Nenhum renderizador de exercício traduz nada**, asseverado. É uma escolha defensável — a tarefa é a coisa medida, e traduzir a tarefa destrói a medição — mas é suporte **fixo**, não decrescente. Se você quer a curva, precisa antes de um modelo de nível.

**(d) Níveis batem com GSE/CEFR (A1–C2), sem nível inventado**
✅ Sem nível inventado — porque **não há nível nenhum**. Nenhuma menção a CEFR ou GSE no código. A única gradação é a contagem de sílabas do Listen and Repeat (9–11 → 14–16 → 19–23), declarada como as faixas reais do ETS. Então a regra não é violada, mas também não é atendida: nada mapeia para GSE/CEFR. Registrado como lacuna, com asserção que falha se alguém introduzir um nível fora de A1–C2.

---

# Automação contínua

## Por que não ESLint, Prettier e Vitest

O pedido nomeia essas três. Instalá-las significa trazer `package.json`, `node_modules` e um passo de build para um projeto cuja principal virtude operacional é não ter nenhum dos três — o app é um arquivo servido como está, e é por isso que um conserto chega numa sala de aula em segundos. ESLint também não analisa um HTML de 11.900 linhas com dez blocos `<script>` sem plugin e configuração.

Então entreguei **o que essas ferramentas pegariam que importa**, em verificadores que rodam com `node` puro:

| Arquivo novo | O que trava | Checagens |
|---|---|---|
| `scripts/check_contrast.js` | Lê a paleta **do próprio `index.html`** e mede todo par cor-sobre-cor contra WCAG 2.1, nos dois temas. Confere que os dois blocos escuros não divergem. Proíbe tinta fixa sobre fundo tematizado | 39 |
| `scripts/check_hygiene.js` | Segredos; handler `onclick` apontando para função inexistente; `getElementById` de id que não existe; botão só-ícone sem rótulo; campo sem rótulo; foco de teclado visível; relógio anunciado; comentário afirmando o que o código não faz; trava de catch vazios | 22 |
| `scripts/check_conformance.js` | As quatro regras inegociáveis, rodando o código: lote nasce pendente, aprovar libera exatamente um item, descartar recolhe, nada pendente é publicado, nenhum campo de imigração existe, nenhuma chamada de rede própria, L1 lida em exatamente dois lugares, nenhum nível inventado | 18 |

Se você quiser as três ferramentas de verdade mesmo assim, é uma decisão sua e eu monto — mas seria a primeira vez que o projeto passa a precisar de `npm install` para ser desenvolvido.

## Como rodar

```bash
sh scripts/qa.sh
```

Roda os 24 arquivos, imprime totais por arquivo, sai com código diferente de zero se qualquer um falhar. `--quiet` só os totais. `AJAR_QR=1` inclui a verificação de QR ponta a ponta com o Vision da Apple (precisa de `swiftc`, leva alguns segundos, por isso é opt-in).

## Hook de commit

Instalado em `.git/hooks/pre-commit` e versionado em `scripts/hooks/pre-commit` (hooks não vão no git; `sh scripts/install-hooks.sh` instala num clone novo).

Testei quebrando o contraste de propósito: o hook recusou o commit e nomeou o arquivo. Leva ~10 segundos. `--no-verify` passa por cima — mas se fizer isso, escreva o motivo na mensagem, porque um commit vermelho sem explicação é uma armadilha para quem for bissectar depois.

---

# Uma coisa que este relatório mostra sobre a suite

Achei três falso-positivos **nos meus próprios verificadores** enquanto os escrevia — a regra de comentários disparou no comentário que documentava o erro que ela procura, a de rede disparou na palavra "fetch" numa frase e em quatro URLs de atribuição, a de L1 contou duas ocorrências numa linha como dois lugares. Estreitei as três, com o motivo escrito no código.

Registro porque é a mesma lição do item 13, do outro lado: **um verificador que grita sem motivo ensina quem lê a ignorá-lo.** Preferi 79 checagens que significam algo a 120 que ninguém olha.
