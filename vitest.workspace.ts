import path from 'path';

export default [
  {
    test: {
      name: 'frontend',
      environment: 'jsdom',
      include: ['tests/unit/frontend/**/*.test.ts', 'tests/unit/frontend/**/*.test.tsx'],
      alias: {
        '@': path.resolve(__dirname, './'),
      },
    },
  },
  {
    test: {
      name: 'backend',
      environment: 'node',
      include: ['tests/unit/backend/**/*.test.ts', 'tests/api/**/*.test.ts'],
      alias: {
        '@': path.resolve(__dirname, './'),
      },
    },
  },
  {
    test: {
      name: 'agent',
      environment: 'node',
      include: ['tests/unit/agent/**/*.test.ts', 'tests/integration/agent/**/*.test.ts'],
      alias: {
        '@': path.resolve(__dirname, './'),
      },
    },
  }
];
