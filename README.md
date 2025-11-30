# Esmeraldinha

![Python](https://img.shields.io/badge/python-3.12+-blue.svg)
![Django](https://img.shields.io/badge/django-5.2.8-green.svg)
![Nuxt](https://img.shields.io/badge/nuxt-4-00DC82.svg)
![Vue](https://img.shields.io/badge/vue-3-4FC08D.svg)
![Node](https://img.shields.io/badge/node-18+-green.svg)
![Coverage](https://img.shields.io/badge/coverage-98%25-brightgreen.svg)
![License](https://img.shields.io/badge/license-Private-red.svg)
![Code Style](https://img.shields.io/badge/code%20style-black-000000.svg)
![REST API](https://img.shields.io/badge/API-REST-orange.svg)

## 🎯 Objetivo

**Esmeraldinha** é um sistema desenvolvido para **automatizar o processo de criação e preenchimento de cadernetas escolares** no site do SEMED (Secretaria Municipal de Educação) da Prefeitura de Limoeiro.

### Problema

O processo manual de criação de cadernetas no sistema do SEMED é:
- ⏱️ **Demorado**: Professores precisam preencher manualmente dados repetitivos
- 🔄 **Repetitivo**: Mesmas informações são inseridas múltiplas vezes
- ❌ **Propenso a erros**: Digitação manual aumenta o risco de inconsistências
- 📄 **Burocrático**: Requer navegação complexa em múltiplas páginas

### Solução

Esmeraldinha oferece:
- ✅ **Automação completa**: Preenchimento automático de cadernetas
- 📸 **Processamento inteligente**: Extração de dados de calendários acadêmicos (imagens)
- 🏫 **Gestão centralizada**: Cadastro e gerenciamento de escolas e professores
- 🚀 **Interface moderna**: UI/UX intuitiva e responsiva
- 🔌 **API REST**: Integração facilitada com outros sistemas

---

## 🏗️ Tecnologias e Arquitetura

### Stack Tecnológico

#### Backend
- **[Django 5.2.8](https://www.djangoproject.com/)**: Framework web Python robusto e escalável
- **[Django REST Framework](https://www.django-rest-framework.org/)**: API RESTful completa
- **[drf-spectacular](https://drf-spectacular.readthedocs.io/)**: Documentação OpenAPI/Swagger automática
- **[Pillow](https://python-pillow.org/)**: Processamento e análise de imagens (calendários)
- **[pandas](https://pandas.pydata.org/) + [numpy](https://numpy.org/)**: Análise e manipulação de dados
- **SQLite**: Banco de dados (desenvolvimento)

#### Frontend
- **[Nuxt 4](https://nuxt.com/)**: Framework Vue.js full-stack com SSR
- **[Vue 3](https://vuejs.org/)**: Framework JavaScript progressivo
- **[Nuxt UI](https://ui.nuxt.com/)**: Biblioteca de componentes UI
- **[TypeScript](https://www.typescriptlang.org/)**: Tipagem estática JavaScript
- **[Tailwind CSS](https://tailwindcss.com/)**: Framework CSS utility-first

### Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                         USUÁRIO FINAL                            │
│                    (Professor/Administrador)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (Nuxt 4)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Pages      │  │  Components  │  │ Composables  │          │
│  │   (Views)    │  │    (UI)      │  │   (Logic)    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         │                  │                  │                  │
│         └──────────────────┴──────────────────┘                  │
│                            │                                     │
│                    Vue 3 + TypeScript                            │
│                    Tailwind CSS                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP/REST
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND (Django 5.2.8)                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              API REST (Django REST Framework)             │   │
│  │                                                           │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌──────────────────┐   │   │
│  │  │   Schools   │ │  Teachers   │ │ Academic Calendar│   │   │
│  │  │     API     │ │     API     │ │       API        │   │   │
│  │  └─────────────┘ └─────────────┘ └──────────────────┘   │   │
│  │         │               │                  │             │   │
│  └─────────┼───────────────┼──────────────────┼─────────────┘   │
│            │               │                  │                  │
│  ┌─────────▼───────────────▼──────────────────▼─────────────┐   │
│  │                  Business Logic                           │   │
│  │   ┌──────────┐  ┌──────────┐  ┌────────────────────┐     │   │
│  │   │ Models   │  │  Views   │  │    Serializers     │     │   │
│  │   │ (ORM)    │  │(Logic)   │  │  (Validation)      │     │   │
│  │   └──────────┘  └──────────┘  └────────────────────┘     │   │
│  └───────────────────────────┬──────────────────────────────┘   │
│                              │                                   │
│  ┌───────────────────────────▼──────────────────────────────┐   │
│  │              Image Processing Engine                      │   │
│  │         (Pillow + pandas + numpy)                         │   │
│  │   - Extração de dados de calendários acadêmicos          │   │
│  │   - OCR e análise de imagens                              │   │
│  └───────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BANCO DE DADOS (SQLite)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Schools    │  │   Teachers   │  │  Calendars   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    SISTEMA EXTERNO (SEMED)                       │
│              (Integração futura via automação web)               │
└─────────────────────────────────────────────────────────────────┘
```

### Fluxo de Dados

1. **Usuário** acessa interface Nuxt
2. **Frontend** faz requisições HTTP para API Django
3. **Backend** processa requisições (CRUD, upload de imagens)
4. **Processamento** de imagens de calendários acadêmicos
5. **Banco de dados** persiste informações
6. **Resposta** retorna ao frontend em JSON
7. **Interface** atualiza com os dados

### Estrutura do Projeto

```
esmeraldinha/
├── apps/                          # Apps Django (backend)
│   ├── academic_calendar/         # Processamento de calendários
│   │   ├── models.py
│   │   ├── views.py
│   │   ├── serializers.py
│   │   └── tests.py
│   ├── school/                    # Gestão de escolas
│   │   ├── models.py
│   │   ├── views.py
│   │   ├── serializers.py
│   │   ├── fixtures/              # Dados iniciais
│   │   └── tests.py
│   └── teacher/                   # Gestão de professores
│       ├── models.py
│       ├── views.py
│       ├── serializers.py
│       └── tests.py
├── frontend/                      # Aplicação Nuxt 4
│   ├── app/
│   │   ├── pages/                # Rotas/Views
│   │   │   ├── index.vue
│   │   │   ├── schools.vue
│   │   │   └── teachers.vue
│   │   ├── components/           # Componentes reutilizáveis
│   │   └── composables/          # Lógica compartilhada
│   ├── nuxt.config.ts
│   └── package.json
├── esmeraldinha/                 # Configurações Django
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
├── manage.py                     # CLI Django
├── requirements.txt              # Dependências Python
├── Makefile                      # Comandos automatizados
└── README.md
```

---

## 🚀 Instalação Local

### Pré-requisitos

- **Python 3.12+**
- **Node.js 18+**
- **pnpm** (gerenciador de pacotes)
- **Make** (opcional, mas recomendado)

### Opção 1: Instalação Rápida com Make (Recomendado)

```bash
# Clone o repositório
git clone <url-do-repositorio>
cd esmeraldinha

# Instala todas as dependências (Python + Node.js)
make install

# Inicia os servidores de desenvolvimento (Django + Nuxt)
make dev
```

Pronto! Acesse:
- **Frontend**: http://localhost:3000
- **Backend/API**: http://127.0.0.1:8000
- **Swagger**: http://127.0.0.1:8000

### Opção 2: Instalação Manual

#### 1. Configurar Backend (Django)

```bash
# Criar ambiente virtual
python -m venv .venv

# Ativar ambiente virtual
# Linux/Mac:
source .venv/bin/activate
# Windows:
.venv\Scripts\activate

# Instalar dependências Python
pip install --upgrade pip
pip install -r requirements.txt

# Criar e aplicar migrations
python manage.py makemigrations
python manage.py migrate

# (Opcional) Criar superusuário para admin Django
python manage.py createsuperuser

# Popular dados de escolas (opcional)
python manage.py seed_schools
```

#### 2. Configurar Frontend (Nuxt)

```bash
# Navegar para o diretório frontend
cd frontend

# Instalar dependências
pnpm install

# Voltar para a raiz
cd ..
```

#### 3. Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
FRONTEND_URL=http://127.0.0.1:3000
API_BASE_URL=http://127.0.0.1:8000
```

#### 4. Executar a Aplicação

**Terminal 1 - Backend:**
```bash
source .venv/bin/activate
python manage.py runserver
```

**Terminal 2 - Frontend:**
```bash
cd frontend
pnpm dev
```

### URLs e Acessos

| Serviço | URL | Descrição |
|---------|-----|-----------|
| **Frontend** | http://localhost:3000 | Interface principal |
| **Backend API** | http://127.0.0.1:8000 | API REST |
| **Swagger UI** | http://127.0.0.1:8000 | Documentação interativa |
| **Admin Django** | http://127.0.0.1:8000/admin | Painel administrativo |

### Endpoints da API

#### Escolas
- `GET /api/schools/` - Lista todas as escolas
- `POST /api/schools/` - Cria uma nova escola
- `GET /api/schools/{id}/` - Detalhes de uma escola
- `PUT /api/schools/{id}/` - Atualiza uma escola
- `PATCH /api/schools/{id}/` - Atualização parcial
- `DELETE /api/schools/{id}/` - Deleta uma escola

#### Professores
- `GET /api/teachers/` - Lista todos os professores
- `GET /api/teachers/{id}/` - Detalhes de um professor
- `POST /api/teachers/` - Cria um novo professor
- `PUT /api/teachers/{id}/` - Atualiza um professor
- `DELETE /api/teachers/{id}/` - Deleta um professor

#### Calendário Acadêmico
- `POST /api/academic-calendar/` - Processa imagem de calendário

#### Documentação
- `GET /api/schema/` - Schema OpenAPI
- `GET /` - Swagger UI

### Comandos Úteis

#### Django
```bash
# Criar superusuário
python manage.py createsuperuser

# Aplicar migrations
python manage.py migrate

# Criar migrations
python manage.py makemigrations

# Popular escolas
python manage.py seed_schools

# Shell do Django
python manage.py shell

# Executar testes
python manage.py test

# Executar testes com cobertura
coverage run --source='.' manage.py test
coverage report
```

#### Nuxt
```bash
cd frontend

# Desenvolvimento
pnpm dev

# Build para produção
pnpm build

# Preview da build
pnpm preview

# Gerar site estático
pnpm generate
```

### Solução de Problemas

#### Erro: "no such table"
```bash
# Recriar o banco de dados
rm db.sqlite3
python manage.py migrate
```

#### Erro: "ModuleNotFoundError"
```bash
# Reinstalar dependências
pip install -r requirements.txt
cd frontend && pnpm install
```

#### Erro: Porta já em uso
```bash
# Django - usar outra porta
python manage.py runserver 8001

# Nuxt - usar outra porta
cd frontend
pnpm dev --port 3001
```

### Dados Iniciais

#### Popular Escolas

A migration `0002_seed_schools.py` popula automaticamente as escolas ao executar `migrate`. Ela procura por:

1. `apps/school/fixtures/schools_real.json` (dados reais - se existir)
2. `apps/school/fixtures/schools_fake.json` (dados fictícios - padrão)

**Para popular manualmente:**

```bash
# Popular usando schools.json
python manage.py seed_schools

# Limpar e recriar
python manage.py seed_schools --clear
```

**Nota:** O comando `seed_schools` procura por `apps/school/fixtures/schools.json`. Para usar dados reais, renomeie ou crie um link simbólico do arquivo `schools_real.json` para `schools.json`.

---

## 🤝 Guia de Contribuição

Contribuições são bem-vindas! Siga as diretrizes abaixo para contribuir com o projeto.

### Como Contribuir

1. **Fork o projeto**
   ```bash
   # Clique em "Fork" no GitHub
   ```

2. **Clone seu fork**
   ```bash
   git clone https://github.com/seu-usuario/esmeraldinha.git
   cd esmeraldinha
   ```

3. **Crie uma branch para sua feature**
   ```bash
   git checkout -b feature/MinhaNovaFeature
   ```

4. **Instale as dependências**
   ```bash
   make install
   # ou siga a instalação manual
   ```

5. **Faça suas alterações**
   - Escreva código limpo e documentado
   - Siga as convenções de código do projeto
   - Adicione testes para novas funcionalidades

6. **Execute os testes**
   ```bash
   # Backend
   python manage.py test
   
   # Cobertura
   coverage run --source='.' manage.py test
   coverage report
   ```

7. **Commit suas mudanças**
   ```bash
   git add .
   git commit -m "feat: Adiciona nova funcionalidade X"
   ```

8. **Push para sua branch**
   ```bash
   git push origin feature/MinhaNovaFeature
   ```

9. **Abra um Pull Request**
   - Vá para o repositório original no GitHub
   - Clique em "New Pull Request"
   - Descreva suas alterações detalhadamente

### Padrões de Código

#### Python (Backend)
- **Style Guide**: [PEP 8](https://pep8.org/)
- **Formatação**: [Black](https://black.readthedocs.io/)
- **Imports**: Ordenados alfabeticamente
- **Docstrings**: Google Style
- **Type Hints**: Sempre que possível

```python
def calcular_total(valores: list[float]) -> float:
    """
    Calcula o total de uma lista de valores.
    
    Args:
        valores: Lista de valores numéricos.
        
    Returns:
        Soma total dos valores.
    """
    return sum(valores)
```

#### JavaScript/TypeScript (Frontend)
- **Style Guide**: [Nuxt Style Guide](https://nuxt.com/docs/guide/concepts/code-style)
- **Formatação**: Prettier (configurado no projeto)
- **Componentes**: PascalCase
- **Funções/variáveis**: camelCase
- **Constantes**: UPPER_SNAKE_CASE

```typescript
// Composable
export const useSchools = () => {
  const schools = ref<School[]>([])
  
  const fetchSchools = async () => {
    // implementação
  }
  
  return { schools, fetchSchools }
}
```

### Convenções de Commit

Siga o padrão [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` Nova funcionalidade
- `fix:` Correção de bug
- `docs:` Documentação
- `style:` Formatação (sem mudança de código)
- `refactor:` Refatoração de código
- `test:` Adição ou correção de testes
- `chore:` Manutenção geral

**Exemplos:**
```bash
feat: adiciona endpoint de listagem de turmas
fix: corrige validação de CPF no cadastro de professores
docs: atualiza README com instruções de deploy
test: adiciona testes para serializer de escolas
```

### Estrutura de um Pull Request

```markdown
## Descrição
Breve descrição das alterações realizadas.

## Tipo de mudança
- [ ] Bug fix
- [ ] Nova feature
- [ ] Breaking change
- [ ] Documentação

## Como testar
1. Passo 1
2. Passo 2
3. Resultado esperado

## Checklist
- [ ] Código segue os padrões do projeto
- [ ] Testes foram adicionados/atualizados
- [ ] Documentação foi atualizada
- [ ] Todos os testes passam
- [ ] Não há warnings de linter
```

### Reportar Bugs

Ao reportar bugs, inclua:

1. **Descrição clara** do problema
2. **Passos para reproduzir**
3. **Comportamento esperado**
4. **Comportamento atual**
5. **Screenshots** (se aplicável)
6. **Ambiente** (OS, versão do Python/Node, etc.)

### Sugerir Features

Para sugerir novas funcionalidades:

1. **Descreva o problema** que a feature resolve
2. **Proponha uma solução**
3. **Alternativas consideradas**
4. **Contexto adicional**

### Dúvidas e Suporte

- Abra uma [Issue](https://github.com/seu-usuario/esmeraldinha/issues)
- Entre em contato com os mantenedores

### Código de Conduta

- Seja respeitoso e inclusivo
- Aceite críticas construtivas
- Foque no que é melhor para a comunidade
- Demonstre empatia com outros membros

---

## 📝 Notas Importantes

- O banco de dados SQLite é criado automaticamente na primeira migration
- Dados reais de escolas devem ser mantidos em `apps/school/fixtures/schools_real.json` (não versionado)
- O arquivo `db.sqlite3` não é versionado (está no `.gitignore`)
- A cobertura de testes atual é de **98%** - mantenha ou melhore este padrão

## 📄 Licença

Este projeto é privado e de uso interno.

## 👥 Autores

- **Leonardo Brito** - Desenvolvedor principal

---

**Desenvolvido com ❤️ usando Django e Nuxt**
