import { describe, expect, it } from "vitest";
import {
  changeType,
  draftFrom,
  draftProblem,
  draftValues,
  integrationIconUrl,
} from "@/lib/integration-draft";
import type { IntegrationType } from "@shared/types";

const adguard: IntegrationType = {
  id: "adguard",
  name: "AdGuard Home",
  icon: "adguard-home",
  fields: [
    { key: "url", label: "API address", kind: "url", required: false },
    { key: "username", label: "Username", kind: "text", required: true },
    { key: "password", label: "Password", kind: "secret", required: true },
    { key: "ignoreTls", label: "Self-signed", kind: "toggle", required: false },
  ],
};
const saved = { type: "adguard", values: { username: "me" }, secretsSet: ["password"] };

describe("integration drafts", () => {
  it("start from the saved integration or nothing", () => {
    expect(draftFrom(saved)).toEqual(saved);
    expect(draftFrom(null)).toEqual({ type: null, values: {}, secretsSet: [] });
  });

  it("restore the saved settings when switching back to their type", () => {
    expect(changeType("adguard", saved)).toEqual(saved);
    expect(changeType("pihole", saved)).toEqual({ type: "pihole", values: {}, secretsSet: [] });
    expect(changeType(null, saved)).toEqual({ type: null, values: {}, secretsSet: [] });
  });

  it("say what's missing, counting saved secrets as present", () => {
    expect(draftProblem(draftFrom(null), undefined)).toBeNull();
    expect(draftProblem({ type: "gone", values: {}, secretsSet: [] }, undefined)).toBe(
      "That integration isn't available"
    );
    expect(draftProblem(draftFrom(saved), adguard)).toBeNull();
    expect(
      draftProblem({ type: "adguard", values: { username: " " }, secretsSet: [] }, adguard)
    ).toBe("Username is required for the integration");
    expect(
      draftProblem({ type: "adguard", values: { username: "me" }, secretsSet: [] }, adguard)
    ).toBe("Password is required for the integration");
  });

  it("send secrets only when typed", () => {
    expect(
      draftValues(
        { type: "adguard", values: { username: "me", password: "", url: "" }, secretsSet: [] },
        adguard
      )
    ).toEqual({
      url: "",
      username: "me",
      ignoreTls: false,
    });
    expect(
      draftValues(
        { type: "adguard", values: { password: "pw", ignoreTls: true }, secretsSet: [] },
        adguard
      )
    ).toEqual({
      password: "pw",
      ignoreTls: true,
    });
  });

  it("point at the app's dashboard-icons picture", () => {
    expect(integrationIconUrl("pi-hole")).toBe(
      "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/pi-hole.svg"
    );
  });
});
