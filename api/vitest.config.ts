import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./test/global-setup.js";

export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
    // Test files share one database; running them in parallel would let one file's cleanup wipe another's rows.
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: TEST_DATABASE_URL,
    },
  },
});
