# Esmeraldinha

Sistema de gestão acadêmica desenvolvido com Django (backend) e Nuxt 4 (frontend).

## 📋 Pré-requisitos

- Python 3.12+
- Node.js 18+ e pnpm
- Make (opcional, mas recomendado)

## 🚀 Instalação Rápida

### Usando Make (Recomendado)

```bash
# Instala todas as dependências (Python e Node.js)
make install

# Inicia os servidores de desenvolvimento (Django + Nuxt)
make dev
```

### Instalação Manual

#### 1. Backend (Django)

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
```

#### 2. Frontend (Nuxt)

```bash
# Navegar para o diretório frontend
cd frontend

# Instalar dependências
pnpm install

# Voltar para a raiz
cd ..
```

## 🗄️ Configuração do Banco de Dados

### Aplicar Migrations

```bash
# Ativar ambiente virtual (se ainda não estiver ativo)
source .venv/bin/activate  # Linux/Mac
# ou
.venv\Scripts\activate  # Windows

# Criar e aplicar migrations
python manage.py makemigrations
python manage.py migrate
```

### Popular Dados de Escolas

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

## 🏃 Executando a Aplicação

### Desenvolvimento (Django + Nuxt simultaneamente)

```bash
# Usando Make
make dev

# Ou manualmente:
# Terminal 1 - Django
source .venv/bin/activate
python manage.py runserver

# Terminal 2 - Nuxt
cd frontend
pnpm dev
```

### Apenas Backend (Django)

```bash
source .venv/bin/activate
python manage.py runserver
```

Acesse: http://127.0.0.1:8000

- API Swagger: http://127.0.0.1:8000
- Admin Django: http://127.0.0.1:8000/admin

### Apenas Frontend (Nuxt)

```bash
cd frontend
pnpm dev
```

Acesse: http://localhost:3000

## 📁 Estrutura do Projeto

```
esmeraldinha/
├── apps/
│   ├── academic_calendar/    # App de calendário acadêmico
│   ├── school/                # App de escolas (CRUD completo)
│   └── teacher/               # App de professores
├── frontend/                  # Aplicação Nuxt 4
│   ├── app/
│   │   ├── pages/            # Páginas da aplicação
│   │   ├── components/       # Componentes Vue
│   │   └── composables/      # Composables reutilizáveis
│   └── nuxt.config.ts
├── esmeraldinha/              # Configurações Django
├── manage.py
├── requirements.txt
├── Makefile
└── README.md
```

## 🔌 Endpoints da API

### Escolas
- `GET /api/schools/` - Lista todas as escolas
- `POST /api/schools/` - Cria uma nova escola
- `GET /api/schools/{id}/` - Detalhes de uma escola
- `PUT /api/schools/{id}/` - Atualiza uma escola
- `PATCH /api/schools/{id}/` - Atualização parcial
- `DELETE /api/schools/{id}/` - Deleta uma escola

### Professores
- `GET /api/teachers/` - Lista todos os professores
- `GET /api/teachers/{id}/` - Detalhes de um professor

### Calendário Acadêmico
- `POST /api/academic-calendar/` - Processa imagem de calendário

### Documentação
- `GET /api/schema/` - Schema OpenAPI
- `GET /` - Swagger UI

## 🛠️ Comandos Úteis

### Django

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
```

### Nuxt

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

## 🔐 Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto (não versionado):

```env
FRONTEND_URL=http://127.0.0.1:3000
API_BASE_URL=http://127.0.0.1:8000
```

## 🧪 Testes

```bash
# Executar testes Django
python manage.py test

# Executar testes com cobertura
coverage run --source='.' manage.py test
coverage report
```

## 📦 Dependências Principais

### Backend
- Django 5.2.8
- Django REST Framework
- drf-spectacular (OpenAPI/Swagger)
- Pillow (processamento de imagens)
- pandas, numpy (análise de dados)

### Frontend
- Nuxt 4
- Vue 3
- Nuxt UI
- TypeScript
- Tailwind CSS

## 🐛 Solução de Problemas

### Erro: "no such table"
```bash
# Recriar o banco de dados
rm db.sqlite3
python manage.py migrate
```

### Erro: "ModuleNotFoundError"
```bash
# Reinstalar dependências
pip install -r requirements.txt
cd frontend && pnpm install
```

### Erro: Porta já em uso
```bash
# Django - usar outra porta
python manage.py runserver 8001

# Nuxt - usar outra porta
cd frontend
pnpm dev --port 3001
```

## 📝 Notas

- O banco de dados SQLite é criado automaticamente na primeira migration
- Dados reais de escolas devem ser mantidos em `apps/school/fixtures/schools_real.json` (não versionado)
- O arquivo `db.sqlite3` não é versionado (está no `.gitignore`)

## 🤝 Contribuindo

1. Faça fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto é privado.

## 👥 Autores

- Leonardo Brito

---

**Desenvolvido com ❤️ usando Django e Nuxt**

