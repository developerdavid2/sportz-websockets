import { WebSocket, WebSocketServer } from "ws";
import type { Server, IncomingMessage } from "http";
import type { Duplex } from "stream";
import { wsArcjet } from "../arcjet.js";

type JSONPayload = Record<string, unknown>;

interface AliveSocket extends WebSocket {
  isAlive: boolean;
  subscriptions: Set<number>;
}

const matchSubscribers = new Map<number, Set<WebSocket>>();

function subscribe(matchId: number, socket: WebSocket) {
  let subscribers = matchSubscribers.get(matchId);
  if (!subscribers) {
    subscribers = new Set<WebSocket>();
    matchSubscribers.set(matchId, subscribers);
  }

  subscribers.add(socket);
}

function unsubscribe(matchId: number, socket: WebSocket) {
  const subscribers = matchSubscribers.get(matchId);

  if (!subscribers) return;
  subscribers.delete(socket);

  if (subscribers.size === 0) {
    matchSubscribers.delete(matchId);
  }
}

function cleanupSubscriptions(socket: AliveSocket) {
  for (const matchId of socket.subscriptions) {
    unsubscribe(matchId, socket);
  }
}

function broadCastToMatch(matchId: number, payload: JSONPayload) {
  const subscribers = matchSubscribers.get(matchId);

  if (!subscribers || subscribers.size === 0) return;

  const message = JSON.stringify(payload);

  for (const client of subscribers) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

function sendJSON(socket: WebSocket, payload: JSONPayload): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function broadCastToAll(wss: WebSocketServer, payload: JSONPayload): void {
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    client.send(JSON.stringify(payload));
  }
}

function handleMessage(socket: AliveSocket, data: { toString: () => string }) {
  let message: { type?: string; matchId?: number };

  try {
    message = JSON.parse(data.toString());
  } catch {
    sendJSON(socket, { type: "error", message: "Invalid JSON" });
    return;
  }

  if (
    message?.type === "subscribe" &&
    typeof message.matchId === "number" &&
    Number.isInteger(message.matchId)
  ) {
    // matchId is narrowed to number by the typeof check
    subscribe(message.matchId, socket);
    socket.subscriptions.add(message.matchId);
    sendJSON(socket, { type: "subscribed", matchId: message.matchId });

    return;
  }

  if (
    message?.type === "unsubscribe" &&
    typeof message.matchId === "number" &&
    Number.isInteger(message.matchId)
  ) {
    // matchId is narrowed to number by the typeof check
    unsubscribe(message.matchId, socket);
    socket.subscriptions.delete(message.matchId);
    sendJSON(socket, { type: "unsubscribed", matchId: message.matchId });
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

  server.on(
    "upgrade",
    async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
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

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    },
  );

  wss.on("connection", (socket: AliveSocket) => {
    socket.isAlive = true;
    socket.subscriptions = new Set();

    socket.on("pong", () => {
      socket.isAlive = true;
    });

    socket.on("message", (data) => {
      handleMessage(socket, data);
    });

    socket.on("error", () => {
      socket.terminate();
    });
    socket.on("close", () => {
      cleanupSubscriptions(socket);
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
    broadCastToAll(wss, { type: "match_created", data: match });
  }

  function broadCastCommentary(matchId: number, comment: JSONPayload) {
    broadCastToMatch(matchId, { type: "commentary", data: comment });
  }

  return { broadCastMatchCreated, broadCastCommentary };
}
