"""Seed a realistic demo account for screenshots and video capture.

A fresh install films badly: The Reckoning, The Fates and Trials are all driven
by subjects and topics, so with an empty database three of the six views show
empty states and the sidebar and right panel look bare in every single frame.

This creates one account with a believable eleven weeks of study behind it —
uneven, with genuinely weak topics and an imperfect streak. A demo showing 98%
across the board reads as fake and undercuts the "it finds your weak spots"
pitch, which is the actual story worth telling.

Usage (from the repo root, with the backend venv active):

    python scripts/seed_demo.py                 # default account, installed app DB
    python scripts/seed_demo.py --user mimir    # choose the username
    python scripts/seed_demo.py --dev           # target backend/data/mimir.db instead
    python scripts/seed_demo.py --wipe          # delete the account first, then reseed

The password is always `demo1234`. Nothing else in the database is touched.
"""

from __future__ import annotations

import argparse
import os
import random
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Deterministic, so re-running produces the same demo and screenshots stay
# consistent between takes.
random.seed(20260803)

PASSWORD = "demo1234"

# ── The curriculum ───────────────────────────────────────────
# confidence is the headline number per topic. The spread is deliberate:
# two topics in real trouble, a few mid, several solid.
# Readiness decays from confidence with time since last study, and the predicted
# grade is built from readiness — so these sit higher than the grade you want on
# screen. Tuned so the prediction lands mid-range: a student doing genuinely
# okay who still has two or three topics in real trouble. That is the story the
# app is for; a flawless profile would have nothing to find.
SUBJECTS: list[tuple[str, str, list[tuple[str, float]]]] = [
    ("Machine Learning", "#4de070", [
        ("Backpropagation",              46),
        ("Gradient Descent",             81),
        ("Bias-Variance Tradeoff",       68),
        ("Convolutional Networks",       76),
        ("Regularisation",               88),
        ("Activation Functions",         93),
    ]),
    ("Computer Networks", "#d4a82c", [
        ("TCP Congestion Control",       51),
        ("Subnetting and CIDR",          74),
        ("DNS Resolution",               86),
        ("TLS Handshake",                69),
        ("Routing Algorithms",           91),
    ]),
    ("Algorithms", "#7cbe8e", [
        ("Dynamic Programming",          55),
        ("Graph Traversal",              83),
        ("Amortised Analysis",           64),
        ("Sorting Lower Bounds",         89),
        ("NP-Completeness",              77),
    ]),
    ("Operating Systems", "#9a7830", [
        ("Deadlock Avoidance",           70),
        ("Virtual Memory and Paging",    79),
        ("Process Scheduling",           94),
        ("Concurrency Primitives",       73),
    ]),
]

# Topics the student keeps getting wrong, surfaced in the right panel.
MISCONCEPTIONS = {
    "Backpropagation":       "Applies the chain rule in the wrong direction when the network has more than two layers.",
    "TCP Congestion Control": "Confuses slow start with congestion avoidance; assumes the window grows linearly from the outset.",
    "Dynamic Programming":   "Reaches for memoisation without first establishing optimal substructure.",
}

CONVERSATIONS = [
    ("Explain backpropagation like I have never seen calculus.",
     "Think of it as blame assignment. The network makes a guess, the guess is wrong by some amount, and backpropagation works out how much each weight contributed to that error — starting at the output and moving backwards, because each layer's blame depends on the blame of the layer after it. Only then does gradient descent nudge every weight a little in the direction that would have made the error smaller."),
    ("Why does TCP slow start double the window instead of adding to it?",
     "Because it is searching, not settling. At the start TCP has no idea how much the path can carry, and adding one segment at a time would take far too long to find out on a fast link. Doubling finds the rough ceiling in logarithmic time, and the moment a loss appears TCP switches to congestion avoidance and starts adding rather than doubling."),
    ("What is the difference between memoisation and tabulation?",
     "Both cache subproblem answers; they differ in direction. Memoisation is top-down — you write the recursion you actually think in, and cache on the way back up. Tabulation is bottom-up — you work out the dependency order yourself and fill a table forwards. Memoisation only computes the subproblems it needs, tabulation avoids recursion depth limits."),
    ("Quiz me on virtual memory.",
     "Here are five questions on paging, translation and replacement policy. Take your time — I will mark them against what a exam scheme would award, not just right or wrong."),
]


def hash_password(pw: str) -> str:
    """Hash exactly the way the app does, so the demo account can log in."""
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
    from passlib.context import CryptContext
    return CryptContext(schemes=["bcrypt"], deprecated="auto").hash(pw)


def db_path(dev: bool) -> Path:
    if dev:
        return Path(__file__).resolve().parent.parent / "backend" / "data" / "mimir.db"
    base = os.environ.get("LOCALAPPDATA")
    if not base:                                   # macOS / Linux
        home = Path.home()
        mac = home / "Library" / "Application Support" / "Mimir" / "data"
        return (mac if mac.exists() else home / ".local" / "share" / "Mimir" / "data") / "mimir.db"
    return Path(base) / "Mimir" / "data" / "mimir.db"


def seed(conn: sqlite3.Connection, username: str, wipe: bool) -> None:
    cur = conn.cursor()
    now = datetime.now()

    # ── Account ──────────────────────────────────────────────
    row = cur.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if row and wipe:
        uid = row[0]
        for table in ("quiz_sessions", "misconceptions", "topics",
                      "conversations", "subjects", "user_memories"):
            cur.execute(f"DELETE FROM {table} WHERE user_id = ?", (uid,))
        cur.execute("DELETE FROM users WHERE id = ?", (uid,))
        row = None
        print(f"  wiped existing account '{username}'")

    if row:
        print(f"  account '{username}' already exists — pass --wipe to rebuild it")
        return

    exam = (now + timedelta(days=23)).date()       # close enough to feel urgent
    cur.execute(
        "INSERT INTO users (username, password_hash, exam_date, created_at) VALUES (?,?,?,?)",
        (username, hash_password(PASSWORD), exam.isoformat(), now - timedelta(days=78)),
    )
    uid = cur.lastrowid

    # ── Subjects, topics, quiz history ───────────────────────
    total_quizzes = 0
    study_days: set = set()

    for subj_name, colour, topics in SUBJECTS:
        cur.execute(
            "INSERT INTO subjects (user_id, name, color, created_at) VALUES (?,?,?,?)",
            (uid, subj_name, colour, now - timedelta(days=76)),
        )
        sid = cur.lastrowid

        for topic_name, confidence in topics:
            # Weak topics were revised recently and are due again soon; strong
            # ones sit on a long interval. That is what SM-2 would actually do.
            # Recency matters as much as the score: readiness decays from the
            # last study date, so an active student needs everything touched
            # fairly recently or the whole board reads as rusty.
            if confidence < 60:
                interval, reps, ease = 1, 1, 1.9
                last = now - timedelta(days=random.randint(0, 2))
            elif confidence < 78:
                interval, reps, ease = 4, 3, 2.2
                last = now - timedelta(days=random.randint(1, 4))
            else:
                interval, reps, ease = random.choice([7, 10, 14]), random.randint(5, 8), 2.6
                last = now - timedelta(days=random.randint(2, 6))

            studies = random.randint(3, 11)
            cur.execute(
                """INSERT INTO topics
                   (user_id, subject_id, name, last_studied, next_review,
                    confidence_score, study_count,
                    sm2_ease_factor, sm2_repetitions, sm2_interval)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (uid, sid, topic_name, last, last + timedelta(days=interval),
                 float(confidence), studies, ease, reps, interval),
            )
            tid = cur.lastrowid

            # Quiz history trending toward the topic's current confidence, so
            # the learning-velocity sparklines have a real slope to draw.
            attempts = max(2, studies - random.randint(0, 3))
            for i in range(attempts):
                progress = (i + 1) / attempts
                # Early attempts are worse than the topic's current standing,
                # but not catastrophic — the all-time accuracy headline should
                # read as a real student improving, not one who is drowning.
                start = max(50.0, confidence - random.uniform(8, 18))
                pct = start + (confidence - start) * progress + random.uniform(-5, 6)
                pct = max(0.0, min(100.0, pct))
                total = random.choice([5, 5, 8, 10])
                score = max(0, min(total, round(total * pct / 100)))
                when = now - timedelta(days=int(70 * (1 - progress)) + random.randint(0, 3),
                                       hours=random.randint(9, 22))
                cur.execute(
                    "INSERT INTO quiz_sessions (user_id, topic_id, score, total, timestamp) VALUES (?,?,?,?,?)",
                    (uid, tid, score, total, when),
                )
                study_days.add(when.date())
                total_quizzes += 1

            if topic_name in MISCONCEPTIONS:
                cur.execute(
                    "INSERT INTO misconceptions (user_id, topic_id, note, count, last_seen) VALUES (?,?,?,?,?)",
                    (uid, tid, MISCONCEPTIONS[topic_name], random.randint(3, 6),
                     now - timedelta(days=random.randint(1, 5))),
                )

    # ── A visible current streak ─────────────────────────────
    # Guarantee the last few days are unbroken so the streak counter reads
    # something rather than zero, which is what an organic random spread gives.
    ml_topic = cur.execute(
        "SELECT id FROM topics WHERE user_id = ? ORDER BY confidence_score DESC LIMIT 1", (uid,)
    ).fetchone()[0]
    for back in range(0, 6):
        day = now - timedelta(days=back, hours=random.randint(10, 21))
        if day.date() in study_days:
            continue
        cur.execute(
            "INSERT INTO quiz_sessions (user_id, topic_id, score, total, timestamp) VALUES (?,?,?,?,?)",
            (uid, ml_topic, random.choice([4, 4, 5]), 5, day),
        )
        study_days.add(day.date())
        total_quizzes += 1

    # ── Chronicle history ────────────────────────────────────
    subj_ids = [r[0] for r in cur.execute("SELECT id FROM subjects WHERE user_id = ?", (uid,))]
    for idx, (q, a) in enumerate(CONVERSATIONS):
        when = now - timedelta(days=(len(CONVERSATIONS) - idx) * 4, hours=random.randint(10, 20))
        sid = subj_ids[idx % len(subj_ids)]
        cur.execute(
            "INSERT INTO conversations (user_id, role, content, subject_id, timestamp, summarized) VALUES (?,?,?,?,?,0)",
            (uid, "user", q, sid, when),
        )
        cur.execute(
            "INSERT INTO conversations (user_id, role, content, subject_id, timestamp, summarized) VALUES (?,?,?,?,?,0)",
            (uid, "assistant", a, sid, when + timedelta(seconds=40)),
        )

    conn.commit()

    accuracy = cur.execute(
        "SELECT ROUND(100.0 * SUM(score) / SUM(total), 1) FROM quiz_sessions WHERE user_id = ?", (uid,)
    ).fetchone()[0]
    weak = cur.execute(
        "SELECT COUNT(*) FROM topics WHERE user_id = ? AND confidence_score < 60", (uid,)
    ).fetchone()[0]

    print(f"\n  user           {username} / {PASSWORD}")
    print(f"  subjects       {len(SUBJECTS)}")
    print(f"  topics         {sum(len(t) for _, _, t in SUBJECTS)}  ({weak} below 60%)")
    print(f"  quiz sessions  {total_quizzes} across {len(study_days)} distinct days")
    print(f"  all-time accuracy  {accuracy}%")
    print(f"  exam date      {exam}  ({(exam - now.date()).days} days out)")


def main() -> None:
    ap = argparse.ArgumentParser(description="Seed a demo account for capture.")
    ap.add_argument("--user", default="demo", help="username to create (default: demo)")
    ap.add_argument("--dev", action="store_true", help="target backend/data/mimir.db")
    ap.add_argument("--wipe", action="store_true", help="delete the account first, then reseed")
    args = ap.parse_args()

    path = db_path(args.dev)
    if not path.exists():
        sys.exit(f"No database at {path} — launch Mimir once so it is created.")

    print(f"seeding {path}")
    conn = sqlite3.connect(path)
    try:
        seed(conn, args.user, args.wipe)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
