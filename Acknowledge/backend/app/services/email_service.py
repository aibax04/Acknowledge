import os
import asyncio
import resend
import logging
from app.models.user import User

logger = logging.getLogger(__name__)

resend.api_key = os.getenv("RESEND_API_KEY")

_EMAIL_FROM = os.getenv("EMAIL_FROM", "Acknowledge <notifications@resend.dev>")
# Comma-separated list of addresses that receive leave notifications
_NOTIFY_EMAILS = [e.strip() for e in os.getenv("COMPANY_NOTIFY_EMAIL", "").split(",") if e.strip()]


def _leave_labels(leave_request, custom_policy_title: str | None) -> tuple[str, str]:
    """Return (leave_label, days_label) for use in email templates."""
    if custom_policy_title:
        leave_label = custom_policy_title
    else:
        raw = leave_request.leave_type.value if hasattr(leave_request.leave_type, "value") else str(leave_request.leave_type)
        leave_label = raw.replace("_", " ").title()

    half_day_note = ""
    if getattr(leave_request, "is_half_day", False):
        period = getattr(leave_request, "half_day_period", "") or ""
        half_day_note = f" · {period.replace('_', ' ').title()}" if period else " · Half Day"

    num_days = leave_request.num_days
    days_label = f"{num_days} day{'s' if num_days != 1 else ''}{half_day_note}"
    return leave_label, days_label


async def send_leave_confirmation(
    applicant: User,
    leave_request,
    custom_policy_title: str | None = None,
):
    """Send a submission confirmation email to the employee."""
    if not resend.api_key:
        logger.warning("RESEND_API_KEY not set — confirmation email skipped")
        return

    leave_label, days_label = _leave_labels(leave_request, custom_policy_title)

    subject = f"Leave Request Submitted — {leave_request.start_date} to {leave_request.end_date}"

    html_content = f"""
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:8px;
              box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">

    <div style="background:#1e3a5f;padding:24px 32px;">
      <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">
        Leave Request Submitted
      </h1>
      <p style="margin:4px 0 0;color:#93c5fd;font-size:13px;">Acknowledge · Leave Management</p>
    </div>

    <div style="padding:28px 32px;">
      <p style="margin:0 0 20px;color:#374151;font-size:15px;">
        Hi <strong>{applicant.full_name}</strong>, your leave request has been submitted
        and is <strong>pending approval</strong>.
      </p>

      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:10px 0;color:#6b7280;font-size:13px;width:140px;vertical-align:top;">Leave Type</td>
          <td style="padding:10px 0;color:#111827;font-size:14px;">{leave_label}</td>
        </tr>
        <tr style="border-top:1px solid #f3f4f6;">
          <td style="padding:10px 0;color:#6b7280;font-size:13px;vertical-align:top;">From</td>
          <td style="padding:10px 0;color:#111827;font-size:14px;">{leave_request.start_date}</td>
        </tr>
        <tr style="border-top:1px solid #f3f4f6;">
          <td style="padding:10px 0;color:#6b7280;font-size:13px;vertical-align:top;">To</td>
          <td style="padding:10px 0;color:#111827;font-size:14px;">{leave_request.end_date}</td>
        </tr>
        <tr style="border-top:1px solid #f3f4f6;">
          <td style="padding:10px 0;color:#6b7280;font-size:13px;vertical-align:top;">Duration</td>
          <td style="padding:10px 0;color:#111827;font-size:14px;font-weight:600;">{days_label}</td>
        </tr>
        <tr style="border-top:1px solid #f3f4f6;">
          <td style="padding:10px 0;color:#6b7280;font-size:13px;vertical-align:top;">Reason</td>
          <td style="padding:10px 0;color:#111827;font-size:14px;">{leave_request.reason or "—"}</td>
        </tr>
      </table>

      <div style="margin-top:28px;padding:16px;background:#f0fdf4;border-radius:6px;
                  border-left:3px solid #22c55e;">
        <p style="margin:0;color:#166534;font-size:13px;">
          You'll receive an update once a director reviews your request.
          You can also track the status on your <strong>Acknowledge dashboard</strong>.
        </p>
      </div>
    </div>

    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">
        This is an automated notification from Acknowledge. Do not reply to this email.
      </p>
    </div>
  </div>
</body>
</html>
"""

    params: resend.Emails.SendParams = {
        "from": _EMAIL_FROM,
        "to": [applicant.email],
        "subject": subject,
        "html": html_content,
    }

    try:
        response = await asyncio.to_thread(resend.Emails.send, params)
        logger.info("Leave confirmation sent to %s: %s", applicant.email, response)
    except Exception as e:
        logger.error("Failed to send leave confirmation to %s: %s", applicant.email, e)


async def send_leave_notification(
    applicant: User,
    leave_request,
    custom_policy_title: str | None = None,
):
    if not resend.api_key:
        logger.warning("RESEND_API_KEY not set — email notification skipped")
        return

    if not _NOTIFY_EMAILS:
        logger.warning("COMPANY_NOTIFY_EMAIL not set — leave notification skipped")
        return

    recipients = _NOTIFY_EMAILS

    leave_label, days_label = _leave_labels(leave_request, custom_policy_title)

    subject = (
        f"Leave Request: {applicant.full_name} "
        f"({leave_request.start_date} → {leave_request.end_date})"
    )

    html_content = f"""
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:8px;
              box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">

    <div style="background:#1e3a5f;padding:24px 32px;">
      <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">
        New Leave Application
      </h1>
      <p style="margin:4px 0 0;color:#93c5fd;font-size:13px;">Acknowledge · Leave Management</p>
    </div>

    <div style="padding:28px 32px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:10px 0;color:#6b7280;font-size:13px;width:140px;vertical-align:top;">Employee</td>
          <td style="padding:10px 0;color:#111827;font-size:14px;font-weight:600;">
            {applicant.full_name}
            <span style="color:#6b7280;font-weight:normal;"> &lt;{applicant.email}&gt;</span>
          </td>
        </tr>
        <tr style="border-top:1px solid #f3f4f6;">
          <td style="padding:10px 0;color:#6b7280;font-size:13px;vertical-align:top;">Leave Type</td>
          <td style="padding:10px 0;color:#111827;font-size:14px;">{leave_label}</td>
        </tr>
        <tr style="border-top:1px solid #f3f4f6;">
          <td style="padding:10px 0;color:#6b7280;font-size:13px;vertical-align:top;">From</td>
          <td style="padding:10px 0;color:#111827;font-size:14px;">{leave_request.start_date}</td>
        </tr>
        <tr style="border-top:1px solid #f3f4f6;">
          <td style="padding:10px 0;color:#6b7280;font-size:13px;vertical-align:top;">To</td>
          <td style="padding:10px 0;color:#111827;font-size:14px;">{leave_request.end_date}</td>
        </tr>
        <tr style="border-top:1px solid #f3f4f6;">
          <td style="padding:10px 0;color:#6b7280;font-size:13px;vertical-align:top;">Duration</td>
          <td style="padding:10px 0;color:#111827;font-size:14px;font-weight:600;">{days_label}</td>
        </tr>
        <tr style="border-top:1px solid #f3f4f6;">
          <td style="padding:10px 0;color:#6b7280;font-size:13px;vertical-align:top;">Reason</td>
          <td style="padding:10px 0;color:#111827;font-size:14px;">{leave_request.reason or "—"}</td>
        </tr>
      </table>

      <div style="margin-top:28px;padding:16px;background:#f9fafb;border-radius:6px;
                  border-left:3px solid #1e3a5f;">
        <p style="margin:0;color:#374151;font-size:13px;">
          Log in to the <strong>Acknowledge dashboard</strong> to approve or reject this request.
        </p>
      </div>
    </div>

    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">
        This is an automated notification from Acknowledge. Do not reply to this email.
      </p>
    </div>
  </div>
</body>
</html>
"""

    params: resend.Emails.SendParams = {
        "from": _EMAIL_FROM,
        "to": recipients,
        "subject": subject,
        "html": html_content,
    }

    try:
        # resend SDK is synchronous — run in thread to avoid blocking the event loop
        response = await asyncio.to_thread(resend.Emails.send, params)
        logger.info("Leave notification sent to %d recipient(s): %s", len(recipients), response)
    except Exception as e:
        logger.error("Failed to send leave notification via Resend: %s", e)
