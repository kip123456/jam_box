import type { Socket } from "socket.io-client";
import { getCollabSocket } from "./socket";

/**
 * WebRTC 信令事件名（必须和 `backend/src/socket/index.ts` 的 WEBRTC_EVENTS 一致）
 */
export const WEBRTC_EVENT = {
  SIGNAL: "webrtc:signal",
  JOIN: "webrtc:join",
  JOINED: "webrtc:joined",
  LEAVE: "webrtc:leave",
  LEFT: "webrtc:left",
  VOICE_LIST: "webrtc:voice-list",
  VOICE_MEMBERS: "webrtc:voice-members",
  MUTED: "member:muted",
  UNMUTED: "member:unmuted",
} as const;

/** Google 公共 STUN 服务器；MVP 不配置 TURN */
const PC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
  iceCandidatePoolSize: 10,
};

/** 说话判定阈值（0-1） */
const SPEAKING_THRESHOLD = 0.05;
/** 说话状态保持时间，避免音量抖动导致图标闪烁 */
const SPEAKING_HOLD_MS = 300;

export interface VoicePeer {
  socketId: string;
  userId: string;
  username: string;
  muted: boolean;
  speaking: boolean;
}

export interface VoiceState {
  joined: boolean;
  muted: boolean;
  /** 房间内其他语音通道成员 */
  peers: VoicePeer[];
}

export type MicrophoneErrorType =
  | "permission-denied"
  | "no-device"
  | "device-busy"
  | "unsupported"
  | "unknown";

export class MicrophoneError extends Error {
  readonly type: MicrophoneErrorType;

  constructor(type: MicrophoneErrorType, message: string) {
    super(message);
    this.name = "MicrophoneError";
    this.type = type;
  }
}

interface VoiceMemberEvent {
  socketId: string;
  userId: string;
  username: string;
  muted: boolean;
}

type SignalPayload =
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "ice"; candidate: RTCIceCandidateInit };

interface SignalMessage {
  from: string;
  fromUserId?: string;
  fromUsername?: string;
  signal: SignalPayload;
}

interface PeerEntry extends VoicePeer {
  pc?: RTCPeerConnection;
  candidates: RTCIceCandidateInit[];
  audio?: HTMLAudioElement;
  analyser?: AnalyserNode;
  analyserData?: Uint8Array;
  analyserTimer?: number;
  speakingTimer?: number;
}

/**
 * 前端 WebRTC 管理器：mesh 拓扑音频通话。
 * 同时维护「语音通道成员展示状态」与「点对点 PeerConnection」，
 * 信令复用 Phase 5 的 `/collab` Socket.IO 连接。
 */
export class WebRTCManager {
  private readonly socket: Socket;
  private readonly onStateChange: (state: VoiceState) => void;
  private readonly peers = new Map<string, PeerEntry>();
  private localStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private joined = false;
  private muted = false;
  private destroyed = false;

  constructor(roomId: string, onStateChange: (state: VoiceState) => void) {
    this.socket = getCollabSocket(roomId);
    this.onStateChange = onStateChange;

    this.socket.on(WEBRTC_EVENT.SIGNAL, this.handleSignal);
    this.socket.on(WEBRTC_EVENT.JOINED, this.handleJoined);
    this.socket.on(WEBRTC_EVENT.LEFT, this.handleLeft);
    this.socket.on(WEBRTC_EVENT.VOICE_MEMBERS, this.handleVoiceMembers);
    this.socket.on(WEBRTC_EVENT.MUTED, this.handleMuted);
    this.socket.on(WEBRTC_EVENT.UNMUTED, this.handleUnmuted);
    this.socket.on("connect", this.handleConnect);

    if (this.socket.connected) {
      this.requestVoiceMembers();
    }
    this.emitState();
  }

  /** 打开麦克风并加入语音通道 */
  async join(): Promise<void> {
    if (this.destroyed || this.joined) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new MicrophoneError("unsupported", "当前浏览器不支持麦克风访问");
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      throw classifyMicrophoneError(err);
    }

    await this.waitForSocket();
    this.localStream = stream;
    this.joined = true;
    this.muted = false;
    this.socket.emit(WEBRTC_EVENT.JOIN);
    this.emitState();
  }

  /** 关闭麦克风并离开语音通道 */
  async leave(): Promise<void> {
    if (this.destroyed) return;

    if (this.joined) {
      this.socket.emit(WEBRTC_EVENT.LEAVE);
    }
    this.closeAllConnections();
    this.stopLocalStream();
    this.joined = false;
    this.muted = false;
    this.emitState();
  }

  /** 切换静音：返回切换后的静音状态 */
  toggleMute(): boolean {
    if (!this.localStream) return this.muted;

    this.muted = !this.muted;
    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = !this.muted;
    }
    this.socket.emit(this.muted ? WEBRTC_EVENT.MUTED : WEBRTC_EVENT.UNMUTED);
    this.emitState();
    return this.muted;
  }

  /** 组件卸载时调用：清理所有连接与监听器 */
  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.joined) {
      this.socket.emit(WEBRTC_EVENT.LEAVE);
    }
    this.closeAllConnections();
    this.stopLocalStream();
    this.joined = false;
    this.muted = false;

    this.socket.off(WEBRTC_EVENT.SIGNAL, this.handleSignal);
    this.socket.off(WEBRTC_EVENT.JOINED, this.handleJoined);
    this.socket.off(WEBRTC_EVENT.LEFT, this.handleLeft);
    this.socket.off(WEBRTC_EVENT.VOICE_MEMBERS, this.handleVoiceMembers);
    this.socket.off(WEBRTC_EVENT.MUTED, this.handleMuted);
    this.socket.off(WEBRTC_EVENT.UNMUTED, this.handleUnmuted);
    this.socket.off("connect", this.handleConnect);

    if (this.audioContext) {
      const ctx = this.audioContext;
      this.audioContext = null;
      void ctx.close().catch(() => undefined);
    }
  }

  // ---------- Socket.IO 事件 ----------

  private handleConnect = () => {
    // 断线重连后 socket.id 变化，需要重新登记语音通道并重建连接
    if (this.joined) {
      this.closeAllConnections();
      this.socket.emit(WEBRTC_EVENT.JOIN);
    }
    this.requestVoiceMembers();
    this.emitState();
  };

  private handleSignal = (payload: SignalMessage) => {
    void this.handleSignalMessage(payload);
  };

  private handleJoined = (member: VoiceMemberEvent) => {
    this.upsertPeer(member);
    this.maybeOfferTo(member.socketId);
    this.emitState();
  };

  private handleLeft = (data: { socketId: string }) => {
    this.removePeer(data.socketId);
    this.emitState();
  };

  private handleVoiceMembers = (members: VoiceMemberEvent[]) => {
    const ownId = this.socket.id;
    const active = new Set(members.map((member) => member.socketId));

    for (const socketId of Array.from(this.peers.keys())) {
      if (socketId !== ownId && !active.has(socketId)) {
        this.removePeer(socketId);
      }
    }

    for (const member of members) {
      if (member.socketId === ownId) continue;
      this.upsertPeer(member);
      this.maybeOfferTo(member.socketId);
    }
    this.emitState();
  };

  private handleMuted = (data: { socketId: string }) => {
    const peer = this.peers.get(data.socketId);
    if (!peer) return;
    peer.muted = true;
    this.emitState();
  };

  private handleUnmuted = (data: { socketId: string }) => {
    const peer = this.peers.get(data.socketId);
    if (!peer) return;
    peer.muted = false;
    this.emitState();
  };

  // ---------- 信令 --------------------

  private async handleSignalMessage(payload: SignalMessage): Promise<void> {
    if (this.destroyed || !this.joined) return;

    const peer = this.upsertPeer({
      socketId: payload.from,
      userId: payload.fromUserId,
      username: payload.fromUsername,
    });

    try {
      if (payload.signal.type === "offer") {
        const pc = this.ensureConnection(peer);
        if (!pc) return;
        await pc.setRemoteDescription({ type: "offer", sdp: payload.signal.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.sendSignal(peer.socketId, { type: "answer", sdp: answer.sdp ?? "" });
        await this.flushCandidates(peer);
      } else if (payload.signal.type === "answer") {
        const pc = peer.pc;
        if (!pc) return;
        await pc.setRemoteDescription({ type: "answer", sdp: payload.signal.sdp });
        await this.flushCandidates(peer);
      } else {
        const pc = peer.pc;
        if (!pc) return;
        if (pc.remoteDescription) {
          await pc.addIceCandidate(payload.signal.candidate);
        } else {
          peer.candidates.push(payload.signal.candidate);
        }
      }
    } catch (err) {
      console.warn("[webrtc] signal handling failed:", err);
    }
    this.emitState();
  }

  private sendSignal(to: string, signal: SignalPayload): void {
    if (this.destroyed) return;
    this.socket.emit(WEBRTC_EVENT.SIGNAL, { to, signal });
  }

  private maybeOfferTo(socketId: string): void {
    if (!this.joined || !this.localStream) return;
    const ownId = this.socket.id;
    // 只由 socket.id 较小的一方发起 offer，避免双方同时 offer 造成 glare
    if (!ownId || ownId >= socketId) return;

    const peer = this.peers.get(socketId);
    if (!peer || peer.pc) return;
    void this.createOffer(peer).catch((err) => {
      console.warn("[webrtc] createOffer failed:", err);
    });
  }

  private async createOffer(peer: PeerEntry): Promise<void> {
    const pc = this.ensureConnection(peer);
    if (!pc || pc.signalingState !== "stable") return;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.sendSignal(peer.socketId, { type: "offer", sdp: offer.sdp ?? "" });
  }

  private ensureConnection(peer: PeerEntry): RTCPeerConnection | null {
    if (peer.pc) return peer.pc;
    if (!this.localStream) return null;

    const pc = new RTCPeerConnection(PC_CONFIG);
    const stream = this.localStream;
    for (const track of stream.getTracks()) {
      pc.addTrack(track, stream);
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(peer.socketId, {
          type: "ice",
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0] ?? new MediaStream([event.track]);
      this.attachRemoteAudio(peer, remoteStream);
    };

    peer.pc = pc;
    return pc;
  }

  private async flushCandidates(peer: PeerEntry): Promise<void> {
    const pc = peer.pc;
    if (!pc) return;
    const pending = peer.candidates.splice(0);
    for (const candidate of pending) {
      await pc.addIceCandidate(candidate);
    }
  }

  // ---------- 远端音频与说话指示 ----------

  private attachRemoteAudio(peer: PeerEntry, stream: MediaStream): void {
    if (peer.audio) return;

    const audio = new Audio();
    audio.srcObject = stream;
    audio.autoplay = true;
    void audio.play().catch(() => undefined);
    peer.audio = audio;

    try {
      const ctx = this.ensureAudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      peer.analyser = analyser;
      peer.analyserData = data;
      peer.analyserTimer = window.setInterval(() => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (const value of data) sum += value;
        const volume = sum / data.length / 255;
        this.markSpeaking(peer, volume > SPEAKING_THRESHOLD);
      }, 200);
    } catch (err) {
      console.warn("[webrtc] analyser setup failed:", err);
    }
  }

  private markSpeaking(peer: PeerEntry, speaking: boolean): void {
    if (speaking) {
      if (peer.speakingTimer !== undefined) {
        window.clearTimeout(peer.speakingTimer);
        peer.speakingTimer = undefined;
      }
      if (!peer.speaking) {
        peer.speaking = true;
        this.emitState();
      }
      return;
    }

    if (!peer.speaking || peer.speakingTimer !== undefined) return;
    peer.speakingTimer = window.setTimeout(() => {
      peer.speaking = false;
      peer.speakingTimer = undefined;
      this.emitState();
    }, SPEAKING_HOLD_MS);
  }

  private ensureAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === "suspended") {
      void this.audioContext.resume().catch(() => undefined);
    }
    return this.audioContext;
  }

  // ---------- 内部工具 ----------

  private upsertPeer(member: {
    socketId: string;
    userId?: string;
    username?: string;
    muted?: boolean;
  }): PeerEntry {
    let peer = this.peers.get(member.socketId);
    if (!peer) {
      peer = {
        socketId: member.socketId,
        userId: member.userId ?? "",
        username: member.username ?? "",
        muted: member.muted ?? false,
        speaking: false,
        candidates: [],
      };
      this.peers.set(member.socketId, peer);
    } else {
      if (member.userId) peer.userId = member.userId;
      if (member.username) peer.username = member.username;
      if (member.muted !== undefined) peer.muted = member.muted;
    }
    return peer;
  }

  private removePeer(socketId: string): void {
    const peer = this.peers.get(socketId);
    if (!peer) return;

    if (peer.pc) {
      peer.pc.onicecandidate = null;
      peer.pc.ontrack = null;
      peer.pc.close();
    }
    if (peer.audio) {
      peer.audio.pause();
      peer.audio.srcObject = null;
    }
    if (peer.analyserTimer !== undefined) {
      window.clearInterval(peer.analyserTimer);
    }
    if (peer.speakingTimer !== undefined) {
      window.clearTimeout(peer.speakingTimer);
    }
    this.peers.delete(socketId);
  }

  private closeAllConnections(): void {
    for (const socketId of Array.from(this.peers.keys())) {
      this.removePeer(socketId);
    }
  }

  private stopLocalStream(): void {
    if (!this.localStream) return;
    for (const track of this.localStream.getTracks()) {
      track.stop();
    }
    this.localStream = null;
  }

  private requestVoiceMembers(): void {
    this.socket.emit(WEBRTC_EVENT.VOICE_LIST);
  }

  private waitForSocket(): Promise<void> {
    if (this.socket.connected) return Promise.resolve();
    return new Promise((resolve) => {
      const onConnect = () => {
        this.socket.off("connect", onConnect);
        resolve();
      };
      this.socket.on("connect", onConnect);
    });
  }

  private emitState(): void {
    if (this.destroyed) return;
    this.onStateChange({
      joined: this.joined,
      muted: this.muted,
      peers: Array.from(this.peers.values()).map((peer) => ({
        socketId: peer.socketId,
        userId: peer.userId,
        username: peer.username,
        muted: peer.muted,
        speaking: peer.speaking,
      })),
    });
  }
}

function classifyMicrophoneError(err: unknown): MicrophoneError {
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name?: unknown }).name ?? "")
      : "";

  if (name === "NotAllowedError" || name === "SecurityError") {
    return new MicrophoneError(
      "permission-denied",
      "麦克风权限被拒绝，请在浏览器设置中允许"
    );
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return new MicrophoneError("no-device", "未检测到麦克风设备");
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return new MicrophoneError(
      "device-busy",
      "麦克风被其他应用占用，请关闭占用程序后重试"
    );
  }
  return new MicrophoneError("unknown", "无法打开麦克风，请稍后重试");
}
