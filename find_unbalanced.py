import re

file_path = r"c:\Users\Владислав\Desktop\TG miniapp\tg-music-player\backend\main.py"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Find all triple-quoted strings
pattern = r'"""'
matches = list(re.finditer(pattern, content))

print(f"Analyzing {len(matches)} triple-quote occurrences...\n")

# Track balance
balance = 0
for i, match in enumerate(matches):
    line_num = content[:match.start()].count('\n') + 1
    
    # Toggle balance
    if balance == 0:
        balance = 1
        status = "OPENING"
    else:
        balance = 0
        status = "CLOSING"
    
    print(f"{i+1:2d}. Line {line_num:4d}: {status} (balance after: {balance})")
    
    # Show context if this leaves us unbalanced at the end
    if i == len(matches) - 1 and balance != 0:
        print(f"\n!!! UNBALANCED: Last triple-quote on line {line_num} is OPENING but never closed!")
        
        # Show the lines around it
        lines = content.split('\n')
        start = max(0, line_num - 3)
        end = min(len(lines), line_num + 3)
        print(f"\nContext (lines {start+1}-{end}):")
        for j in range(start, end):
            marker = " >>> " if j == line_num - 1 else "     "
            print(f"{marker}{j+1}: {lines[j]}")

print(f"\nFinal balance: {balance}")
if balance != 0:
    print("ERROR: Unbalanced triple quotes!")
else:
    print("OK: All triple quotes are balanced")
