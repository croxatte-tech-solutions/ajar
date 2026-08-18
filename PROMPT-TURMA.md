# A turma, e o muro na porta — prompt de execução

Documento de trabalho. Escrito antes de codar, no mesmo formato do
`PROMPT-CONTAS.md`, para que as decisões fiquem argumentadas e não descobertas
no meio.

Continua de onde aquele parou. As seis fases dele estão feitas — a última,
`e6ed7df`, fechou as duas `KNOWN GAP` chaveando o registro do aluno por conta
em vez de por nome digitado. O que sobrou de lá, e que este plano recolhe, é
uma coisa só: **`isMemberOf` continua lendo o perfil que o próprio aluno
escreve.** Verificado em `firestore.rules` linhas 116-120.

---

## O que se está construindo

Duas mudanças que se sustentam uma na outra:

1. **O conteúdo passa a exigir cadastro.** A tela inicial — a que explica o que
   "ajar" quer dizer — vira a única porta. Ninguém vê exercício sem conta.
2. **A turma passa a ser montada pela professora**, com os alunos trazendo os
   próprios nomes, e não com ela digitando treze.

A segunda depende da primeira: só faz sentido um aluno reivindicar uma vaga se
ele tem uma conta para amarrar na vaga.

---

## Decisões tomadas, e por quê

### 1. São dois muros, não um

Confundir os dois é o erro que faria a Michele aprovar gente para deixá-la
praticar.

    Cadastro   →  abre o CONTEÚDO. Exercícios, prática, o app inteiro.
    Aprovação  →  abre a TURMA. Colegas, histórico com a professora, notas.

Quem se cadastra e não está em turma nenhuma pratica à vontade e não aparece
para ninguém. É o que hoje o anônimo faz, só que com nome e com histórico que
sobrevive à troca de celular. A professora não é porteira do conteúdo — ela é
porteira da turma dela, que é a única coisa que ela tem motivo para guardar.

### 2. O anônimo sai inteiro, não só da tela

Hoje `signInAnonymously(auth)` roda no boot e dá contexto de autenticação a
todo visitante, e `signOutTeacher()` volta para uma sessão anônima de
propósito, "para o app seguir funcionando como aparelho de aluno". As duas
somem. Sair passa a levar para o muro, que é o que sair significa agora.

Isso muda o sentido de `isSignedIn()` nas regras: hoje ele é verdadeiro para
todo mundo que abriu o site, e passa a ser verdadeiro só para quem tem conta.
Toda regra que usa `isSignedIn()` precisa ser relida com esse novo sentido
antes de a sessão anônima ser removida — uma regra escrita quando "assinado"
queria dizer "abriu o site" pode estar frouxa ou apertada demais depois.

### 3. O link escaneado tem que sobreviver ao cadastro

Este é o modo de falhar mais provável de todo o plano, e é de sala de aula.

Treze alunos escaneiam o QR ao mesmo tempo. Com o muro, eles caem no cadastro.
Se depois de criar a conta caírem na tela inicial genérica, **o exercício que
eles escanearam evaporou** — e a professora tem treze pessoas perdidas ao mesmo
tempo, no minuto em que a aula ia começar.

Então o destino escaneado é guardado antes do muro e restaurado depois do
cadastro. É requisito, não polimento. O app já tem cicatriz desse tipo: o
commit `a0463db` conserta um QR que abria o exercício errado, e o comentário no
código chama pelo nome — *"o qr code nao conectava ao exercicio certo"*.

### 4. Entrar numa turma é concedido, nunca declarado

Hoje não é. `joinSchool()` escreve `schoolId` no perfil do próprio aluno, e a
regra pergunta:

    function isMemberOf(schoolId) {
      ... get(/users/$(request.auth.uid)).data.schoolId == schoolId;
    }

O documento que decide se você é da turma é escrito por você. **A carteirinha é
auto-emitida.** É a mesma falha que o emulador pegou em `3e40109`, fechada
naquele commit só para o anônimo; a forma continua de pé para quem tem conta.

`e6ed7df` chegou perto e não passou por aqui: ele mudou onde o aluno MORA
(`students/{uid}`) sem mudar o que decide se ele é DA TURMA, que continua sendo
o `schoolId` que ele mesmo grava no próprio perfil. As duas coisas parecem a
mesma e não são — e é por isso que fechar as duas `KNOWN GAP` não fechou esta.

Passa a ser a existência de `schools/{id}/students/{uid}` — um documento que só
a professora daquela escola escreve. `joinSchool()` deixa de existir como ato de
entrada e vira, no máximo, um pedido.

### 5. Os alunos trazem os próprios nomes

Treze pessoas digitando um nome cada, ao mesmo tempo, em vez de uma pessoa
digitando treze, em série. O nome vem de quem sabe escrevê-lo, o que também
mata a vaga órfã: hoje um erro de digitação dela cria um nome que aluno nenhum
consegue reivindicar.

O nome do cadastro é o que a turma vê. O `users/{uid}` com email, país e data
de nascimento continua legível só pelo dono — a professora não recebe nada
disso, e essa separação é o motivo de o perfil ser um documento à parte.

### 6. A janela de entrada, e o preço dela, dito em voz alta

A professora abre a turma para entrada por alguns minutos, e enquanto estiver
aberta os pedidos entram sozinhos. Ela fecha. Dois toques para treze alunos.

**Isso é uma folga deliberada na regra 4, e não adianta fingir que não é.**
Enquanto a janela está aberta, o aluno escreve o próprio registro de aluno. As
quatro amarras que a tornam aceitável:

- só a professora abre, e a janela mora em `classroom/joinWindow`, que só ela
  escreve;
- expira por horário, verificado na própria regra contra `request.time`, não na
  tela;
- o documento criado é mínimo e validado — o próprio uid, o nome do perfil, e
  nada de resumo, nota ou desempenho;
- a contagem aparece ao vivo na tela dela. Ela está contando cabeças na sala de
  qualquer jeito; se marcar catorze para treze presentes, ela sabe na hora e vê
  qual nome sobra.

Fechada a janela, volta tudo à regra 4: pedido, e um toque dela.

### 7. Os treze nomes já digitados são as treze vagas

Aquele tempo já foi pago e não se paga de novo. A lista está em
`schools/{escola}/classroom/roster`, na nuvem. Ela vira o conjunto de vagas.

Quando a Ana se cadastra e pede entrada, a professora vê o pedido ao lado da
vaga "Ana" que ela mesma digitou, e aprovar é o que amarra uma na outra. **A
migração do histórico pega carona na aprovação:** o que estava em
`students/ana` passa para `students/{uid}` no momento em que existe um uid para
onde mandar.

O documento antigo só é apagado depois que o novo está confirmado. Perder o
histórico de alguém em silêncio é exatamente o padrão de bug que este projeto
passou o dia inteiro consertando — `945842e`, `87ef11a`, `0442201` — e uma
migração é o lugar clássico onde ele volta.

### 8. A idade passa a ser 13, e o muro é o motivo

Era 16, escolhido no `PROMPT-CONTAS.md` porque os alunos são internacionais e
16 satisfaz COPPA e GDPR de uma vez. **O muro muda essa conta.** Enquanto
existia o anônimo, quem não tinha idade de conta praticava assim mesmo; agora
`MIN_AGE` é a única porta, e abaixo dele a pessoa não usa o app de forma
nenhuma. Em 16, um aluno de 15 ficaria inteiramente de fora.

13 cobre COPPA, que usa 13, e a LGPD, onde criança é quem tem menos de 12.
Fica exposto em parte da UE: o GDPR usa 16 por padrão e deixa cada país baixar
até 13 — Reino Unido 13, Espanha 14, França 15, Alemanha e Holanda 16.

**O que sustenta a posição não é o número, é de onde vem o consentimento.** A
lei europeia abre exceção quando a escola consente em contexto educacional, e
o `PROMPT-CONTAS.md` já registra isso como o caminho do Ajar. Então a política
de privacidade ganha uma linha dizendo, com todas as letras, que abaixo de 16
o uso é sob consentimento da escola ou do responsável — em vez de o app fingir
que o número resolve sozinho. Uma política que descreve um app diferente do
que está rodando é pior que nenhuma, e as cinco asserções que conferem a
política contra o comportamento existem exatamente por isso.

O número é barato: `MIN_AGE` é constante única e os cinco textos de tela
derivam dela. A linha da política não é, e é ela que precisa de revisão.

### 9. Uma turma por escola, por enquanto — mas barato de mudar depois

A pergunta "a Michele tem uma turma ou mais de uma?" ficou sem resposta duas
vezes, então assumo o que o modelo já diz: uma professora, uma turma.

Para que isso não custe uma migração se estiver errado, o registro do aluno
nasce com `classIds: []`. Uma turma a mais depois vira um filtro, não uma
mudança de caminho — `schools/{id}/students/{uid}` continua sendo onde o aluno
mora. É a única generalidade especulativa deste plano, e ela existe porque
migrar treze alunos que já estão em uso é caro e acrescentar um campo vazio não
é.

---

## Modelo de dados

O que muda em relação ao `PROMPT-CONTAS.md`:

    schools/{id}/students/{uid}        CHAVEADO POR UID, era pelo nome digitado
      { displayName, classIds, lastSeen, summary }
      create: a professora da escola — ou o próprio, só com a janela aberta
      read:   a professora, e os membros da turma
      update: a professora, e o próprio para o seu desempenho
      delete: a professora

    schools/{id}/joinRequests/{uid}    A FILA DA TURMA. Nova.
      { displayName, requestedAt }
      create: o próprio, e concede NADA
      read, delete: a professora da escola
      update: ninguém

    schools/{id}/classroom/joinWindow  A JANELA. Nova.
      { openUntil }
      read: qualquer membro       write: só a professora

    users/{uid}                        inalterado, menos por uma coisa
      schoolId deixa de ser o que decide filiação. Vira preferência de
      navegação: onde o app abre. Nunca mais é lido por uma regra.

`isMemberOf(schoolId)` passa a ser `exists(schools/{id}/students/{uid})`, e é
essa linha que fecha a carteirinha auto-emitida.

---

## Fluxo

    A ALUNA
      abre hiajar.com        →  o muro: o que é "ajar", e uma porta só
      cria conta             →  nome, país, nascimento, email, senha
      já está dentro         →  pratica à vontade, sem turma nenhuma
      escaneia o QR          →  pede entrada na turma da Michele
      espera um toque        →  e enquanto espera, continua praticando

    A MICHELE
      abre a turma           →  a lista que ela já digitou, com os pedidos ao lado
      confere e aprova       →  um toque por aluno
      ou abre a janela       →  no primeiro dia: dois toques para a turma inteira

O aluno nunca fica olhando para uma parede. Pedido pendente é uma linha na tela
dele dizendo que a professora precisa confirmar, com o app funcionando em volta.

---

## Fases

1. **Regras e modelo** — `joinRequests`, a janela, e o novo `isMemberOf`.
   Provado no emulador, sem uma tela sequer. As duas `KNOWN GAP` já viraram em
   `e6ed7df`, mas as asserções antigas continuam no arquivo apontando para os
   caminhos por nome — precisam sair ou virar asserção de caminho morto, ou o
   arquivo passa a descrever um app que não existe mais.
2. ~~**Identidade do aluno**~~ — **feita em `e6ed7df`.** `students/{uid}` e a
   nota privada em `students/{uid}/private/note`. Sobra só a parte de dados: o
   commit trocou a chave e **não migrou o que já existia**, então o histórico
   dos treze sob nome digitado ficou órfão. A migração da decisão 7 continua
   valendo, e agora é a única coisa que falta desta fase.
3. **O pedido e a aprovação** — o aluno pede, e a Michele aprova dentro da
   lista que ela já abre, sem tela nova.
4. **O muro** — a tela inicial vira porta única, sai a sessão anônima, e o
   destino escaneado sobrevive ao cadastro. `MIN_AGE` vai a 13 e a política
   ganha a linha do consentimento, porque é aqui que o portão passa a ser a
   única porta.
5. **A janela de entrada** — auto-aprovação com prazo, e a contagem ao vivo.
6. **Colar a lista** — várias linhas no campo que já existe. Rede de segurança.

A ordem tem um motivo e não é a ordem do desejo. O muro é a fase 4 e não a 1
porque ele é a única que pode trancar uma turma real para fora numa manhã de
segunda. Ele sobe quando a porta ao lado dele já funciona.

---

## O que precisa ser feito no console, e não posso fazer

Herdado do `PROMPT-CONTAS.md`, e ainda sem confirmação de que foi feito:

- `hiajar.com` nos domínios autorizados do Firebase Auth.
- Provedor Google habilitado em Authentication → Sign-in method.
- `admins/{uid do Rony}` criado à mão.
- `firestore.rules` republicado. O `PROGRESS.md` lista isso como o único item
  aberto que afeta uma turma, e as regras mudaram muito desde então.

Com o muro, o primeiro item deixa de ser "o login com Google falha" e passa a
ser "ninguém entra no app".

---

## Fora de escopo, declarado

- Convite por código ou por email. A turma tem treze pessoas e um QR na parede.
- Turmas múltiplas. Ver decisão 9 — o campo fica, a funcionalidade não.
- Importar CSV ou ler a lista de uma foto. Mais coisa para dar errado do que
  tempo economizado, e não há backend para processar arquivo.
- Recuperar o histórico de quem praticou anônimo e nunca criou conta. Não há
  como saber quem era — é o que "nada escrito em lugar nenhum" significa.
