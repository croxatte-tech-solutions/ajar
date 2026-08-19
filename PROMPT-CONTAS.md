# Contas de verdade no Ajar — prompt de execução

Documento de trabalho. **Escrito em 17 de agosto de 2026, antes de codar**,
para que as decisões fiquem argumentadas e não descobertas no meio. Executado
nas fases abaixo.

> ## O que mudou depois que isto foi escrito
>
> Este é um documento de decisão, não uma descrição do app. O raciocínio abaixo
> fica como está — inclusive onde a conclusão foi revertida, porque o motivo de
> uma decisão continua valendo mesmo quando ela muda. O que está desatualizado
> em relação ao código de hoje:
>
> - **A idade mínima é 13, não 16.** A decisão 3 argumenta 16 como menor
>   denominador comum entre COPPA e GDPR, e isso continua correto como leitura
>   da lei. O que mudou foi o produto: quando a conta virou a **única** forma de
>   entrar, 16 deixou de ser "a idade sobre a qual guardamos dados" e passou a
>   ser "a idade em que este app começa" — e uma turma de escola de idiomas tem
>   gente de 14 e 15 anos. `MIN_AGE = 13` no código, e a política de privacidade
>   explica exatamente essa troca ao aluno.
> - **Todas as seis fases estão concluídas.** Autenticação, cadastro e painel do
>   administrador não estavam marcados aqui e estão prontos.
> - **A decisão 4 (popup, nunca redirect) continua certa e custou caro.** O
>   popup carrega um iframe escondido contra o domínio de autenticação, e esse
>   iframe é preenchido por um script vindo de `apis.google.com` — que não estava
>   no `script-src`. Ver `PROGRESS.md`, sessão de 18–19/08.
> - **O administrador lê `users/{uid}`.** A decisão 2 e o modelo de dados abaixo
>   dizem que ninguém além do dono lê aquele documento. Mudou em 18/08 por
>   decisão do dono do app, com a política de privacidade reescrita no mesmo
>   commit e um check que compara as duas em ambos os sentidos.
>
> Para o estado de hoje, ler `README.md` e `CLAUDE.md`, não este arquivo.

---

## O que se está construindo

Login com conta Google e cadastro próprio no site, para alunos e professores,
com um acesso de administrador para o dono do app aprovar professores.

Hoje o aluno é uma **string digitada** (`localStorage.ajar_student_name`).
Nada no banco sabe quem ele é. É por isso que as regras carregam duas falhas
que o emulador assevera de propósito: um colega lê a nota privada da professora
sobre outro aluno, e lê o resumo dele. Nenhuma regra consegue escrever "só a
Ana" enquanto a Ana não é ninguém.

Conta de verdade é o que fecha as duas. É a mudança de fundação do projeto.

---

## Decisões tomadas, e por quê

### 1. Professor não se auto-declara professor

O cadastro pede o nome da escola. **Texto digitado não pode conceder acesso a
uma escola.** Se concedesse, qualquer pessoa se cadastra como professora da
CSE e lê a turma inteira — nomes, desempenho, e as anotações privadas.

Hoje `teachers/{uid}` tem `allow create: if false` exatamente por isso.

**Escolhido: aprovação manual.** O professor se cadastra e cai numa fila. O
administrador aprova. Com um punhado de professores é um toque por pessoa, não
exige infraestrutura nenhuma, e é seguro por construção — ninguém entra sem que
uma pessoa tenha decidido que entra.

Código de convite é o próximo degrau, quando a escala pedir. Ele troca o toque
por uma coleção de convites e por um novo modo de falhar: código vazado é
professor falso.

### 2. O administrador é um documento, não uma custom claim

O caminho canônico do Firebase para papéis é custom claims no token. Aqui ele é
o errado, por três motivos concretos:

- Exige o Admin SDK. Não há backend, e não haverá — o app não tem build step.
- Não se vê nem se edita pelo console. Depurar exige escrever código.
- O token do usuário só reflete a mudança depois de um refresh, então aprovar
  alguém não tem efeito até ele sair e voltar.

`admins/{uid}` é um documento criado à mão no console, exatamente como
`teachers/{uid}` já é. As regras perguntam com `exists()`. Custa uma leitura
por avaliação de regra, que é o preço que já se paga em `isTeacherOf()`.

Ninguém pode se criar administrador: `allow create, delete: if false`.

### 3. Idade mínima 16, e bloqueia abaixo

As leis dão números diferentes — COPPA usa 13, GDPR usa 16 em boa parte da
Europa. Os alunos são internacionais, então o menor denominador comum vale
para todos: **16 satisfaz as duas em qualquer país de uma vez**, e evita a
maquinaria de consentimento parental, que é cara, lenta e fácil de errar.

Duas ressalvas honestas, das fontes:

- Uma caixinha "tenho mais de 13" **não é conformidade**. Um portão de idade
  não protege um produto que é claramente destinado a crianças. Ajar prepara
  para um exame de admissão universitária — não é esse produto, e é isso que
  sustenta a posição.
- A lei abre exceção quando **a escola fornece o consentimento** em contexto
  educacional. É o caminho do Ajar, e é mais simples que consentimento parental.

Quem informar menos de 16 não cria conta, e **a data informada não é gravada**.
Guardar a data de nascimento de alguém que foi recusado seria coletar dado de
menor justamente na hora de dizer que não se coleta.

### 4. Popup, nunca redirect

`signInWithRedirect` usa um iframe cross-origin contra o domínio de auth. O app
está em `hiajar.com` (Cloudflare Pages) e o domínio de auth é
`*.firebaseapp.com`, então navegadores que bloqueiam armazenamento de terceiros
— Safari por padrão, Chrome — quebram o fluxo. A própria documentação do
Firebase recomenda popup.

Popup tem seu próprio modo de falhar: bloqueador. Isso é tratado com mensagem,
não ignorado.

### 5. A sessão anônima é promovida, não descartada

Quem já praticou tem histórico ligado a um uid anônimo. `linkWithPopup`
preserva o uid, então entrar com Google mantém tudo. Criar conta nova e
abandonar a antiga perderia o trabalho da pessoa em silêncio — que é o padrão
de bug que este projeto passou o dia inteiro consertando.

---

## Modelo de dados

    admins/{uid}                  console apenas. { note }
      read: só o próprio          create, update, delete: false

    users/{uid}                   o perfil. PII mora aqui e só aqui.
      { displayName, email, country, birthDate, role, schoolId, createdAt }
      read, write: só o próprio   nunca legível pela turma nem pela professora

    teacherRequests/{uid}         a fila de aprovação
      { name, email, schoolNameTyped, requestedAt }
      create: o próprio           read, delete: administrador
      update: ninguém

    teachers/{uid}                inalterado no formato
      { name, schoolId, schoolName }
      create, delete: administrador (era: ninguém)
      update: o próprio, só name e schoolName

    schools/{id}/students/{uid}   o que a turma pode ver
      { displayName, lastSeen, summary }
      chaveado por uid, não mais por nome digitado

**A separação que importa:** `users/{uid}` guarda email, país e data de
nascimento, e é legível só pelo dono. `schools/{id}/students/{uid}` guarda
nome de exibição e desempenho, e é legível pela turma. A professora não precisa
da data de nascimento de ninguém para dar aula, então não a recebe.

---

## Fluxo, no padrão que os apps usam

    Entrar
      ├── Continuar com Google      → popup → perfil completo? → entra
      │                                     └── não → completar perfil
      └── Entrar com email e senha  → entra

    Criar conta
      ├── nome completo             obrigatório
      ├── país de origem            obrigatório
      ├── data de nascimento        obrigatório, portão de 16+
      ├── email                     obrigatório (vem do Google, ou digitado)
      ├── senha                     só na via email
      ├── [ ] sou professor         → abre "nome da escola", obrigatório
      └── [ ] li a política de privacidade

Entrar com Google e completar o perfil depois é o padrão de todo app que usa
provedor social: o Google devolve nome e email, nunca país nem data de
nascimento. Pedir os dois numa segunda tela é o desenho normal, não um remendo.

O aluno entra na turma pelo link — escaneou o QR e entrou, está na turma.
Mesmo nível de confiança de hoje, atrito zero na sala.

O professor não entra em turma nenhuma ao se cadastrar. Ele entra na fila.

---

## Fases

1. **Papéis de verdade** — professor é quem tem registro de professor, não quem
   tem login. *(feito: commit 27bf572)*
2. **Regras e modelo de dados** — `admins`, `users`, `teacherRequests`, e as
   regras que os separam. Asseveradas no emulador antes de existir UI.
3. **Autenticação** — Google por popup, email e senha, promoção do anônimo.
   *(feito)*
4. **Cadastro** — o formulário, o portão de idade, a política de privacidade.
   *(feito — e o portão ficou em 13, ver a nota no topo)*
5. **Painel do administrador** — a fila, aprovar, recusar. *(feito)*
6. **Identidade do aluno** — `students/{uid}` no lugar de `students/{nome}`, as
   notas privadas movidas, e as duas falhas conhecidas fechadas. *(feito)*

   O que as causava não era o modo anônimo. Todo visitante anônimo já tinha
   uid estável. Era o registro ser arquivado por `nome.toLowerCase()` — e nome
   não é identidade: nenhuma regra consegue dizer "só a Ana" sobre uma string
   que alguém digitou numa caixa. Sobre um uid, consegue.

   Sobra uma coisa menor e proposital: um colega vê o **nome de exibição** e o
   resumo do outro na lista da turma. É para isso que uma lista de turma serve.

A ordem não é negociável: cada fase depende da anterior, e a 2 vem antes de
qualquer tela porque uma regra escrita depois da UI é uma regra escrita para
caber no que já existe.

---

## O que precisa ser feito no console, e não posso fazer

- `hiajar.com` na lista de **domínios autorizados** do Firebase Auth. Sem isso
  o login com Google falha com `auth/unauthorized-domain`.
- Provedor **Google** habilitado em Authentication → Sign-in method.
- `admins/{uid do Rony}` criado à mão.

---

## Fora de escopo, declarado

- Consentimento parental. Não existe menor de 16 no produto, por construção.
- Verificação de idade documental. Um portão declarado é o que a lei pede para
  este produto; verificação por documento é para produtos destinados a crianças.
- Custom claims. Ver decisão 2.
- Login social além do Google. Um provedor a mais é uma superfície a mais.
