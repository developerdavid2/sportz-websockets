import { WebSocket, WebSocketServer } from "ws";
import type { Server } from "http";

type JSONPayload = Record<string, unknown>;

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

  wss.on("connection", (socket: WebSocket) => {
    sendJSON(socket, { type: "welcome" });

    socket.on("error", console.error);
  });

  function broadCastMatchCreated(match: JSONPayload): void {
    broadCast(wss, { type: "match_created", data: match });
  }

  return { broadCastMatchCreated };
}
