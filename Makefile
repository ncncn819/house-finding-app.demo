.PHONY: test test-backend test-frontend

PYTHON ?= $(shell command -v python3.13 || command -v python3)

test: test-backend test-frontend

test-backend:
	cd backend && $(PYTHON) -m pytest -q

test-frontend:
	cd houseapp && npm run test:run
