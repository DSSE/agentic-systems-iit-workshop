"""Entry point for coding agents: starts the CampusDesk MCP server over stdio.

Works from any working directory, so .mcp.json / .gemini/settings.json can point straight at it.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.mcp_server import server  # noqa: E402

if __name__ == "__main__":
    server.run("stdio")
