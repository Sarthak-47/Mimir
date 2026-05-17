"""
Tier 3 Feature 2 — Study Timeline Intelligence verification.
Usage: .venv/Scripts/python verify_tier3_f2.py
"""
import json, time, sys, math, urllib.request, urllib.error
from datetime import datetime, timedelta

BASE = "http://localhost:8000"
PASS = FAIL = 0

def ok(msg):  global PASS; PASS += 1; print(f"  [PASS] {msg}")
def bad(msg): global FAIL; FAIL += 1; print(f"  [FAIL] {msg}")
def hdr(msg): print(f"\n=== {msg} ===")

def post_json(url, payload, token=None):
    body = json.dumps(payload).encode()
    headers = {"Content-Type": "application/json"}
    if token: headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=body, headers=headers)
    try:
        with urllib.request.urlopen(req) as r: return json.loads(r.read()), r.status
    except urllib.error.HTTPError as e: return json.loads(e.read()), e.code

def get_json(url, token=None):
    headers = {}
    if token: headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as r: return json.loads(r.read()), r.status
    except urllib.error.HTTPError as e: return json.loads(e.read()), e.code

def put_json(url, payload, token=None):
    body = json.dumps(payload).encode()
    headers = {"Content-Type": "application/json"}
    if token: headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=body, headers=headers, method="PUT")
    try:
        with urllib.request.urlopen(req) as r: return json.loads(r.read()), r.status
    except urllib.error.HTTPError as e: return json.loads(e.read()), e.code


# ── Auth setup ────────────────────────────────────────────────
hdr("Setup — auth + data")
ts = int(time.time()); uname = f"t3f2u{ts}"
r, st = post_json(f"{BASE}/api/users/register", {"username": uname, "password": "pw1234"})
if st in (200, 201) and "access_token" in r:
    TOKEN = r["access_token"]; ok(f"auth OK — user={uname!r}")
else:
    print("Cannot continue without token."); sys.exit(1)

r, st = post_json(f"{BASE}/api/progress/subjects", {"name": "Algorithms", "color": "#6ab87a"}, token=TOKEN)
SUBJ_ID = r["id"] if st in (200, 201) else None

topics = ["Binary Trees", "Sorting Algorithms", "Dynamic Programming"]
TOPIC_IDS = []
for name in topics:
    r, st = post_json(f"{BASE}/api/progress/topics", {"name": name, "subject_id": SUBJ_ID}, token=TOKEN)
    if st in (200, 201): TOPIC_IDS.append(r["id"])

# Submit varied quiz scores to give the topics different confidence levels
scores = [(1, 5), (4, 5), (2, 5)]  # 20%, 80%, 40%
for tid, (score, total) in zip(TOPIC_IDS, scores):
    post_json(f"{BASE}/api/quiz/submit", {"topic_id": tid, "score": score, "total": total}, token=TOKEN)

ok(f"Created {len(TOPIC_IDS)} topics with varied quiz scores")


# ── 1. Readiness module unit tests ────────────────────────────
hdr("1. Readiness engine — Ebbinghaus decay")
from memory.readiness import calculate_topic_readiness, generate_schedule, priority_label

class FakeTopic:
    def __init__(self, conf, days_ago):
        self.confidence_score = conf
        self.last_studied = (datetime.utcnow() - timedelta(days=days_ago)) if days_ago >= 0 else None

# Fresh topic — no decay
t = FakeTopic(80.0, 0)
r = calculate_topic_readiness(t, [])
if abs(r - 80.0) < 1.0:
    ok(f"No decay (0 days): readiness={r:.1f}% (~80%)")
else:
    bad(f"Expected ~80%, got {r:.1f}%")

# 14-day gap for an 80% topic — should decay substantially
t2 = FakeTopic(80.0, 14)
r2 = calculate_topic_readiness(t2, [])
if r2 < 70:
    ok(f"14-day decay on 80% topic: readiness={r2:.1f}% < 70% (decayed)")
else:
    bad(f"Expected significant decay, got {r2:.1f}%")

# Never studied — no decay
t3 = FakeTopic(60.0, -1)
t3.last_studied = None
r3 = calculate_topic_readiness(t3, [])
if abs(r3 - 60.0) < 1.0:
    ok(f"Never studied (no decay): readiness={r3:.1f}% = 60%")
else:
    bad(f"Expected ~60%, got {r3:.1f}%")


# ── 2. Priority labels ────────────────────────────────────────
hdr("2. Priority label mapping")
pairs = [(25.0, "critical"), (55.0, "weak"), (70.0, "moderate"), (90.0, "strong")]
all_ok = all(priority_label(s) == expected for s, expected in pairs)
if all_ok:
    ok("priority_label: critical/weak/moderate/strong thresholds correct")
else:
    bad(f"priority_label mismatch: {[(s, priority_label(s), exp) for s, exp in pairs if priority_label(s) != exp]}")


# ── 3. Exam-date GET ──────────────────────────────────────────
hdr("3. GET /api/progress/exam-date — initial null")
r, st = get_json(f"{BASE}/api/progress/exam-date", TOKEN)
if st == 200 and r.get("exam_date") is None:
    ok("GET exam-date returns null for new user")
else:
    bad(f"Unexpected: {st} {r}")


# ── 4. Exam-date PUT + persist ────────────────────────────────
hdr("4. PUT /api/progress/exam-date — save and retrieve")
exam_str = (datetime.utcnow() + timedelta(days=30)).strftime("%Y-%m-%d")
r, st = put_json(f"{BASE}/api/progress/exam-date", {"exam_date": exam_str}, TOKEN)
if st == 200 and r.get("exam_date") == exam_str:
    ok(f"PUT exam-date saved: {exam_str}")
else:
    bad(f"PUT failed: {st} {r}")

r2, st2 = get_json(f"{BASE}/api/progress/exam-date", TOKEN)
if st2 == 200 and r2.get("exam_date") == exam_str:
    ok("exam-date persisted across GET")
else:
    bad(f"exam-date not persisted: {r2}")


# ── 5. GET /api/progress/readiness ────────────────────────────
hdr("5. GET /api/progress/readiness — returns Ebbinghaus data")
r, st = get_json(f"{BASE}/api/progress/readiness", TOKEN)
if st != 200:
    bad(f"readiness returned {st}: {r}"); sys.exit(1)

if len(r) == len(TOPIC_IDS):
    ok(f"readiness: {len(r)} topics returned")
else:
    bad(f"Expected {len(TOPIC_IDS)} topics, got {len(r)}")

# Check fields
row = r[0]
required = {"id", "name", "subject_id", "confidence_score", "readiness", "priority", "last_studied", "days_since"}
missing = required - set(row.keys())
if not missing:
    ok(f"readiness row has all required fields: {list(row.keys())}")
else:
    bad(f"Missing fields: {missing}")

# First topic should be weakest (sorted ascending by readiness)
readiness_vals = [x["readiness"] for x in r]
if readiness_vals == sorted(readiness_vals):
    ok(f"readiness sorted weakest-first: {[round(x, 1) for x in readiness_vals]}")
else:
    bad(f"Not sorted: {readiness_vals}")

# Verify readiness ≤ confidence_score (decay only goes down or stays equal)
all_decayed_ok = all(x["readiness"] <= x["confidence_score"] + 0.5 for x in r)
if all_decayed_ok:
    ok("readiness <= confidence_score for all topics (Ebbinghaus never inflates)")
else:
    bad(f"Some readiness > confidence_score: {[(x['name'], x['readiness'], x['confidence_score']) for x in r if x['readiness'] > x['confidence_score'] + 0.5]}")


# ── 6. GET /api/progress/schedule ─────────────────────────────
hdr("6. GET /api/progress/schedule — 7-day plan")
r, st = get_json(f"{BASE}/api/progress/schedule", TOKEN)
if st != 200:
    bad(f"schedule returned {st}: {r}"); sys.exit(1)

if len(r) == 7:
    ok("schedule: 7 days returned")
else:
    bad(f"Expected 7 days, got {len(r)}")

# Check first day
day0 = r[0]
if day0["day_label"] == "Tomorrow":
    ok("Day 0 label = 'Tomorrow'")
else:
    bad(f"Expected 'Tomorrow', got {day0['day_label']!r}")

# days_until_exam should be ~29 (we set exam 30 days out, day 1 = 29)
due = day0.get("days_until_exam")
if due is not None and 27 <= due <= 31:
    ok(f"days_until_exam reasonable: {due}")
else:
    bad(f"days_until_exam unexpected: {due}")

# Each day has topics with required fields
day_ok = all(
    "name" in t and "subject" in t and "readiness" in t and "priority" in t
    for day in r for t in day["topics"]
)
if day_ok:
    ok("All schedule topic entries have name/subject/readiness/priority")
else:
    bad("Some schedule topic entries missing fields")

# Weakest topic should appear in day 1 (highest urgency first)
weakest = min(readiness_vals)
day1_readiness = [t["readiness"] for t in day0["topics"]]
if min(day1_readiness) <= weakest + 1.0:
    ok(f"Weakest topic (readiness={weakest:.1f}%) appears in day 1 schedule")
else:
    bad(f"Day 1 doesn't contain the weakest topic: {day1_readiness}")


# ── 7. Clear exam date ────────────────────────────────────────
hdr("7. PUT exam-date null — clear")
r, st = put_json(f"{BASE}/api/progress/exam-date", {"exam_date": None}, TOKEN)
if st == 200 and r.get("exam_date") is None:
    ok("exam-date cleared to null")
else:
    bad(f"Clear failed: {st} {r}")

# Schedule without exam date — days_until_exam should be None
r, st = get_json(f"{BASE}/api/progress/schedule", TOKEN)
if st == 200 and r[0].get("days_until_exam") is None:
    ok("Schedule without exam date: days_until_exam=None correctly")
else:
    bad(f"Expected None for days_until_exam, got {r[0].get('days_until_exam')!r}")


# ── 8. Frontend file checks ───────────────────────────────────
hdr("8. Frontend — ReckoningView redesign")
import pathlib
rv = pathlib.Path("D:/Claude Code Projs/Mimir/frontend/src/views/ReckoningView.tsx")
if rv.exists():
    src = rv.read_text(encoding="utf-8")
    checks = [
        ("ExamCountdown",     "ExamCountdown component present"),
        ("readiness",         "readiness data fetched"),
        ("schedule",          "schedule data fetched"),
        ("exam-date",         "exam-date API endpoint used"),
        ("days_until_exam",   "days_until_exam rendered"),
        ("Seven-Day",         "Seven-Day War Plan section"),
        ("Ebbinghaus",        "Ebbinghaus caption in UI"),
        ("decayBadge",        "decay badge style defined"),
    ]
    for token, desc in checks:
        if token in src:
            ok(f"ReckoningView.tsx: {desc}")
        else:
            bad(f"ReckoningView.tsx missing: {desc}")
else:
    bad("ReckoningView.tsx not found")


# ── done ─────────────────────────────────────────────────────
hdr(f"RESULTS — {PASS} passed, {FAIL} failed")
if FAIL == 0:
    print("\n  Feature 2 (Study Timeline Intelligence) verified on live system.")
else:
    print(f"\n  {FAIL} check(s) need attention.")
    sys.exit(1)
