import { PublicKey } from "@solana/web3.js";
import bs from "bs58";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import createRouter from "../core/create-router.js";
import newJwtToken from "../core/new-jwt-token.js";
import redis from "../lib/redis.js";

const authRouter = createRouter();

authRouter.get("/get-challenge", async (req, res, next) => {
  const { success, data, error } = z
    .object({
      address: z.string(),
    })
    .safeParse(req.query);

  if (!success) {
    res.status(400).send("Bad Request");
    return;
  }

  // invalid address
  if (data.address.length > 44 || data.address.length < 32) {
    res.status(400).send("Bad Request");
  }

  const challenge = uuid();

  await redis.lpush(data.address, challenge);
  const ttl = await redis.ttl(data.address);
  if (ttl === -1) await redis.expire(data.address, 60 * 5);

  res.status(200).send(challenge);
});

authRouter.post("/login", async (req, res, next) => {
  const { success, data, error } = z
    .object({
      address: z.string(),
      challenge: z.string(),
      signature: z.string(),
    })
    .safeParse(req.body);

  if (!success) {
    res.status(400).send(error);
    return;
  }

  // from verify message with signature, then redis check list

  const { address, challenge, signature } = data;

  // invalid address
  if (data.address.length > 44 || data.address.length < 32) {
    res.status(400).send("Bad Request");
  }

  try {
    const challengeBytes = naclUtil.decodeUTF8(challenge);
    const signatureBytes = bs.decode(signature);
    const pubkey = new PublicKey(address).toBytes();

    const result = nacl.sign.detached.verify(
      challengeBytes,
      signatureBytes,
      pubkey
    );

    if (!result) {
      res.status(400).send("Bad Request");
      return;
    }

    const existingChallengesFromAddress = await redis.lrange(address, 0, -1);
    if (!existingChallengesFromAddress.includes(challenge)) {
      res.status(400).send("Bad Request");
      return;
    }

    redis.lrem(address, 0, challenge);
    res.cookie(...newJwtToken(address));
    res.send(true);
  } catch (err) {
    console.log(err);
    if (!res.headersSent) {
      res.status(400).send("Bad Request");
    }
  }
});

authRouter.post("/logout", async (req, res) => {
  res.clearCookie("authToken");
  res.status(200).send();
});

export default authRouter;
