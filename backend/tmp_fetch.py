import json
import sys
import asyncio
sys.path.insert(0, 'backend')
from services.google_api import fetch_calendar
result = asyncio.run(fetch_calendar(prompt='Get today calendar events', date=''))
print(json.dumps(result))
