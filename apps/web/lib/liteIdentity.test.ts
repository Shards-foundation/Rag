import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { isSameOriginMutation } from "./liteIdentity";

function request(headers: Record<string, string>): NextRequest {
  return new NextRequest("http://0.0.0.0:3000/api/lite/init", { headers });
}

describe("Lite Mode same-origin mutation guard", () => {
  it("accepts the public Host when Next's internal request URL uses 0.0.0.0", () => {
    const req = request({
      origin: "http://localhost:3000",
      host: "localhost:3000",
      "x-forwarded-host": "localhost:3000",
      "x-forwarded-proto": "http",
    });
    expect(req.nextUrl.origin).toBe("http://0.0.0.0:3000");
    expect(isSameOriginMutation(req)).toBe(true);
  });

  it("uses the trusted forwarded protocol for HTTPS deployments", () => {
    expect(isSameOriginMutation(request({
      origin: "https://product.example",
      host: "product.example",
      "x-forwarded-host": "product.example",
      "x-forwarded-proto": "https",
    }))).toBe(true);
  });

  it("rejects a foreign origin even if it sends the victim's Host header", () => {
    expect(isSameOriginMutation(request({
      origin: "https://attacker.example",
      host: "product.example",
      "x-forwarded-proto": "https",
    }))).toBe(false);
  });

  it("continues to allow non-browser clients that omit Origin", () => {
    expect(isSameOriginMutation(request({ host: "localhost:3000" }))).toBe(true);
  });

  it("rejects malformed Origin headers", () => {
    expect(isSameOriginMutation(request({ origin: "null", host: "localhost:3000" }))).toBe(false);
  });
});
