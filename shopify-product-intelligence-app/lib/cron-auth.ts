import crypto from "crypto";

export function isCronAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret) {
    throw new Error("Missing CRON_SECRET");
  }

  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  const suppliedSecret = authorization.slice("Bearer ".length);
  const expected = Buffer.from(cronSecret);
  const supplied = Buffer.from(suppliedSecret);

  return (
    expected.length === supplied.length &&
    crypto.timingSafeEqual(expected, supplied)
  );
}
