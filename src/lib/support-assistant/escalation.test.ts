import { describe, expect, it } from "vitest";
import {
  forwardMasterReply,
  supportForwardsWithoutReplyLimit,
} from "@/lib/support-assistant/escalation";

describe("forwardMasterReply", () => {
  it("не несёт в группу реплики сверх лимита, пока специалист молчит", async () => {
    const result = await forwardMasterReply({
      escalationId: "00000000-0000-0000-0000-000000000000",
      telegramMessageId: 1,
      code: "AB23",
      text: "ну что там?",
      forwardsSinceReply: supportForwardsWithoutReplyLimit,
    });

    expect(result).toBe("limit");
  });
});
