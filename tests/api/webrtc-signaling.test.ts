import http from "node:http";
import { createRequire } from "node:module";
import { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";
import { createApp } from "../../backend/src/index";
import { setupSocketIO } from "../../backend/src/socket";
import prisma from "../../backend/src/lib/prisma";

const backendRequire = createRequire(
  new URL("../../backend/package.json", import.meta.url)
);
const { Server } = backendRequire("socket.io") as {
  Server: new (server: http.Server) => any;
};
const { io: createClient } = backendRequire("socket.io-client") as {
  io: (url: string, options: Record<string, unknown>) => any;
};

const request = supertest(createApp());
const AUTH_BASE = "/api/v1/auth";
const ROOMS_BASE = "/api/v1/rooms";

interface TestUser {
  id: string;
  token: string;
}

async function registerAndLogin(username: string): Promise<TestUser> {
  await request
    .post(`${AUTH_BASE}/register`)
    .send({ username, password: "Passw0rd123" });
  const login = await request
    .post(`${AUTH_BASE}/login`)
    .send({ username, password: "Passw0rd123" });
  return {
    id: login.body.data.user.id as string,
    token: login.body.data.accessToken as string,
  };
}

async function createRoom(token: string, name: string): Promise<string> {
  const res = await request
    .post(ROOMS_BASE)
    .set("Authorization", `Bearer ${token}`)
    .send({ name, isPublic: true });
  expect(res.status).toBe(200);
  return res.body.data.id as string;
}

async function joinRoom(token: string, roomId: string): Promise<void> {
  const res = await request
    .post(`${ROOMS_BASE}/${roomId}/join`)
    .set("Authorization", `Bearer ${token}`)
    .send({});
  expect(res.status).toBe(200);
}

function connectSocket(
  port: number,
  auth: { token?: string; roomId?: string }
): Promise<any> {
  return new Promise((resolve, reject) => {
    const socket = createClient(`http://127.0.0.1:${port}/collab`, {
      transports: ["websocket"],
      reconnection: false,
      auth,
    });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (err: Error) => {
      socket.disconnect();
      reject(err);
    });
  });
}

function waitForEvent<T = unknown>(socket: any, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for ${event}`)),
      5_000
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

let httpServer: http.Server;
let io: any;
let port = 0;
const openSockets: any[] = [];

async function startSocketServer(): Promise<void> {
  httpServer = http.createServer(createApp());
  io = new Server(httpServer);
  setupSocketIO(io);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  port = (httpServer.address() as AddressInfo).port;
}

async function closeSocketServer(): Promise<void> {
  for (const socket of openSockets.splice(0)) {
    socket.disconnect();
  }
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
}

beforeEach(async () => {
  await prisma.roomMember.deleteMany({});
  await prisma.room.deleteMany({});
  await prisma.user.deleteMany({});
  await startSocketServer();
});

afterEach(async () => {
  await closeSocketServer();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("WebRTC 信令", () => {
  it("加入语音通道：房间成员收到 voice-members/joined，并按点对点转发 offer", async () => {
    const alice = await registerAndLogin("vr_alice");
    const bob = await registerAndLogin("vr_bob");
    const roomId = await createRoom(alice.token, "语音房间");
    await joinRoom(bob.token, roomId);

    const socketA = await connectSocket(port, { token: alice.token, roomId });
    const socketB = await connectSocket(port, { token: bob.token, roomId });
    openSockets.push(socketA, socketB);

    const joinedByB = waitForEvent<{ socketId: string; userId: string }>(
      socketB,
      "webrtc:joined"
    );
    const voiceListForA = waitForEvent<any[]>(socketA, "webrtc:voice-members");
    socketA.emit("webrtc:join");

    const list = await voiceListForA;
    const joinedA = await joinedByB;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ socketId: socketA.id, userId: alice.id, muted: false });
    expect(joinedA).toMatchObject({ socketId: socketA.id, userId: alice.id });

    const signalAtB = waitForEvent<any>(socketB, "webrtc:signal");
    socketA.emit("webrtc:signal", {
      to: socketB.id,
      signal: { type: "offer", sdp: "v=0\r\nfake-offer" },
    });

    const signal = await signalAtB;
    expect(signal).toMatchObject({
      to: socketB.id,
      from: socketA.id,
      fromUserId: alice.id,
      signal: { type: "offer", sdp: "v=0\r\nfake-offer" },
    });

    // B 也加入语音通道后才能离开（未加入时 leave 是幂等的）
    const voiceListForB = waitForEvent<any[]>(socketB, "webrtc:voice-members");
    socketB.emit("webrtc:join");
    await voiceListForB;

    const leftAtA = waitForEvent<{ socketId: string }>(socketA, "webrtc:left");
    socketB.emit("webrtc:leave");
    const left = await leftAtA;
    expect(left.socketId).toBe(socketB.id);
  });

  it("静音状态广播：其他成员收到 member:muted / member:unmuted，后加入者能查到静音状态", async () => {
    const alice = await registerAndLogin("vr_alice2");
    const bob = await registerAndLogin("vr_bob2");
    const roomId = await createRoom(alice.token, "静音房间");
    await joinRoom(bob.token, roomId);

    const socketA = await connectSocket(port, { token: alice.token, roomId });
    const socketB = await connectSocket(port, { token: bob.token, roomId });
    const socketC = await connectSocket(port, { token: bob.token, roomId });
    openSockets.push(socketA, socketB, socketC);

    socketA.emit("webrtc:join");
    await waitForEvent(socketA, "webrtc:voice-members");

    const mutedAtB = waitForEvent<{ userId: string; socketId: string }>(
      socketB,
      "member:muted"
    );
    socketA.emit("member:muted");
    expect(await mutedAtB).toMatchObject({ userId: alice.id, socketId: socketA.id });

    const membersForC = waitForEvent<any[]>(socketC, "webrtc:voice-members");
    socketC.emit("webrtc:voice-list");
    const members = await membersForC;
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ socketId: socketA.id, muted: true });

    const unmutedAtB = waitForEvent<{ userId: string }>(socketB, "member:unmuted");
    socketA.emit("member:unmuted");
    expect(await unmutedAtB).toMatchObject({ userId: alice.id });
  });

  it("安全：无 JWT 或非房间成员无法建立连接；跨房间信令不会被转发", async () => {
    const alice = await registerAndLogin("vr_alice3");
    const bob = await registerAndLogin("vr_bob3");
    const stranger = await registerAndLogin("vr_stranger3");
    const room1 = await createRoom(alice.token, "房间一");
    const room2 = await createRoom(stranger.token, "房间二");
    await joinRoom(bob.token, room1);

    await expect(connectSocket(port, { roomId: room1 })).rejects.toThrow("鉴权失败");
    await expect(
      connectSocket(port, { token: stranger.token, roomId: room1 })
    ).rejects.toThrow("不是该房间成员");

    const socketA = await connectSocket(port, { token: alice.token, roomId: room1 });
    const socketB = await connectSocket(port, { token: bob.token, roomId: room1 });
    const socketS = await connectSocket(port, {
      token: stranger.token,
      roomId: room2,
    });
    openSockets.push(socketA, socketB, socketS);

    let received = false;
    socketS.on("webrtc:signal", () => {
      received = true;
    });
    socketA.emit("webrtc:signal", {
      to: socketS.id,
      signal: { type: "offer", sdp: "v=0\r\ncross-room" },
    });

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(received).toBe(false);

    // 畸形信令同样不会被转发
    let malformedReceived = false;
    socketB.on("webrtc:signal", () => {
      malformedReceived = true;
    });
    socketA.emit("webrtc:signal", { to: socketB.id, signal: { type: "offer" } });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(malformedReceived).toBe(false);
  });
});
