# Meta App Review — Dalilacom Responder

Everything needed to submit the Responder app for review once Business Verification is approved.
Written so it can be pasted into the Meta developer dashboard (App Review → Permissions and features).

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
- [ ] Facebook Login product added with the OAuth redirect above whitelisted; webhooks product with the callback URL and `messages`, `feed` fields (Page) and `messages`, `comments` (Instagram).
- [ ] The test Page and Instagram account are linked, and the test users have a role on the app.
- [ ] `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN` set on the live Render service; `META_OAUTH_SCOPES` includes the Instagram permissions once the app has them.
- [ ] Test the whole flow once on the live site just before recording the video.
- [ ] Data-use answers: we process message text only to answer it; stored in our database; deletable on request; not sold or shared.

## If a submission is rejected

Read the reason in the dashboard, fix exactly that point (usually the screencast missing the permission dialog or a step),
and resubmit. Rejections for unclear videos are common and are not final.
