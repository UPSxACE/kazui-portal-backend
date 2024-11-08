"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const mocha_1 = require("mocha");
function returnsTrue() {
    return true;
}
(0, mocha_1.describe)("Mocha test", () => {
    (0, mocha_1.describe)("Mocha subtest", () => {
        it("should return true", () => {
            assert_1.default.equal(returnsTrue(), true);
        });
    });
});
