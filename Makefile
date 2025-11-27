.PHONY: dev install check_env check_db

VENV_BIN = .venv/bin
FRONTEND_DIR = ./frontend
CONCURRENTLY = $(FRONTEND_DIR)/node_modules/.bin/concurrently
PIP = $(VENV_BIN)/pip
PYTHON = $(VENV_BIN)/python
DJANGO = $(PYTHON) manage.py
MAKE = make

install:
	@echo "🐍 Installing python dependencies..."
	@python -m venv .venv
	@$(PIP) install --upgrade pip
	@$(PIP) install -r requirements.txt

	@echo "🚀 Installing frontend dependencies..."
	@cd $(FRONTEND_DIR) && pnpm install -D concurrently
	@cd $(FRONTEND_DIR) && pnpm install
	@echo "🔧 Rebuilding native dependencies..."

check_env:
	@echo "🔍 Checking if dependencies are installed..."
	@if [ ! -d "$(FRONTEND_DIR)/node_modules" ] || [ ! -d ".venv" ]; then \
		echo "🚨 Dependencies not found. Running 'make install' first."; \
		$(MAKE) install; \
	fi

check_db:
	@echo "🔍 Checking if database is available..."
	@if [ ! -f "db.sqlite3" ]; then \
		echo "🚨 Database not found. Running 'make migrate' first."; \
		$(MAKE) migrate; \
	fi

migrate:
	@echo "🔧 Applying migrations..."
	@$(DJANGO) makemigrations
	@$(DJANGO) migrate

dev: check_env check_db
	@echo "🚀 Starting development server..."
	@$(CONCURRENTLY) \
		--names "Django,Nuxt" \
		--prefix-colors "magenta,green" \
		--kill-others \
		--kill-others-on-fail \
		"$(DJANGO) runserver 0.0.0.0:8000" \
		"cd $(FRONTEND_DIR) && npm run dev"