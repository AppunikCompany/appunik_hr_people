module.exports = {
  apps: [
    {
      name: "hr-api",
      script: "artifacts/api-server/node_modules/tsx/dist/cli.mjs",
      args: "artifacts/api-server/src/index.ts",
      cwd: "/Users/karanpanchal/Downloads/HR-Suite/.claude/worktrees/pensive-boyd",
      env: {
        NODE_ENV: "development",
        PORT: "3001",
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },
    {
      name: "hr-ngrok",
      script: "ngrok",
      args: "http 3001 --log=stdout",
      interpreter: "none",
      watch: false,
      autorestart: true,
      max_restarts: 999,
      restart_delay: 2000,
    },
  ],
};
