import { DeployedWorkflow } from "../workflows/types";

export const Messages = {
  welcome(): string {
    return `👋 Welcome to Rigel — powered by FlowBot!

I turn plain English into live KeeperHub onchain automations.

Just tell me what you want to automate. For example:
• "Alert me when ETH drops below $2000"
• "Warn me if my Aave health factor drops below 1.5"
• "Notify me when wallet 0x1234 receives more than 1 ETH"

What would you like to automate?`;
  },

  help(): string {
    return `Here's what I can set up for you:

💼 *Wallet Monitor*
"Alert me when wallet 0x... receives more than 1 ETH"

🏥 *DeFi Health Monitor*
"Warn me if my Aave health factor drops below 1.5"

📈 *Price Alert*
"Tell me when ETH drops below $2000"

🔄 *Auto-Compound*
"Claim and reinvest my Aave rewards every Sunday"

💰 *Balance Alert*
"Alert me when my USDC on Base drops below 500"

*Commands:*
/list — see your active workflows
/pause — pause a workflow
/resume — resume a workflow
/delete — delete a workflow
/status — see recent executions`;
  },

  clarify(question: string): string {
    return `I need one more detail:\n\n${question}`;
  },

  cantUnderstand(): string {
    return `I didn't quite understand that. Try something like:
• "Alert me when ETH drops below $2000"
• "Watch wallet 0x1234 for incoming transfers over 1 ETH"
• "Warn me if my Aave health factor drops below 1.5"

Or type /help to see all options.`;
  },

  tooManyAttempts(): string {
    return `I'm having trouble understanding the details.
Please try rephrasing your request from scratch.

Example: "Alert me when ETH price drops below $2000"`;
  },

  deploying(): string {
    return `⟳ Creating your workflow on KeeperHub...`;
  },

  deploySuccess(name: string, url: string): string {
    return `✅ *${name}* is live!
🔗 ${url}
⚡ Active and monitoring now`;
  },

  deployError(error: string): string {
    return `⚠️ Something went wrong creating your workflow.
Error: ${error}

Please try again or visit keeperhub.com`;
  },

  noWorkflows(): string {
    return `You don't have any active workflows yet.
Send me a message to create your first one!`;
  },

  workflowList(workflows: DeployedWorkflow[]): string {
    const items = workflows
      .map(
        (w, i) =>
          `${i + 1}. ${w.paused ? "⏸" : "⚡"} ${w.name}\n   ${w.url}`
      )
      .join("\n\n");
    return `Your workflows:\n\n${items}`;
  },
};
