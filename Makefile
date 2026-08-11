.PHONY: test-integration test-smoke test benchmark

test-integration:
	./scripts/test-integration.sh

test-smoke:
	./scripts/test-smoke.sh

test: test-integration test-smoke

ifeq ($(OS),Windows_NT)
benchmark:
	powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/run-benchmarks.ps1
else
benchmark:
	./scripts/run-benchmarks.sh
endif
