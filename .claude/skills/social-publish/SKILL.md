---
name: social-publish
description: Prepare and SCHEDULE DALILACOM's own posts on its Facebook Pages and Instagram account from the approved content calendar; the platform publishes them later by itself. Use when the owner asks to post, schedule, or prepare social media posts for DALILACOM. Facebook and Instagram only for now.
---

# Social publishing for DALILACOM

Schedules the company's own posts. **The default is to schedule, never to publish at once.** The post is created with a future time and the platform releases it by itself. Read `AGENTS.md`, `marketing/01-strategy-phase1.md` and the files named below before the first run.

## Hard rules

1. **Schedule only approved content.** A post may be scheduled only if its calendar day (or text id) is listed in `marketing/approval.md` under "Approved". If it is not listed, or the file says nothing is approved, prepare it and stop. Do not schedule or publish.
1b. **Do not publish immediately** unless the owner says so for that one post.
2. **Anything outside the calendar goes back to the owner** (new idea, changed wording, a reply, a story). Show the final text and wait for a clear yes.
3. **Never ask for, type, store or print an access token or password.** Keys come through the `request_credential` tool or the server's environment. If a token is missing, stop and say so.
4. **Stop and hand back to the owner** on a CAPTCHA, a verification code, a login page, a permission dialog, a restriction or warning from Meta. Never try to get around them.
5. **One post, one account, one check.** After scheduling, open the scheduled post (Business Suite → Planner, or the Page's scheduled posts), confirm text, image, account and time, and write a line in `marketing/publish-log.md` with the status "scheduled". On the planned day, check that it went out and change the line to "published" with the link. If it did not, tell the owner.
6. Do not edit or delete files that exist. Additions only (the log, new drafts).

## Accounts

| Account | Audience and language | Browser profile (fallback only) |
|---|---|---|
| Facebook Page "دليلكم dalilacom" | Syria. Syrian colloquial Arabic | `dalilacomsy` |
| Facebook Page "منصة دليلكم dalilacom" | Arab world. Modern Standard Arabic | `Arbeit` |
| Instagram account linked to the Page above | Arab world. Modern Standard Arabic | `Arbeit` |

YouTube, TikTok and Telegram are later. Skip any calendar line that targets them.

## Language

- The texts in `marketing/` are written in Levantine colloquial. They fit the Syria Page as they are.
- For the two Modern Standard Arabic accounts, use a Fusha text written from scratch, kept in `marketing/fusha/` (same file name as the source, or `day-NN.md`). **If the Fusha text for that day does not exist, write it as a draft, put it in the approvals list as "waiting for the owner", and do not publish.** Never publish a word-for-word conversion.
- Do not mix Arabic and English in one line. English names stand alone on their own line. Links stand alone on their own line.

## Content rules (from the project's decisions)

- Audience: business owners only. Worldwide: write no city or country names.
- Core message: "كم ربحت هالشهر؟" and "اعرف كم ربحت فعلاً". Campaign slogan: "شغلك على الخريطة، وحساباتك بإيدك."
- One topic per post (accounting for now). No umbrella campaign yet.
- Launch offer: 3 months free for a limited time, then 2 USD a month or 20 USD a year. No card, nothing is charged on its own. Never write "may be extended" or "free forever".
- Promise only what exists. Accounting: income, expenses and net profit per currency; barcode stock; reading an invoice from a photo (the user reviews and confirms, with a daily limit); CSV export and printable report; delivered store orders are recorded by themselves. Not a balance sheet, taxes or receivables. Never write "a complete accounting program" or "you don't need an accountant" (write: it prepares the numbers for your accountant).
- Auto-responder: Telegram only. Facebook and Instagram are "soon". WhatsApp does not exist. Never promise Meta.
- Any text about promotional messages must say the user can switch them off (website: "حسابي والأمان", Android: notification settings).
- Patient and customer data is sensitive. The only thing allowed to be said: medical text is encrypted before it is saved. Anything else, ask the owner.
- Terms: "صاحب النشاط" not "تاجر"; "حسم" not "خصم"; "زبون" not "عميل"; "دليلكم" in Arabic, DALILACOM in Latin letters.
- Invent no numbers, statistics, testimonials or names.
- Every post ends with the call: "حمّل تطبيق «دليلكم» من متجر غوغل بلاي، أو افتح الموقع:" then the link on its own line: `https://dalilacom.com`. Add the Google Play link only after the owner sends it.

## Steps

1. Pick the day from `marketing/04-content-calendar-30-days.md` (today's date relative to the start date in `marketing/approval.md`).
2. Find its text: "نص N" is in `02-ad-copy.md`, "فيديو N" in `03-video-scripts.md`, other text is in the calendar row.
3. Check rule 1. Not approved: write the prepared post into `marketing/publish-log.md` as "prepared" and stop.
4. For each target account, take the right-language text (see Language). Check it against the content rules above.
5. Schedule (see "Scheduling" below). Do not press an immediate publish button.
6. Verify the scheduled post and log it: date, account, day number, planned time, status "scheduled".
7. Report to the owner in short Syrian Arabic sentences: what was scheduled, where, for when, and anything that needs them.

## Scheduling

- **Time:** one post a day, at the time the owner sets in `marketing/approval.md` ("وقت النشر"). If no time is set, schedule nothing and ask. Use the audience's local time and write the time zone in the log.
- **How far ahead:** schedule at most one week at a time, and only days that are approved. Keep it inside the platform's limits.
- **Facebook, API:** create the post with `published=false` and `scheduled_publish_time`. Meta's Pages API docs (checked 2026-11-12): the time must be between 10 minutes and 30 days from the request. Read the post back and compare `scheduled_publish_time` before logging.
- **Instagram:** Meta's content-publishing API docs describe publishing only (create a container, then `media_publish`). They describe no scheduled time. So schedule Instagram posts in **Meta Business Suite → Planner/Schedule** in the `Arbeit` profile, which holds the post and releases it. Do not build a home-made timer that publishes later unless the owner asks.
- **Facebook, browser:** the same Business Suite scheduler, in the right profile for that Page.
- **Changes:** to change or cancel a scheduled post, edit or delete the scheduled item. If a day's approval is removed from `approval.md`, delete its scheduled posts.

## Status of the setup (2026-11-12)

Business verification was submitted that day and takes about 2 business days. Access Verification is no longer required. `pages_manage_posts` and the Instagram publishing permissions are not yet requested. Test one scheduled post per account, with the owner watching, before the first automatic run. See `docs/META_APP_REVIEW.md`, section "Phase 2".
