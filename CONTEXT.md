# Context: Esmeraldinha

Esmeraldinha fills in cadernetas on the portal do professor of Limoeiro de Anadia on behalf of professores, driven by the auxiliar de ensino.

Domain terms are Portuguese and are never translated — in prose, in code identifiers, or in filenames. Everything around them is English. Where the portal shows a different label for a term, the label is recorded so an agent reading the screen can map the two.

## Language

### Pessoas

**auxiliar de ensino**:
The person who fills in cadernetas on behalf of professores. The only user of Esmeraldinha.
_Avoid_: assistant, operador, usuário

**professor**:
The teacher a caderneta belongs to. Not a user of Esmeraldinha — a portal identity that Esmeraldinha acts on behalf of.
_Avoid_: teacher, docente

**credenciais do professor**:
The login (a CPF), senha and escola a professor hands over so the auxiliar de ensino can act as them on the portal. Esmeraldinha stores these by necessity: the portal has no delegated access.
_Avoid_: credentials, account

### Portal

**portal**:
The portal do professor of Limoeiro de Anadia. The external system Esmeraldinha writes into, and the only place a caderneta legally exists.
_Avoid_: site, sistema externo

**escola**:
The school a professor logs into the portal under. Part of the credenciais do professor, alongside login and senha.
_Avoid_: school, unidade

**sessão do portal**:
An authenticated session on the portal, opened with the credenciais do professor and expiring after an idle period.
_Avoid_: session, login

### Estrutura

**caderneta**:
The record a professor must keep for one turma across the school year. Composed of the five partes below, and finished only once every aula of every etapa is filled in.
_Avoid_: diário, registro, notebook

**turma**:
A class group. A caderneta belongs to exactly one turma.
_Avoid_: class, grupo

**etapa**:
One of the four periods the school year is divided into. Its start and end dates come from the calendário acadêmico.
_Avoid_: term, período, bimestre

**calendário acadêmico**:
The external academic calendar that dictates each etapa's start and end dates.
_Avoid_: calendar, cronograma

**mês**:
A month within an etapa. An etapa spans two or three of them. Purely a way of narrowing what you are looking at — it carries no completeness of its own.
_Avoid_: month, período

**redução**:
The daily grouping a turma's aulas are filed under. The portal labels this field _Grupo diário_.
_Avoid_: grupo diário, turno

**aula**:
One dated lesson in a turma. The unit of completeness: a caderneta advances one aula at a time.
_Avoid_: lesson, class, dia

**estudante**:
A student enrolled in a turma, named as such by the portal.
_Avoid_: aluno, student, criança

**matrícula**:
An estudante's enrolment in a turma, carrying a situação (e.g. `ATIVO`) and a data da matrícula. The boletim is keyed by matrícula, not by person.
_Avoid_: enrolment, registration

### Partes da caderneta

**conteúdo**:
What was taught in each aula. Filled in on the portal's _Lançamento de Conteúdo_ screen.
_Avoid_: content, plano de aula

**frequência**:
Attendance of each estudante at each aula. Filled in on the portal's _Lançamento de Presença_ screen.
_Avoid_: presença, attendance, chamada

**ficha de desempenho**:
The performance sheet for each estudante. The portal's _Ficha Desempenho_ screen.
_Avoid_: performance sheet, avaliação

**ficha descritiva**:
The descriptive sheet for each estudante. The portal's _Ficha Descritiva/Monitoramento_ screen.
_Avoid_: descriptive sheet, relatório, parecer

**boletim**:
The grade grid holding every estudante's notas for an etapa. The portal's _Resultado de Avaliação_ screen. Filling it in requires the etapa's avaliações to already exist.
_Avoid_: notas, report card, resultado

### Campos

**ordem da aula**:
An aula's position within its dia.
_Avoid_: order, posição

**código CR**:
The curriculum reference recorded against an aula's conteúdo.
_Avoid_: codigo, referência curricular, BNCC

**desenvolvimento**:
The narrative of how an aula was taught. The portal labels this field _Desenvolvimento / Metodologia_.
_Avoid_: metodologia, description, conteúdo

**ferramentas**:
The resources used in an aula. The portal labels this field _Ferramentas Utilizadas_.
_Avoid_: recursos, materiais, tools

**recuperação**:
Whether an aula was a make-up lesson.
_Avoid_: makeup, reforço

**interação**:
Whether an aula involved interaction, recorded per aula alongside recuperação.
_Avoid_: interaction, participação

**avaliação**:
An assessment an etapa's notas are given against, with a nome, tipo (e.g. `OBSERVAÇÃO`, `TRABALHO EM GRUPO`, `AVALIAÇÃO/PROVA`), data and valor. Created on the portal's _Cadastro de Avaliação_ screen before the boletim can be filled in.
_Avoid_: assessment, prova, atividade

**nota final da etapa**:
The grade an estudante closes an etapa with.
_Avoid_: final grade, média, nota
