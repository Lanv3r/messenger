.PHONY: test-integration test-smoke test

test-integration:
	./scripts/test-integration.sh

test-smoke:
	./scripts/test-smoke.sh

test: test-integration test-smoke
