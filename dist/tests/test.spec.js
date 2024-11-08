import assert from "assert";
import { describe } from "mocha";
function returnsTrue() {
    return true;
}
describe("Mocha test", () => {
    describe("Mocha subtest", () => {
        it("should return true", () => {
            assert.equal(returnsTrue(), true);
        });
    });
});
