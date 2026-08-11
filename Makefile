.PHONY: test-integration test-smoke test benchmark

test-integration:
	./scripts/test-integration.sh

test-smoke:
	./scripts/test-smoke.sh

test: test-integration test-smoke

benchmark:
	./scripts/run-benchmarks.sh
