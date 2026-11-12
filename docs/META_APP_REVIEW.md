# Meta App Review — Dalilacom Responder

Everything needed to submit the Responder app for review once Business Verification is approved.
Written so it can be pasted into the Meta developer dashboard (App Review → Permissions and features).

## Where things stand (updated 2026-11-02)

Everything below was rebuilt under the owner's own business portfolio **Anas Abdulaziz** after the old portfolio was restricted.

| Item | Value |
|---|---|
| Meta app | Dalilacom, ID `2541640469676064`, published (live mode), use cases: Messenger from Meta + Instagram messaging |
| Facebook Page | منصة دليلكم Dalilacom, ID `1427696977090276`, owned by the portfolio; webhook fields `messages`, `feed` subscribed |
| Webhook | `https://dalilacom.com/hooks/meta` verified |
| Domain | dalilacom.com verified in the portfolio |
| Still open | business verification, `pages_messaging` etc. review, `META_APP_ID` / `META_APP_SECRET` on Render |

Facebook Login (signing customers in to Dalilacom) is a separate Meta app and a separate review; its use case cannot be combined with the messaging ones. The responder only needs the page permissions below.

**Important for the reviewer to be able to test:** until Meta approves the app, Facebook/Instagram linking in Dalilacom is limited to
admin accounts (`src/lib/metaAccess.ts`). The reviewer's test account is a normal account, so **set `META_PUBLIC_ACCESS=true` on Render
for the whole review period**, otherwise the "Continue with Facebook" step fails and the review is rejected. Telegram is unaffected.

## Phase 1 scope (decided 2026-11-02): messaging only

The new Meta dashboard keeps permissions under each use case. The first review asks only for direct messages: **three** Page permissions,
`pages_show_list`, `pages_manage_metadata` and `pages_messaging` (all "ready for testing"). Reading the Page's posts
(`pages_read_engagement`) and comment replies (`pages_read_user_content`, `pages_manage_engagement`) come in the second submission,
together with the "Manage everything on your Page" use case already added to the app. The login dialog therefore lists three
permissions. For the first video, show only the Messenger steps (no "Load my posts", no comments).

## What the app does (one paragraph for the reviewer)

Dalilacom is a business directory and online store for Syria. A shop owner connects their own Facebook Page and
Instagram professional account to the "Auto-responder". The responder answers the shop's customers on the shop's behalf:
direct messages (Messenger and Instagram DM) and comments on the shop's posts, using rules the shop wrote
(keywords, a fixed reply, or an AI-written reply from facts the shop entered). The shop sees every conversation in an
inbox inside the app and can answer by hand. We only read messages and comments sent to the connected Page or account,
and we only answer them. We never post on the shop's timeline and never message anyone who has not written first.

## URLs

| Item | Value |
|---|---|
| Privacy policy | https://dalilacom.com/privacy.html |
| Terms of service | https://dalilacom.com/terms.html |
| Data deletion instructions | https://dalilacom.com/data-deletion.html |
| Data deletion callback | https://dalilacom.com/legal/facebook/data-deletion |
| OAuth redirect | https://dalilacom.com/responder/meta/oauth/callback |
| Webhook callback | https://dalilacom.com/hooks/meta (verify token = `META_VERIFY_TOKEN` on the server) |
| Website | https://dalilacom.com/app/ |

## Permissions to request, and the one sentence for each

**Facebook Pages**

| Permission | Why we need it |
|---|---|
| `pages_show_list` | After the shop owner logs in with Facebook we list the Pages they manage so they can choose which Page to connect. |
| `pages_manage_metadata` | To subscribe the chosen Page to our webhook (`messages`, `feed`) so we are told when a customer writes. |
| `pages_messaging` | To read a customer's message sent to the shop's Page and to send the shop's reply in the same Messenger conversation. |
| `pages_read_engagement` | To read the shop's own posts and their comments, so a rule can be limited to chosen posts and the reply can refer to the post. |
| `pages_read_user_content` | To read the text of comments customers wrote under the shop's posts, which is required to answer them. |
| `pages_manage_engagement` | To post the shop's reply as a comment under the customer's comment. |

**Instagram** (professional account linked to the Page)

| Permission | Why we need it |
|---|---|
| `instagram_basic` | To identify the connected Instagram professional account and read its posts, so a rule can be limited to chosen posts. |
| `instagram_manage_messages` | To read direct messages sent to the shop's account and send the shop's reply. |
| `instagram_manage_comments` | To read comments on the shop's posts and reply to them. |

Do not request anything else. Each request must match what the code really calls (`src/services/channels/meta.driver.ts`).

## Test instructions for the reviewer (paste into "Notes for reviewer")

1. Open https://dalilacom.com/app/ and sign in with the test account below (a normal account; no payment needed).
2. Tap the red robot button in the middle of the bottom bar (Auto-responder) and start the free trial.
3. Open the **Channels** tab, press **Continue with Facebook**, log in with the Facebook test user given in the dashboard
   (a tester of this app that manages the test Page), and choose the test Page.
4. Open **Rules** and add: keyword `price`, reply `Our prices start at 5 dollars.`
5. From a second Facebook test user, send the test Page a Messenger message containing `price`.
6. Open the **Inbox** tab: the message appears and the automatic reply was sent. The same reply arrives in Messenger.
7. Comment `price` under any post of the test Page from the second user: the reply appears as a comment.
8. Repeat 3-7 with the Instagram professional account linked to the test Page (DM and comment).
9. To remove the connection: **Channels** → switch the connection off, or follow the data-deletion page.

Test account for step 1: create one named `meta-review@dalilacom.com` with a strong password **on the day of submission**;
put the credentials only in the dashboard's reviewer-notes field, never in this repository.

## Screencast (Meta asks for one video per permission group; one 3-4 minute video can cover all)

Record the screen in English subtitles or voice. Show, in this order:

1. (0:00) The app login screen at dalilacom.com/app/ and the owner signing in.
2. (0:15) Auto-responder → Channels → **Continue with Facebook**; the real Facebook permission dialog listing the permissions
   above; choosing the Page; the connection showing as active. *The dialog must be visible — Meta rejects videos that skip it.*
3. (0:50) Rules tab: creating the keyword rule.
4. (1:10) Second device or account sends a Messenger message → Inbox shows it → the automatic reply arrives in Messenger.
5. (1:50) A comment is added under a Page post → the reply appears under it, and the Inbox shows it. (`pages_read_user_content`, `pages_manage_engagement`)
6. (2:20) Repeat for Instagram: the DM and the comment. (`instagram_manage_messages`, `instagram_manage_comments`)
7. (3:00) Show the data-deletion page and the privacy policy link, then switching the connection off.

Tips: use a clean browser profile, English UI language (menu → language) so the reviewer can follow, no real customer data
on screen, keep each step visible for a few seconds.

## Before pressing "Submit"

- [ ] Business Verification approved and the app connected to the verified business.
- [ ] App icon (1024x1024), category, privacy URL, terms URL and data-deletion URL filled in (Settings → Basic).
- [ ] `META_PUBLIC_ACCESS=true` set on Render for the review period (see above), set back later only if it should stay closed.
- [ ] The OAuth redirect above whitelisted under "Facebook Login for Business" in the app dashboard (the new use-case model keeps it there); webhooks product with the callback URL and `messages`, `feed` fields (Page) and `messages`, `comments` (Instagram).
- [ ] The test Page and Instagram account are linked, and the test users have a role on the app.
- [ ] `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN` set on the live Render service; `META_OAUTH_SCOPES` includes the Instagram permissions once the app has them.
- [ ] Test the whole flow once on the live site just before recording the video.
- [ ] Data-use answers: we process message text only to answer it; stored in our database; deletable on request; not sold or shared.

## If a submission is rejected

Read the reason in the dashboard, fix exactly that point (usually the screencast missing the permission dialog or a step),
and resubmit. Rejections for unclear videos are common and are not final.

## Phase 2: publishing our own posts (added 2026-11-12)

Second submission, after the messaging one. Purpose: Dalilacom publishes **its own** marketing posts to **its own** Facebook Pages
and Instagram account from the approved content calendar. It never posts on a shop's timeline. Names below were checked against
Meta's permissions reference on 2026-11-12; check them again on the day of submission, Meta renames permissions.

### Facts checked on 2026-11-12

- Business Verification of the portfolio **Anas Abdulaziz** (`2931042627259797`) was submitted on 2026-11-12 (sole proprietorship, Germany,
  Gewerbe-Anmeldung page 1, confirmed by SMS). Meta said about 2 business days. Status: Business info → "Business verification status".
- **Access Verification (Tech Provider) is no longer required.** Meta's page says so (updated 2026-10-23). Do not start it.
- The app already has the use cases "Engage with customers on Messenger", "Manage messaging & content on Instagram" and
  "Manage everything on your Page". No "Required actions" are open.
- Dashboard state that day: `pages_show_list`, `pages_manage_metadata`, `pages_read_engagement`, `pages_read_user_content`,
  `pages_manage_engagement`, `business_management` are "Ready for testing". `pages_manage_posts` and every Instagram permission
  still show "Add to App Review". `pages_messaging` sits under the Messenger use case.
- The owner has a role on the app, so posting to the owner's own Pages may work in standard access without review. Test that first
  (publish one post to each Page). Ask for review only if the call is refused.

### Permissions for publishing

| Permission | Depends on | Why we need it |
|---|---|---|
| `pages_manage_posts` | `pages_read_engagement`, `pages_show_list` | To publish, edit and delete DALILACOM's own posts, photos and videos on its own Pages. |
| `instagram_business_content_publish` | `instagram_business_basic` | To publish DALILACOM's own photo and video posts to its own Instagram professional account. |

If the Instagram connection stays on the Facebook-login path, the older names apply instead: `instagram_content_publish` with
`instagram_basic`. The app dashboard shows which of the two the use case offers; request only that one.

### Use case text for the reviewer (paste)

DALILACOM is an online directory and store. The company publishes its own announcements, tips and offers on its own Facebook Pages
and Instagram account. A team member prepares each post in a content calendar, approves it, and the app publishes it at the planned
time. The app only publishes to Pages and accounts that DALILACOM itself owns. It does not publish for other businesses, does not
read private data, and does not message anyone.

### Screencast for the publishing permissions (about 2 minutes)

1. The approved calendar entry (text and image) in the publishing tool.
2. The Facebook permission dialog listing the publishing permission, choosing the DALILACOM Page. *The dialog must be visible.*
3. Publishing: the post appears on the Page. Show editing and deleting the same post.
4. Repeat for the Instagram account: the post appears in the feed.
5. The privacy policy link and how the connection is removed.

### Before submitting phase 2

- [ ] Business Verification approved (check Business info first).
- [ ] One test post published to each Page and to Instagram by the owner, to see whether review is needed at all.
- [ ] Only approved calendar content is publishable. Anything outside the calendar goes back to the owner first.
- [ ] No access token in the chat or in this repository. Keys are entered through the credential tool or set on the server.
