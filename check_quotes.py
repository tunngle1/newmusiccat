import re

file_path = r"c:\Users\Владислав\Desktop\TG miniapp\tg-music-player\backend\main.py"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Find all triple-quoted strings and check if they're properly closed
pattern = r'"""'
matches = list(re.finditer(pattern, content))

print(f"Found {len(matches)} triple-quote occurrences")

# They should come in pairs
if len(matches) % 2 != 0:
    print("ERROR: Odd number of triple quotes found!")
    for i, match in enumerate(matches):
        line_num = content[:match.start()].count('\n') + 1
        print(f"  {i+1}. Line {line_num}: position {match.start()}")
else:
    print("Triple quotes appear to be balanced")

# Let's also check around line 1235
lines = content.split('\n')
print("\n--- Lines 1230-1240 ---")
for i in range(1229, min(1240, len(lines))):
    print(f"{i+1}: {lines[i]}")
