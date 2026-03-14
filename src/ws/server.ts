import { WebSocket, WebSocketServer } from "ws";
import type { Server } from "http";
import { httpArcjet, wsArcjet } from "../arcjet.js";

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

export function attachWebSocketServer(server: Server) {
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: 1024 * 1024,
  });

  wss.on("connection", async (socket: AliveSocket, req) => {
    if (wsArcjet) {
      try {
        const decision = await wsArcjet.protect(req);

        if (decision.isDenied()) {
          const code = decision.reason.isRateLimit() ? 1013 : 1008;

          const reason = decision.reason.isRateLimit()
            ? "Rate limit exceeded"
            : "Access denied";

          socket.close(code, reason);
          return;
        }
      } catch (e) {
        console.error("WS connection error", e);
        socket.close(1011, "Server security error");
        return;
      }
    }
    socket.isAlive = true;
    socket.on("pong", () => {
      socket.isAlive = true;
    });

    sendJSON(socket, { type: "welcome" });
    socket.on("error", console.error);
  });

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
