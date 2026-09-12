# Cloud Run 用。手順は docs/ops/DEPLOY_CLOUDRUN.md
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
# クライアントのバンドルに esbuild（devDependency）が要るので、ビルド時だけ dev も入れる
RUN npm ci --include=dev

COPY . .
# **イメージの中でバンドルし直す**。ローカルの public/dist を持ち込むと
# 「デプロイしたのに反映されない」事故になる（Azure で実際に起きた）
RUN npm run build:client && npm prune --omit=dev

# Cloud Run が PORT を渡す（server/src/index.ts が process.env.PORT を見る）
CMD ["npm", "start"]
