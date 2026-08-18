# Revisão total do Ajar — técnica, pedagógica e linguística

Prompt de execução em camadas. Escrito 18/08/2026 contra `d153999`.

Você é duas pessoas ao mesmo tempo: **engenheiro de front-end com quinze anos**
e **mestre em linguística inglesa com experiência em preparação para exames**.
O segundo nunca foi consultado neste projeto, e é onde está o material novo.

## Contexto que não se negocia

- `index.html` único, ~14.700 linhas, sem build step. Deliberado.
- `sh scripts/qa.sh` — 40 arquivos, 3307 asserções. `AJAR_RULES=1` adiciona 109
  no emulador real do Firestore (precisa de Java).
- Hook de pre-commit recusa commit vermelho.
- Quando um checker discorda do app, a pergunta é **qual dos dois está errado**.
  Já houve os dois casos. Não afrouxe checker para passar.
- Usuárias reais: uma professora e ~13 alunos internacionais em **Denver,
  Colorado**, preparando-se para o **TOEFL iBT**.
- O TOEFL **não é um exame só americano**, e supor isso já produziu uma
  recomendação errada aqui. A ETS usa sotaques da América do Norte, Reino
  Unido, Austrália e Nova Zelândia no Listening, de propósito. Ver 1.1.

## Regra acima de todas

**Não alucine.** Toda afirmação precisa de evidência: `arquivo:linha`, número
medido, ou saída de comando. Um achado sem evidência não entra. Se não deu para
medir, diga que não deu.

---

# CAMADA 1 — O inglês que está sendo ensinado

A camada mais urgente, porque é a única que afeta o aluno em toda sessão e
nenhuma auditoria anterior olhou.

## 1.1 Variedade de inglês — e a correção que o dono fez  *(medido)*

Eu escrevi "o TOEFL é americano, então padronize tudo em americano". **Estava
errado, e ele duvidou antes de eu executar.**

A ETS diz o contrário, e por escrito: o Listening do TOEFL iBT usa
**deliberadamente** sotaques da América do Norte, Reino Unido, Austrália e
Nova Zelândia. Norte-americano é o mais comum; os outros são de propósito,
porque é o inglês que se ouve num ambiente acadêmico de verdade.

Isso inverte metade da recomendação e transforma um defeito em quase um
recurso. Medido nos bancos:

| | palavras | formas britânicas | por mil |
|---|---|---|---|
| **Listening** (conversa, palestra, aviso, resposta) | 20.431 | 66 | 3,23 |
| **Reading** (passagem, leitura do dia) | 12.037 | 23 | 1,91 |

**O que isso quer dizer, item por item:**

- **No Listening, britânico é legítimo e deveria ser intencional.** Um aluno
  que só ouviu americano vai tropeçar numa palestra britânica no dia do teste.
  Hoje as 66 ocorrências são acidente; deveriam ser desenho, com a proporção
  documentada e norte-americano dominante como na ETS.
- **No Reading, a ortografia deveria ser americana.** A ETS escreve em
  americano nos próprios materiais. `centre`, `colour`, `organised` numa
  passagem escrita não é o que o teste mostra. **23 ocorrências.**
- **Na interface do app — o texto que eu escrevi — deveria ser americano**, e
  não é: `practise`, `practising`, `centre`. O app fala com um aluno numa
  escola americana. Isso é meu, é seguro, e não toca em gabarito.
- **Vocabulário como `chemist`, `flat`, `queue` é a decisão mais fina.** No
  Listening ensina o aluno a reconhecer, o que o teste cobra. Na vida em
  Denver ele precisa produzir `pharmacy`, `apartment`, `line`. Reconhecer e
  produzir são habilidades diferentes, e o app não distingue as duas hoje.

**Ordem:** interface primeiro (meu texto, risco zero). Ortografia do Reading
depois (mecânica, sem mudar sentido). Vocabulário do Listening **não se toca
sem decisão dele** — é onde a fidelidade ao exame e a vida em Denver apontam
para lados diferentes.

**Regra que fica:** nunca deixar de seguir o padrão e as normativas aplicadas
no teste real. Quando eu achar que sei o que a ETS faz, verificar antes de
agir — foi assim que este item mudou de sentido.

## 1.2 Registro e naturalidade

Ler 40 itens sorteados e julgar como professor, não como script:
- O inglês soa como pessoa ou como livro didático?
- O registro bate com a situação? (Um aviso de mural não fala como um amigo.)
- Os distratores são errados por um motivo **interessante** — um erro que um
  aluno de verdade cometeria — ou arbitrários?
- Há vocabulário fora do nível? Palavra rara fazendo o trabalho de distinguir?

## 1.3 Consistência de nível

O TOEFL iBT mira B2–C1 do CEFR. Medir dispersão de dificuldade dentro de cada
banco: comprimento de sentença, densidade lexical, frequência das palavras.
Um banco onde metade é A2 e metade é C1 não treina ninguém.

## 1.4 Viés cultural

Conteúdo que pressupõe experiência que um aluno do Vietnã ou da Indonésia não
tem. Já existe `AUDITORIA` sobre isso; reconferir com os bancos atuais.

---

# CAMADA 2 — Referências externas

Pesquisar e **citar números**, não impressões:

- **Duolingo English Test** — o concorrente direto do TOEFL. Formato, duração,
  como reporta resultado.
- **Magoosh / TestGlider / BestMyTest** — TOEFL prep pagos. O que oferecem que
  não temos, e o que temos que eles não têm.
- **Kahoot / Quizizz / Nearpod** — resposta em sala. Comparar com a rodada ao
  vivo: o que eles resolveram que ainda não resolvemos.
- **Anki / SM-2** — repetição espaçada. Hoje o app sorteia sem memória de erro.
  Avaliar se cabe sem build step.

Para cada um: o que copiar, o que rejeitar, e por quê.

---

# CAMADA 3 — Técnica, o que ainda não foi olhado

- **Acessibilidade** — nunca foi feita auditoria dedicada. Contraste WCAG 2.2 AA
  nos três estados de tema, ordem de foco, área de toque, live regions, e o app
  em 375/768/1280.
- **Desempenho** — 14.700 linhas num arquivo. Medir tempo até interativo em 3G
  simulado, que é o wifi da escola.
- **O vermelho não reproduzido** — uma corrida deu 3277 contra 3295. Rodar a
  suíte 20 vezes e caracterizar.
- **Verificação no navegador real** — nada disso foi visto rodando.

---

# CAMADA 4 — Produto

- O que falta para uma segunda escola além de publicar as regras.
- O que a professora ainda faz à mão e não deveria.
- O que o aluno não consegue fazer e deveria.

---

## Entrega

Commits argumentados em inglês, um por achado corrigido. Um relatório final com
achados classificados, evidência de cada um, e o que ficou aberto e por quê.
