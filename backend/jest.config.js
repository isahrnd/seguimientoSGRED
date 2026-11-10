module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/src/', '<rootDir>/libs/'],
  testRegex: '.*\.spec\.ts$',
  transform: { '^.+\.(t|j)s$': ['ts-jest', { diagnostics: false }] },
  moduleDirectories: ['node_modules', '<rootDir>'],
  testEnvironment: 'node',
};
