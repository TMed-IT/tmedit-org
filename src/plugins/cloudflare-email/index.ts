import { env } from "cloudflare:workers";
import { definePlugin } from "emdash";

const requireTextBinding = (name: "EMAIL_FROM" | "EMAIL_FROM_NAME") => {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is not configured`);
  }
  return value.trim();
};

export function createPlugin() {
  return definePlugin({
    id: "cloudflare-email",
    version: "1.0.0",
    capabilities: ["hooks.email-transport:register"],
    hooks: {
      "email:deliver": {
        exclusive: true,
        handler: async ({ message, source }, ctx) => {
          const result = await env.EMAIL.send({
            from: {
              email: requireTextBinding("EMAIL_FROM"),
              name: requireTextBinding("EMAIL_FROM_NAME"),
            },
            to: message.to,
            subject: message.subject,
            text: message.text,
            ...(message.html ? { html: message.html } : {}),
          });

          ctx.log.info("Email delivered through Cloudflare Email Sending", {
            messageId: result.messageId,
            source,
          });
        },
      },
    },
  });
}
