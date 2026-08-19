import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from benchmarks.run import (  # noqa: E402
    WORKLOADS,
    compare_results,
    evenly_spaced_indexes,
    percentage_indexes,
    percentile,
    summarize,
)


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

    def test_evenly_spaced_indexes_include_the_full_range(self):
        self.assertEqual(evenly_spaced_indexes(10, 3), [0, 4, 9])
        self.assertEqual(evenly_spaced_indexes(10, 1), [5])

    def test_percentage_indexes_select_requested_share_with_phase(self):
        self.assertEqual(percentage_indexes(50, 10, phase=0.4), [4, 14, 24, 34, 44])
        self.assertEqual(percentage_indexes(50, 10, phase=0.8), [8, 18, 28, 38, 48])
        self.assertEqual(percentage_indexes(50, 0), [])

    def test_compare_results_matches_operation_and_workload(self):
        current = [
            {
                "operation": "list_chats",
                "workload": "small",
                "latency": {"p95_ms": 12.0},
            }
        ]
        baseline = [
            {
                "operation": "list_chats",
                "workload": "small",
                "latency": {"p95_ms": 10.0},
            }
        ]

        self.assertEqual(compare_results(current, baseline)[0]["delta_percent"], 20.0)

    def test_workloads_scale_every_dimension(self):
        dimensions = (
            "group_chat_count",
            "self_chat_count",
            "direct_chat_count",
            "messages_in_target_chat",
            "member_count",
            "attachment_count",
            "attachment_bytes",
        )

        for smaller, larger in zip(WORKLOADS[:-1], WORKLOADS[1:], strict=True):
            for dimension in dimensions:
                self.assertGreater(
                    getattr(larger, dimension),
                    getattr(smaller, dimension),
                    f"{dimension} should increase with workload size",
                )

    def test_chat_mix_keeps_self_chats_small_and_direct_chats_dominant(self):
        for workload in WORKLOADS:
            self.assertEqual(workload.deleted_last_message_percent, 2)
            self.assertEqual(workload.reply_message_percent, 10)
            self.assertEqual(workload.attachment_message_percent, 10)
            self.assertEqual(workload.attachments_per_message, 4)
            self.assertLessEqual(workload.self_chat_count, 5)
            self.assertGreater(
                workload.direct_chat_count,
                workload.self_chat_count,
            )


if __name__ == "__main__":
    unittest.main()
