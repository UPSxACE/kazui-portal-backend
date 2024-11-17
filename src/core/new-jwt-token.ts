import { CookieOptions } from "express";
import jwt from "jsonwebtoken";

type CookieName = string;
type JwtString = string;
export default function newJwtToken(
  address: string
): [CookieName, JwtString, CookieOptions] {
  const nowUtc = new Date().getTime();
  const expiresIn = nowUtc + 1 * 24 * 60 * 60 * 1000; // 24 hours
  const token = jwt.sign({ address }, process.env.JWT_SECRET ?? "", {
    expiresIn,
  });

  return [
    "authToken",
    token,
    {
      domain: process.env.COOKIE_DOMAIN,
      httpOnly: true,
      expires: new Date(expiresIn),
      secure: process.env.NODE_ENV === "production" ? true : false,
    },
  ];
}
