import { describe, expect, it } from "vitest";
import {
  SERVICE_FORM_DATA_KEYS,
  buildServiceFormData,
  createServicePayloadFromFormData,
  readServiceMultipartMetadata,
  updateServicePayloadFromFormData,
} from "./service-form-data";

describe("service form data helpers", () => {
  it("builds create form data with normalized optional defaults", () => {
    const iconFile = new File(["svg"], "icon.svg", { type: "image/svg+xml" });
    const formData = buildServiceFormData(
      {
        name: "Orbit",
        url: "https://example.com/orbit",
        description: null,
        category: null,
        icon_url: "https://example.com/icon.svg",
      },
      {
        iconFile,
        includeDefaultOpenInNewTab: true,
      }
    );

    expect(formData.get(SERVICE_FORM_DATA_KEYS.name)).toBe("Orbit");
    expect(formData.get(SERVICE_FORM_DATA_KEYS.url)).toBe("https://example.com/orbit");
    expect(formData.get(SERVICE_FORM_DATA_KEYS.description)).toBeNull();
    expect(formData.get(SERVICE_FORM_DATA_KEYS.category)).toBeNull();
    expect(formData.get(SERVICE_FORM_DATA_KEYS.iconUrl)).toBe("https://example.com/icon.svg");
    expect(formData.get(SERVICE_FORM_DATA_KEYS.openInNewTab)).toBe("true");
    expect(formData.get(SERVICE_FORM_DATA_KEYS.iconFile)).toBe(iconFile);
    expect(formData.get(SERVICE_FORM_DATA_KEYS.removeIcon)).toBeNull();
  });

  it("builds update form data with empty-string fields and remove-icon flag when requested", () => {
    const formData = buildServiceFormData(
      {
        name: "Orbit",
        description: "",
        category: "",
        icon_url: "",
        open_in_new_tab: false,
      },
      {
        allowEmptyFields: true,
        removeIcon: true,
      }
    );

    expect(formData.get(SERVICE_FORM_DATA_KEYS.name)).toBe("Orbit");
    expect(formData.get(SERVICE_FORM_DATA_KEYS.description)).toBe("");
    expect(formData.get(SERVICE_FORM_DATA_KEYS.category)).toBe("");
    expect(formData.get(SERVICE_FORM_DATA_KEYS.iconUrl)).toBe("");
    expect(formData.get(SERVICE_FORM_DATA_KEYS.openInNewTab)).toBe("false");
    expect(formData.get(SERVICE_FORM_DATA_KEYS.removeIcon)).toBe("true");
  });

  it("omits undefined and empty optional values when no empty-field override is requested", () => {
    const formData = buildServiceFormData({
      name: undefined,
      url: undefined,
      description: "",
      category: null,
      icon_url: "",
    });

    expect(formData.get(SERVICE_FORM_DATA_KEYS.name)).toBeNull();
    expect(formData.get(SERVICE_FORM_DATA_KEYS.url)).toBeNull();
    expect(formData.get(SERVICE_FORM_DATA_KEYS.description)).toBeNull();
    expect(formData.get(SERVICE_FORM_DATA_KEYS.category)).toBeNull();
    expect(formData.get(SERVICE_FORM_DATA_KEYS.iconUrl)).toBeNull();
    expect(formData.get(SERVICE_FORM_DATA_KEYS.openInNewTab)).toBeNull();
  });

  it("parses create payloads from shared form-data keys", () => {
    const formData = new FormData();
    formData.set(SERVICE_FORM_DATA_KEYS.name, "Orbit");
    formData.set(SERVICE_FORM_DATA_KEYS.url, "https://example.com/orbit");
    formData.set(SERVICE_FORM_DATA_KEYS.description, " Dashboard ");
    formData.set(SERVICE_FORM_DATA_KEYS.category, " Infra ");
    formData.set(SERVICE_FORM_DATA_KEYS.iconUrl, " https://example.com/icon.svg ");
    formData.set(SERVICE_FORM_DATA_KEYS.openInNewTab, "false");

    expect(createServicePayloadFromFormData(formData)).toEqual({
      name: "Orbit",
      url: "https://example.com/orbit",
      description: "Dashboard",
      category: "Infra",
      icon_url: "https://example.com/icon.svg",
      open_in_new_tab: false,
    });
  });

  it("defaults create payload open-in-new-tab to true when the field is omitted", () => {
    const formData = new FormData();
    formData.set(SERVICE_FORM_DATA_KEYS.name, "Orbit");
    formData.set(SERVICE_FORM_DATA_KEYS.url, "https://example.com/orbit");

    expect(createServicePayloadFromFormData(formData)).toEqual({
      name: "Orbit",
      url: "https://example.com/orbit",
      description: null,
      category: null,
      icon_url: null,
      open_in_new_tab: true,
    });
  });

  it("falls back to empty required create fields when form-data values are absent", () => {
    expect(createServicePayloadFromFormData(new FormData())).toEqual({
      name: "",
      url: "",
      description: null,
      category: null,
      icon_url: null,
      open_in_new_tab: true,
    });
  });

  it("parses partial update payloads and multipart metadata from shared form-data keys", () => {
    const populatedFormData = new FormData();
    populatedFormData.set(SERVICE_FORM_DATA_KEYS.description, "   ");
    populatedFormData.set(SERVICE_FORM_DATA_KEYS.category, "  Media  ");
    populatedFormData.set(SERVICE_FORM_DATA_KEYS.iconUrl, "   ");
    populatedFormData.set(SERVICE_FORM_DATA_KEYS.openInNewTab, "false");
    populatedFormData.set(SERVICE_FORM_DATA_KEYS.removeIcon, "true");
    populatedFormData.set(
      SERVICE_FORM_DATA_KEYS.iconFile,
      new File(["svg"], "icon.svg", { type: "image/svg+xml" })
    );

    expect(updateServicePayloadFromFormData(populatedFormData)).toEqual({
      description: null,
      category: "Media",
      icon_url: null,
      open_in_new_tab: false,
    });

    expect(readServiceMultipartMetadata(populatedFormData)).toEqual({
      iconFile: expect.any(File),
      removeIcon: true,
    });

    const emptyFileFormData = new FormData();
    emptyFileFormData.set(
      SERVICE_FORM_DATA_KEYS.iconFile,
      new File([], "empty.svg", { type: "image/svg+xml" })
    );

    expect(readServiceMultipartMetadata(emptyFileFormData)).toEqual({
      iconFile: null,
      removeIcon: false,
    });
  });

  it("parses sparse updates and ignores non-file multipart icon values", () => {
    const formData = new FormData();
    formData.set(SERVICE_FORM_DATA_KEYS.name, "Orbit");
    formData.set(SERVICE_FORM_DATA_KEYS.url, "https://example.com/orbit");
    formData.set(SERVICE_FORM_DATA_KEYS.iconUrl, " https://example.com/icon.svg ");

    expect(updateServicePayloadFromFormData(formData)).toEqual({
      name: "Orbit",
      url: "https://example.com/orbit",
      icon_url: "https://example.com/icon.svg",
    });

    formData.set(SERVICE_FORM_DATA_KEYS.iconFile, "not-a-file");

    expect(readServiceMultipartMetadata(formData)).toEqual({
      iconFile: null,
      removeIcon: false,
    });
  });

  it("round-trips status check settings", () => {
    const formData = buildServiceFormData(
      {
        name: "Proxmox",
        url: "https://pve.lan:8006",
        check_enabled: true,
        check_method: "tcp",
        check_target: "pve.lan:8006",
        check_interval: 30,
        check_ignore_tls: false,
      },
      { includeDefaultOpenInNewTab: true }
    );

    expect(createServicePayloadFromFormData(formData)).toEqual({
      name: "Proxmox",
      url: "https://pve.lan:8006",
      description: null,
      category: null,
      icon_url: null,
      open_in_new_tab: true,
      check_enabled: true,
      check_method: "tcp",
      check_target: "pve.lan:8006",
      check_interval: 30,
      check_ignore_tls: false,
    });
  });

  it("sends an empty check target on update so it can be cleared", () => {
    const formData = buildServiceFormData({ check_target: "" }, { allowEmptyFields: true });
    expect(formData.get(SERVICE_FORM_DATA_KEYS.checkTarget)).toBe("");
    expect(formData.get(SERVICE_FORM_DATA_KEYS.checkInterval)).toBeNull();
    expect(updateServicePayloadFromFormData(formData)).toEqual({ check_target: null });
  });

  it("turns an unreadable check interval into NaN so validation rejects it", () => {
    for (const value of ["", "soon"]) {
      const formData = new FormData();
      formData.set(SERVICE_FORM_DATA_KEYS.checkInterval, value);
      formData.set(SERVICE_FORM_DATA_KEYS.checkIgnoreTls, "false");
      expect(updateServicePayloadFromFormData(formData)).toEqual({
        check_interval: Number.NaN,
        check_ignore_tls: false,
      });
    }
  });

  it("preserves an explicit true open-in-new-tab update value", () => {
    const formData = new FormData();
    formData.set(SERVICE_FORM_DATA_KEYS.openInNewTab, "true");

    expect(updateServicePayloadFromFormData(formData)).toEqual({
      open_in_new_tab: true,
    });
  });
});
