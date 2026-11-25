// The module's two blocks of bytes, as the firmware defines them:
//   settings: firmware/src/SettingsCodec.h (18 bytes)
//   status:   firmware/src/LinkStatus.h    (12 bytes)
// The checks here are the firmware's own, so that a form the page lets
// through is one the module accepts. The module checks again regardless.

export const SERVICE_UUID = '6f7a0001-5d2c-4b1e-9c1a-3f8e5a2b7c10';
export const STATUS_UUID = '6f7a0002-5d2c-4b1e-9c1a-3f8e5a2b7c10';
export const CONFIG_UUID = '6f7a0003-5d2c-4b1e-9c1a-3f8e5a2b7c10';

export const CONFIG_SIZE = 18;
export const STATUS_SIZE = 12;
export const CONFIG_VERSION = 1;
export const STATUS_VERSION = 1;

export const MIN_SECONDS = 1;
export const MAX_SECONDS = 300;
export const MAX_DELAY_MS = 10000;
export const MAX_LIGHTS = 3; // sidelights | low beam; fog is not accepted

export const NO_WRITE_YET = 0xff;
export const WRITE_FAILED = 0xfe;

const FLAGS = ['moduleEnabled', 'welcomeEnabled', 'welcomeOnlyDark', 'ignitionLightsEnabled',
  'goodbyeEnabled', 'goodbyeOnlyDark'];

function isInt(v, min, max) {
  return Number.isInteger(v) && v >= min && v <= max;
}

// Which fields of a settings object the module would refuse. Empty: none.
export function configProblems(c) {
  const bad = [];
  for (const f of FLAGS) {
    if (typeof c[f] !== 'boolean') bad.push(f);
  }
  for (const f of ['welcomeLights', 'ignitionLights', 'drlLights', 'goodbyeLights']) {
    if (!isInt(c[f], 0, MAX_LIGHTS)) bad.push(f);
  }
  for (const f of ['welcomeSeconds', 'goodbyeSeconds']) {
    if (!isInt(c[f], MIN_SECONDS, MAX_SECONDS)) bad.push(f);
  }
  if (!isInt(c.drlDelayMs, 0, MAX_DELAY_MS)) bad.push('drlDelayMs');
  if (!isInt(c.darkThreshold, 0, 65535)) bad.push('darkThreshold');
  if (!isInt(c.lightThreshold, 0, 65535)) bad.push('lightThreshold');
  if (isInt(c.darkThreshold, 0, 65535) && isInt(c.lightThreshold, 0, 65535) &&
      c.darkThreshold >= c.lightThreshold) {
    bad.push('thresholds');
  }
  return bad;
}

export function encodeConfig(c) {
  const bad = configProblems(c);
  if (bad.length) {
    throw new Error('settings not valid: ' + bad.join(', '));
  }
  const b = new Uint8Array(CONFIG_SIZE);
  const v = new DataView(b.buffer);
  b[0] = CONFIG_VERSION;
  FLAGS.forEach((f, bit) => { if (c[f]) b[1] |= 1 << bit; });
  b[2] = c.welcomeLights;
  b[3] = c.ignitionLights;
  b[4] = c.drlLights;
  b[5] = c.goodbyeLights;
  b[6] = 0; // brightness policy: only the factory one exists
  b[7] = 0;
  v.setUint16(8, c.welcomeSeconds, true);
  v.setUint16(10, c.goodbyeSeconds, true);
  v.setUint16(12, c.drlDelayMs, true);
  v.setUint16(14, c.darkThreshold, true);
  v.setUint16(16, c.lightThreshold, true);
  return b;
}

// { config } for a block the module itself would accept, { error } otherwise.
// The error names are the firmware's settings::Result.
export function decodeConfig(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.length !== CONFIG_SIZE) return { error: 'BadLength' };
  if (b[0] !== CONFIG_VERSION) return { error: 'BadVersion' };
  if (b[1] & ~0x3f) return { error: 'BadFlags' };
  for (let i = 2; i <= 5; i++) {
    if (b[i] > MAX_LIGHTS) return { error: 'BadLights' };
  }
  if (b[6] !== 0) return { error: 'BadPolicy' };
  if (b[7] !== 0) return { error: 'BadReserved' };
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const welcomeSeconds = v.getUint16(8, true);
  const goodbyeSeconds = v.getUint16(10, true);
  if (welcomeSeconds < MIN_SECONDS || welcomeSeconds > MAX_SECONDS ||
      goodbyeSeconds < MIN_SECONDS || goodbyeSeconds > MAX_SECONDS) {
    return { error: 'BadDuration' };
  }
  const drlDelayMs = v.getUint16(12, true);
  if (drlDelayMs > MAX_DELAY_MS) return { error: 'BadDelay' };
  const darkThreshold = v.getUint16(14, true);
  const lightThreshold = v.getUint16(16, true);
  if (darkThreshold >= lightThreshold) return { error: 'BadThresholds' };
  const config = {
    welcomeLights: b[2], ignitionLights: b[3], drlLights: b[4], goodbyeLights: b[5],
    welcomeSeconds, goodbyeSeconds, drlDelayMs, darkThreshold, lightThreshold,
  };
  FLAGS.forEach((f, bit) => { config[f] = (b[1] & (1 << bit)) !== 0; });
  return { config };
}

// The firmware's settings::Result by number, as the status block reports it.
export const WRITE_RESULT_NAMES = ['Ok', 'BadLength', 'BadVersion', 'BadFlags', 'BadLights', 'BadPolicy',
  'BadDuration', 'BadDelay', 'BadThresholds', 'BadReserved'];

export function decodeStatus(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.length !== STATUS_SIZE) return { error: 'BadLength' };
  if (b[0] !== STATUS_VERSION) return { error: 'BadVersion' };
  return {
    status: {
      coreStatus: b[1],
      position: b[2],
      ignitionOn: (b[3] & 0x01) !== 0,
      engineRunning: (b[3] & 0x02) !== 0,
      dark: (b[3] & 0x04) !== 0,
      setupValid: (b[3] & 0x08) !== 0,
      settingsPending: (b[3] & 0x10) !== 0,
      moduleEnabled: (b[3] & 0x20) !== 0,
      batteryMv: b[4] | (b[5] << 8),
      fault: b[6],
      relayMask: b[7],
      controllerMode: b[8],
      lastWriteResult: b[9],
    },
  };
}

export function toHex(bytes) {
  return Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join(' ');
}

export function fromHex(text) {
  const clean = text.replace(/\s+/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}
