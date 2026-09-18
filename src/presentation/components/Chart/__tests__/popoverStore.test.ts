import { describe, expect, it, vi } from "vitest";
import { createPopoverStore } from "../Popover/popoverStore";

const item = (key: string) => ({ key, datum: key, x: 0, y: 0 });

describe("chart popover store (I2)", () => {
  it("previews on hover and clears when the pointer leaves", () => {
    const store = createPopoverStore<string>();
    store.preview(item("a"));
    expect(store.get()).toMatchObject({ item: { key: "a" }, pinned: false });
    store.leave("a");
    expect(store.get().item).toBeNull();
  });

  it("ignores a stale leave from a mark that is no longer shown", () => {
    // Moving quickly from a to b can deliver b's enter before a's leave.
    const store = createPopoverStore<string>();
    store.preview(item("a"));
    store.preview(item("b"));
    store.leave("a");
    expect(store.get().item?.key).toBe("b");
  });

  it("keeps a pin through hovering other marks and leaving this one", () => {
    const store = createPopoverStore<string>();
    store.toggle(item("a"));
    store.preview(item("b"));
    store.leave("a");
    expect(store.get()).toMatchObject({ item: { key: "a" }, pinned: true });
  });

  it("pins what was only previewed — a tap is a hover then a click", () => {
    const store = createPopoverStore<string>();
    store.preview(item("a"));
    store.toggle(item("a"));
    expect(store.get().pinned).toBe(true);
  });

  it("unpins on a second click of the same mark, and moves on a click of another", () => {
    const store = createPopoverStore<string>();
    store.toggle(item("a"));
    store.toggle(item("b"));
    expect(store.get()).toMatchObject({ item: { key: "b" }, pinned: true });
    store.toggle(item("b"));
    expect(store.get().item).toBeNull();
  });

  it("does not notify when nothing changed", () => {
    // 2,460 marks means a lot of repeated enters on the same dot.
    const store = createPopoverStore<string>();
    const listener = vi.fn();
    store.subscribe(listener);
    const a = item("a");
    store.preview(a);
    store.preview(a);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
