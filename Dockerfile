FROM node:18-alpine
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S aditri -u 1001
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY --chown=aditri:nodejs . .
RUN mkdir -p uploads logs && chown -R aditri:nodejs uploads logs
USER aditri
EXPOSE 5000
CMD ["node", "server.js"]
