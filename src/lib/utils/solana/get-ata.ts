import {
  Account,
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  TokenAccountNotFoundError,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import getRpcConnection from "./get-rpc-connection.js";

export default async function getAta(address: string) {
  const connection = getRpcConnection();

  const ataAddress = getAssociatedTokenAddressSync(
    new PublicKey(process.env.SPL_TOKEN_ADDRESS ?? ""),
    new PublicKey(address)
  );

  const ata: false | Account = await getAccount(
    connection,
    ataAddress,
    undefined,
    TOKEN_PROGRAM_ID
  ).catch((err) => {
    if (err.name === TokenAccountNotFoundError.name) return false;
    throw err;
  });

  return ata;
}
