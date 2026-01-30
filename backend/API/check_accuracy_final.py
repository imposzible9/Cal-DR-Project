import sqlite3

con = sqlite3.connect("ratings.sqlite")
cur = con.cursor()

print("=" * 60)
print("ตรวจสอบ rating_accuracy (5 แถวล่าสุด)")
print("=" * 60)

cur.execute("""
    SELECT ticker, timestamp, 
           correct_daily, incorrect_daily, accuracy_daily,
           daily_rating, daily_prev
    FROM rating_accuracy 
    ORDER BY timestamp DESC 
    LIMIT 5
""")

rows = cur.fetchall()
for r in rows:
    ticker, ts, correct, incorrect, acc, rating, prev = r
    total = correct + incorrect
    print(f"\n{ticker} | {ts}")
    print(f"  Rating: {prev} → {rating}")
    print(f"  Accuracy: {acc:.2f}% (Correct: {correct}, Incorrect: {incorrect}, Total: {total})")

print("\n" + "=" * 60)
print("ตรวจสอบ AAPL")
print("=" * 60)

cur.execute("""
    SELECT ticker, timestamp, 
           correct_daily, incorrect_daily, accuracy_daily,
           daily_rating, daily_prev
    FROM rating_accuracy 
    WHERE ticker = 'AAPL'
    ORDER BY timestamp DESC 
    LIMIT 3
""")

rows = cur.fetchall()
if rows:
    for r in rows:
        ticker, ts, correct, incorrect, acc, rating, prev = r
        total = correct + incorrect
        print(f"\n{ticker} | {ts}")
        print(f"  Rating: {prev} → {rating}")
        print(f"  Accuracy: {acc:.2f}% (Correct: {correct}, Incorrect: {incorrect}, Total: {total})")
else:
    print("❌ ไม่พบข้อมูล AAPL")

con.close()
