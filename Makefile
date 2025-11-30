.PHONY: dev install check_env check_db clean_ports

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
	@$(DJANGO) seed

clean_ports:
	@echo "🧹 Cleaning ports used by the application..."
	@echo "🔍 Checking and killing processes on ports 8000, 3000, and 5432..."
	@-for port in 8000 3000 5432; do \
		if lsof -ti:$$port >/dev/null 2>&1; then \
			echo "🛑 Killing process(es) on port $$port..."; \
			lsof -ti:$$port | xargs kill -9 2>/dev/null || true; \
			sleep 1; \
		else \
			echo "✅ Port $$port is free"; \
		fi \
	done
	@echo "✨ Ports cleaned successfully!"

dev: check_env check_db
	@echo "🚀 Starting development server..."
	@$(CONCURRENTLY) \
		--names "Django,Nuxt" \
		--prefix-colors "magenta,green" \
		--kill-others \
		--kill-others-on-fail \
		"$(DJANGO) runserver 0.0.0.0:8000" \
		"cd $(FRONTEND_DIR) && npm run dev"