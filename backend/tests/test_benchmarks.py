import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from benchmarks.run import compare_results, percentile, summarize  # noqa: E402


class BenchmarkMathTest(unittest.TestCase):
    def test_percentile_uses_nearest_rank(self):
        samples = [float(value) for value in range(1, 21)]

        self.assertEqual(percentile(samples, 50), 10.0)
        self.assertEqual(percentile(samples, 95), 19.0)

    def test_summary_includes_raw_samples_and_p95(self):
        result = summarize([3.0, 1.0, 2.0])

        self.assertEqual(result["sample_count"], 3)
        self.assertEqual(result["p95_ms"], 3.0)
        self.assertEqual(result["samples_ms"], [3.0, 1.0, 2.0])

    def test_compare_results_matches_operation_and_workload(self):
        current = [{
            "operation": "list_chats",
            "workload": "small",
            "latency": {"p95_ms": 12.0},
        }]
        baseline = [{
            "operation": "list_chats",
            "workload": "small",
            "latency": {"p95_ms": 10.0},
        }]

        self.assertEqual(compare_results(current, baseline)[0]["delta_percent"], 20.0)


if __name__ == "__main__":
    unittest.main()
