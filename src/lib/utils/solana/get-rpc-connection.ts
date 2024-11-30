import { Connection } from "@solana/web3.js";

export default function getRpcConnection() {
  return new Connection(process.env.RPC_URL ?? "", "confirmed");
}
