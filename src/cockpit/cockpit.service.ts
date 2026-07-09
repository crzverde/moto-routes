/**
 * Servicio de grabación de rutas GPS.
 * Maneja el estado de grabación, acumulación de puntos, persistencia y lógica de paradas.
 */

import type { CockpitState, RoutePoint, RouteMetadata } from './cockpit.types.js';
import { calculateDistance, calculateAvgSpeed, detectStop } from './cockpit.transform.js';

export interface GpsCoords {
  lat: number;
  lng: number;
  alt: number;
  speed: number;
  timestamp: number;
}

export interface GpsProvider {
  getCurrentPosition(): Promise<GpsCoords>;
  watchPosition(callback: (pos: GpsCoords) => void): () => void;
  checkPermissions(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;
}

export interface StorageProvider {
  save(path: string, data: string): Promise<void>;
}

export type StateListener = (state: CockpitState) => void;

export interface CockpitService {
  subscribe(listener: StateListener): () => void;
  getCurrentState(): CockpitState;
  startRecording(): void;
  stopRecording(): RouteMetadata | null;
  pauseRecording(): void;
  resumeRecording(): void;
  checkGpsPermission(): Promise<boolean>;
  requestGpsPermission(): Promise<boolean>;
  setInvisibleMode(active: boolean): void;
}

function createInitialState(): CockpitState {
  return {
    status: 'idle', currentSpeed: 0, avgSpeed: 0, totalDistance: 0,
    elapsedTime: 0, altitude: 0, points: [], stopState: 'moving',
    stopTimer: 0, hasGpsPermission: false, gpsSignalLost: false,
    gpsLostTimer: 0, invisibleMode: false,
  };
}

function buildMetadata(s: CockpitState): RouteMetadata {
  return {
    date: new Date().toISOString(), duration: s.elapsedTime,
    totalDistance: s.totalDistance, avgSpeed: s.avgSpeed, stops: [],
  };
}

interface ServiceContext {
  state: CockpitState;
  listeners: Set<StateListener>;
  cleanupWatch: (() => void) | null;
  gpsTickInterval: ReturnType<typeof setInterval> | null;
  lastPoint: RoutePoint | null;
  notify(): void;
  s: CockpitState;
  cw: (() => void) | null;
  ti: ReturnType<typeof setInterval> | null;
  lp: RoutePoint | null;
}

function createServiceState(): ServiceContext {
  let state: CockpitState = createInitialState();
  const listeners = new Set<StateListener>();
  let cleanupWatch: (() => void) | null = null;
  let gpsTickInterval: ReturnType<typeof setInterval> | null = null;
  let lastPoint: RoutePoint | null = null;

  function notify(): void {
    const snapshot = { ...state };
    for (const fn of listeners) { fn(snapshot); }
  }

  return { state, listeners, cleanupWatch, gpsTickInterval, lastPoint, notify,
    get s(): CockpitState { return state; },
    set s(v: CockpitState) { state = v; },
    get cw(): (() => void) | null { return cleanupWatch; },
    set cw(v: (() => void) | null) { cleanupWatch = v; },
    get ti(): ReturnType<typeof setInterval> | null { return gpsTickInterval; },
    set ti(v: ReturnType<typeof setInterval> | null) { gpsTickInterval = v; },
    get lp(): RoutePoint | null { return lastPoint; },
    set lp(v: RoutePoint | null) { lastPoint = v; },
  };
}

function startRecording(ctx: ServiceContext, gps: GpsProvider): void {
  if (ctx.s.status !== 'idle') return;
  ctx.s = { ...ctx.s, status: 'recording', points: [], currentSpeed: 0,
    avgSpeed: 0, totalDistance: 0, elapsedTime: 0, altitude: 0,
    stopState: 'moving', stopTimer: 0, gpsSignalLost: false, gpsLostTimer: 0 };
  ctx.lp = null;
  ctx.notify();
  ctx.ti = setInterval(() => {
    ctx.s = { ...ctx.s, elapsedTime: ctx.s.elapsedTime + 1 };
    ctx.notify();
  }, 1000);
  ctx.cw = gps.watchPosition((pos) => {
    addPoint(ctx, { timestamp: pos.timestamp, lat: pos.lat, lng: pos.lng, alt: pos.alt, speed: pos.speed });
  });
}

function addPoint(ctx: ServiceContext, point: RoutePoint): void {
  let dd = 0;
  if (ctx.lp) dd = calculateDistance(ctx.lp, point);
  ctx.lp = point;
  const td = ctx.s.totalDistance + dd;
  const as = calculateAvgSpeed(td, ctx.s.elapsedTime || 1);
  const sr = detectStop(point.speed, ctx.s.stopTimer, ctx.s.stopState);
  ctx.s = { ...ctx.s, points: [...ctx.s.points, point], currentSpeed: point.speed,
    avgSpeed: as, totalDistance: td, altitude: point.alt, gpsSignalLost: false,
    gpsLostTimer: 0, stopState: sr.state, stopTimer: sr.timer };
  ctx.notify();
}

function cleanupTick(ctx: ServiceContext): void {
  if (ctx.ti != null) { clearInterval(ctx.ti); ctx.ti = null; }
  if (ctx.cw != null) { ctx.cw(); ctx.cw = null; }
}

export function createCockpitService(
  gps: GpsProvider,
  _storage: StorageProvider,
): CockpitService {
  const ctx = createServiceState();

  return {
    subscribe: (listener: StateListener): () => void => {
      ctx.listeners.add(listener);
      return () => { ctx.listeners.delete(listener); };
    },
    getCurrentState: (): CockpitState => ({ ...ctx.s }),
    startRecording: (): void => { startRecording(ctx, gps); },
    stopRecording: (): RouteMetadata | null => {
      if (ctx.s.status === 'idle') return null;
      cleanupTick(ctx);
      const meta = buildMetadata(ctx.s);
      ctx.s = { ...createInitialState(), hasGpsPermission: ctx.s.hasGpsPermission };
      ctx.notify();
      return meta;
    },
    pauseRecording: (): void => {
      if (ctx.s.status !== 'recording') return;
      ctx.s = { ...ctx.s, status: 'paused' };
      if (ctx.ti != null) clearInterval(ctx.ti);
      ctx.ti = null;
      ctx.notify();
    },
    resumeRecording: (): void => {
      if (ctx.s.status !== 'paused') return;
      ctx.s = { ...ctx.s, status: 'recording' };
      startRecording(ctx, gps);
      ctx.notify();
    },
    checkGpsPermission: async (): Promise<boolean> => {
      const ok = await gps.checkPermissions();
      ctx.s = { ...ctx.s, hasGpsPermission: ok };
      ctx.notify();
      return ok;
    },
    requestGpsPermission: async (): Promise<boolean> => {
      const ok = await gps.requestPermissions();
      ctx.s = { ...ctx.s, hasGpsPermission: ok };
      ctx.notify();
      return ok;
    },
    setInvisibleMode: (active: boolean): void => {
      ctx.s = { ...ctx.s, invisibleMode: active };
      ctx.notify();
    },
  };
}