import { WebSocket, WebSocketServer } from "ws";
import type { Server, IncomingMessage } from "http";
import type { Duplex } from "stream";
import { wsArcjet } from "../arcjet.js";

type JSONPayload = Record<string, unknown>;

interface AliveSocket extends WebSocket {
  isAlive: boolean;
}

function sendJSON(socket: WebSocket, payload: JSONPayload): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function broadCast(wss: WebSocketServer, payload: JSONPayload): void {
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    client.send(JSON.stringify(payload));
  }
}

function rejectUpgrade(
  socket: Duplex,
  statusCode: number,
  message: string,
): void {
  socket.write(
    `HTTP/1.1 ${statusCode} ${message}\r\n` +
      `Connection: close\r\n` +
      `Content-Type: text/plain\r\n\r\n` +
      `${message}`,
  );
  socket.destroy();
}

export function attachWebSocketServer(server: Server) {
  const wss = new WebSocketServer({
    noServer: true, // We handle the upgrade manually
    maxPayload: 1024 * 1024,
  });

  // ── Arcjet gate: runs before the WebSocket handshake ──────────────────────
  server.on(
    "upgrade",
    async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      // Only intercept requests to the /ws path
      if (req.url !== "/ws") {
        socket.destroy();
        return;
      }

      if (wsArcjet) {
        try {
          const decision = await wsArcjet.protect(req);

          if (decision.isDenied()) {
            if (decision.reason.isRateLimit()) {
              rejectUpgrade(socket, 429, "Too Many Requests");
            } else {
              rejectUpgrade(socket, 403, "Forbidden");
            }
            return;
          }
        } catch (e) {
          console.error("[WS] Arcjet error during upgrade:", e);
          rejectUpgrade(socket, 500, "Internal Server Error");
          return;
        }
      }

      // Arcjet passed — complete the handshake
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    },
  );

  // ── Connection handler: no protection logic here ──────────────────────────
  wss.on("connection", (socket: AliveSocket) => {
    socket.isAlive = true;
    socket.on("pong", () => {
      socket.isAlive = true;
    });

    sendJSON(socket, { type: "welcome" });
    socket.on("error", console.error);
  });

  // ── Heartbeat: ping/pong every 30s ────────────────────────────────────────
  const interval = setInterval(() => {
    wss.clients.forEach((client) => {
      const socket = client as AliveSocket;
      if (!socket.isAlive) return socket.terminate();
      socket.isAlive = false;
      socket.ping();
    });
  }, 30000);

  wss.on("close", () => clearInterval(interval));

  function broadCastMatchCreated(match: JSONPayload): void {
    broadCast(wss, { type: "match_created", data: match });
  }

  return { broadCastMatchCreated };
}
