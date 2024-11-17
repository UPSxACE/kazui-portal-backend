export default function base64ToUint8Bits(base64String: string) {
  const binaryString = atob(base64String); // Decode base64 to binary string
  const uint8Array = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    uint8Array[i] = binaryString.charCodeAt(i);
  }
  return uint8Array;
}
