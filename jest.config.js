module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@libs/(.*)$': '<rootDir>/src/libs/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: ['node_modules/(?!(uuid)/)'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
};
