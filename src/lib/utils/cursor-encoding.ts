import { z } from "zod";

function encode<T>(schema: z.ZodType<T>, data: unknown) {
  const dataEncoded = schema.parse(data);
  const stringified = JSON.stringify(dataEncoded);
  const utf8Bytes = new TextEncoder().encode(stringified);
  const binaryString = Array.from(utf8Bytes)
    .map((byte) => String.fromCharCode(byte))
    .join("");
  return btoa(binaryString);
}
function decode<T>(schema: z.ZodType<T>, dataBase64: string) {
  const binaryString = atob(dataBase64);
  const utf8Bytes = Uint8Array.from(binaryString, (char) => char.charCodeAt(0));
  const stringified = new TextDecoder().decode(utf8Bytes); // Convert back to Unicode string
  const data = JSON.parse(stringified);
  return schema.parse(data);
}

const cursorEncoding = { encode, decode };
export default cursorEncoding;
