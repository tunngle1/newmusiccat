import py_compile
import sys

file_path = r"c:\Users\Владислав\Desktop\TG miniapp\tg-music-player\backend\main.py"

try:
    py_compile.compile(file_path, doraise=True)
    print("✅ SUCCESS: File has no syntax errors!")
    sys.exit(0)
except py_compile.PyCompileError as e:
    print(f"❌ SYNTAX ERROR:")
    print(e)
    sys.exit(1)
