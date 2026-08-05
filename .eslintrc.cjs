root: true
env:
  node: true
  es2022: true
parser: '@typescript-eslint/parser'
parserOptions:
  ecmaVersion: latest
  sourceType: module
  projectService: true
  tsconfigRootDir: .
plugins:
  - '@typescript-eslint'
extends:
  - eslint:recommended
  - plugin:@typescript-eslint/recommended
  - plugin:@typescript-eslint/stylistic
  - prettier
ignorePatterns:
  - node_modules/
  - dist/
  - '**/*.generated.ts'
  - prisma/migrations/
rules:
  '@typescript-eslint/no-explicit-any': off
  '@typescript-eslint/no-unused-vars':
    - warn
    - argsIgnorePattern: '^_'
      varsIgnorePattern: '^_'
  '@typescript-eslint/consistent-type-imports':
    - error
    - prefer: type-imports
      disallowTypeAnnotations: false
