.PHONY: install dev dev-backend dev-frontend test up down

install:
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

dev-backend:
	cd backend && uvicorn app.main:app --reload

dev-frontend:
	cd frontend && npm run dev

dev: ## run backend + frontend dev servers together; Ctrl+C stops both
	@trap 'kill 0' EXIT; \
	$(MAKE) dev-backend & \
	$(MAKE) dev-frontend & \
	wait

test:
	cd backend && pytest -q

up: ## full stack via Docker
	docker compose up --build

down:
	docker compose down
