import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Рабочие копии агентов со своими сборками. Без этого `eslint` без
    // аргументов разбирает .next каждой копии — минуты вместо секунд.
    ".claude/**",
    // Сохранённые из браузера страницы: минифицированные бандлы чужого кода.
    // Они давали все ошибки линта, из-за чего проверка проекта ничего не
    // значила — «не проходит» было про них, а не про нас.
    "*_files/**",
  ]),
]);

export default eslintConfig;
