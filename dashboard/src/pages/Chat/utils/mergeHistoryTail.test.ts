import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../hooks/sseHelpers";
import { mergeHistoryWithLocalTail } from "./mergeHistoryTail";

function msg(
  id: string,
  role: ChatMessage["role"],
  content: string,
  timestamp = 1,
): ChatMessage {
  return { id, role, content, timestamp };
}

describe("mergeHistoryWithLocalTail", () => {
  it("keeps a user message sent while the server page was in flight", () => {
    const loaded = [msg("old-a", "assistant", "之前的回复", 1_000)];
    const current = [msg("local-user", "user", "继续做", 5_000)];
    expect(
      mergeHistoryWithLocalTail(loaded, current).map((m) => m.content),
    ).toEqual(["之前的回复", "继续做"]);
  });

  it("keeps the in-flight assistant bubbles that follow that user message", () => {
    const loaded = [msg("old-a", "assistant", "之前的回复", 1_000)];
    const current = [
      msg("local-user", "user", "继续做", 5_000),
      msg("local-a", "assistant", "正在处理", 5_100),
    ];
    expect(mergeHistoryWithLocalTail(loaded, current).map((m) => m.id)).toEqual(
      ["old-a", "local-user", "local-a"],
    );
  });

  it("drops the live bubbles once the stored user id has a reply", () => {
    const loaded = [
      msg("old-a", "assistant", "之前的回复", 1_000),
      msg("local-user", "user", "继续做", 5_000),
      msg("srv-a", "assistant", "做好了", 5_200),
    ];
    const current = [
      msg("local-user", "user", "继续做", 20_000),
      msg("local-a", "assistant", "做好了", 20_100),
    ];
    expect(mergeHistoryWithLocalTail(loaded, current).map((m) => m.id)).toEqual(
      ["old-a", "local-user", "srv-a"],
    );
  });

  it("keeps the live reply when the user row is stored and the answer is not", () => {
    const loaded = [msg("local-user", "user", "继续做", 5_000)];
    const current = [
      msg("local-user", "user", "继续做", 20_000),
      msg("local-a", "assistant", "正在处理", 20_100),
    ];
    expect(mergeHistoryWithLocalTail(loaded, current).map((m) => m.id)).toEqual(
      ["local-user", "local-a"],
    );
  });

  it("keeps a second send of the same text", () => {
    const loaded = [
      msg("u1", "user", "继续做", 1_000),
      msg("a1", "assistant", "第一次", 1_100),
    ];
    const current = [
      msg("u1", "user", "继续做", 1_000),
      msg("a1", "assistant", "第一次", 1_100),
      msg("local-user", "user", "继续做", 9_000),
    ];
    expect(mergeHistoryWithLocalTail(loaded, current).map((m) => m.id)).toEqual(
      ["u1", "a1", "local-user"],
    );
  });

  it("does not replay a finished turn when the browser clock is ahead", () => {
    const loaded = [
      msg("old-a", "assistant", "之前的回复", 1_000),
      msg("local-user", "user", "帮我画一张股权交易的流程图", 5_000),
      msg("srv-a", "assistant", "做好了", 5_200),
    ];
    const current = [
      msg("local-user", "user", "帮我画一张股权交易的流程图", 20_000),
      msg("local-a", "assistant", "帮我画一张股权交易的流程图", 20_100),
    ];
    expect(mergeHistoryWithLocalTail(loaded, current).map((m) => m.id)).toEqual(
      ["old-a", "local-user", "srv-a"],
    );
  });

  it("keeps a second identical send the server page does not have yet", () => {
    const loaded = [
      msg("srv-user", "user", "继续做", 5_000),
      msg("srv-a", "assistant", "第一次", 5_200),
    ];
    const current = [
      msg("local-user-1", "user", "继续做", 5_000),
      msg("local-a", "assistant", "第一次", 5_100),
      msg("local-user-2", "user", "继续做", 20_000),
    ];
    expect(mergeHistoryWithLocalTail(loaded, current).map((m) => m.id)).toEqual(
      ["srv-user", "srv-a", "local-user-2"],
    );
  });

  it("keeps older pages already prepended above the latest server page", () => {
    const loaded = [msg("m2", "user", "第二页", 2_000)];
    const current = [
      msg("m1", "user", "更早", 1_000),
      msg("m2", "user", "第二页", 2_000),
      msg("local-user", "user", "新的", 8_000),
    ];
    expect(mergeHistoryWithLocalTail(loaded, current).map((m) => m.id)).toEqual(
      ["m1", "m2", "local-user"],
    );
  });
});
