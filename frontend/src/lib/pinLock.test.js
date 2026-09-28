// pinLock — device-local quick-unlock. The JWT stays the real credential;
// this locks in that only a SALTED hash ever touches localStorage.
import { describe, it, expect, beforeEach } from "vitest"
import { pinIsSet, setPin, clearPin, verifyPin } from "./pinLock"

// vitest runs in a node environment (no DOM): give the module the same
// localStorage surface the browser provides.
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
  get length() { return store.size },
  key: i => [...store.keys()][i] ?? null,
}
Object.defineProperty(globalThis.localStorage, "keysArray", { get: () => [...store.keys()] })

beforeEach(() => localStorage.clear())

describe("setPin / verifyPin", () => {
  it("accepts the right PIN and rejects wrong ones", async () => {
    await setPin("5566", 7)
    expect(await verifyPin("5566")).toBe(true)
    expect(await verifyPin("5567")).toBe(false)
    expect(await verifyPin("")).toBe(false)
  })
  it("verifyPin is false when no PIN was ever set (fresh device)", async () => {
    expect(await verifyPin("0000")).toBe(false)
  })
  it("stores only a salted hash — never the plain PIN", async () => {
    await setPin("1234", 7)
    const stored = localStorage.keysArray.map(k => localStorage.getItem(k)).join("|")
    expect(stored).not.toContain("1234")
    expect(localStorage.getItem("pos_pin_hash")).toMatch(/^[0-9a-f]{64}$/)
    expect(localStorage.getItem("pos_pin_salt")).toMatch(/^[0-9a-f]{32}$/)
  })
  it("salting makes the same PIN hash differently on each device", async () => {
    await setPin("1234", 7)
    const first = localStorage.getItem("pos_pin_hash")
    await setPin("1234", 7)                 // new salt each time
    expect(localStorage.getItem("pos_pin_hash")).not.toBe(first)
  })
})

describe("pinIsSet", () => {
  it("false before set, true after, and scoped to the user id", async () => {
    expect(pinIsSet()).toBe(false)
    await setPin("2468", 42)
    expect(pinIsSet()).toBe(true)
    expect(pinIsSet(42)).toBe(true)
    expect(pinIsSet(99)).toBe(false)        // another user on this device
  })
})

describe("clearPin", () => {
  it("removes everything so the lock screen never reappears", async () => {
    await setPin("1111", 1)
    clearPin()
    expect(pinIsSet()).toBe(false)
    expect(await verifyPin("1111")).toBe(false)
    expect(localStorage.getItem("pos_pin_hash")).toBeNull()
    expect(localStorage.getItem("pos_pin_salt")).toBeNull()
  })
})
