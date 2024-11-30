export default function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

export function sleepRpc() {
  return sleep(Number(process.env.RPC_SLEEP_MS));
}
