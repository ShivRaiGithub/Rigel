import { DeployedWorkflow, ParsedIntent } from "../workflows/types";
import { WorkflowTemplate, TEMPLATES } from "../templates";

export const Messages = {
  welcome(): string {
    return `👋 Welcome to Rigel!

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

*AI Mode (Gemini):*
/natural <message> — describe a workflow in plain English

*Quick Templates (no AI needed):*
/templates — see all preset templates
/deptemp <N> <params> — deploy a template directly
/jsonup — deploy a workflow from a KeeperHub JSON file

*Workflow Management:*
/list — see your active workflows
/pause — pause a workflow
/resume — resume a workflow
/run — manually trigger a workflow
/export — download workflow JSON
/delete — delete a workflow
/status — see recent executions
/cancel — cancel current action`;
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

  confirmationMessage(intent: ParsedIntent): string {
    const p = intent.parameters;
    const wallet = p.walletAddress ? shortWallet(p.walletAddress) : null;
    const chain = p.chain
      ? p.chain.charAt(0).toUpperCase() + p.chain.slice(1)
      : "Ethereum";

    const FOOTER = `\n\nDeploy this workflow?\n✅ Yes  |  ✏️ Edit  |  ❌ Cancel`;

    switch (intent.workflowType) {
      case "price_alert": {
        const token = p.token ?? "token";
        const dir = p.direction === "above" ? "rises above" : "drops below";
        const price =
          p.threshold != null ? `$${p.threshold.toLocaleString()}` : "?";
        const checkEvery = p.schedule ?? "every 10 minutes";
        return (
          `Here's what I'll set up:\n\n` +
          `📋 *${token.toUpperCase()} Price Alert*\n` +
          `- Monitors ${token.toUpperCase()} price ${checkEvery}\n` +
          `- Triggers when price ${dir} ${price}\n` +
          `- Sends you a Telegram notification` +
          FOOTER
        );
      }

      case "wallet_monitor": {
        const token = p.token ?? "ETH";
        const dir = p.direction === "outgoing" ? "outgoing" : "incoming";
        const threshold = p.threshold ?? "?";
        return (
          `Here's what I'll set up:\n\n` +
          `📋 *Wallet Monitor — ${wallet ?? "?"}*\n` +
          `- Watches for ${dir} ${token.toUpperCase()} transfers\n` +
          `- Chain: ${chain}\n` +
          `- Triggers when amount exceeds ${threshold} ${token.toUpperCase()}\n` +
          `- Sends you a Telegram notification` +
          FOOTER
        );
      }

      case "defi_health": {
        const protocol = p.protocol
          ? p.protocol.charAt(0).toUpperCase() + p.protocol.slice(1)
          : "Protocol";
        const metric = p.metric ?? "healthFactor";
        const threshold = p.threshold ?? "?";
        return (
          `Here's what I'll set up:\n\n` +
          `📋 *${protocol} Health Monitor*\n` +
          `- Checks your ${metric} every 5 minutes\n` +
          `- Wallet: ${wallet ?? "?"}\n` +
          `- Chain: ${chain}\n` +
          `- Alerts when ${metric} drops below ${threshold}` +
          FOOTER
        );
      }

      case "auto_compound": {
        const protocol = p.protocol
          ? p.protocol.charAt(0).toUpperCase() + p.protocol.slice(1)
          : "Protocol";
        const schedule = p.schedule ?? "on schedule";
        const minReward =
          p.minRewardUSD != null ? `$${p.minRewardUSD}` : "$20";
        return (
          `Here's what I'll set up:\n\n` +
          `📋 *${protocol} Auto-Compound*\n` +
          `- Claims and reinvests your rewards\n` +
          `- Wallet: ${wallet ?? "?"}\n` +
          `- Chain: ${chain}\n` +
          `- Runs ${schedule}\n` +
          `- Only compounds if rewards exceed ${minReward}` +
          FOOTER
        );
      }

      case "balance_alert": {
        const token = p.token ?? "token";
        const threshold = p.threshold ?? "?";
        return (
          `Here's what I'll set up:\n\n` +
          `📋 *${token.toUpperCase()} Balance Alert*\n` +
          `- Checks your balance every hour\n` +
          `- Wallet: ${wallet ?? "?"}\n` +
          `- Chain: ${chain}\n` +
          `- Alerts when ${token.toUpperCase()} drops below ${threshold}` +
          FOOTER
        );
      }

      default:
        return (
          `Here's what I'll set up:\n\n` +
          `📋 *Custom Workflow*\n` +
          `- Parameters collected successfully` +
          FOOTER
        );
    }
  },

  // ─── Stage 4: Workflow management ───────────────────────────────────────────

  selectWorkflow(workflows: DeployedWorkflow[], action: string): string {
    const items = workflows
      .map(
        (w, i) =>
          `${i + 1}. ${w.paused ? "⏸" : "⚡"} *${w.name}*\n   ${w.url}`
      )
      .join("\n\n");
    return (
      `Which workflow would you like to ${action}?\n\n` +
      `${items}\n\n` +
      `Reply with a number (1–${workflows.length}) or /cancel to go back`
    );
  },

  pauseSuccess(name: string): string {
    return `⏸ Paused: *${name}*\n\nSend /resume to re-activate it.`;
  },

  resumeSuccess(name: string): string {
    return `▶️ Resumed: *${name}*\n\nIt's now actively monitoring.`;
  },

  runSuccess(
    name: string,
    result: import("../keeperhub/client").WorkflowExecutionResult
  ): string {
    const ids = [
      result.executionId ? `Execution: \`${result.executionId}\`` : null,
      result.runId ? `Run: \`${result.runId}\`` : null,
      result.status ? `Status: \`${result.status}\`` : null,
    ].filter(Boolean);

    return `▶️ Triggered: *${name}*${ids.length ? `\n\n${ids.join("\n")}` : ""}`;
  },

  deleteConfirm(name: string): string {
    return (
      `⚠️ Are you sure you want to delete *${name}*?\n\n` +
      `This cannot be undone.\n\n` +
      `Reply *yes* to confirm or /cancel to go back`
    );
  },

  deleteSuccess(name: string): string {
    return `🗑 Deleted: *${name}*`;
  },

  statusMessage(name: string, executions: import("../keeperhub/client").Execution[]): string {
    if (executions.length === 0) {
      return `📊 *${name}*\n\nNo executions yet — the workflow hasn't run.`;
    }
    const rows = executions.map((e) => {
      const icon =
        e.status === "success"
          ? "✅"
          : e.status === "failed"
          ? "❌"
          : e.status === "running"
          ? "⟳"
          : "⏳";
      const ts = new Date(e.startedAt).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      });
      return `${icon} ${ts} UTC — ${e.status}`;
    });
    return `📊 *${name}*\n\nLast ${executions.length} executions:\n\n${rows.join("\n")}`;
  },

  // ─── Stage 5: Templates ─────────────────────────────────────────────────────

  templateList(): string {
    const items = TEMPLATES.map((t) => {
      const usage = t.params
        .map((p) => (p.optional ? `[${p.example}]` : `<${p.example}>`))
        .join(" ");
      return (
        `${t.emoji} *${t.id}. ${t.name}*\n` +
        `${t.description}\n` +
        `\`/deptemp ${t.id} ${usage}\``
      );
    }).join("\n\n");

    return (
      `*Workflow Templates*\n\n` +
      `Deploy a workflow instantly — no AI required.\n\n` +
      `${items}\n\n` +
      `_Optional params shown in [brackets]._`
    );
  },

  templateUsage(templateId: number): string {
    const t = TEMPLATES.find((x) => x.id === templateId);
    if (!t) return `Template #${templateId} not found. Send /templates to see all.`;
    const usage = t.params
      .map((p) => (p.optional ? `[${p.example}]` : `<${p.example}>`))
      .join(" ");
    const paramList = t.params
      .map((p, i) => `  ${i + 1}. *${p.label}*${p.optional ? " _(optional)_" : ""} — e.g. \`${p.example}\``)
      .join("\n");
    return (
      `${t.emoji} *${t.name}*\n${t.description}\n\n` +
      `Usage:\n\`/deptemp ${t.id} ${usage}\`\n\n` +
      `Parameters:\n${paramList}`
    );
  },

  naturalHelp(): string {
    return (
      `🤖 *AI Mode* — describe your workflow in plain English:\n\n` +
      `Example:\n` +
      `\`/natural Alert me when ETH drops below $2000\`\n\n` +
      `Or type your message directly (no command needed).`
    );
  },

  // ─── /jsonup ────────────────────────────────────────────────────────────────

  jsonupPrompt(): string {
    return (
      `📤 *Deploy from JSON*\n\n` +
      `Upload your KeeperHub workflow JSON file and I'll deploy it instantly.\n\n` +
      '_Send the `.json` file now, or /cancel to go back._'
    );
  },

  jsonupInvalidFile(): string {
    return (
      `❌ That doesn't look like a valid KeeperHub workflow JSON.\n\n` +
      'The file must contain at minimum a `name` field plus `nodes` and `edges` arrays.\n\n' +
      `Please try again or /cancel to go back.`
    );
  },

  jsonupParseError(detail: string): string {
    return (
      `❌ Failed to parse JSON file: ${detail}\n\n` +
      `Make sure the file is valid JSON and try again, or /cancel to go back.`
    );
  },

  jsonupDeploying(name: string): string {
    return `⟳ Deploying *${name}* from JSON…`;
  },
};

/** Truncates a wallet address to "0x1234...abcd" format. */
function shortWallet(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
