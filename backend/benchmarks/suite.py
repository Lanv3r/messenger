#!/usr/bin/env python3
"""Run each large benchmark operation in a fresh Python process."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from benchmarks.run import (
    DEFAULT_RESULTS_DIR,
    OPERATIONS,
    compare_results,
    git_revision,
    print_results,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--iterations", type=int, default=25)
    parser.add_argument("--warmups", type=int, default=10)
    parser.add_argument(
        "--operation",
        action="append",
        choices=OPERATIONS,
        help="Run only this operation; repeat to select multiple operations",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="JSON output path (default: benchmark-results/<timestamp>.json)",
    )
    parser.add_argument("--baseline", type=Path, help="Prior JSON result to compare")
    parser.add_argument(
        "--max-regression-percent",
        type=float,
        help="Fail when any matching p95 exceeds this percentage regression",
    )
    return parser.parse_args()


def run_worker(
    operation: str,
    output: Path,
    warmups: int,
    iterations: int,
) -> dict[str, Any]:
    command = [
        sys.executable,
        "-m",
        "benchmarks.run",
        "--operation",
        operation,
        "--workload",
        "large",
        "--warmups",
        str(warmups),
        "--iterations",
        str(iterations),
        "--output",
        str(output),
    ]
    completed = subprocess.run(command, check=False)
    if completed.returncode != 0:
        raise RuntimeError(
            f"benchmark worker for {operation} exited with "
            f"status {completed.returncode}"
        )
    return json.loads(output.read_text())


def main() -> int:
    args = parse_args()
    if args.iterations < 1 or args.warmups < 0:
        raise SystemExit("iterations must be positive and warmups cannot be negative")
    if args.max_regression_percent is not None and args.baseline is None:
        raise SystemExit("--max-regression-percent requires --baseline")

    selected_operations = tuple(dict.fromkeys(args.operation or OPERATIONS))
    results: list[dict[str, Any]] = []

    with tempfile.TemporaryDirectory(prefix="messenger-benchmarks-") as temp_dir:
        temporary_results_dir = Path(temp_dir)
        for operation in selected_operations:
            print(
                f"\nStarting {operation} in a fresh process with the large workload...",
                flush=True,
            )
            worker_document = run_worker(
                operation,
                temporary_results_dir / f"{operation}.json",
                args.warmups,
                args.iterations,
            )
            worker_results = worker_document.get("results", [])
            if len(worker_results) != 1:
                raise RuntimeError(
                    f"benchmark worker for {operation} returned "
                    f"{len(worker_results)} results instead of one"
                )
            results.extend(worker_results)

    created_at = datetime.now(timezone.utc)
    document: dict[str, Any] = {
        "schema_version": 1,
        "created_at": created_at.isoformat(),
        "git_revision": git_revision(),
        "environment": {
            "measurement": (
                "FastAPI TestClient with PostgreSQL; setup excluded; "
                "one fresh Python process and schema per operation"
            ),
            "workload": "large",
            "warmups": args.warmups,
            "iterations": args.iterations,
            "process_count": len(selected_operations),
        },
        "results": results,
    }

    comparisons = []
    if args.baseline:
        baseline_document = json.loads(args.baseline.read_text())
        comparisons = compare_results(results, baseline_document["results"])
        document["baseline"] = str(args.baseline)
        document["comparisons"] = comparisons

    output = args.output
    if output is None:
        output = DEFAULT_RESULTS_DIR / created_at.strftime("%Y%m%dT%H%M%SZ.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(document, indent=2) + "\n")

    print("\nIsolated large-workload results:")
    print_results(results)
    if comparisons:
        print("\np95 comparison to baseline:")
        for comparison in comparisons:
            print(
                f"  {comparison['operation']}/{comparison['workload']}: "
                f"{comparison['delta_percent']:+.2f}%"
            )
    print(f"\nResults written to {output}")

    if args.max_regression_percent is not None:
        regressions = [
            comparison
            for comparison in comparisons
            if comparison["delta_percent"] > args.max_regression_percent
        ]
        if regressions:
            print(
                f"p95 regression threshold exceeded for {len(regressions)} result(s)",
                file=sys.stderr,
            )
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
