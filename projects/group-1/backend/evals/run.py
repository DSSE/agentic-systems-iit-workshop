"""Run the five spec cases against the real model for each prompt version and compare.

    cd backend
    .venv/Scripts/python -m evals.run                      # v1 vs v2, every case once
    .venv/Scripts/python -m evals.run --repeats 3 --cases 1,4 --model gemini-2.5-flash-lite

Each conversation runs on its own temp copy of data.json, so evals never touch the real file.
Results go to evals/results/<timestamp>.md and .json.
"""

import argparse
import asyncio
import json
import os
import re
import shutil
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path

import openai

from app import config, store
from app.agent import llm as agent_llm
from app.agent.runner import run_chat

from .cases import ALWAYS, CASES, TODAY, Outcome

RESULTS_DIR = Path(__file__).parent / "results"


class QuotaExhausted(RuntimeError):
    pass


class ThrottledLLM:
    """Spaces out calls to stay under a free tier's requests-per-minute, and retries 429s."""

    def __init__(self, inner, rpm: float, max_retries: int = 6):
        self.inner = inner
        self.interval = 60.0 / rpm if rpm > 0 else 0
        self.max_retries = max_retries
        self.last = 0.0
        self.calls = 0

    async def __call__(self, messages, tools):
        for attempt in range(self.max_retries + 1):
            wait = self.last + self.interval - time.monotonic()
            if wait > 0:
                await asyncio.sleep(wait)
            self.last = time.monotonic()
            try:
                self.calls += 1
                return await self.inner(messages, tools)
            except openai.RateLimitError as e:
                text = str(e)
                if "PerDay" in text or "per day" in text.lower() or "daily" in text.lower():
                    raise QuotaExhausted("Daily quota exhausted for this model. Try --model with another one.") from e
                if attempt == self.max_retries:
                    raise
                match = re.search(r"retry in ([\d.]+)s", text)
                delay = float(match.group(1)) + 2 if match else 20 * (attempt + 1)
                print(f"    rate limited; waiting {delay:.0f}s", flush=True)
                await asyncio.sleep(delay)


async def run_case(case: dict, prompt: str, llm, seed: Path, workdir: Path) -> dict:
    data = workdir / f"{case['id']}-{prompt}.json"
    shutil.copy(seed, data)
    os.environ["DATA_PATH"] = str(data)
    os.environ["AUDIT_PATH"] = str(workdir / "audit.jsonl")
    rooms, bookings = store.load()
    before = data.read_bytes()

    messages = [{"role": "user", "content": text} for text in case["messages"]]
    started = time.monotonic()
    error = None
    try:
        reply = await run_chat(messages, llm, requester="Eval", today=TODAY, prompt_version=prompt)
        outcome = Outcome(reply.reply, reply.proposal, reply.trace, data.read_bytes() != before, rooms, bookings)
    except QuotaExhausted:
        raise
    except Exception as e:  # a provider error fails the case rather than the whole run
        error = f"{type(e).__name__}: {str(e)[:200]}"
        outcome = Outcome("", None, [], data.read_bytes() != before, rooms, bookings)

    checks = {fn.__name__: bool(fn(outcome)) for fn in [*case["checks"], *ALWAYS]}
    if error:
        checks = {name: False for name in checks}
    return {
        "id": case["id"],
        "case": case["case"],
        "prompt": prompt,
        "passed": all(checks.values()),
        "checks": checks,
        "reply": outcome.reply,
        "proposal": outcome.proposal,
        "tools": [t["tool"] for t in outcome.trace],
        "error": error,
        "seconds": round(time.monotonic() - started, 1),
    }


def write_report(results: list[dict], prompts: list[str], model: str, repeats: int, partial: bool) -> Path:
    RESULTS_DIR.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    (RESULTS_DIR / f"{stamp}.json").write_text(json.dumps(results, indent=2), encoding="utf-8")

    lines = [
        f"# Eval results {stamp}",
        "",
        f"Model `{model}` · prompts {', '.join(prompts)} · {repeats} run(s) per case · today fixed to {TODAY}"
        + (" · **PARTIAL (stopped early)**" if partial else ""),
        "",
        "| Case | " + " | ".join(prompts) + " |",
        "|---|" + "---|" * len(prompts),
    ]
    for case in CASES:
        cells = []
        for p in prompts:
            runs = [r for r in results if r["id"] == case["id"] and r["prompt"] == p]
            cells.append(f"{sum(r['passed'] for r in runs)}/{len(runs)}" if runs else "–")
        lines.append(f"| {case['id']} | " + " | ".join(cells) + " |")
    totals = []
    for p in prompts:
        runs = [r for r in results if r["prompt"] == p]
        totals.append(f"**{sum(r['passed'] for r in runs)}/{len(runs)}**" if runs else "–")
    lines += [f"| **Total** | " + " | ".join(totals) + " |", "", "## Failures", ""]

    failures = [r for r in results if not r["passed"]]
    if not failures:
        lines.append("None.")
    for r in failures:
        failed = [name for name, ok in r["checks"].items() if not ok]
        lines += [
            f"### {r['id']} · {r['prompt']}",
            f"- Failed checks: {', '.join(failed)}",
            f"- Tools called: {', '.join(r['tools']) or 'none'}",
            f"- Proposal: `{json.dumps(r['proposal'])}`",
            f"- Reply: {r['reply'] or r['error']}",
            "",
        ]
    path = RESULTS_DIR / f"{stamp}.md"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompts", default="v1,v2")
    parser.add_argument("--repeats", type=int, default=1)
    parser.add_argument("--cases", default="", help="comma-separated case numbers, e.g. 1,4 (default: all)")
    parser.add_argument("--model", default="", help="override LLM_MODEL for this run")
    parser.add_argument("--rpm", type=float, default=float(os.environ.get("EVAL_RPM", 5)), help="max requests per minute")
    args = parser.parse_args()

    prompts = [p.strip() for p in args.prompts.split(",") if p.strip()]
    wanted = {int(c) for c in args.cases.split(",") if c.strip()}
    cases = [c for c in CASES if not wanted or c["case"] in wanted]

    if args.model:
        os.environ["LLM_MODEL"] = args.model
    try:
        inner = agent_llm.from_env()
    except agent_llm.LLMNotConfigured as e:
        print(e)
        return 2
    inner.client = inner.client.with_options(max_retries=0)  # ThrottledLLM handles retries
    llm = ThrottledLLM(inner, rpm=args.rpm)
    model = config.llm_settings()["model"]

    seed = config.PROJECT_ROOT / "data.json"
    results, partial = [], False
    print(f"Model {model}; {len(cases)} cases × {len(prompts)} prompts × {args.repeats} run(s)", flush=True)
    with tempfile.TemporaryDirectory() as tmp:
        try:
            for repeat in range(args.repeats):
                for case in cases:
                    for prompt in prompts:
                        r = await run_case(case, prompt, llm, seed, Path(tmp))
                        results.append(r)
                        mark = "PASS" if r["passed"] else "FAIL"
                        print(f"  [{mark}] {r['id']:<22} {prompt}  ({r['seconds']}s)", flush=True)
        except QuotaExhausted as e:
            print(f"Stopped: {e}")
            partial = True

    path = write_report(results, prompts, model, args.repeats, partial)
    print(f"\nLLM calls: {llm.calls}. Report: {path}")
    print(path.read_text(encoding="utf-8").split("## Failures")[0])
    return 0 if results and all(r["passed"] for r in results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
