export default function unifyOwner<T, Y>(
  userObject: Y & {
    owner_id: T | null;
    owner_address: T | null;
  }
) {
  const { owner_id, owner_address, ...userRest } = userObject;
  if (userObject.owner_address) {
    return { ...userRest, owner: owner_address };
  }
  return { ...userRest, owner: owner_id };
}
