"""MCP-compatible JSON-RPC 2.0 server over stdio (newline-delimited JSON).

The same protocol serves the dsh bridge and any MCP client (Claude Code, RL
environments): ``initialize`` → ``tools/list`` → ``tools/call``. Calls run on a
small thread pool so a slow kicad-cli run does not block reads; edits to one file
are serialized by the toolbox.
"""

from __future__ import annotations

import json
import sys
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from typing import IO, Any

from . import __version__
from .tools import TOOL_SPECS, CallContext, ToolError, Toolbox

PROTOCOL_VERSION = "2025-06-18"
SUPPORTED_PROTOCOLS = ("2024-11-05", "2025-03-26", "2025-06-18")

INSTRUCTIONS = (
    "KiCad tools. Read before you edit: read_schematic / get_symbol_pins / list_nets. Make changes with one "
    "edit_schematic batch, then run erc — KiCad's verdict decides whether the design is correct. Coordinates are "
    "millimetres with Y growing downward; keep everything on the 1.27 mm grid."
)


class Server:
    def __init__(self, toolbox: Toolbox, stdin: IO[str] | None = None, stdout: IO[str] | None = None, workers: int = 4):
        self.toolbox = toolbox
        self.stdin = stdin or sys.stdin
        self.stdout = stdout or sys.stdout
        self.pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="kicad-tool")
        self.write_lock = threading.Lock()
        self.calls: dict[Any, CallContext] = {}  # tools/call requests in flight, by request id

    def send(self, message: dict[str, Any]) -> None:
        line = json.dumps(message, ensure_ascii=False, separators=(",", ":"))
        with self.write_lock:
            self.stdout.write(line + "\n")
            self.stdout.flush()

    def reply(self, msg_id: Any, result: Any = None, error: dict[str, Any] | None = None) -> None:
        if msg_id is None:
            return
        payload: dict[str, Any] = {"jsonrpc": "2.0", "id": msg_id}
        if error is not None:
            payload["error"] = error
        else:
            payload["result"] = result
        self.send(payload)

    def serve(self) -> None:
        for raw in self.stdin:
            raw = raw.strip()
            if not raw:
                continue
            try:
                message = json.loads(raw)
            except json.JSONDecodeError as exc:
                self.send({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": f"parse error: {exc}"}})
                continue
            self.dispatch(message)
        self.pool.shutdown(wait=True)

    def dispatch(self, message: dict[str, Any]) -> None:
        method = message.get("method")
        msg_id = message.get("id")
        params = message.get("params") or {}
        if method == "initialize":
            requested = params.get("protocolVersion")
            self.reply(msg_id, {
                "protocolVersion": requested if requested in SUPPORTED_PROTOCOLS else PROTOCOL_VERSION,
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "dsh-kicad-sidecar", "version": __version__},
                "instructions": INSTRUCTIONS,
            })
        elif method == "ping":
            self.reply(msg_id, {})
        elif method == "tools/list":
            self.reply(msg_id, {"tools": [
                {"name": s.name, "description": s.description, "inputSchema": s.schema,
                 "annotations": {"readOnlyHint": not s.writes, "destructiveHint": s.name in ("edit_schematic", "edit_pcb", "update_pcb")}}
                for s in TOOL_SPECS
            ]})
        elif method == "tools/call":
            context = CallContext(progress=self._progress_sender(params))
            if msg_id is not None:
                self.calls[msg_id] = context
            self.pool.submit(self._call, msg_id, params.get("name"), params.get("arguments") or {}, context)
        elif method == "notifications/cancelled":
            # The client gave up on a request (dsh's tool signal aborted): tools that run long (autoroute) stop.
            context = self.calls.get(params.get("requestId"))
            if context is not None:
                context.cancel.set()
        elif isinstance(method, str) and method.startswith("notifications/"):
            return  # initialized and the like: nothing to do
        else:
            self.reply(msg_id, error={"code": -32601, "message": f"method not found: {method}"})

    def _progress_sender(self, params: dict[str, Any]):
        token = (params.get("_meta") or {}).get("progressToken")
        if token is None:
            return None

        def send(progress: float, total: float | None, message: str) -> None:
            body: dict[str, Any] = {"progressToken": token, "progress": progress, "message": message}
            if total is not None:
                body["total"] = total
            self.send({"jsonrpc": "2.0", "method": "notifications/progress", "params": body})

        return send

    def _call(self, msg_id: Any, name: str, arguments: dict[str, Any], context: CallContext | None = None) -> None:
        try:
            value = self.toolbox.call(name, arguments, context)
            self.reply(msg_id, {
                "content": [{"type": "text", "text": json.dumps(value, ensure_ascii=False, indent=1)}],
                "structuredContent": value,
                "isError": False,
            })
        except ToolError as exc:
            self.reply(msg_id, {"content": [{"type": "text", "text": str(exc)}], "isError": True})
        except Exception as exc:  # pragma: no cover - defensive
            traceback.print_exc(file=sys.stderr)
            self.reply(msg_id, {"content": [{"type": "text", "text": f"internal error: {exc!r}"}], "isError": True})
        finally:
            self.calls.pop(msg_id, None)
