import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import bs from "bs58";
import { eq } from "drizzle-orm";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import { isArrayBuffer } from "util/types";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import createRouter from "../core/create-router.js";
import newJwtToken from "../core/new-jwt-token.js";
import db from "../db/index.js";
import { userTable } from "../db/schema.js";
import redis from "../lib/redis.js";
import sleep, { sleepRpc } from "../lib/utils/sleep.js";
import getRpcConnection from "../lib/utils/solana/get-rpc-connection.js";

const authRouter = createRouter();

// FIXME delete!
authRouter.get("/test", async (req, res, next) => {
  let attempts = 0;
  while (attempts < 5) {
    attempts++;
    console.log("ATTEMPT: " + attempts);
    try {
      const connection = getRpcConnection();

      const mintPublicKey = new PublicKey(
        "kaz86ereaWMMsep13XrhSuyZ7tbHAs5RjCZKdaSmb9n"
      );

      const accounts = await connection.getParsedProgramAccounts(
        TOKEN_PROGRAM_ID,
        {
          filters: [
            {
              dataSize: 165,
            },
            {
              memcmp: {
                offset: 0,
                bytes: mintPublicKey.toString(),
              },
            },
          ],
        }
      ); // top 20

      const valuesFiltered: { owner: string; balance: number }[] = [];
      for (const topHolder of accounts) {
        if (isArrayBuffer(topHolder.account.data)) continue;
        const data = {
          owner: topHolder.account.data.parsed?.info?.owner,
          balance: topHolder.account.data.parsed?.info?.tokenAmount?.uiAmount,
        };

        const [account] = await db
          .select({ address: userTable.address })
          .from(userTable)
          .where(eq(userTable.address, topHolder.account.owner.toString()));

        valuesFiltered.push(data);
        // if (Boolean(account)) valuesFiltered.push(topHolder);
      }

      res.send(valuesFiltered);
      return;
    } catch (err) {
      await sleepRpc();
      console.log(err);
    }
  }
  next("INTERNAL_ERROR");
});

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
