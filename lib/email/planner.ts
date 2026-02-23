type PlannerEmailRecipient = {
  email: string;
  name?: string | null;
};

type PlannerEmailArgs = {
  roomCode: string;
  roomName?: string | null;
  projectTitle: string;
  recipients: PlannerEmailRecipient[];
};

export type PlannerEmailResult = {
  status: "sent" | "failed" | "skipped";
  sentCount: number;
  failedCount: number;
  warning?: string;
};

function getBaseUrl() {
  return (
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    ""
  );
}

function getResendConfig() {
  return {
    apiKey: process.env.EMAIL_PROVIDER_API_KEY?.trim() || "",
    from: process.env.EMAIL_FROM?.trim() || "",
  };
}

function buildPlannerEmailContent(args: {
  recipientName?: string | null;
  roomCode: string;
  roomName?: string | null;
  projectTitle: string;
  calendarUrl: string;
  roomUrl: string;
}) {
  const roomLabel = args.roomName?.trim() ? `${args.roomName} (${args.roomCode})` : args.roomCode;
  const greeting = args.recipientName?.trim() ? `Hi ${args.recipientName.trim()},` : "Hi,";

  const text = [
    greeting,
    "",
    `The project planner was updated for room ${roomLabel}.`,
    `Project title: ${args.projectTitle}`,
    "",
    `Download calendar (.ics): ${args.calendarUrl}`,
    `Open room: ${args.roomUrl}`,
  ].join("\n");

  const html = [
    `<p>${greeting}</p>`,
    `<p>The project planner was updated for room <strong>${roomLabel}</strong>.</p>`,
    `<p><strong>Project title:</strong> ${args.projectTitle}</p>`,
    `<p><a href="${args.calendarUrl}">Download calendar (.ics)</a></p>`,
    `<p><a href="${args.roomUrl}">Open room</a></p>`,
  ].join("");

  return { text, html, subject: `Project calendar updated: ${roomLabel}` };
}

async function sendResendEmail(args: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: args.from,
      to: [args.to],
      subject: args.subject,
      text: args.text,
      html: args.html,
    }),
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(`Resend send failed: ${response.status} ${response.statusText} ${payload}`.trim());
  }
}

export async function sendPlannerCalendarEmails(args: PlannerEmailArgs): Promise<PlannerEmailResult> {
  const recipients = args.recipients
    .map((recipient) => ({ ...recipient, email: recipient.email.trim() }))
    .filter((recipient) => recipient.email.length > 0);

  if (recipients.length === 0) {
    return { status: "skipped", sentCount: 0, failedCount: 0, warning: "No recipient emails found." };
  }

  const baseUrl = getBaseUrl();
  const { apiKey, from } = getResendConfig();
  if (!baseUrl || !apiKey || !from) {
    return {
      status: "failed",
      sentCount: 0,
      failedCount: recipients.length,
      warning: "Email is not configured. Set APP_BASE_URL, EMAIL_PROVIDER_API_KEY, and EMAIL_FROM.",
    };
  }

  const calendarUrl = `${baseUrl}/api/rooms/${args.roomCode}/calendar.ics`;
  const roomUrl = `${baseUrl}/room/${args.roomCode}`;

  let sentCount = 0;
  let failedCount = 0;

  await Promise.all(
    recipients.map(async (recipient) => {
      const content = buildPlannerEmailContent({
        recipientName: recipient.name,
        roomCode: args.roomCode,
        roomName: args.roomName,
        projectTitle: args.projectTitle,
        calendarUrl,
        roomUrl,
      });
      try {
        await sendResendEmail({
          apiKey,
          from,
          to: recipient.email,
          subject: content.subject,
          text: content.text,
          html: content.html,
        });
        sentCount += 1;
      } catch (error) {
        failedCount += 1;
        console.error("[planner-email] send failed", {
          roomCode: args.roomCode,
          recipient: recipient.email,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })
  );

  if (failedCount > 0) {
    return {
      status: "failed",
      sentCount,
      failedCount,
      warning: "Plan saved, but one or more calendar emails failed to send.",
    };
  }

  return { status: "sent", sentCount, failedCount: 0 };
}

