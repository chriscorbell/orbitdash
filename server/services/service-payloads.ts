import {
  createServicePayloadFromFormData,
  readServiceMultipartMetadata,
  type ServiceFormDataReader,
  updateServicePayloadFromFormData,
} from "@shared/service-form-data";
import type { CreateServicePayload, UpdateServicePayload } from "@shared/types";
import { hasJsonContentType, parseJsonBody } from "../request-body";

export interface ParsedServicePayload<TPayload> {
  iconFile: File | null;
  payload: TPayload;
  removeIcon: boolean;
}

export interface ServicePayloadParseFailure {
  error: string;
  status: 400 | 415;
}

async function parseServicePayload<TPayload extends CreateServicePayload | UpdateServicePayload>(
  request: Request,
  createPayload: (formData: ServiceFormDataReader) => TPayload
): Promise<ParsedServicePayload<TPayload> | ServicePayloadParseFailure> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const { iconFile, removeIcon } = readServiceMultipartMetadata(formData);

    return {
      iconFile,
      payload: createPayload(formData),
      removeIcon,
    };
  }

  if (hasJsonContentType(contentType)) {
    const parsedBody = await parseJsonBody(request);
    if (!parsedBody.success) {
      return {
        error: parsedBody.error ?? "request body must be valid JSON",
        status: parsedBody.status ?? 400,
      };
    }

    return {
      iconFile: null,
      payload: parsedBody.data as TPayload,
      removeIcon: false,
    };
  }

  return {
    error: "content-type must be application/json or multipart/form-data",
    status: 415,
  };
}

export function parseCreateServiceRequest(
  request: Request
): Promise<ParsedServicePayload<CreateServicePayload> | ServicePayloadParseFailure> {
  return parseServicePayload(request, createServicePayloadFromFormData);
}

export function parseUpdateServiceRequest(
  request: Request
): Promise<ParsedServicePayload<UpdateServicePayload> | ServicePayloadParseFailure> {
  return parseServicePayload(request, updateServicePayloadFromFormData);
}
