import os
import sys

# Ensure `import app.*` resolves when pytest is invoked from the repo root or
# anywhere else (the backend package lives next to this file).
sys.path.insert(0, os.path.dirname(__file__))
