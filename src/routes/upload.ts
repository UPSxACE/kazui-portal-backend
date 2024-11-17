import createRouter from "../core/create-router.js";
import db from "../db/index.js";
import { uploadTable } from "../db/schema.js";

function splitName(filename: string) {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1)
    return {
      name: filename || "unnamed",
      extension: "",
    };
  return {
    name: filename.slice(0, lastDot) || "unnamed",
    extension: filename.slice(lastDot + 1),
  };
}

function mergeName({ name, extension }: { name: string; extension: string }) {
  if (!extension) return name;
  return name + "." + extension;
}

const uploadRouter = createRouter();

// FIXME limit user calls or size or count (probably count) --> register user uploads --> register where they are used
uploadRouter.post("/", async function (req, res) {
  if (req.files?.file && !Array.isArray(req.files.file)) {
    if (req.files.file.truncated) {
      res.status(413).send("Payload Too Large");
      return;
    }

    const { name, extension } = splitName(req.files.file.name);
    const fileName = mergeName({
      name: name.slice(0, 11) + "_" + String(Date.now()),
      extension,
    });

    if (extension.length > 5) {
      res.status(400).send("Bad Request");
      return;
    }

    const filePath = `./uploads/${req.user!.address}/${fileName}`;
    const virtualPath = `/uploads/${req.user!.address}/${fileName}`;
    await req.files.file.mv(filePath);
    await db
      .insert(uploadTable)
      .values({ owner_address: req.user!.address, path: virtualPath });
    res.status(200).send(`${process.env.BASE_URL}${virtualPath}`);
    return;
  }
  res.status(400).send("Bad Request");
});

export default uploadRouter;
