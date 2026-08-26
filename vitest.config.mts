import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Тесты закрывают чистую логику AI-поддержки: скоринг поиска по карте
// сервиса, сторож отсебятины в ответе оператора и разбор исходов модели.
// Ни сети, ни базы — всё это функции над данными, поэтому прогон быстрый и
// не флейкает.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
