import cookie from "cookie";
import http from "http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { z } from "zod";
import { CustomJwtPayload } from "../server.js";
import RealTimeStatsRoom from "./rooms/real-time-stats-room.js";

export let realTimeStatsRoom: RealTimeStatsRoom | null = null;

let sessionsCount = 0;

export async function setupWebsockets(app: Express.Application) {
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // SECTION - create rooms and init them
  realTimeStatsRoom = new RealTimeStatsRoom(io);
  await realTimeStatsRoom.init();

  io.on("connection", async (socket) => {
    sessionsCount++;

    const user = await(async function () {
      const cookies = cookie.parse(socket.handshake.headers.cookie ?? "");
      if (!cookies["authToken"]) return null;
      const payload = jwt.verify(
        cookies["authToken"],
        process.env.JWT_SECRET ?? ""
      );
      const data: CustomJwtPayload = z
        .object({ address: z.string() })
        .passthrough()
        .parse(payload);

      return data;
    })().catch(() => null);

    console.log(
      `a user${user ? ` of address ${user.address}` : ""} has connected`
    );
    console.log("concurrent sessions:", sessionsCount);

    // SECTION - Emit data for the first time
    socket.emit("rts:newest-accounts", realTimeStatsRoom?.newestAccounts.data);
    socket.emit("rts:richest", realTimeStatsRoom?.richest.data);
    socket.emit("rts:top-holders", realTimeStatsRoom?.topHolders.data);
    // SECTION - Listen to client emits
    socket.on("rts:top-holders:claim-spot", () => {
      if (user) {
        if (process.env.NODE_ENV !== "production") {
          console.log(`CLAIM RECEIVED BY ${user.address}!`);
        }
        realTimeStatsRoom?.claimSpot(user.address);
      }
    });
    // SECTION - Join rooms
    await socket.join("real-time-stats");

    socket.on("disconnect", () => {
      console.log(`${user ? `${user.address}` : "a user"} has disconnected`);
      sessionsCount -= 1;
      console.log("concurrent sessions:", sessionsCount);
    });
  });

  return server;
}
